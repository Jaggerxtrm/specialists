---
title: Background Jobs
scope: background-jobs
category: guide
version: 1.1.0
updated: 2026-03-25
description: Background execution model, job files, and monitoring commands.
source_of_truth_for:
  - "src/cli/feed.ts"
  - "src/cli/result.ts"
  - "src/cli/steer.ts"
  - "src/cli/stop.ts"
  - "src/specialist/supervisor.ts"
domain:
  - jobs
---

# Background Jobs

Use background mode when a specialist run will take longer or you want to keep working.

## Start a background job

```bash
specialists run sync-docs --bead unitAI-26s --background
# → Job started: 49adda
```

## Observe progress

```bash
specialists feed 49adda --follow
specialists feed -f
```

## Read final output

```bash
specialists result 49adda
```

## Steer a running job

Send a mid-run message to redirect the agent without cancelling it. The message is delivered after the current tool calls finish, before the next LLM call.

```bash
specialists steer 49adda "focus only on supervisor.ts"
specialists steer 49adda "skip the test suite, just fix the bug"
```

Under the hood this writes `{"type":"steer","message":"..."}` to a named FIFO at `.specialists/jobs/<id>/steer.pipe`. The Pi RPC protocol picks it up on the next turn.

## Stop a job

```bash
specialists stop 49adda
```

## Job files

Background jobs write runtime data under:

```text
.specialists/jobs/<job-id>/
```

Important files:

| File | Purpose |
|---|---|
| `status.json` | current job state, pid, elapsed time, fifo_path |
| `events.jsonl` | streamed events emitted during the run |
| `result.txt` | final output when the job completes |
| `steer.pipe` | named FIFO for mid-run steering (removed on job completion) |

Completion markers are stored under:

```text
.specialists/ready/
```

## Completion banners

The completion hook can inject a completion banner into the next session prompt when a background job finishes.

## See also

- [workflow.md](workflow.md)
- [hooks.md](hooks.md)
- [cli-reference.md](cli-reference.md)
