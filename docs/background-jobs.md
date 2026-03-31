---
title: Background Jobs
scope: background-jobs
category: guide
version: 1.4.0
updated: 2026-03-30
synced_at: 0972c0b0
description: Supervisor-backed job model, keep-alive semantics, and monitoring commands.
source_of_truth_for:
  - "src/cli/run.ts"
  - "src/cli/feed.ts"
  - "src/cli/steer.ts"
  - "src/cli/resume.ts"
  - "src/specialist/supervisor.ts"
domain:
  - jobs
---

# Background Jobs

> `sp` is an alias for `specialists`.

Every `specialists run` is Supervisor-backed and writes runtime artifacts to `.specialists/jobs/<job-id>/`.

## Start a run

```bash
specialists run sync-docs --bead unitAI-26s
# stderr: [job started: 49adda]
```

`specialists run` no longer supports `--background`.

Use one of these async observation patterns instead:
- CLI: run normally, then `feed` / `poll` / `result`
- MCP: `start_specialist` + `feed_specialist`
- Shell: append `&` if you explicitly want shell backgrounding

Latest job id is also written to:

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

Run-time precedence:
- `--no-keep-alive` / `no_keep_alive` forces one-shot mode
- `--keep-alive` / `keep_alive` forces keep-alive mode
- otherwise `execution.interactive` decides (default `false`)

## Observe progress

```bash
specialists feed 49adda --follow
specialists feed -f
specialists poll 49adda --json
```

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
| `status.json` | current state (`starting/running/waiting/done/error`), pid, model, bead_id |
| `events.jsonl` | append-only normalized timeline |
| `result.txt` | final assistant output |
| `steer.pipe` | FIFO for `steer` / `resume` messages (removed on completion) |

Ready markers:

```text
.specialists/ready/
```

## See also

- [workflow.md](workflow.md)
- [cli-reference.md](cli-reference.md)
- [mcp-tools.md](mcp-tools.md)
