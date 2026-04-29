---
title: MCP Tools Reference
scope: mcp-tools
category: reference
version: 2.1.0
updated: 2026-04-29
synced_at: f52d3674
description: MCP tool contract for the Specialists server.
source_of_truth_for:
  - "src/server.ts"
  - "src/tools/specialist/use_specialist.tool.ts"
domain:
  - mcp
  - tools
---

# MCP Tools Reference

This server now exposes a single MCP tool.

## Active tool inventory

| Tool | Purpose |
|---|---|
| `use_specialist` | synchronous specialist run with result returned directly in MCP response |

## `use_specialist`

### Input schema

```ts
z.object({
  name: z.string().describe('Specialist identifier (e.g. codebase-explorer)'),
  prompt: z.string().optional().describe('The task or question for the specialist'),
  bead_id: z.string().optional().describe('Use an existing bead as the specialist prompt'),
  variables: z.record(z.string()).optional().describe('Additional $variable substitutions'),
  backend_override: z.string().optional().describe('Force a specific backend (gemini, qwen, anthropic)'),
  autonomy_level: z.enum(['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH']).optional().describe('Override permission level for this invocation'),
  context_depth: z.number().min(0).max(10).optional().describe('Depth of blocker context injection (0 = none, 1 = immediate blockers, etc.)'),
}).refine((input) => Boolean(input.prompt?.trim() || input.bead_id), {
  message: 'Either prompt or bead_id is required',
  path: ['prompt'],
})
```

### Behavior highlights

- `bead_id` links execution to an existing bead and uses it as task context.
- The tool runs in foreground and returns final output directly in the MCP result.
- For orchestration, monitoring, steering, resume, and cancellation, use the CLI (`specialists run/feed/result/steer/resume/stop`).

## Removed MCP tools

The following tools were intentionally removed from MCP surface and are CLI-only workflows now:

- `start_specialist` *(legacy compatibility implementations may still emit a deprecation warning; migrate to `specialists run <name> --prompt "..." --background` now — full removal in next major)*
- `feed_specialist`
- `stop_specialist`
- `steer_specialist`
- `resume_specialist`
- `specialist_status`
- `run_parallel`
- `follow_up_specialist`
- `specialist_init`
- `list_specialists`

## See also

- [cli-reference.md](cli-reference.md)
- [workflow.md](workflow.md)
- [background-jobs.md](background-jobs.md)
