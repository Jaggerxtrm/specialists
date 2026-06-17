// Pure git output parsers for DiffView.
//
// No subprocess calls — all input is text from `git diff --numstat`,
// `git status --porcelain`, or unified diff. Lives outside runtime so
// fixture-based tests can drive every branch without spawning git.

export type DiffStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';

export interface DiffSummaryEntry {
  path: string;
  status: DiffStatus;
  added: number;
  deleted: number;
  binary: boolean;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  kind: 'context' | 'add' | 'del' | 'meta';
  text: string;
}

const SHA_OR_REF_RE = /^[a-f0-9]{7,40}$|^[a-zA-Z0-9._/-]+$/;

export function isValidGitRef(ref: string): boolean {
  if (!ref) return false;
  if (ref.startsWith('-')) return false;
  return SHA_OR_REF_RE.test(ref);
}

// Parse `git diff --numstat`. Lines look like:
//   3\t1\tsrc/foo.ts
//   -\t-\tbin/blob.bin           (binary)
//   12\t0\tpath/to/file with space.ts
//   2\t1\tsrc/{old => new}.ts    (rename arrow form)
export function parseNumstat(input: string): Array<{ path: string; added: number; deleted: number; binary: boolean }> {
  const rows: Array<{ path: string; added: number; deleted: number; binary: boolean }> = [];
  for (const line of input.split('\n')) {
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [a, d, ...rest] = parts;
    const path = rest.join('\t');
    const binary = a === '-' && d === '-';
    rows.push({
      path: normalizeRenamePath(path),
      added: binary ? 0 : Number(a) || 0,
      deleted: binary ? 0 : Number(d) || 0,
      binary,
    });
  }
  return rows;
}

function normalizeRenamePath(path: string): string {
  // `git diff --numstat` emits `{old => new}` segments for renames. Use the
  // destination path for display.
  const renameRe = /\{([^{}=]*) => ([^{}=]*)\}/;
  let result = path;
  while (renameRe.test(result)) {
    result = result.replace(renameRe, (_full, _from: string, to: string) => to);
  }
  return result;
}

// Parse `git status --porcelain=v1` to extract added/modified/deleted/untracked.
// Lines look like:
//   ` M src/foo.ts`           (working tree modified)
//   `M  src/bar.ts`           (staged modified)
//   `MM src/baz.ts`           (both)
//   `?? new/file.ts`          (untracked)
//   `A  src/added.ts`
//   `D  src/deleted.ts`
//   `R  old.ts -> new.ts`
export function parsePorcelainStatus(input: string): Map<string, DiffStatus> {
  const result = new Map<string, DiffStatus>();
  for (const line of input.split('\n')) {
    if (line.length < 3) continue;
    const xy = line.slice(0, 2);
    const rest = line.slice(3);
    let path = rest;
    if (xy === '??') {
      result.set(path, '?');
      continue;
    }
    if (rest.includes(' -> ')) path = rest.split(' -> ').pop() ?? rest;
    const code = pickStatusCode(xy);
    if (code) result.set(path, code);
  }
  return result;
}

function pickStatusCode(xy: string): DiffStatus | null {
  const x = xy[0];
  const y = xy[1];
  // prefer the working-tree code (y), fall back to the staged code (x)
  const candidate = (y !== ' ' && y !== undefined ? y : x) ?? '';
  if (candidate === 'M' || candidate === 'A' || candidate === 'D' || candidate === 'R'
    || candidate === 'C' || candidate === 'T' || candidate === 'U') {
    return candidate;
  }
  return null;
}

// Merge `git diff --numstat` and `git status --porcelain` into a single sorted summary.
export function buildDiffSummary(
  numstat: ReturnType<typeof parseNumstat>,
  porcelain: Map<string, DiffStatus>,
): DiffSummaryEntry[] {
  const byPath = new Map<string, DiffSummaryEntry>();
  for (const row of numstat) {
    byPath.set(row.path, {
      path: row.path,
      status: porcelain.get(row.path) ?? 'M',
      added: row.added,
      deleted: row.deleted,
      binary: row.binary,
    });
  }
  // Untracked files are not in numstat (no diff yet) — add them from porcelain.
  for (const [path, status] of porcelain.entries()) {
    if (status === '?' && !byPath.has(path)) {
      byPath.set(path, { path, status: '?', added: 0, deleted: 0, binary: false });
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

// Parse a single-file unified diff (output of `git diff <base> -- <file>`).
export function parseUnifiedDiff(input: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  for (const line of input.split('\n')) {
    if (line.startsWith('@@')) {
      if (current) hunks.push(current);
      current = { header: line, lines: [] };
      continue;
    }
    if (line.startsWith('diff --git') || line.startsWith('index ')
      || line.startsWith('--- ') || line.startsWith('+++ ')
      || line.startsWith('new file mode') || line.startsWith('deleted file mode')
      || line.startsWith('similarity index')) {
      // Header noise — skip when we have no hunk yet; surface as 'meta'
      // line inside the current hunk if present.
      if (current) current.lines.push({ kind: 'meta', text: line });
      continue;
    }
    if (!current) continue;
    const kind: DiffLine['kind'] = line.startsWith('+') ? 'add'
      : line.startsWith('-') ? 'del'
      : 'context';
    current.lines.push({ kind, text: line });
  }
  if (current) hunks.push(current);
  return hunks;
}

export const HUNK_DISPLAY_CEILING = 5000;
