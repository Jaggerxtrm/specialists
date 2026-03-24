---
title: Background Jobs
scope: background-jobs
category: guide
version: 1.0.0
updated: 2026-03-23
description: Background execution model, job files, and monitoring commands.
source_of_truth_for:
  - "src/cli/feed.ts"
  - "src/cli/result.ts"
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
| `status.json` | current job state, pid, elapsed time |
| `events.jsonl` | streamed events emitted during the run |
| `result.txt` | final output when the job completes |

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
