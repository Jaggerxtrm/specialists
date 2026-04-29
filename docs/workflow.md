---
title: Bead-First Workflow
scope: workflow
category: guide
version: 1.3.0
updated: 2026-04-29
synced_at: 5f1ba872
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
- Supervisor auto-closes linked input bead on terminal status (DONE/cancelled).

## Ad-hoc work

```bash
specialists run <name> --prompt "..."
```

Use this for quick untracked tasks.

## Async observation model

`--background` spawns a detached process via tmux. Use `sp attach <job>` to reconnect.

Use:
- CLI: run, then inspect with `feed`, `ps`, `result`
- MCP: `use_specialist` (only exposed tool)
- Shell backgrounding (`&`) when needed

## `--context-depth`

`--context-depth` controls blocker context injection when using `--bead`.

| Value | Meaning |
|---|---|
| `0` | Disable dependency context injection |
| `3` | Walk 3 levels up completed blockers (default) |
| `N` | Walk N levels up completed blockers |

## `--no-beads`

`--no-beads` disables tracking bead creation/updates for the run.

Important:
- It does not disable bead reading when `--bead <id>` is used.
- Prompt source is still the bead when `--bead` is provided.

## Steering vs resume

- `steer`: for jobs currently `running` (mid-turn redirection)
- `resume`: for keep-alive jobs in `waiting` (next turn)

Keep-alive may be enabled explicitly (`--keep-alive`) or by specialist YAML (`execution.interactive: true`).
Use `--no-keep-alive` when you want one-shot behavior for an otherwise interactive specialist.

`resume` is not valid for non-waiting jobs.

## Auto-append bead notes (all specialists)

For **all specialists** invoked with `--bead`, Supervisor appends output notes back to the input bead automatically. This includes READ_ONLY, LOW, MEDIUM, and HIGH specialists.

## See also

- [background-jobs.md](background-jobs.md)
- [mcp-tools.md](mcp-tools.md)
- [authoring.md](authoring.md)
