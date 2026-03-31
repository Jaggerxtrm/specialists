---
title: Feature Guides
scope: runtime-features
category: guide
version: 1.0.0
updated: 2026-03-30
synced_at: 0972c0b0
description: Practical guides for structured output, job observation, bead-linked runs, keep-alive resume, stuck detection, and specialist authoring.
source_of_truth_for:
  - "src/cli/run.ts"
  - "src/cli/feed.ts"
  - "src/cli/poll.ts"
  - "src/cli/result.ts"
  - "src/cli/resume.ts"
  - "src/specialist/supervisor.ts"
  - "src/specialist/schema.ts"
---

# Feature Guides

> `sp` is an alias for `specialists`.

## 1) Structured run output modes (`human`, `--json`, `--raw`)

`specialists run` supports three foreground output modes.

### Human mode (default)

```bash
sp run executor --prompt "Investigate failing tests"
```

- Shows formatted timeline events (debounced to reduce noise)
- Prints final assistant output when `run_complete` arrives
- Prints job footer to stderr with `job`, optional `bead`, elapsed time, model/backend

### JSON mode (`--json`)

```bash
sp run executor --prompt "Investigate failing tests" --json
```

- Streams NDJSON, one event per line
- Each event envelope includes `jobId`, `specialist`, optional `beadId`, plus timeline event fields
- Model/backend banner still prints to stderr

### Raw mode (`--raw`)

```bash
sp run executor --prompt "Investigate failing tests" --raw
```

- Legacy stream of raw progress deltas (`onProgress`) to stdout
- Useful for backward compatibility with older parsers
- Does not tail `events.jsonl` formatting

### Mode selection rules

- Default is `human`
- `--json` switches to structured event stream
- `--raw` switches to legacy progress stream
- If both are passed, the last flag wins

---

## 2) Job observation: `feed`, `poll`, `result`, `feed_specialist`

All observation reads Supervisor artifacts under:

```text
.specialists/jobs/<job-id>/
  status.json
  events.jsonl
  result.txt
```

### `feed` (timeline-first)

```bash
sp feed <job-id>
sp feed <job-id> --follow
sp feed -f --forever
sp feed --json --since 5m --limit 200
```

- Best for timeline/event visibility
- Snapshot mode: replay matching events
- Follow mode (`-f`): polls and appends new events in chronological order
- JSON mode outputs NDJSON envelopes with job metadata + event payload

### `poll` (machine snapshot + cursors)

```bash
sp poll <job-id>
sp poll <job-id> --cursor 12 --output-cursor 340
```

- Always returns a single JSON object
- Includes:
  - `status`, `elapsed_ms`, `current_event`, `current_tool`
  - `events` delta since `cursor`
  - `output_delta` since `output_cursor`
  - next cursors (`cursor`, `output_cursor`)
- Good for script-driven incremental polling

### `result` (final text)

```bash
sp result <job-id>
sp result <job-id> --wait --timeout 120
```

- Prints `result.txt`
- `--wait` polls until `done`/`error`
- `--timeout` applies only with `--wait`

### MCP `feed_specialist` (cursor-paginated event API)

Use with `start_specialist` job IDs.

- Input: `job_id`, optional `cursor`, optional `limit`
- Output: `events`, `next_cursor`, `has_more`, `is_complete`, plus metadata (`status`, `specialist`, `model`, `bead_id`)
- Poll pattern:
  1. call with `cursor: 0`
  2. call again with returned `next_cursor`
  3. stop when `is_complete=true` and `has_more=false`

Use `result` when you want final plain text; use feed/feed_specialist when you want event history.

---

## 3) Bead-linked runs (`--bead`)

Use an existing bead as the run input source:

```bash
sp run executor --bead unitAI-123
```

Behavior:

- Reads bead content via `bd show --json`
- Builds full run prompt from bead context (`buildBeadContext(...)`)
- Injects variables:
  - `$bead_context`
  - `$bead_id`
- Adds `bead_id` to status and timeline (`run_start`, status footer)

### Dependency context injection

By default, `--bead` injects completed blockers at depth 1.

```bash
sp run executor --bead unitAI-123 --context-depth 2
sp run executor --bead unitAI-123 --context-depth 0  # disable blocker injection
```

### Tracking control

```bash
sp run executor --bead unitAI-123 --no-beads
```

- `--no-beads` disables bead tracking/updates
- Bead reading still works (run input still comes from `--bead`)

### Prompt source exclusivity

`--prompt` and `--bead` are mutually exclusive.

---

## 4) Keep-alive + resume (`--keep-alive`, `--no-keep-alive`, `resume`)

Keep a session alive for multi-turn flows:

```bash
sp run executor --prompt "Analyze this bug" --keep-alive
```

Interactive specialists can enable this by default in YAML:

```yaml
specialist:
  execution:
    interactive: true
```

Default behavior and precedence:

1. `--no-keep-alive` / `no_keep_alive` forces one-shot mode
2. `--keep-alive` / `keep_alive` forces keep-alive
3. Otherwise, runner uses `execution.interactive`
4. If unset, default is one-shot (`false`)

Supervisor behavior in keep-alive mode:

- Creates FIFO: `.specialists/jobs/<job-id>/steer.pipe`
- On first turn completion, job status becomes `waiting`
- Session stays alive with full conversation history retained

Resume with a next-turn task:

```bash
sp resume <job-id> "Now implement the fix and add tests"
```

Rules:

- `resume` is valid only when status is `waiting`
- If status is `running`, use `steer`/`steer_specialist` (mid-turn guidance)
- `resume` writes `{type:"resume", task:"..."}` to FIFO
- After resume turn finishes, status returns to `waiting` until closed

Use `--no-keep-alive` for a one-off run even when the specialist is interactive:

```bash
sp run executor --prompt "Quick check only" --no-keep-alive
```

Observation loop for keep-alive runs:

```bash
sp feed <job-id> --follow
```

---

## 5) Stuck detection configuration

There are two complementary mechanisms.

### A) Session-level stall timeout (`execution.stall_timeout_ms`)

Defined in specialist YAML under `execution`.

```yaml
specialist:
  execution:
    stall_timeout_ms: 120000
```

- Passed to `PiAgentSession` as `stallTimeoutMs`
- If no RPC/protocol activity occurs within this window, the session is killed with `StallTimeoutError`
- Set `0`/unset to disable this watchdog

### B) Supervisor-level stale detection (`stall_detection`)

Defined at top-level specialist config:

```yaml
specialist:
  stall_detection:
    running_silence_warn_ms: 60000
    running_silence_error_ms: 300000
    waiting_stale_ms: 3600000
    tool_duration_warn_ms: 120000
```

Defaults (if omitted):

- `running_silence_warn_ms`: 60s
- `running_silence_error_ms`: 300s
- `waiting_stale_ms`: 3600s
- `tool_duration_warn_ms`: 120s

Supervisor outcomes:

- Emits `stale_warning` timeline events
- Can promote long-running silence to `status=error`
- Emits waiting-state stale warnings without auto-closing keep-alive jobs

---

## 6) Specialist authoring example (executor-style)

Example with structured-friendly settings and stall controls:

```yaml
specialist:
  metadata:
    name: executor
    version: 1.0.0
    description: "General-purpose execution specialist"
    category: codegen

  execution:
    model: openai-codex/gpt-5.3-codex
    fallback_model: anthropic/claude-sonnet-4-6
    timeout_ms: 0
    stall_timeout_ms: 120000
    response_format: text
    permission_required: HIGH
    thinking_level: medium

  prompt:
    system: |
      You are a production implementation specialist.
    task_template: |
      $prompt

      Working directory: $cwd

  stall_detection:
    running_silence_warn_ms: 60000
    running_silence_error_ms: 300000
    waiting_stale_ms: 3600000
    tool_duration_warn_ms: 120000
```

Authoring notes:

- `response_format` controls requested format (`text|json|markdown`) at specialist config level
- `stall_timeout_ms` handles session protocol silence
- `stall_detection` handles Supervisor state/timeline warnings and error promotion
- For bead-driven specialists, rely on `$bead_context` / `$bead_id` in templates

---

## Quick reference flows

### CLI async observation flow

```bash
sp run executor --prompt "Task" --json
# capture job id from stderr
sp feed <job-id> --follow
sp result <job-id> --wait --timeout 120
```

### MCP async observation flow

1. `start_specialist` → get `job_id`
2. `feed_specialist` with cursor paging until complete
3. (optional) `resume_specialist` for keep-alive jobs in `waiting`
