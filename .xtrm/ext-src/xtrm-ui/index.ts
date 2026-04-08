/**
 * XTRM UI Extension
 *
 * Wraps pi-dex functionality with XTRM-specific preferences:
 * - Uses pi-dex themes and header
 * - Disables pi-dex footer (let custom-footer handle it)
 * - Provides /xtrm-ui commands for theme/density switching
 *
 * This eliminates the race condition between pi-dex's footer and
 * XTRM's custom-footer extension.
 */

import type {
  BashToolDetails,
  EditToolDetails,
  ExtensionAPI,
  ExtensionContext,
  FindToolDetails,
  GrepToolDetails,
  LsToolDetails,
  ReadToolDetails,
  ToolResultEvent,
} from "@mariozechner/pi-coding-agent";
import {
  CustomEditor,
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@mariozechner/pi-coding-agent";
import { Box, Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  cleanOutputLines,
  countPrefixedItems,
  createUnifiedLineDiff,
  diffStats,
  formatDuration,
  formatLineLabel,
  joinMeta,
  lineCount,
  previewLines,
  renderRichDiffPreview,
  renderToolSummary,
  shortenCommand,
  shortenPath,
} from "./format";

// ============================================================================
// Types
// ============================================================================

export type XtrmThemeName = "pidex-dark" | "pidex-light";
export type XtrmDensity = "compact" | "comfortable";

export interface XtrmUiPrefs {
  themeName: XtrmThemeName;
  density: XtrmDensity;
  showHeader: boolean;
  compactTools: boolean;
  showFooter: boolean; // Our key addition - when false, skip setFooter()
  forceTheme: boolean; // When false, skip setTheme (allow external theme override)
}

// ============================================================================
// Defaults
// ============================================================================

export const XTRM_UI_PREFS_ENTRY = "xtrm-ui-prefs";

export const DEFAULT_PREFS: XtrmUiPrefs = {
  themeName: "pidex-dark",
  density: "compact",
  showHeader: true,
  compactTools: true,
  showFooter: false, // XTRM: disable pi-dex footer, use custom-footer
  forceTheme: true,
};

// ============================================================================
// Preferences
// ============================================================================

type MaybeCustomEntry = {
  type?: string;
  customType?: string;
  data?: unknown;
};

function normalizePrefs(input: unknown): XtrmUiPrefs {
  if (!input || typeof input !== "object") return { ...DEFAULT_PREFS };
  const source = input as Partial<XtrmUiPrefs>;
  return {
    themeName: source.themeName === "pidex-light" ? "pidex-light" : "pidex-dark",
    density: source.density === "comfortable" ? "comfortable" : "compact",
    showHeader: source.showHeader ?? DEFAULT_PREFS.showHeader,
    compactTools: source.compactTools ?? DEFAULT_PREFS.compactTools,
    showFooter: source.showFooter ?? DEFAULT_PREFS.showFooter,
    forceTheme: source.forceTheme ?? DEFAULT_PREFS.forceTheme,
  };
}

function loadPrefs(entries: ReadonlyArray<MaybeCustomEntry>): XtrmUiPrefs {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type === "custom" && entry.customType === XTRM_UI_PREFS_ENTRY) {
      return normalizePrefs(entry.data);
    }
  }
  return { ...DEFAULT_PREFS };
}

function persistPrefs(pi: ExtensionAPI, prefs: XtrmUiPrefs): void {
  pi.appendEntry(XTRM_UI_PREFS_ENTRY, prefs);
}

// ============================================================================
// Chrome Application
// ============================================================================

function fitVisible(text: string, width: number): string {
  const truncated = truncateToWidth(text, width);
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function formatThinking(level: string): string {
  return level === "off" ? "standard" : level;
}

function applyXtrmChrome(
  ctx: ExtensionContext,
  prefs: XtrmUiPrefs,
  getThinkingLevel: () => string
): void {
  // Theme
  if (prefs.forceTheme) ctx.ui.setTheme(prefs.themeName);

  // Tool expansion
  ctx.ui.setToolsExpanded(!prefs.compactTools);

  // Editor — density-aware input padding
  ctx.ui.setEditorComponent((tui, theme, keybindings) => {
    const editor = new XtrmEditor(tui, theme, keybindings);
    editor.setPrefs(prefs);
    return editor;
  });

  // Header (optional)
  if (prefs.showHeader) {
    ctx.ui.setHeader((_tui, theme) => ({
      invalidate() {},
      render(width: number): string[] {
        const boxWidth = width >= 54 ? 50 : Math.max(24, width);
        const model = ctx.model?.id ?? "no-model";
        const thinking = getThinkingLevel();
        const border = (text: string) => theme.fg("borderAccent", text);
        const leftPad = "";

        const top = leftPad + border(`╭${"─".repeat(Math.max(0, boxWidth - 2))}╮`);
        const line1 =
          leftPad +
          border("│") +
          fitVisible(
            ` ${theme.fg("dim", ">_")} ${theme.bold("XTRM")} ${theme.fg("dim", `(v1.0.0)`)}`,
            boxWidth - 2
          ) +
          border("│");
        const gap = leftPad + border("│") + fitVisible("", boxWidth - 2) + border("│");
        const line2 =
          leftPad +
          border("│") +
          fitVisible(
            ` ${theme.fg("dim", "model:".padEnd(11))}${model} ${thinking}${theme.fg("accent", "    /model")}${theme.fg("dim", " to change")}`,
            boxWidth - 2
          ) +
          border("│");
        const line3 =
          leftPad +
          border("│") +
          fitVisible(
            ` ${theme.fg("dim", "directory:".padEnd(11))}${basename(ctx.cwd)}`,
            boxWidth - 2
          ) +
          border("│");
        const bottom = leftPad + border(`╰${"─".repeat(Math.max(0, boxWidth - 2))}╯`);

        return [top, line1, gap, line2, line3, bottom];
      },
    }));
  } else {
    ctx.ui.setHeader(undefined);
  }

  // Footer - ONLY if showFooter is true (default false for XTRM)
  // This is the key difference from pi-dex - we let custom-footer handle it
  if (prefs.showFooter) {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
      return {
        dispose: unsubscribe,
        invalidate() {},
        render(width: number): string[] {
          const modelId = ctx.model?.id ?? "no-model";
          const thinking = getThinkingLevel();
          const contextUsage = ctx.getContextUsage();
          const leftPct = contextUsage?.percent != null ? `${100 - Math.round(contextUsage.percent)}% left` : undefined;
          const line = theme.fg(
            "dim",
            [`${modelId} ${thinking}`, leftPct, basename(ctx.cwd)]
              .filter(Boolean)
              .join(" · ")
          );
          return [truncateToWidth(line, width)];
        },
      };
    });
  }
  // If showFooter is false, we do NOT call setFooter - custom-footer will handle it
}

// ============================================================================
// Tool Render Helpers
// ============================================================================

function renderOutputPreview(theme: any, lines: string[], maxLines: number): string {
  const subset = lines.slice(0, maxLines);
  let text = subset.map((line) => theme.fg("toolOutput", `  ${line}`)).join("\n");
  if (lines.length > maxLines) text += `\n${theme.fg("muted", `  … +${lines.length - maxLines} more`)}`;
  return text;
}

function renderVerticalPreview(theme: any, lines: string[], maxLines: number): string {
  const subset = lines.slice(0, maxLines);
  let text = subset.map((line) => `${theme.fg("muted", "│")} ${theme.fg("toolOutput", line)}`).join("\n");
  if (lines.length > maxLines) text += `\n${theme.fg("muted", "│")} ${theme.fg("muted", `… +${lines.length - maxLines} more lines`)}`;
  return text;
}


function lineRange(offset?: number, limit?: number): string | undefined {
  if (offset == null && limit == null) return undefined;
  const start = offset ?? 1;
  if (limit == null) return `${start}`;
  return `${start}-${start + limit - 1}`;
}

function summarizeCount(text: string): number {
  return text.split("\n").filter((line) => line.trim().length > 0).length;
}

// ============================================================================
// Editor (task p38n.3)
// ============================================================================

class XtrmEditor extends CustomEditor {
  constructor(...args: ConstructorParameters<typeof CustomEditor>) {
    super(...args);
  }

  setPrefs(prefs: XtrmUiPrefs): void {
    this.setPaddingX(prefs.density === "comfortable" ? 2 : 1);
  }

  render(width: number): string[] {
    return super.render(width);
  }
}

// ============================================================================
// Commands
// ============================================================================

function sendInfoMessage(pi: ExtensionAPI, title: string, content: string): void {
  pi.sendMessage({
    customType: "xtrm-ui-info",
    content,
    display: true,
    details: { title },
  });
}

function parseThemeArg(arg: string): XtrmThemeName | undefined {
  const normalized = arg.trim().toLowerCase();
  if (normalized === "dark" || normalized === "pidex-dark") return "pidex-dark";
  if (normalized === "light" || normalized === "pidex-light") return "pidex-light";
  return undefined;
}

function parseDensityArg(arg: string): XtrmDensity | undefined {
  const normalized = arg.trim().toLowerCase();
  if (normalized === "compact") return "compact";
  if (normalized === "comfortable" || normalized === "normal") return "comfortable";
  return undefined;
}

function registerCommands(pi: ExtensionAPI, getPrefs: () => XtrmUiPrefs, setPrefs: (p: XtrmUiPrefs) => void, getThinkingLevel: () => string) {
  pi.registerMessageRenderer("xtrm-ui-info", (message, _options, theme) => {
    const title = (message.details as { title?: string } | undefined)?.title ?? "XTRM UI";
    const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
    box.addChild(new Text(theme.fg("customMessageLabel", theme.bold(title)), 0, 0));
    box.addChild(new Text(theme.fg("customMessageText", String(message.content ?? "")), 0, 0));
    return box;
  });

  pi.registerCommand("xtrm-ui", {
    description: "Show XTRM UI status and active preferences",
    handler: async (_args, ctx) => {
      const prefs = getPrefs();
      const contextUsage = ctx.getContextUsage();
      const lines = [
        `Theme: ${prefs.themeName}`,
        `Force theme: ${prefs.forceTheme ? "on" : "off"}`,
        `Density: ${prefs.density}`,
        `Compact tools: ${prefs.compactTools ? "on" : "off"}`,
        `Show header: ${prefs.showHeader ? "yes" : "no"}`,
        `Show footer: ${prefs.showFooter ? "yes" : "no"} (custom-footer handles this)`,
        `Model: ${ctx.model?.id ?? "none"}`,
        `Context: ${contextUsage?.tokens ?? "unknown"}/${contextUsage?.contextWindow ?? "unknown"}`,
      ];
      sendInfoMessage(pi, "XTRM UI status", lines.join("\\n"));
    },
  });

  pi.registerCommand("xtrm-ui-theme", {
    description: "Switch XTRM UI theme: dark|light",
    getArgumentCompletions: (prefix) => {
      const values = ["dark", "light"].filter((item) => item.startsWith(prefix));
      return values.length > 0 ? values.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const themeName = parseThemeArg(args);
      if (!themeName) {
        ctx.ui.notify("Usage: /xtrm-ui-theme dark|light", "warning");
        return;
      }
      const prefs = { ...getPrefs(), themeName };
      setPrefs(prefs);
      persistPrefs(pi, prefs);
      applyXtrmChrome(ctx, prefs, getThinkingLevel);
      ctx.ui.notify(`XTRM UI theme set to ${themeName}`, "info");
    },
  });

  pi.registerCommand("xtrm-ui-density", {
    description: "Switch XTRM UI density: compact|comfortable",
    getArgumentCompletions: (prefix) => {
      const values = ["compact", "comfortable"].filter((item) => item.startsWith(prefix));
      return values.length > 0 ? values.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const density = parseDensityArg(args);
      if (!density) {
        ctx.ui.notify("Usage: /xtrm-ui-density compact|comfortable", "warning");
        return;
      }
      const prefs = { ...getPrefs(), density };
      setPrefs(prefs);
      persistPrefs(pi, prefs);
      applyXtrmChrome(ctx, prefs, getThinkingLevel);
      ctx.ui.notify(`XTRM UI density set to ${density}`, "info");
    },
  });

  pi.registerCommand("xtrm-ui-header", {
    description: "Toggle XTRM UI header: on|off",
    getArgumentCompletions: (prefix) => {
      const values = ["on", "off"].filter((item) => item.startsWith(prefix));
      return values.length > 0 ? values.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const showHeader = args.trim().toLowerCase() === "on";
      const prefs = { ...getPrefs(), showHeader };
      setPrefs(prefs);
      persistPrefs(pi, prefs);
      applyXtrmChrome(ctx, prefs, getThinkingLevel);
      ctx.ui.notify(`XTRM UI header ${showHeader ? "enabled" : "disabled"}`, "info");
    },
  });

  pi.registerCommand("xtrm-ui-forcetheme", {
    description: "Control whether xtrm-ui overrides the active theme: on|off",
    getArgumentCompletions: (prefix) => {
      const values = ["on", "off"].filter((item) => item.startsWith(prefix));
      return values.length > 0 ? values.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const normalized = args.trim().toLowerCase();
      if (normalized !== "on" && normalized !== "off") {
        ctx.ui.notify("Usage: /xtrm-ui-forcetheme on|off", "warning");
        return;
      }
      const forceTheme = normalized === "on";
      const prefs = { ...getPrefs(), forceTheme };
      setPrefs(prefs);
      persistPrefs(pi, prefs);
      applyXtrmChrome(ctx, prefs, getThinkingLevel);
      ctx.ui.notify(`XTRM UI force theme ${forceTheme ? "enabled" : "disabled"}`, "info");
    },
  });

  pi.registerCommand("xtrm-ui-reset", {
    description: "Restore XTRM UI defaults",
    handler: async (_args, ctx) => {
      const prefs = { ...DEFAULT_PREFS };
      setPrefs(prefs);
      persistPrefs(pi, prefs);
      applyXtrmChrome(ctx, prefs, getThinkingLevel);
      ctx.ui.notify("XTRM UI reset to defaults", "info");
    },
  });
}

// ============================================================================
// Tool Renderers (ported from pi-dex tooling.ts)
// ============================================================================

type BuiltInTools = ReturnType<typeof createBuiltInTools>;

type XtrmMeta<TArgs = Record<string, unknown>> = {
  tool: string;
  args: TArgs;
  durationMs: number;
};

type XtrmWritePreview =
  | { kind: "created"; lineCount: number }
  | { kind: "updated"; diff: string; additions: number; removals: number }
  | { kind: "unchanged" };

type DetailsWithXtrmMeta<TDetails, TArgs = Record<string, unknown>> = TDetails & {
  xtrmMeta?: XtrmMeta<TArgs>;
  xtrmWritePreview?: XtrmWritePreview;
};

const toolCache = new Map<string, BuiltInTools>();

function createBuiltInTools(cwd: string) {
  return {
    bash: createBashTool(cwd),
    read: createReadTool(cwd),
    edit: createEditTool(cwd),
    write: createWriteTool(cwd),
    find: createFindTool(cwd),
    grep: createGrepTool(cwd),
    ls: createLsTool(cwd),
  };
}

function getTools(cwd: string): BuiltInTools {
  let tools = toolCache.get(cwd);
  if (!tools) {
    tools = createBuiltInTools(cwd);
    toolCache.set(cwd, tools);
  }
  return tools;
}

function withXtrmMeta<TDetails extends object, TArgs extends Record<string, unknown>>(
  details: TDetails | undefined,
  tool: string,
  args: TArgs,
  durationMs: number,
): DetailsWithXtrmMeta<TDetails, TArgs> {
  return { ...(details ?? ({} as TDetails)), xtrmMeta: { tool, args, durationMs } };
}

function getXtrmMeta<TDetails extends object, TArgs extends Record<string, unknown>>(
  details: TDetails | undefined,
): XtrmMeta<TArgs> | undefined {
  if (!details || typeof details !== "object") return undefined;
  return (details as DetailsWithXtrmMeta<TDetails, TArgs>).xtrmMeta;
}

function getTextContent(result: { content: Array<{ type: string; text?: string }> }): string {
  const item = result.content.find((content) => content.type === "text");
  return item?.text ?? "";
}

function createWritePreview(path: string, nextContent: string): XtrmWritePreview {
  if (!path || !existsSync(path)) {
    return { kind: "created", lineCount: lineCount(nextContent) };
  }

  let currentContent = "";
  try {
    currentContent = readFileSync(path, "utf8");
  } catch {
    return { kind: "created", lineCount: lineCount(nextContent) };
  }

  if (currentContent === nextContent) return { kind: "unchanged" };

  const diff = createUnifiedLineDiff(currentContent, nextContent);
  const stats = diffStats(diff);
  return {
    kind: "updated",
    diff,
    additions: stats.additions,
    removals: stats.removals,
  };
}

function renderPendingCall(toolName: string, args: Record<string, unknown>, theme: any): Text {
  return new Text(renderToolSummary(theme, "pending", toolName, summarizeToolSubject(toolName, args), undefined), 0, 0);
}

function stableToolSignature(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${JSON.stringify(args)}`;
}

function summarizeToolSubject(toolName: string, args: Record<string, unknown>): string | undefined {
  switch (toolName) {
    case "bash": return shortenCommand(String(args.command ?? ""), 52);
    case "read": {
      const path = shortenPath(String(args.path ?? ""), 42);
      const range = lineRange(args.offset as number | undefined, args.limit as number | undefined);
      return range ? `${path}:${range}` : path;
    }
    case "edit":
    case "write": return shortenPath(String(args.path ?? ""), 42);
    case "find":
    case "grep": return String(args.pattern ?? "");
    case "ls": return shortenPath(String(args.path ?? "."), 42);
    default: return undefined;
  }
}

const SERENA_COMPACT_TOOLS = new Set([
  "find_symbol",
  "find_referencing_symbols",
  "insert_after_symbol",
  "replace_symbol_body",
  "read_file",
  "get_symbols_overview",
  "insert_before_symbol",
  "rename_symbol",
  "restart_language_server",
  "jet_brains_get_symbols_overview",
  "jet_brains_find_symbol",
  "jet_brains_find_referencing_symbols",
  "jet_brains_type_hierarchy",
  "search_for_pattern",
  "list_dir",
  "find_file",
  "create_text_file",
  "replace_content",
  "delete_lines",
  "replace_lines",
  "insert_at_line",
  "execute_shell_command",
  "get_current_config",
  "activate_project",
  "remove_project",
  "switch_modes",
  "open_dashboard",
  "check_onboarding_performed",
  "onboarding",
  "initial_instructions",
  "prepare_for_new_conversation",
  "summarize_changes",
  "think_about_collected_information",
  "think_about_task_adherence",
  "think_about_whether_you_are_done",
  "read_memory",
  "write_memory",
  "list_memories",
  "delete_memory",
  "rename_memory",
  "edit_memory",
  "serena_mcp_reset",
]);

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function countSearchMatches(payload: unknown): number | undefined {
  const record = asRecord(payload);
  if (!record) return undefined;
  let total = 0;
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) total += value.length;
  }
  return total > 0 ? total : undefined;
}

function countOverviewSymbols(payload: unknown): number {
  if (Array.isArray(payload)) {
    const nested = payload.reduce<number>((total, value) => total + countOverviewSymbols(value), 0);
    return nested || payload.length;
  }
  const record = asRecord(payload);
  if (!record) return 0;
  return Object.values(record).reduce<number>((total, value) => total + countOverviewSymbols(value), 0);
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

function countJsonItems(payload: unknown): number | undefined {
  if (Array.isArray(payload)) return payload.length;
  const record = asRecord(payload);
  if (!record) return undefined;

  let total = 0;
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) total += value.length;
  }
  return total > 0 ? total : undefined;
}

function summarizeSerenaSubject(toolName: string, input: Record<string, unknown>): string | undefined {
  switch (toolName) {
    case "find_symbol":
    case "find_referencing_symbols":
    case "replace_symbol_body":
    case "insert_after_symbol":
    case "insert_before_symbol":
    case "rename_symbol":
    case "jet_brains_find_symbol":
    case "jet_brains_find_referencing_symbols":
    case "jet_brains_type_hierarchy":
      return String(input.name_path_pattern ?? input.name_path ?? "symbol");
    case "get_symbols_overview":
    case "jet_brains_get_symbols_overview":
    case "read_file":
    case "create_text_file":
    case "replace_content":
    case "replace_lines":
    case "delete_lines":
    case "insert_at_line":
    case "list_dir":
    case "find_file":
      return shortenPath(String(input.relative_path ?? input.path ?? "."), 42);
    case "search_for_pattern":
      return shortenCommand(String(input.substring_pattern ?? ""), 52);
    case "read_memory":
    case "write_memory":
    case "delete_memory":
    case "rename_memory":
    case "edit_memory":
      return String(input.memory_name ?? input.old_name ?? "memory");
    case "activate_project":
    case "remove_project":
      return String(input.project ?? input.project_name ?? "project");
    case "switch_modes": {
      const modes = input.modes;
      if (Array.isArray(modes)) return modes.map((mode) => String(mode)).join(",");
      return "modes";
    }
    case "execute_shell_command":
      return shortenCommand(String(input.command ?? ""), 52);
    default:
      return undefined;
  }
}

function summarizeSerenaToolResult(
  toolName: string,
  input: Record<string, unknown>,
  text: string,
  durationMs: number | undefined,
): string {
  const payload = parseJson(text);
  const duration = formatDuration(durationMs);
  const subject = summarizeSerenaSubject(toolName, input);
  const meta = (...parts: Array<string | undefined>) => {
    const joined = joinMeta(parts);
    return joined ? ` · ${joined}` : "";
  };

  switch (toolName) {
    case "find_symbol":
    case "find_referencing_symbols":
    case "jet_brains_find_symbol":
    case "jet_brains_find_referencing_symbols": {
      const count = countJsonItems(payload) ?? (text.match(/"name_path"\s*:/g)?.length ?? 0);
      return `• serena ${toolName} ${subject ?? "symbol"}${meta(formatLineLabel(count, "result"), duration)}`;
    }
    case "get_symbols_overview":
    case "jet_brains_get_symbols_overview":
    case "jet_brains_type_hierarchy": {
      const count = Math.max(countOverviewSymbols(payload), text.match(/"name_path"\s*:/g)?.length ?? 0);
      return `• serena ${toolName} ${subject ?? "file"}${meta(formatLineLabel(count, "symbol"), duration)}`;
    }
    case "search_for_pattern": {
      const count = countSearchMatches(payload) ?? (text.match(/^\s*>\s*\d+:/gm)?.length ?? 0);
      return `• serena search ${subject ?? "pattern"}${meta(formatLineLabel(count, "match"), duration)}`;
    }
    case "read_file": {
      return `• serena read ${subject ?? "file"}${meta(formatLineLabel(countLines(text), "line"), duration)}`;
    }
    case "list_dir": {
      const count = countJsonItems(payload) ?? countLines(text);
      return `• serena list_dir ${subject ?? "."}${meta(formatLineLabel(count, "entry"), duration)}`;
    }
    case "find_file": {
      const count = countJsonItems(payload) ?? countLines(text);
      return `• serena find_file ${String(input.file_mask ?? "")}${meta(formatLineLabel(count, "match"), duration)}`;
    }
    case "replace_symbol_body":
    case "insert_after_symbol":
    case "insert_before_symbol":
    case "rename_symbol":
    case "create_text_file":
    case "replace_content":
    case "replace_lines":
    case "delete_lines":
    case "insert_at_line":
    case "write_memory":
    case "delete_memory":
    case "rename_memory":
    case "edit_memory":
    case "activate_project":
    case "remove_project":
    case "switch_modes":
    case "restart_language_server":
    case "onboarding":
    case "serena_mcp_reset":
      return `• serena ${toolName}${subject ? ` ${subject}` : ""}${meta(duration)}`;
    case "execute_shell_command": {
      const count = countLines(text);
      return `• serena shell ${subject ?? "command"}${meta(formatLineLabel(count, "line"), duration)}`;
    }
    default: {
      const count = countJsonItems(payload) ?? countLines(text);
      return `• serena ${toolName}${subject ? ` ${subject}` : ""}${meta(formatLineLabel(count, "item"), duration)}`;
    }
  }
}

function registerXtrmUiTools(pi: ExtensionAPI): void {
  const activeToolCalls = new Map<string, string>();
  const activeSignatureCounts = new Map<string, number>();
  const toolCallStartTimes = new Map<string, number>();

  const trackToolCallStart = (toolCallId: string, toolName: string, args: Record<string, unknown>) => {
    const signature = stableToolSignature(toolName, args);
    activeToolCalls.set(toolCallId, signature);
    activeSignatureCounts.set(signature, (activeSignatureCounts.get(signature) ?? 0) + 1);
    toolCallStartTimes.set(toolCallId, Date.now());
  };

  const trackToolCallEnd = (toolCallId: string) => {
    const signature = activeToolCalls.get(toolCallId);
    if (!signature) return;
    activeToolCalls.delete(toolCallId);
    const next = (activeSignatureCounts.get(signature) ?? 1) - 1;
    if (next <= 0) activeSignatureCounts.delete(signature);
    else activeSignatureCounts.set(signature, next);
    toolCallStartTimes.delete(toolCallId);
  };

  const isToolCallActive = (toolName: string, args: Record<string, unknown>) =>
    activeSignatureCounts.has(stableToolSignature(toolName, args));

  const renderPendingCallIfActive = (toolName: string, args: Record<string, unknown>, theme: any) =>
    isToolCallActive(toolName, args) ? renderPendingCall(toolName, args, theme) : new Text("", 0, 0);

  pi.on("tool_call", async (event) => {
    trackToolCallStart(event.toolCallId, event.toolName, event.input as Record<string, unknown>);
  });

  pi.on("tool_execution_end", async (event) => {
    trackToolCallEnd(event.toolCallId);
  });

  pi.on("tool_result", async (event: ToolResultEvent, ctx) => {
    if (!SERENA_COMPACT_TOOLS.has(event.toolName)) return undefined;
    if (ctx.ui.getToolsExpanded()) return undefined;
    if (event.isError) return undefined;

    const text = getTextContent({ content: event.content as Array<{ type: string; text?: string }> });
    if (!text.trim()) return undefined;

    const startedAt = toolCallStartTimes.get(event.toolCallId);
    const durationMs = startedAt != null ? Date.now() - startedAt : undefined;
    const compactText = summarizeSerenaToolResult(event.toolName, event.input, text, durationMs);

    return {
      content: [{ type: "text", text: compactText }],
      details: event.details,
    };
  });

  pi.registerTool({
    name: "bash",
    label: "bash",
    description: getTools(process.cwd()).bash.description,
    parameters: getTools(process.cwd()).bash.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const started = Date.now();
      const result = await getTools(ctx.cwd).bash.execute(toolCallId, params, signal, onUpdate);
      return { ...result, details: withXtrmMeta(result.details as BashToolDetails | undefined, "bash", params as Record<string, unknown>, Date.now() - started) };
    },
    renderCall: (args, theme) => renderPendingCallIfActive("bash", args as Record<string, unknown>, theme),
    renderResult(result, { expanded, isPartial }, theme) {
      const details = (result.details ?? {}) as DetailsWithXtrmMeta<BashToolDetails, Record<string, unknown>>;
      const meta = getXtrmMeta<BashToolDetails, Record<string, unknown>>(details);
      const command = shortenCommand(String(meta?.args.command ?? ""));
      if (isPartial) {
        return new Text(`${theme.fg("accent", "•")} ${theme.fg("toolTitle", "Running ")}${theme.fg("accent", command)}${theme.fg("toolTitle", " in bash")}`, 0, 0);
      }
      const output = getTextContent(result as any);
      const outputLines = cleanOutputLines(output);
      const exitMatch = output.match(/exit code:\s*(-?\d+)/i);
      const exitCode = exitMatch ? Number.parseInt(exitMatch[1] ?? "0", 10) : 0;
      const bullet = exitCode === 0 ? theme.fg("success", "•") : theme.fg("error", "•");
      const summary = joinMeta([formatLineLabel(outputLines.length, "line"), formatDuration(meta?.durationMs), details.truncation?.truncated ? "truncated" : undefined]);
      let text = `${bullet} ${theme.fg("toolTitle", "Ran ")}${theme.fg("accent", command)}`;
      if (summary) text += theme.fg("dim", ` · ${summary}`);
      if (expanded && outputLines.length > 0) text += `\n${renderVerticalPreview(theme, outputLines, 10)}`;
      return new Text(text, 0, 0);
    },
  });

  pi.registerTool({
    name: "read",
    label: "read",
    description: getTools(process.cwd()).read.description,
    parameters: getTools(process.cwd()).read.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const started = Date.now();
      const result = await getTools(ctx.cwd).read.execute(toolCallId, params, signal, onUpdate);
      return { ...result, details: withXtrmMeta(result.details as ReadToolDetails | undefined, "read", params as Record<string, unknown>, Date.now() - started) };
    },
    renderCall: (args, theme) => renderPendingCallIfActive("read", args as Record<string, unknown>, theme),
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(renderToolSummary(theme, "pending", "read", "loading", undefined), 0, 0);
      const details = (result.details ?? {}) as DetailsWithXtrmMeta<ReadToolDetails, Record<string, unknown>>;
      const meta = getXtrmMeta<ReadToolDetails, Record<string, unknown>>(details);
      const subjectBase = shortenPath(String(meta?.args.path ?? ""));
      const range = lineRange(meta?.args.offset as number | undefined, meta?.args.limit as number | undefined);
      const subject = range ? `${subjectBase}:${range}` : subjectBase;
      const first = result.content[0];
      if (first?.type === "image") {
        return new Text(renderToolSummary(theme, "success", "read", subject, joinMeta(["image", formatDuration(meta?.durationMs)])), 0, 0);
      }
      const textContent = getTextContent(result as any);
      const lines = textContent.split("\n");
      let text = renderToolSummary(theme, "success", "read", subject, joinMeta([formatLineLabel(lines.length, "line"), formatDuration(meta?.durationMs), details.truncation?.truncated ? `from ${details.truncation.totalLines}` : undefined]));
      if (expanded && textContent.length > 0) text += `\n${renderOutputPreview(theme, previewLines(textContent, 14), 14)}`;
      return new Text(text, 0, 0);
    },
  });

  pi.registerTool({
    name: "edit",
    label: "edit",
    description: getTools(process.cwd()).edit.description,
    parameters: getTools(process.cwd()).edit.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const started = Date.now();
      const result = await getTools(ctx.cwd).edit.execute(toolCallId, params, signal, onUpdate);
      return { ...result, details: withXtrmMeta(result.details as EditToolDetails | undefined, "edit", params as Record<string, unknown>, Date.now() - started) };
    },
    renderCall: (args, theme) => renderPendingCallIfActive("edit", args as Record<string, unknown>, theme),
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(renderToolSummary(theme, "pending", "edit", "applying", undefined), 0, 0);
      const details = (result.details ?? {}) as DetailsWithXtrmMeta<EditToolDetails, Record<string, unknown>>;
      const meta = getXtrmMeta<EditToolDetails, Record<string, unknown>>(details);
      const textContent = getTextContent(result as any);
      if (/^error/i.test(textContent.trim())) {
        return new Text(renderToolSummary(theme, "error", "edit", shortenPath(String(meta?.args.path ?? "")), textContent.split("\n")[0]), 0, 0);
      }
      const stats = details.diff ? diffStats(details.diff) : { additions: 0, removals: 0 };
      let text = renderToolSummary(theme, "success", "edit", shortenPath(String(meta?.args.path ?? "")), joinMeta([`+${stats.additions}`, `-${stats.removals}`, formatDuration(meta?.durationMs)]));
      if (expanded && details.diff) text += `\n${renderRichDiffPreview(theme, details.diff, 18)}`;
      return new Text(text, 0, 0);
    },
  });

  pi.registerTool({
    name: "write",
    label: "write",
    description: getTools(process.cwd()).write.description,
    parameters: getTools(process.cwd()).write.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const started = Date.now();
      const args = params as Record<string, unknown>;
      const path = String(args.path ?? "");
      const content = String(args.content ?? "");
      const preview = createWritePreview(path, content);
      const result = await getTools(ctx.cwd).write.execute(toolCallId, params, signal, onUpdate);
      const details = withXtrmMeta(result.details as Record<string, never> | undefined, "write", args, Date.now() - started);
      return { ...result, details: { ...details, xtrmWritePreview: preview } };
    },
    renderCall: (args, theme) => renderPendingCallIfActive("write", args as Record<string, unknown>, theme),
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(renderToolSummary(theme, "pending", "write", "writing", undefined), 0, 0);
      const details = (result.details ?? {}) as DetailsWithXtrmMeta<Record<string, never>, Record<string, unknown>>;
      const meta = getXtrmMeta<Record<string, never>, Record<string, unknown>>(details);
      const textContent = getTextContent(result as any);
      if (/^error/i.test(textContent.trim())) {
        return new Text(renderToolSummary(theme, "error", "write", shortenPath(String(meta?.args.path ?? "")), textContent.split("\n")[0]), 0, 0);
      }

      const subject = shortenPath(String(meta?.args.path ?? ""));
      const preview = details.xtrmWritePreview;

      if (preview?.kind === "unchanged") {
        return new Text(renderToolSummary(theme, "success", "write", subject, joinMeta(["no changes", formatDuration(meta?.durationMs)])), 0, 0);
      }

      if (preview?.kind === "updated") {
        let text = renderToolSummary(
          theme,
          "success",
          "write",
          subject,
          joinMeta([`+${preview.additions}`, `-${preview.removals}`, formatDuration(meta?.durationMs)]),
        );
        if (expanded && preview.diff) text += `\n${renderRichDiffPreview(theme, preview.diff, 18)}`;
        return new Text(text, 0, 0);
      }

      const lines = preview?.kind === "created"
        ? preview.lineCount
        : lineCount(String(meta?.args.content ?? ""));

      return new Text(
        renderToolSummary(
          theme,
          "success",
          "write",
          subject,
          joinMeta([formatLineLabel(lines, "line"), formatDuration(meta?.durationMs)]),
        ),
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "find",
    label: "find",
    description: getTools(process.cwd()).find.description,
    parameters: getTools(process.cwd()).find.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const started = Date.now();
      const result = await getTools(ctx.cwd).find.execute(toolCallId, params, signal, onUpdate);
      return { ...result, details: withXtrmMeta(result.details as FindToolDetails | undefined, "find", params as Record<string, unknown>, Date.now() - started) };
    },
    renderCall: (args, theme) => renderPendingCallIfActive("find", args as Record<string, unknown>, theme),
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(renderToolSummary(theme, "pending", "find", "searching", undefined), 0, 0);
      const details = (result.details ?? {}) as DetailsWithXtrmMeta<FindToolDetails, Record<string, unknown>>;
      const meta = getXtrmMeta<FindToolDetails, Record<string, unknown>>(details);
      const textContent = getTextContent(result as any);
      const count = summarizeCount(textContent);
      let text = renderToolSummary(theme, "success", "find", String(meta?.args.pattern ?? ""), joinMeta([formatLineLabel(count, "match"), formatDuration(meta?.durationMs), details.resultLimitReached ? "limit reached" : undefined]));
      if (expanded && count > 0) text += `\n${renderOutputPreview(theme, previewLines(textContent, 10), 10)}`;
      return new Text(text, 0, 0);
    },
  });

  pi.registerTool({
    name: "grep",
    label: "grep",
    description: getTools(process.cwd()).grep.description,
    parameters: getTools(process.cwd()).grep.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const started = Date.now();
      const result = await getTools(ctx.cwd).grep.execute(toolCallId, params, signal, onUpdate);
      return { ...result, details: withXtrmMeta(result.details as GrepToolDetails | undefined, "grep", params as Record<string, unknown>, Date.now() - started) };
    },
    renderCall: (args, theme) => renderPendingCallIfActive("grep", args as Record<string, unknown>, theme),
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(renderToolSummary(theme, "pending", "grep", "searching", undefined), 0, 0);
      const details = (result.details ?? {}) as DetailsWithXtrmMeta<GrepToolDetails, Record<string, unknown>>;
      const meta = getXtrmMeta<GrepToolDetails, Record<string, unknown>>(details);
      const textContent = getTextContent(result as any);
      const count = countPrefixedItems(textContent, ["-- "]) || summarizeCount(textContent);
      let text = renderToolSummary(theme, "success", "grep", String(meta?.args.pattern ?? ""), joinMeta([formatLineLabel(count, "match"), formatDuration(meta?.durationMs), details.matchLimitReached ? "limit reached" : undefined]));
      if (expanded && textContent.length > 0) text += `\n${renderOutputPreview(theme, previewLines(textContent, 12), 12)}`;
      return new Text(text, 0, 0);
    },
  });

  pi.registerTool({
    name: "ls",
    label: "ls",
    description: getTools(process.cwd()).ls.description,
    parameters: getTools(process.cwd()).ls.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const started = Date.now();
      const result = await getTools(ctx.cwd).ls.execute(toolCallId, params, signal, onUpdate);
      return { ...result, details: withXtrmMeta(result.details as LsToolDetails | undefined, "ls", params as Record<string, unknown>, Date.now() - started) };
    },
    renderCall: (args, theme) => renderPendingCallIfActive("ls", args as Record<string, unknown>, theme),
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(renderToolSummary(theme, "pending", "ls", "listing", undefined), 0, 0);
      const details = (result.details ?? {}) as DetailsWithXtrmMeta<LsToolDetails, Record<string, unknown>>;
      const meta = getXtrmMeta<LsToolDetails, Record<string, unknown>>(details);
      const textContent = getTextContent(result as any);
      const count = summarizeCount(textContent);
      let text = renderToolSummary(theme, "success", "ls", shortenPath(String(meta?.args.path ?? ".")), joinMeta([formatLineLabel(count, "entry"), formatDuration(meta?.durationMs), details.entryLimitReached ? "limit reached" : undefined]));
      if (expanded && count > 0) text += `\n${renderOutputPreview(theme, previewLines(textContent, 12), 12)}`;
      return new Text(text, 0, 0);
    },
  });
}

// ============================================================================
// Main Extension
// ============================================================================

function isXtrmTheme(name: string | undefined): boolean {
  return name === "pidex-dark" || name === "pidex-light";
}

export default function xtrmUiExtension(pi: ExtensionAPI): void {
  let prefs: XtrmUiPrefs = { ...DEFAULT_PREFS };
  let previousThemeName: string | null = null;
  const extensionThemeDir = join(__dirname, "themes");

  const getPrefs = () => prefs;
  const setPrefs = (p: XtrmUiPrefs) => { prefs = p; };
  const getThinkingLevel = () => formatThinking(pi.getThinkingLevel());

  registerXtrmUiTools(pi);
  registerCommands(pi, getPrefs, setPrefs, getThinkingLevel);

  const refresh = (ctx: ExtensionContext) => {
    applyXtrmChrome(ctx, prefs, getThinkingLevel);
  };

  pi.on("resources_discover", async () => ({
    themePaths: [extensionThemeDir],
  }));

  pi.on("session_start", async (_event, ctx) => {
    prefs = loadPrefs(ctx.sessionManager.getEntries() as Array<MaybeCustomEntry>);
    if (!previousThemeName && !isXtrmTheme(ctx.ui.theme.name)) {
      previousThemeName = ctx.ui.theme.name ?? null;
    }
    refresh(ctx);

    setTimeout(() => {
      if (prefs.forceTheme) ctx.ui.setTheme(prefs.themeName);
    }, 0);
  });

  pi.on("session_switch", async (_event, ctx) => {
    if (!previousThemeName && !isXtrmTheme(ctx.ui.theme.name)) {
      previousThemeName = ctx.ui.theme.name ?? null;
    }
    refresh(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    if (!previousThemeName && !isXtrmTheme(ctx.ui.theme.name)) {
      previousThemeName = ctx.ui.theme.name ?? null;
    }
    refresh(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (previousThemeName) {
      ctx.ui.setTheme(previousThemeName);
    }
  });

  pi.on("input", async (event) => {
    if (event.source === "extension") return { action: "continue" as const };
    if (!event.text.trim()) return { action: "continue" as const };
    if (event.text.startsWith("/") || event.text.startsWith("!")) return { action: "continue" as const };
    if (event.text.startsWith("› ")) return { action: "continue" as const };
    return event.images
      ? { action: "transform" as const, text: `› ${event.text}`, images: event.images }
      : { action: "transform" as const, text: `› ${event.text}` };
  });

  pi.on("context", async (event) => {
    const messages = event.messages.map((message) => {
      if (message.role === "user" && typeof message.content === "string" && message.content.startsWith("› ")) {
        return { ...message, content: message.content.slice(2) };
      }
      if (message.role === "user" && Array.isArray(message.content)) {
        return {
          ...message,
          content: message.content.map((item, index) =>
            index === 0 && item.type === "text" && item.text.startsWith("› ")
              ? { ...item, text: item.text.slice(2) }
              : item
          ),
        };
      }
      return message;
    });
    return { messages };
  });
}
