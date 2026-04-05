---
title: Feature Guides
scope: runtime-features
category: guide
version: 1.1.0
updated: 2026-04-05
synced_at: a7dee4b5
description: Practical guides for structured output, job observation, bead-linked runs, keep-alive resume, worktree isolation, stuck detection, waiting state observability, auto gitnexus sync, and specialist authoring.
source_of_truth_for:
  - "src/cli/run.ts"
  - "src/cli/feed.ts"
  - "src/cli/poll.ts"
  - "src/cli/result.ts"
  - "src/cli/resume.ts"
  - "src/specialist/supervisor.ts"
  - "src/specialist/schema.ts"
  - "src/specialist/job-root.ts"
  - "src/specialist/worktree.ts"
  - "src/specialist/worktree-gc.ts"
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

## 2) Job observation: `feed`, `poll`, `result`

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
- **Waiting state**: when a keep-alive job enters `waiting` status, feed displays a magenta `WAIT` banner with resume instructions

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
- **Waiting state**: when status is `waiting`, result prints a footer with resume instructions

Use `result` when you want final plain text; use `feed`/`poll` when you want event history and incremental state.

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
- Emits `status_change` timeline event with `status: "waiting"` and `previous_status: "running"`
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

### Waiting state observability

When a keep-alive job enters the `waiting` state, the system provides multiple observation signals:

**Timeline event** (`events.jsonl`):
```json
{"t": 1743883200000, "type": "status_change", "status": "waiting", "previous_status": "running"}
```

**Feed output** (`sp feed <job-id>`):
```
WAIT executor (49adda) is waiting for input. Use: specialists resume 49adda "..."
```
- Displayed in **magenta** to distinguish from running/done states
- Shows specialist name, job ID, and exact resume command

**Status output** (`sp status --job <job-id>`):
```
  status       waiting
  action       specialists resume 49adda "..."
```
- Status field rendered in magenta
- `action` row shows the resume command to use

**Result footer** (`sp result <job-id>`):
```
--- Session is waiting for your input. Use: specialists resume 49adda "..." ---
```
- Appended to result output when status is `waiting`
- Printed to stderr in dimmed text

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
- `permission_required` controls post-job GitNexus reindex (see below)
- For bead-driven specialists, rely on `$bead_context` / `$bead_id` in templates

---

## 8) Auto GitNexus reindex after high-permission jobs

Supervisor automatically triggers a GitNexus reindex after jobs with elevated file access complete.

### Trigger conditions

```yaml
specialist:
  execution:
    permission_required: MEDIUM  # or HIGH
```

When `permission_required` is `MEDIUM` or `HIGH`, the supervisor spawns a detached `npx gitnexus analyze` process after job completion.

### Behavior

- **Detached execution**: reindex runs in background, does not block job completion
- **Working directory**: analyze runs in the job's worktree (if applicable) or main checkout
- **Timeline event**: emits a `meta` event with `model: "gitnexus_analyze_started"` or `model: "gitnexus_analyze_start_failed"`
- **Failure handling**: if spawn fails, error is logged to timeline but job still completes

### Example timeline events

```json
{"t": 1743883200000, "type": "meta", "model": "gitnexus_analyze_started", "backend": "supervisor"}
```

### Rationale

High-permission specialists (`MEDIUM`/`HIGH`) typically modify source code. Auto-reindex ensures the GitNexus knowledge graph stays current without requiring manual intervention or separate CI steps.

### Disabling

To disable auto-reindex for a high-permission specialist, set `permission_required` to `LOW` or omit it (defaults to `LOW`).

---

## 9) Debugger v2.0 — Keep-alive iterative debugging

The `debugger` specialist was upgraded to v2.0 with enhanced capabilities for iterative debug-fix-verify cycles.

### Configuration

```yaml
specialist:
  metadata:
    name: debugger
    version: 2.0.0
    description: >-
      Autonomous debugger: given any symptom, error, or stack trace, systematically
      traces call chains with GitNexus, identifies root cause at file:line precision,
      applies targeted fixes, and verifies the fix works. Keep-alive for iterative
      debug-fix-verify cycles.

  execution:
    permission_required: HIGH
    interactive: true  # enables keep-alive
```

### Key changes in v2.0

| Feature | v1.0 | v2.0 |
|---------|------|------|
| Permission level | MEDIUM | **HIGH** |
| Keep-alive | No | **Yes** (`interactive: true`) |
| Workflow | Single-pass | **Iterative cycles** |

### Iterative workflow

1. **Initial run**: `sp run debugger --bead bd-123`
   - Investigates root cause using GitNexus
   - Applies targeted fix
   - Verifies fix works
   - Enters `waiting` state

2. **Resume if needed**: `sp resume <job-id> "Fix didn't work, error is now..."`
   - Re-diagnoses with new evidence
   - Applies corrected fix
   - Re-verifies
   - Returns to `waiting`

3. **Repeat** until issue is resolved

### When to use

- Complex bugs requiring multiple fix attempts
- Issues where the initial hypothesis may be wrong
- Debugging sessions that need human verification between attempts

### Observation

Use standard observation commands:

```bash
sp feed <job-id> --follow   # Watch investigation progress
sp status --job <job-id>    # Check waiting state
sp result <job-id>          # Read bug report + resume footer
```

---

## 10) Worktree isolation (`--worktree`, `--job`)

Each edit-permission specialist runs in an isolated git worktree (branch). This prevents concurrent file corruption when multiple executors modify overlapping paths, and produces a clean per-task branch that the orchestrator merges in dependency order.

### CLI flags

```bash
specialists run <name> [--worktree] [--job <id>]
```

| Flag | Semantics | Creates worktree? |
|------|-----------|:-:|
| `--worktree` | Provision a new isolated workspace; requires `--bead` | Yes |
| `--job <id>` | Reuse the workspace of an existing job | No |

`--worktree` and `--job` are **mutually exclusive**.

### `--worktree` (new isolated workspace)

Requires `--bead <id>` — the bead id drives the deterministic branch name.

```bash
sp run executor --worktree --bead hgpu.3
# stderr: [worktree created: /repo/.worktrees/hgpu.3/hgpu.3-executor  branch: feature/hgpu.3-executor]
```

If a worktree for that branch already exists (e.g. from a prior interrupted run) it is reused:

```bash
# stderr: [worktree reused: /repo/.worktrees/hgpu.3/hgpu.3-executor  branch: feature/hgpu.3-executor]
```

### `--job <id>` (reuse existing workspace)

Reads `worktree_path` from the target job's `status.json` and uses that directory as `cwd`. The **caller's** `--bead` remains authoritative — only the workspace is borrowed.

```bash
sp run reviewer --job 49adda --bead hgpu.3-review
# stderr: [workspace reused from job 49adda: /repo/.worktrees/hgpu.3/hgpu.3-executor]
```

Hard fail conditions:
- `status.json` missing or unreadable for the given job id
- `worktree_path` absent — the target job was not started with `--worktree`

### Worktree GC

Clean up terminal job worktrees:

```bash
sp clean            # prunes job dirs AND terminal worktrees
sp clean --dry-run  # preview removals without deleting
```

GC candidates must satisfy all conditions:
1. Job status is `done` or `error` (terminal)
2. `worktree_path` is recorded in `status.json`
3. The directory still exists on disk
4. Job status is **not** `starting`, `running`, or `waiting`

For full technical details, see [worktrees.md](worktrees.md).

---
## Quick reference flows

### CLI async observation flow

```bash
sp run executor --prompt "Task" --json
# capture job id from stderr
sp feed <job-id> --follow
sp result <job-id> --wait --timeout 120
```

### Worktree isolation flow

```bash
# 1. Executor provisions worktree, runs implementation
sp run executor --worktree --bead hgpu.3
# → job id: 49adda

# 2. Reviewer reuses same workspace (read-only)
sp run reviewer --job 49adda --bead hgpu.3-review

# 3. Clean up terminal worktrees after review complete
sp clean --dry-run   # preview
sp clean             # execute
```

### MCP single-run flow

1. `use_specialist` with `name` + `prompt`/`bead_id`
2. Read final output directly from MCP response

