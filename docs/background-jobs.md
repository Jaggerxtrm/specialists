---
title: Background Jobs
scope: background-jobs
category: guide
version: 1.8.0
updated: 2026-06-23
synced_at: bf6baf7a
description: Supervisor-backed job model, keep-alive semantics, and monitoring commands.
source_of_truth_for:
  - "src/cli/run.ts"
  - "src/cli/feed.ts"
  - "src/cli/chat.ts"
  - "src/cli/chat/control.ts"
  - "src/cli/chat/feed.ts"
  - "src/cli/chat/status.ts"
  - "src/cli/steer.ts"
  - "src/cli/resume.ts"
  - "src/specialist/supervisor.ts"
domain:
  - jobs
---

# Background Jobs

> `sp` is an alias for `specialists`.

Every `specialists run` is DB-backed in normal runtime. `.specialists/jobs/<job-id>/` remains a legacy/operator mirror for recovery and debugging.

## Start a run

```bash
specialists run sync-docs --bead unitAI-26s
# stderr: [job started: 49adda]
```

`specialists run --background` spawns a detached child process that runs the full Supervisor-backed flow in its own process group. The parent prints the job id and exits immediately.

When `tmux` is installed:
- a named tmux session is created as `sp-<specialist>-<id>`
- use `specialists attach <job-id>` to attach directly to that legacy tmux session
- use `specialists list --live` for an interactive tmux session picker

For a first-class interactive TUI while launching a new specialist, use `sp chat <specialist> ...`. Chat is separate from legacy tmux attach: it owns the terminal, renders the normalized feed, shows status, and sends steer/resume messages from one prompt.

When `tmux` is not installed, the CLI falls back to detached process mode (stdio ignored, spawned with `detached: true`) and still keeps DB state canonical; file mirrors are legacy/operator-only.

Latest job id is surfaced by active-mode detection. Legacy file mirror, when enabled, may still write:

```text
.specialists/jobs/latest
```

## Keep-alive sessions

```bash
specialists run debugger --bead unitAI-abc --keep-alive
```

You can also make keep-alive the default in specialist YAML:

```yaml
specialist:
  execution:
    interactive: true
```

After the first turn, keep-alive jobs transition to `waiting` and preserve full conversation context for future turns.

Keep-alive sessions support automatic cleanup via `waiting_auto_close_ms` in stall detection configuration. When configured (value > 0), waiting sessions automatically close after the specified silence threshold. The close attempt has a 5-second graceful timeout; if the session close hangs, forced termination is triggered.

Run-time precedence:
- `--no-keep-alive` / `no_keep_alive` forces one-shot mode
- `--keep-alive` / `keep_alive` forces keep-alive mode
- otherwise `execution.interactive` decides (default `false`)

## Observe progress

```bash
sp ps                         # actionable dashboard
sp ps -f                      # TTY in-place dashboard; pipes append ANSI-free snapshots
sp feed 49adda --follow       # per-job follow, including future resume turns
sp feed -f                    # global follow; keep-alive waiting jobs are terminal-equivalent unless --forever
sp feed 49adda                # compact DB-backed event replay for that job
sp log 49adda                 # lean runtime/control/error log; parent dirs aggregate child repo DBs
sp log --specialist reviewer -f  # follow reviewer runtime logs
sp ps 49adda --json
```

Snapshot `sp feed <job-id>` reads compact DB event history for that job. Use `sp log <job-id>` for the lean runtime/debug stream: dispatch, control signals, resume/steer consumption, stop/SIGTERM/SIGKILL, crashes, status transitions, and terminal error provenance. It intentionally excludes feed-owned agent internals by default; add `--all-events` when you need them. Legacy file mirrors, when enabled, are recovery surfaces rather than the normal source of truth.

## Interactive chat TUI

Use `sp chat` when you want to launch a specialist and keep a live, interactive control surface open:

```bash
sp chat explorer "map this failure"
sp chat reviewer --bead unitAI-929wj
```

The chat feed intentionally matches `sp feed -f` formatting. It reads timeline events from SQLite first and falls back to `events.jsonl` only for recovery. It suppresses raw launch preamble/stderr noise, shows startup/payload context side-lines, dedupes repeated streaming `THINK`/`TEXT` events once per turn, and appends the final `run_complete.output` so the result is visible in the same screen.

Typed chat input uses the same FIFO as the explicit commands:

| Current status | Chat input becomes | CLI equivalent |
|---|---|---|
| `running` / `starting` | `{"type":"steer","message":"..."}` | `sp steer <job-id> "..."` |
| `waiting` | `{"type":"resume","task":"..."}` | `sp resume <job-id> "..."` |

Slash commands in chat:

- `/quit` detaches without killing the job.
- `Ctrl+C` behaves like `/quit`: it restores the terminal and detaches, but does not stop the job.
- `/stop` stops the job through the normal control path.
- `/finalize` finalizes a waiting chain/job.
- `/notes <text>` appends to the current bead.
- `/show` prints current context.

`sp attach <job-id>` is still the legacy tmux attach path. TUI attach to an already-existing job is planned separately in bead `unitAI-hx4ln`; until then, use `sp feed` + `sp steer`/`sp resume` for existing jobs that were not started by `sp chat`.

## Read final output

```bash
specialists result 49adda
```

## Steer a running job

`steer` works for **any running job** (keep-alive or not). It injects a mid-turn instruction and does not cancel the run.

```bash
specialists steer 49adda "focus only on supervisor.ts"
specialists steer 49adda "skip tests and isolate root cause"
```

FIFO payload:

```json
{"type":"steer","message":"..."}
```

## Resume a waiting keep-alive job

`resume` is for keep-alive sessions in `waiting` state only.

```bash
specialists resume 49adda "now write the fix"
specialists resume 49adda "add regression tests"
```

If status is `running`, use `steer` instead.

`specialists follow-up` remains as a deprecated alias that delegates to `resume`.

## Stop a job

```bash
specialists stop 49adda
```

## Job files

```text
.specialists/jobs/<job-id>/
```

| File | Purpose |
|---|---|
| `status.json` | legacy/operator mirror of current state (`starting/running/waiting/done/error`), pid, model, bead_id, tmux_session? |
| `events.jsonl` | legacy/operator mirror of append-only normalized timeline |
| `result.txt` | legacy/operator mirror of final assistant output |
| `steer.pipe` | FIFO for `steer` / `resume` messages (removed on completion) |

Ready markers:

```text
.specialists/ready/
```

## Stall detection thresholds

Background jobs support configurable stall detection via `specialist.stall_detection` in specialist YAML:

| Option | Default | Description |
|---|---|---|
| `running_silence_warn_ms` | 60000 | Warn when no output received during running state |
| `running_silence_error_ms` | 300000 | Error/cancel when running silence exceeds threshold |
| `waiting_stale_ms` | 3600000 | Warn when waiting job has no activity |
| `waiting_auto_close_ms` | 0 | Auto-close waiting sessions after N ms (0 = disabled) |
| `tool_duration_warn_ms` | 120000 | Warn when tool call exceeds duration |

YAML example:

```yaml
specialist:
  stall_detection:
    waiting_auto_close_ms: 1800000  # Auto-close after 30 min idle
```

## See also

- [workflow.md](workflow.md)
- [cli-reference.md](cli-reference.md)
- [mcp-tools.md](mcp-tools.md)
