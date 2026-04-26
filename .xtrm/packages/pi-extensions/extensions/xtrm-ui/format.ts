export interface DiffStats {
  additions: number;
  removals: number;
}

// pi-diff compatibility adapter:
// @heyhuynhgiabuu/pi-diff currently exposes extension-first entrypoints
// (no stable library export surface), so xtrm-ui vendors this renderer to
// keep write/edit previews deterministic while preserving single-wrapper ownership.
interface DiffTheme {
  fg(color: string, text: string): string;
  bold?(text: string): string;
}

interface HunkCursor {
  oldLine: number;
  newLine: number;
}

export function shortenHome(path: string): string {
  const home = process.env.HOME;
  if (home && path.startsWith(home)) return `~${path.slice(home.length)}`;
  return path;
}

export function shortenPath(path: string, max = 56): string {
  const normalized = shortenHome(path);
  if (normalized.length <= max) return normalized;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return `…${normalized.slice(-(max - 1))}`;
  const tail = parts.slice(-2).join("/");
  const head = parts[0]?.startsWith("~") ? "~/" : "…/";
  const candidate = `${head}${tail}`;
  if (candidate.length <= max) return candidate;
  return `…${candidate.slice(-(max - 1))}`;
}

export function shortenCommand(command: string, max = 72): string {
  const singleLine = command.replace(/\s+/g, " ").trim();
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, Math.max(0, max - 1))}…`;
}

export function lineCount(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

export function previewLines(text: string, count: number): string[] {
  return text.split("\n").slice(0, count);
}

export function cleanOutputLines(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .filter((line) => !/^exit code:\s*-?\d+$/i.test(line.trim()));
}

export function countPrefixedItems(text: string, prefixes: string[]): number {
  return text.split("\n").filter((line) => prefixes.some((prefix) => line.startsWith(prefix))).length;
}

export function diffStats(diff: string): DiffStats {
  let additions = 0;
  let removals = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    if (line.startsWith("-") && !line.startsWith("---")) removals++;
  }
  return { additions, removals };
}

export function createUnifiedLineDiff(oldContent: string, newContent: string): string {
  if (oldContent === newContent) return "";

  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const out: string[] = ["--- a/file", "+++ b/file", `@@ -1,${oldLines.length} +1,${newLines.length} @@`];

  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex];
    const newLine = newLines[newIndex];

    if (oldLine === newLine) {
      out.push(` ${oldLine ?? ""}`);
      oldIndex++;
      newIndex++;
      continue;
    }

    if (oldIndex + 1 < oldLines.length && oldLines[oldIndex + 1] === newLine) {
      out.push(`-${oldLine ?? ""}`);
      oldIndex++;
      continue;
    }

    if (newIndex + 1 < newLines.length && oldLine === newLines[newIndex + 1]) {
      out.push(`+${newLine ?? ""}`);
      newIndex++;
      continue;
    }

    if (oldIndex < oldLines.length) {
      out.push(`-${oldLine ?? ""}`);
      oldIndex++;
    }
    if (newIndex < newLines.length) {
      out.push(`+${newLine ?? ""}`);
      newIndex++;
    }
  }

  return out.join("\n");
}

function parseHunkHeader(line: string): HunkCursor | undefined {
  const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
  if (!match) return undefined;
  return {
    oldLine: Number.parseInt(match[1] ?? "1", 10),
    newLine: Number.parseInt(match[2] ?? "1", 10),
  };
}

function renderLineNumbers(theme: DiffTheme, oldLine: number | null, newLine: number | null): string {
  const format = (value: number | null) => (value == null ? "    " : String(value).padStart(4, " "));
  return theme.fg("muted", `${format(oldLine)} ${format(newLine)} │`);
}

function safeBold(theme: DiffTheme, text: string): string {
  return theme.bold ? theme.bold(text) : text;
}

function splitChangedSegment(before: string, after: string): { before: string; beforeMid: string; beforeTail: string; after: string; afterMid: string; afterTail: string } {
  let prefixLength = 0;
  const minLength = Math.min(before.length, after.length);

  while (prefixLength < minLength && before[prefixLength] === after[prefixLength]) {
    prefixLength++;
  }

  let suffixLength = 0;
  while (
    suffixLength < minLength - prefixLength &&
    before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) {
    suffixLength++;
  }

  return {
    before: before.slice(0, prefixLength),
    beforeMid: before.slice(prefixLength, before.length - suffixLength),
    beforeTail: before.slice(before.length - suffixLength),
    after: after.slice(0, prefixLength),
    afterMid: after.slice(prefixLength, after.length - suffixLength),
    afterTail: after.slice(after.length - suffixLength),
  };
}

function renderWordHighlightedPair(theme: DiffTheme, removed: string, added: string): { removed: string; added: string } {
  const segments = splitChangedSegment(removed, added);
  const removedContent = `${segments.before}${segments.beforeMid ? safeBold(theme, segments.beforeMid) : ""}${segments.beforeTail}`;
  const addedContent = `${segments.after}${segments.afterMid ? safeBold(theme, segments.afterMid) : ""}${segments.afterTail}`;

  return {
    removed: theme.fg("toolDiffRemoved", `-${removedContent}`),
    added: theme.fg("toolDiffAdded", `+${addedContent}`),
  };
}

export function renderRichDiffPreview(theme: DiffTheme, diff: string, maxLines: number): string {
  const lines = diff.split("\n");
  const rendered: string[] = [];
  let shown = 0;
  let oldLine = 1;
  let newLine = 1;

  for (let index = 0; index < lines.length && shown < maxLines; index++) {
    const line = lines[index] ?? "";

    if (line.startsWith("@@")) {
      const cursor = parseHunkHeader(line);
      if (cursor) {
        oldLine = cursor.oldLine;
        newLine = cursor.newLine;
      }
      rendered.push(`${renderLineNumbers(theme, null, null)} ${theme.fg("muted", line)}`);
      shown++;
      continue;
    }

    if (line.startsWith("---") || line.startsWith("+++")) {
      rendered.push(`${renderLineNumbers(theme, null, null)} ${theme.fg("toolDiffContext", line)}`);
      shown++;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---") && shown + 1 <= maxLines) {
      const nextLine = lines[index + 1] ?? "";
      if (nextLine.startsWith("+") && !nextLine.startsWith("+++")) {
        const pair = renderWordHighlightedPair(theme, line.slice(1), nextLine.slice(1));
        rendered.push(`${renderLineNumbers(theme, oldLine, null)} ${pair.removed}`);
        rendered.push(`${renderLineNumbers(theme, null, newLine)} ${pair.added}`);
        oldLine++;
        newLine++;
        index++;
        shown += 2;
        continue;
      }
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      rendered.push(`${renderLineNumbers(theme, oldLine, null)} ${theme.fg("toolDiffRemoved", line)}`);
      oldLine++;
      shown++;
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      rendered.push(`${renderLineNumbers(theme, null, newLine)} ${theme.fg("toolDiffAdded", line)}`);
      newLine++;
      shown++;
      continue;
    }

    if (line.startsWith(" ")) {
      rendered.push(`${renderLineNumbers(theme, oldLine, newLine)} ${theme.fg("toolDiffContext", line)}`);
      oldLine++;
      newLine++;
      shown++;
      continue;
    }

    rendered.push(`${renderLineNumbers(theme, null, null)} ${theme.fg("toolDiffContext", line)}`);
    shown++;
  }

  if (lines.length > shown) {
    rendered.push(theme.fg("muted", `     … +${lines.length - shown} more`));
  }

  return rendered.join("\n");
}

export function formatDuration(durationMs: number | undefined): string | undefined {
  if (!durationMs || durationMs < 0) return undefined;
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

export function formatLineLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function renderToolSummary(
  theme: { fg(color: string, text: string): string; bold(text: string): string },
  status: "pending" | "success" | "error" | "muted",
  label: string,
  subject?: string,
  meta?: string,
): string {
  const color =
    status === "pending" ? "accent"
    : status === "error" ? "error"
    : status === "success" ? "success"
    : "muted";
  let text = `${theme.fg(color, "•")} ${theme.fg("toolTitle", theme.bold(label))}`;
  if (subject) text += ` ${theme.fg("accent", subject)}`;
  if (meta) text += theme.fg("muted", ` · ${meta}`);
  return text;
}

export function joinMeta(parts: Array<string | undefined | false>): string | undefined {
  const filtered = parts.filter((part): part is string => typeof part === "string" && part.length > 0);
  return filtered.length > 0 ? filtered.join(" · ") : undefined;
}
