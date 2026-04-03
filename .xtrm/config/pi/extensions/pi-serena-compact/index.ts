import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";

// Serena/GitNexus MCP tool names that produce verbose output
const COMPACT_TOOLS = new Set([
  // Serena symbol operations
  "find_symbol",
  "find_referencing_symbols", 
  "get_symbols_overview",
  "jet_brains_find_symbol",
  "jet_brains_find_referencing_symbols",
  "jet_brains_get_symbols_overview",
  "jet_brains_type_hierarchy",
  
  // Serena file operations
  "read_file",
  "create_text_file",
  "replace_content",
  "replace_lines",
  "delete_lines",
  "insert_at_line",
  
  // Serena search/navigation
  "search_for_pattern",
  "list_dir",
  "find_file",
  
  // Serena symbol editing
  "replace_symbol_body",
  "insert_after_symbol",
  "insert_before_symbol",
  "rename_symbol",
  
  // GitNexus
  "gitnexus_query",
  "gitnexus_context",
  "gitnexus_impact",
  "gitnexus_detect_changes",
  "gitnexus_list_repos",
  
  // Serena memory
  "read_memory",
  "write_memory",
  "list_memories",
  
  // Other verbose tools
  "execute_shell_command",
  "structured_return",
]);

// Tools that should show more output even when compacted
const PRESERVE_OUTPUT_TOOLS = new Set([
  "read_file",
  "read_memory",
  "execute_shell_command",
  "structured_return",
]);

function isSerenaTool(toolName: string): boolean {
  return COMPACT_TOOLS.has(toolName);
}

function getTextContent(content: Array<{ type: string; text?: string }>): string {
  const item = content.find((c) => c.type === "text");
  return item?.text ?? "";
}

function truncateLines(text: string, maxLines: number, maxLineLen = 180): string {
  const lines = text.split("\n");
  const truncated = lines.map(line => 
    line.length > maxLineLen ? line.slice(0, maxLineLen) + "…" : line
  );
  
  if (truncated.length <= maxLines) return truncated.join("\n");
  return truncated.slice(0, maxLines).join("\n") + `\n… +${truncated.length - maxLines} more lines`;
}

function compactResult(
  toolName: string,
  content: Array<{ type: string; text?: string }>,
  maxLines: number = 6,
): Array<{ type: string; text: string }> {
  const textContent = getTextContent(content);
  
  if (!textContent) {
    return [{ type: "text", text: "✓ No output" }];
  }
  
  // For certain tools, show more output
  const effectiveMaxLines = PRESERVE_OUTPUT_TOOLS.has(toolName) ? 12 : maxLines;
  
  const compacted = truncateLines(textContent, effectiveMaxLines, 180);
  
  return [{ type: "text", text: compacted }];
}

export default function serenaCompactExtension(pi: ExtensionAPI): void {
  let toolsExpanded = false;

  // Track tools expanded state
  pi.on("session_start", async (_event, ctx) => {
    toolsExpanded = ctx.ui.getToolsExpanded();
  });

  pi.on("session_switch", async (_event, ctx) => {
    toolsExpanded = ctx.ui.getToolsExpanded();
  });

  // Compact Serena tool results
  pi.on("tool_result", async (event: ToolResultEvent) => {
    // Only handle Serena/MCP tools
    if (!isSerenaTool(event.toolName)) return undefined;
    
    // If tools are expanded, don't compact
    if (toolsExpanded) return undefined;
    
    // Compact the content
    const compacted = compactResult(event.toolName, event.content, 6);
    
    return { content: compacted };
  });
}
