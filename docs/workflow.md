---
title: Bead-First Workflow
scope: workflow
category: guide
version: 1.4.2
updated: 2026-06-24
synced_at: bf6baf7a
description: Canonical tracked and ad-hoc workflow for Specialists.
source_of_truth_for:
  - "src/cli/run.ts"
  - "src/cli/chat.ts"
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
- Supervisor appends specialist output back to the input bead. Terminal bead closure still follows the current workflow gates and memory-ack rules; if `waiting_auto_close_ms` is configured, waiting keep-alive jobs can also close automatically after silence. Verify bead state before committing or publishing.

## Ad-hoc work

```bash
specialists run <name> --prompt "..."
```

Use this for quick untracked tasks.

## Async observation model

For headless or multi-job work, run specialists normally and inspect them with `feed`, `ps`, and `result`:

```bash
specialists run explorer --bead unitAI-abc
sp feed -f
sp result <job-id>
```

For a human-in-the-loop launch, use `sp chat`:

```bash
sp chat explorer --bead unitAI-abc
```

`sp chat` opens a TUI that combines a `sp feed -f`-style feed, pinned status row, final result display, and input prompt. Freeform input maps to `steer` while the job is running and `resume` while it is waiting. `/quit` and `Ctrl+C` detach without killing the job; use `/stop` when you intend to stop it.

`--background` may also create a legacy tmux session when tmux is available. `sp attach <job>` reconnects to that tmux session only; it is not yet the chat TUI attach flow. Existing-job TUI attach is tracked separately in bead `unitAI-hx4ln`.

Use:
- CLI: run/chat, then inspect with `feed`, `ps`, `result`
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

Inside `sp chat`, freeform input chooses between those two actions automatically based on the current status. Use explicit `sp steer` / `sp resume` commands when operating outside the chat TUI or from scripts.

Keep-alive may be enabled explicitly (`--keep-alive`) or by specialist YAML (`execution.interactive: true`).
Use `--no-keep-alive` when you want one-shot behavior for an otherwise interactive specialist.

`resume` is not valid for non-waiting jobs.

## Auto-append bead notes (all specialists)

For **all specialists** invoked with `--bead`, Supervisor appends output notes back to the input bead automatically. This includes READ_ONLY, LOW, MEDIUM, and HIGH specialists.

## See also

- [background-jobs.md](background-jobs.md)
- [mcp-tools.md](mcp-tools.md)
- [authoring.md](authoring.md)
