---
title: MCP Tools Reference
scope: mcp-tools
category: reference
version: 2.0.0
updated: 2026-03-31
synced_at: 490e0f83
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
  name: z.string(),
  prompt: z.string().optional(),
  bead_id: z.string().optional(),
  variables: z.record(z.string()).optional(),
  backend_override: z.string().optional(),
  model_override: z.string().optional(),
  no_beads: z.boolean().optional(),
  include_blocker_context: z.boolean().optional(),
  context_depth: z.number().int().min(0).max(5).optional(),
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
