---
title: MCP Tools Reference
scope: mcp-tools
category: reference
version: 1.1.0
updated: 2026-03-30
synced_at: 0972c0b0
description: MCP tool contracts for the Specialists server.
source_of_truth_for:
  - "src/server.ts"
  - "src/tools/specialist/*.tool.ts"
  - "src/specialist/supervisor.ts"
domain:
  - mcp
  - tools
---

# MCP Tools Reference

This server exposes 11 tools (including deprecated aliases).

## Active tool inventory

| Tool | Purpose |
|---|---|
| `specialist_init` | bootstrap + catalog |
| `list_specialists` | list specialists |
| `use_specialist` | synchronous run |
| `start_specialist` | async run, returns `job_id` |
| `feed_specialist` | cursor-paginated event stream |
| `resume_specialist` | next-turn resume for waiting keep-alive jobs |
| `steer_specialist` | mid-run steering for running jobs |
| `stop_specialist` | cancel running job |
| `specialist_status` | health + job summary |
| `run_parallel` | deprecated |
| `follow_up_specialist` | deprecated alias |

## `start_specialist` (Supervisor-backed)

`start_specialist` now launches a full Supervisor-managed run (same durable runtime model as CLI `specialists run`).

Artifacts are written under:

```text
.specialists/jobs/<job-id>/
  status.json
  events.jsonl
  result.txt
```

### Input schema

```ts
z.object({
  name: z.string(),
  prompt: z.string(),
  variables: z.record(z.string()).optional(),
  backend_override: z.string().optional(),
  bead_id: z.string().optional(),
})
```

### Return

```ts
{ job_id: string }
```

## `steer_specialist`

- Valid for `running` jobs.
- Works for both registry-backed runs and Supervisor/FIFO jobs.
- Sends a non-cancelling mid-turn instruction.

## `resume_specialist`

- Valid only for keep-alive jobs in `waiting` state.
- Sends next-turn task with conversation history preserved.
- If job is `running`, use `steer_specialist` instead.

## Bead behavior highlights

- `use_specialist`/`start_specialist` accept `bead_id`.
- Runner injects bead-aware system override to prevent specialist-created sub-beads.
- For READ_ONLY + input bead runs, Supervisor auto-appends output notes to the input bead.

## Deprecated

- `follow_up_specialist` → use `resume_specialist`
- `run_parallel` → use `start_specialist` + `feed_specialist`

## See also

- [background-jobs.md](background-jobs.md)
- [workflow.md](workflow.md)
- [cli-reference.md](cli-reference.md)
