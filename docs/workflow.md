---
title: Bead-First Workflow
scope: workflow
category: guide
version: 1.1.0
updated: 2026-03-30
synced_at: 0972c0b0
description: Canonical tracked and ad-hoc workflow for Specialists.
source_of_truth_for:
  - "src/cli/run.ts"
  - "src/specialist/runner.ts"
  - "src/specialist/supervisor.ts"
  - "src/cli/resume.ts"
  - "src/cli/steer.ts"
domain:
  - workflow
  - beads
---

# Bead-First Workflow

> `sp` is an alias for `specialists`.

The canonical flow is bead-first. `specialists run` is always Supervisor-backed and emits a job id.

## Tracked work (primary)

```bash
bd create "Investigate X" -t task -p 1 --json
bd update <id> --claim --json
specialists run <name> --bead <id> [--context-depth N]
specialists feed -f
bd close <id> --reason "Done" --json
```

Key behavior for `--bead` runs:
- Bead content is the prompt source.
- Runner injects bead context variables (`$bead_context`, `$bead_id`).
- Runner applies a bead-aware system override to prevent sub-bead creation.
- Orchestrator owns the input bead lifecycle; runner does not auto-close input beads.

## Ad-hoc work

```bash
specialists run <name> --prompt "..."
```

Use this for quick untracked tasks.

## Async observation model

`--background` was removed from `specialists run`.

Use:
- CLI: run, then inspect with `feed`, `poll`, `result`
- MCP: `start_specialist` + `feed_specialist`
- Shell backgrounding (`&`) when needed

## `--context-depth`

`--context-depth` controls blocker context injection when using `--bead`.

| Value | Meaning |
|---|---|
| `0` | Disable dependency context injection |
| `1` | Immediate completed blockers only (default) |
| `2+` | Walk N levels up completed blockers |

## `--no-beads`

`--no-beads` disables tracking bead creation/updates for the run.

Important:
- It does not disable bead reading when `--bead <id>` is used.
- Prompt source is still the bead when `--bead` is provided.

## Steering vs resume

- `steer`: for jobs currently `running` (mid-turn redirection)
- `resume`: for keep-alive jobs in `waiting` (next turn)

`resume` is not valid for non-waiting jobs.

## READ_ONLY bead-note behavior

For READ_ONLY specialists invoked with `--bead`, Supervisor appends output notes back to the input bead automatically.

## See also

- [background-jobs.md](background-jobs.md)
- [mcp-tools.md](mcp-tools.md)
- [authoring.md](authoring.md)
