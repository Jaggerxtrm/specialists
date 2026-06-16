# Research Findings: Agent-Runtime Tool Registries and Capability Systems

**Bead:** unitAI-6b821
**Date:** 2026-05-03
**Sources:** 10+ primary sources (repos, docs, code)

---

## Executive Summary

Surveyed 6 agent runtimes for tool registry patterns, permission models, capability classification, and failure handling. Key findings:

| System | Tool Registration | Permission Tiers | Capability Tags | Preference Signals | Failure Handling |
|--------|------------------|------------------|-----------------|-------------------|------------------|
| **pi-mono** (this project) | Hardcoded arrays | 4 levels (READ_ONLY→HIGH) | None | None | Silent skip |
| **Gemini CLI** | ToolRegistry class + MCP discovery | ApprovalMode enum + PolicyEngine | Kind enum (12 values) | Policy rules with priority | Connection states + diagnostics |
| **Claude Code** | MCP config + allowed-tools frontmatter | Sandbox + permission rules | None | Wildcard patterns | OAuth retry + reconnection |
| **VS Code** | IMcpRegistry + gallery | Contribution enablement | McpCapability enum | Extension enablement | State tracking |
| **Aider** | --lint-cmd + model config | None | None | None | Linter-based |
| **OpenHands** | litellm ToolRegistry | None | FunctionDeclaration schema | None | Not documented |

**Recommendation:** Gemini CLI's Kind + PolicyEngine pattern is most mature. pi-mono should adopt capability tags + soft/hard deny modes.

---

## 1. pi-mono (mariozechner/pi-coding-agent)

**Source:** `src/pi/session.ts` (lines 156-243, 643-675)

### Tool Registration
- **Static hardcoded arrays** in `mapPermissionToTools()`:
  - `GITNEXUS_READ_TOOLS` (5 tools)
  - `SERENA_READ_TOOLS` (21 tools)
  - `SERENA_LOW_TOOLS` (1 tool)
  - `SERENA_WRITE_TOOLS` (20 tools)
  - `GITNEXUS_WRITE_TOOLS` (2 tools)
  - Native tools: `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write`

### Permission Tiers
```typescript
// src/pi/session.ts:225-243
switch (level?.toUpperCase()) {
  case 'READ_ONLY': return [read, grep, find, ls, ...GITNEXUS_READ, ...SERENA_READ];
  case 'LOW':       return [...READ_ONLY, bash, ...SERENA_LOW];
  case 'MEDIUM':    return [...LOW, edit, ...SERENA_WRITE, ...GITNEXUS_WRITE];
  case 'HIGH':      return [...MEDIUM, write];
}
```

### Capability Tags
- **None.** Tools grouped by source package, not capability.

### Preference Signals
- **None.** Native `grep` and `gitnexus_query` coexist with no preference.

### Failure Handling
- **Silent skip** via `existsSync()` (lines 662-675):
```typescript
if (!excludedExtensions.has(gitnexusPackageName)) {
  const gitnexusPath = join(npmGlobalDir, gitnexusPackageName);
  if (existsSync(gitnexusPath)) args.push('-e', gitnexusPath);
}
```
- No startup warning, no health probe, no fallback policy.

### Patterns to Adopt
- Capability tags (Kind enum like Gemini CLI)
- Soft/hard deny modes for native fallbacks
- Health probes with `loaded_unhealthy` state

### Patterns to Reject
- Silent extension skip (makes debugging impossible)
- No preference signals (causes explorer-uses-grep problem)

---

## 2. Gemini CLI (google-gemini/gemini-cli)

**Sources:** 
- ToolRegistry: `packages/core/src/tools/tool-registry.ts`
- Kind enum: `packages/core/src/tools/tools.ts`
- PolicyEngine: `packages/core/src/policy/policy.ts`
- MCP handling: `packages/core/src/tools/mcp-client.ts`

### Tool Registration
- **ToolRegistry class** with methods:
  - `registerTool(tool: AnyDeclarativeTool)`
  - `unregisterTool(name: string)`
  - `getTool(name: string)`
  - `getAllTools()`
  - `getFunctionDeclarations(modelId?: string)`
  - `discoverAllTools()` — discovers CLI + MCP tools

### Permission Tiers
- **ApprovalMode enum:** `default`, `auto_edit`, `plan`, `yolo`
- **PolicyEngine** evaluates `PolicyRule` objects:
  - Decision: `allow`, `deny`, `ask_user`
  - Priority tiers: Admin(5) > User(4) > Workspace(3) > Extension(2) > Default(1)
  - Conditions: `toolName`, `argsPattern`, `mcpName`, `toolAnnotations`, `interactive`, `modes`

### Capability Tags
- **Kind enum** (12 values):
  - `Read`, `Edit`, `Delete`, `Move`, `Search`, `Execute`, `Think`, `Agent`, `Fetch`, `Communicate`, `Plan`, `SwitchMode`, `Other`
- Tools declare `kind` property:
```typescript
class ReadFileTool extends DeclarativeTool {
  kind = Kind.Read;
  isReadOnly = true;
}
```
- `READ_ONLY_KINDS` array filters read-only tools.

### Preference Signals
- **Policy rules** with wildcards:
```toml
[[rule]]
toolName = "run_shell_command"
commandPrefix = "npm test"
decision = "allow"
priority = 100
modes = ["default", "autoEdit"]
```
- `getExcludedTools()` method filters by policy before sending to model.

### Failure Handling
- **MCP connection states:** `CONNECTING`, `CONNECTED`, `DISCONNECTED`
- `McpClientManager.getLastError(serverName)` tracks last error
- `emitDiagnostic()` for detailed diagnostics
- Tool errors: `isMCPToolError()` checks `isError` property
- Error sent to model as `functionResponse` for retry

### Patterns to Adopt
- Kind enum for capability classification
- PolicyEngine with priority tiers
- Connection state tracking + `getLastError()`
- `getExcludedTools()` for preference filtering

---

## 3. Claude Code (anthropics/claude-code)

**Sources:**
- MCP integration: `plugins/plugin-dev/skills/mcp-integration/SKILL.md`
- Tool usage: `plugins/plugin-dev/skills/mcp-integration/references/tool-usage.md`
- Server types: `plugins/plugin-dev/skills/mcp-integration/references/server-types.md`

### Tool Registration
- **MCP config** in `settings.json` or command frontmatter:
```json
{
  "my-server": {
    "command": "npx",
    "args": ["-y", "my-mcp-server"]
  }
}
```
- **allowed-tools frontmatter** for commands:
```markdown
---
allowed-tools: [
  "mcp__plugin_asana_asana__asana_create_task",
  "mcp__plugin_asana_asana__asana_search_tasks"
]
---
```

### Permission Tiers
- **Permission rules:** `allow`, `deny`, `ask`
- **Sandbox mode:** PID namespace isolation (Linux)
- `sandbox.failIfUnavailable` setting
- **Dangerous path safety checks** for critical directories
- `PreToolUse` hooks (but `deny` rules take precedence)

### Capability Tags
- **None.** Tools identified by name pattern.

### Preference Signals
- **Wildcard patterns** in allowed-tools:
```markdown
allowed-tools: ["mcp__plugin_asana_asana__*"]
```
- Frontmatter scoping per-command.

### Failure Handling
- **OAuth fixes:** token refresh, timeout handling, `headersHelper`
- **Connection stability:** `ECONNRESET` retry with fresh TCP, bridge reconnection
- **Error reporting:** rate limits, API errors, malformed output
- **Reconnection:** auto-reconnect for SSE, persistent sessions
- **Tool availability:** first-turn headless sessions, subagent inheritance

### Patterns to Adopt
- allowed-tools frontmatter for command scoping
- Sandbox mode with `failIfUnavailable`
- OAuth reconnection logic

---

## 4. VS Code MCP (microsoft/vscode)

**Sources:**
- `src/vs/workbench/contrib/mcp/common/mcpTypes.ts`
- `src/vs/platform/mcp/common/mcpManagementService.ts`
- `src/vs/workbench/services/mcp/common/mcpWorkbenchManagementService.ts`

### Tool Registration
- **IMcpRegistry** interface
- **McpGalleryService** for marketplace installation
- **McpManagementService** for install/uninstall
- Extension-prefixed identifiers: `ext.packageName/toolName`

### Permission Tiers
- **Contribution enablement:** `IEnablementModel`
- `ContributionEnablementState` enum
- Workspace trust gating

### Capability Tags
- **McpCapability enum** (referenced in `mcpTypes.ts:25`)

### Preference Signals
- Extension enablement state controls availability
- Gallery manifest status

### Failure Handling
- Connection state tracking
- Gallery manifest status
- Workbench service error reporting

### Patterns to Adopt
- Extension-prefixed tool names (avoids collisions)
- Gallery-based discovery model

---

## 5. Aider (aider-ai/aider)

**Sources:**
- Model config: `aider/website/docs/config/adv-model-settings.md`
- Linter config: `aider/website/_posts/2024-05-22-linting.md`

### Tool Registration
- **--lint-cmd** for external linters:
```bash
aider --lint-cmd javascript:jslint
```
- Model metadata JSON for unrecognized LLMs

### Permission Tiers
- **None.** LLM controls tool use.

### Capability Tags
- **None.**

### Preference Signals
- Built-in linter disabled for TypeScript (prefers ESLint)

### Failure Handling
- Linter-based feedback loop

### Patterns to Adopt
- (None directly applicable)

---

## 6. OpenHands (openhands/openhands)

**Sources:**
- CodeAct Agent: `openhands/agenthub/codeact_agent/README.md`
- Telemetry: `enterprise/doc/design-doc/openhands-enterprise-telemetry-design.md`

### Tool Registration
- **litellm ChatCompletionToolParam** structure:
```python
MyTool = ChatCompletionToolParam(
    type='function',
    function={
        'name': 'my_tool',
        'description': '...',
        'parameters': {...}
    }
)
```
- **CollectorRegistry** for metrics (not tools)

### Permission Tiers
- **None.**

### Capability Tags
- FunctionDeclaration schema only

### Preference Signals
- **None.**

### Failure Handling
- Not documented in available sources

---

## Design Recommendations for gzrx-tool-catalog

### §2 Capability Axes — Adopt Gemini CLI Kind Enum
**Current:** Capability tags proposed but not standardized.
**Recommendation:** Align with Gemini CLI's 12-value Kind enum:
- `Read`, `Edit`, `Delete`, `Move`, `Search`, `Execute`, `Think`, `Agent`, `Fetch`, `Communicate`, `Plan`, `Other`
- Add `Analyze` for graph operations (GitNexus-specific)
- Split `memory` into `memory.read` / `memory.write` (as doc already notes)

**Source:** Gemini CLI `packages/core/src/tools/tools.ts`

### §3 Tier Policy — Adopt PolicyEngine Pattern
**Current:** Static tier→tool mapping.
**Recommendation:** Implement PolicyEngine with:
- Priority tiers (Admin > User > Workspace > Extension > Default)
- Rule conditions: `toolName`, `argsPattern`, `mcpName`, `modes`
- `denied_natives_mode: soft|hard` as proposed
- `getExcludedTools()` method for filtering

**Source:** Gemini CLI `packages/core/src/policy/policy.ts`

### §4 Tool Catalog Schema — Add Extension Prefix
**Current:** Flat tool names.
**Recommendation:** Adopt VS Code's extension-prefixed naming:
- `pi-gitnexus/gitnexus_query`
- `pi-serena-tools/find_symbol`
- Avoids collisions, clarifies source

**Source:** VS Code `extensionPrefixedIdentifier()` in `mcpTypes.ts`

### §5 Manifest Extension — Add allowed-tools Frontmatter
**Current:** Manifest at tier level only.
**Recommendation:** Add Claude Code-style allowed-tools for specialist-level scoping:
```json
"specialists": {
  "explorer": {
    "allowed_tools": ["gitnexus_*", "serena:read_*"],
    "denied_natives_mode": "hard"
  }
}
```

**Source:** Claude Code `allowed-tools` frontmatter

### §6 Resolved-Debug — Add Health Probes
**Current:** Silent extension skip.
**Recommendation:** Implement Gemini CLI-style health probes:
- `not_installed`, `disabled`, `loaded_healthy`, `loaded_unhealthy`
- `getLastError()` for MCP servers
- `/mcp list` equivalent in `sp config show --resolved`

**Source:** Gemini CLI `McpClientManager.getLastError()`, `MCPServerStatus`

### §7 Migration — Add Soft Deny First
**Current:** No preference signals.
**Recommendation:** Phase 1 = soft deny via prompt instruction (no tool removal).
- Add `preferred_over` metadata to catalog
- System prompt: "Prefer gitnexus_query over grep when GitNexus is loaded"
- Phase 2 = hard deny after verification

**Source:** Gemini CLI `getExcludedTools()` pattern

---

## Anti-Patterns to Avoid

1. **Silent extension skip** (pi-mono current) — makes debugging impossible
2. **No capability tags** (pi-mono, Claude Code) — prevents intelligent filtering
3. **Static tier mapping** (pi-mono) — no runtime adaptation
4. **No health probes** (pi-mono) — can't distinguish `not_installed` from `loaded_unhealthy`
5. **No preference signals** (pi-mono, Aider, OpenHands) — causes explorer-uses-grep problem

---

## Sources Cited

1. `src/pi/session.ts` (pi-mono) — lines 156-243, 643-675
2. Gemini CLI ToolRegistry — `packages/core/src/tools/tool-registry.ts`
3. Gemini CLI Kind enum — `packages/core/src/tools/tools.ts`
4. Gemini CLI PolicyEngine — `packages/core/src/policy/policy.ts`
5. Gemini CLI MCP handling — `packages/core/src/tools/mcp-client.ts`
6. Claude Code MCP integration — `plugins/plugin-dev/skills/mcp-integration/SKILL.md`
7. Claude Code allowed-tools — `plugins/plugin-dev/skills/mcp-integration/references/tool-usage.md`
8. VS Code MCP types — `src/vs/workbench/contrib/mcp/common/mcpTypes.ts`
9. VS Code MCP management — `src/vs/platform/mcp/common/mcpManagementService.ts`
10. Aider linter config — `aider/website/_posts/2024-05-22-linting.md`
11. OpenHands CodeAct — `openhands/agenthub/codeact_agent/README.md`
12. pi-gitnexus tools — `/home/dawid/.nvm/.../pi-gitnexus/dist/tools.js`
13. pi-serena-tools — `/home/dawid/.nvm/.../pi-serena-tools/serenaTools.ts`

---

## Confidence Levels

| Finding | Confidence | Source Quality |
|---------|------------|----------------|
| pi-mono tool registration | HIGH | Direct code read |
| Gemini CLI Kind enum | HIGH | Direct code read |
| Gemini CLI PolicyEngine | HIGH | DeepWiki + code |
| Claude Code allowed-tools | MEDIUM | Docs only (no code access) |
| VS Code MCP types | MEDIUM | ghgrep snippets |
| Aider tool model | LOW | Docs only |
| OpenHands tool registry | MEDIUM | DeepWiki + code snippets |

