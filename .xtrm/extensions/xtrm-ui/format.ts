export interface DiffStats {
  additions: number;
  removals: number;
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
