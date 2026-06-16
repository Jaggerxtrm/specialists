import { describe, expect, it } from 'vitest';
import {
  buildDiffSummary,
  isValidGitRef,
  parseNumstat,
  parsePorcelainStatus,
  parseUnifiedDiff,
} from '../../../src/cli/console/git.js';
import {
  renderDiffHunkHeader,
  renderDiffHunkLine,
  renderDiffSummaryRow,
} from '../../../src/cli/console/theme.js';
import {
  initialConsoleState,
  reduceConsoleState,
} from '../../../src/cli/console/view-model.js';
import type { DiffSummary } from '../../../src/cli/console/types.js';

const SGR_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(SGR_RE, '');

describe('git.ts — argument hygiene', () => {
  it('isValidGitRef accepts SHAs and refs', () => {
    expect(isValidGitRef('abc1234')).toBe(true);
    expect(isValidGitRef('1a2b3c4d5e6f7890abcdef1234567890abcdef12')).toBe(true);
    expect(isValidGitRef('main')).toBe(true);
    expect(isValidGitRef('origin/main')).toBe(true);
    expect(isValidGitRef('feature/unitAI-ctb4u-rebase')).toBe(true);
  });

  it('isValidGitRef rejects shell-injection attempts', () => {
    expect(isValidGitRef('')).toBe(false);
    expect(isValidGitRef('-rf /')).toBe(false);
    expect(isValidGitRef('--exec=evil')).toBe(false);
    expect(isValidGitRef('; rm')).toBe(false);
    expect(isValidGitRef('$(whoami)')).toBe(false);
    expect(isValidGitRef('`evil`')).toBe(false);
  });
});

describe('parseNumstat', () => {
  it('parses added/deleted counts and paths', () => {
    const rows = parseNumstat('3\t1\tsrc/foo.ts\n12\t0\tdocs/readme.md');
    expect(rows).toEqual([
      { path: 'src/foo.ts', added: 3, deleted: 1, binary: false },
      { path: 'docs/readme.md', added: 12, deleted: 0, binary: false },
    ]);
  });

  it('detects binary files via the `-\\t-` marker', () => {
    const rows = parseNumstat('-\t-\tbin/blob.bin\n5\t2\tsrc/x.ts');
    expect(rows[0].binary).toBe(true);
    expect(rows[0].added).toBe(0);
    expect(rows[1].binary).toBe(false);
  });

  it('normalizes rename arrows `{old => new}`', () => {
    const rows = parseNumstat('2\t1\tsrc/{old.ts => new.ts}');
    expect(rows[0].path).toBe('src/new.ts');
  });

  it('handles paths with tabs by joining the tail', () => {
    const rows = parseNumstat('1\t0\tpath\twith\ttab.ts');
    expect(rows[0].path).toBe('path\twith\ttab.ts');
  });

  it('returns empty array on empty input', () => {
    expect(parseNumstat('')).toEqual([]);
  });
});

describe('parsePorcelainStatus', () => {
  it('parses M / A / D / R / ?? codes', () => {
    const map = parsePorcelainStatus(
      [' M src/foo.ts',
        'A  src/added.ts',
        'D  src/deleted.ts',
        '?? new/file.ts',
        'R  old.ts -> renamed.ts',
      ].join('\n'),
    );
    expect(map.get('src/foo.ts')).toBe('M');
    expect(map.get('src/added.ts')).toBe('A');
    expect(map.get('src/deleted.ts')).toBe('D');
    expect(map.get('new/file.ts')).toBe('?');
    expect(map.get('renamed.ts')).toBe('R');
  });

  it('prefers working-tree code over staged', () => {
    const map = parsePorcelainStatus('MM src/x.ts');
    expect(map.get('src/x.ts')).toBe('M');
  });

  it('ignores blank lines', () => {
    expect(parsePorcelainStatus('\n\n').size).toBe(0);
  });
});

describe('buildDiffSummary', () => {
  it('merges numstat + porcelain and sorts by path', () => {
    const numstat = parseNumstat('3\t1\tsrc/foo.ts\n-\t-\tbin/blob.bin');
    const porcelain = parsePorcelainStatus(' M src/foo.ts\nA  src/added.ts\n?? new/untracked.ts');
    const merged = buildDiffSummary(numstat, porcelain);
    const paths = merged.map((e) => e.path);
    expect(paths).toEqual(['bin/blob.bin', 'new/untracked.ts', 'src/foo.ts']);
    expect(merged.find((e) => e.path === 'src/foo.ts')?.status).toBe('M');
    expect(merged.find((e) => e.path === 'bin/blob.bin')?.binary).toBe(true);
    expect(merged.find((e) => e.path === 'new/untracked.ts')?.status).toBe('?');
  });
});

describe('parseUnifiedDiff', () => {
  const sample = [
    'diff --git a/src/foo.ts b/src/foo.ts',
    'index abc123..def456 100644',
    '--- a/src/foo.ts',
    '+++ b/src/foo.ts',
    '@@ -1,3 +1,4 @@',
    ' context line',
    '-removed',
    '+added',
    ' more context',
    '@@ -10,2 +11,3 @@',
    ' c',
    '+x',
  ].join('\n');

  it('extracts hunks with header + line kinds', () => {
    const hunks = parseUnifiedDiff(sample);
    expect(hunks.length).toBe(2);
    expect(hunks[0].header).toBe('@@ -1,3 +1,4 @@');
    expect(hunks[0].lines.map((l) => l.kind)).toEqual(['context', 'del', 'add', 'context']);
    expect(hunks[1].lines[1].kind).toBe('add');
  });
});

describe('theme: diff row rendering', () => {
  it('summary row shows + and - counts with selection marker', () => {
    const row = strip(
      renderDiffSummaryRow(
        { path: 'src/foo.ts', status: 'M', added: 3, deleted: 1, binary: false },
        80,
        true,
      ),
    );
    expect(row.startsWith('›')).toBe(true);
    expect(row).toContain('+3');
    expect(row).toContain('-1');
    expect(row).toContain('src/foo.ts');
  });

  it('binary entry shows "bin" instead of counts', () => {
    const row = strip(
      renderDiffSummaryRow(
        { path: 'bin/blob.bin', status: 'M', added: 0, deleted: 0, binary: true },
        80,
        false,
      ),
    );
    expect(row).toContain('bin');
  });

  it('hunk header and line kinds use theme.paint', () => {
    expect(strip(renderDiffHunkHeader('@@ -1,3 +1,4 @@', 80))).toBe('@@ -1,3 +1,4 @@');
    expect(strip(renderDiffHunkLine('add', '+added', 80))).toBe('+added');
    expect(strip(renderDiffHunkLine('del', '-removed', 80))).toBe('-removed');
  });
});

describe('view-model: diff actions', () => {
  const baseSummary: DiffSummary = {
    worktree: { path: '/wt', branch: 'feature/x', base: 'abc1234' },
    entries: [
      { path: 'a.ts', status: 'M', added: 3, deleted: 1, binary: false },
      { path: 'b.ts', status: 'A', added: 5, deleted: 0, binary: false },
    ],
  };

  it('open(view=diff) sets stage=summary + loading=true', () => {
    const state = reduceConsoleState(initialConsoleState(), { type: 'open', view: 'diff', jobId: 'a' });
    expect(state.view).toBe('diff');
    expect(state.diff.stage).toBe('summary');
    expect(state.diff.loading).toBe(true);
  });

  it('diffSummaryLoaded clears loading and stores entries', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'open', view: 'diff', jobId: 'a' });
    state = reduceConsoleState(state, { type: 'diffSummaryLoaded', summary: baseSummary });
    expect(state.diff.loading).toBe(false);
    expect(state.diff.summary?.entries.length).toBe(2);
  });

  it('diffOpenFile switches stage and remembers path', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'open', view: 'diff', jobId: 'a' });
    state = reduceConsoleState(state, { type: 'diffSummaryLoaded', summary: baseSummary });
    state = reduceConsoleState(state, { type: 'diffOpenFile', index: 1, path: 'b.ts' });
    expect(state.diff.stage).toBe('file');
    expect(state.diff.filePath).toBe('b.ts');
    expect(state.diff.loading).toBe(true);
  });

  it('diffBack from file returns to summary; from summary leaves view', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'open', view: 'diff', jobId: 'a' });
    state = reduceConsoleState(state, { type: 'diffSummaryLoaded', summary: baseSummary });
    state = reduceConsoleState(state, { type: 'diffOpenFile', index: 0, path: 'a.ts' });
    state = reduceConsoleState(state, { type: 'diffBack' });
    expect(state.view).toBe('diff');
    expect(state.diff.stage).toBe('summary');
    state = reduceConsoleState(state, { type: 'diffBack' });
    expect(state.view).toBe('ps');
  });

  it('diffMove clamps selectedFileIndex within entries range (summary stage)', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'open', view: 'diff', jobId: 'a' });
    state = reduceConsoleState(state, { type: 'diffSummaryLoaded', summary: baseSummary });
    state = reduceConsoleState(state, { type: 'diffMove', delta: 5, viewportRows: 10 });
    expect(state.diff.selectedFileIndex).toBe(1);
    state = reduceConsoleState(state, { type: 'diffMove', delta: -10, viewportRows: 10 });
    expect(state.diff.selectedFileIndex).toBe(0);
  });
});
