---
title: Feature Guides
scope: runtime-features
category: guide
version: 1.3.0
updated: 2026-04-06
synced_at: 9648ffae
description: Practical guides for structured output, job observation, bead-linked runs, keep-alive resume, worktree isolation, stuck detection, waiting state observability, auto gitnexus sync, specialist authoring, config presets, and JSON-first configuration.
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
  - "src/cli/edit.ts"
  - "src/specialist/loader.ts"
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

### SQLite persistence (schema v4)

When SQLite is available, Supervisor uses it as the primary storage backend with file-based fallback:

- **`specialist_jobs` table**: status, bead_id, node_id, worktree_path, branch, last_output, elapsed_ms
- **`specialist_events` table**: append-only timeline with event_json (JSON-first design)
- **Node tables** (schema v4): `node_runs`, `node_members`, `node_events`, `node_memory` for orchestrator tracking
- **Dual-write**: atomic transactions at job start/completion; mid-run writes are standalone for resilience
- **Backward compatible**: file-based storage remains functional when SQLite is unavailable

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
- **Text preview**: `TURN+` lines show 80-char preview of accumulated text content
- **Context warnings**: feed displays context utilization warnings at WARN/CRITICAL thresholds

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
- **SQLite-first**: reads from `specialist_events` table when available, falls back to `events.jsonl`

### `result` (final text)

```bash
sp result <job-id>
sp result <job-id> --wait --timeout 120
```

- Prints `result.txt`
- `--wait` polls until `done`/`error`
- `--timeout` applies only with `--wait`
- **Waiting state**: when status is `waiting`, result prints a footer with resume instructions
- **SQLite-backed**: reads from `specialist_jobs.last_output` column when available

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
- **Schema v2**: `bead_id` persisted as dedicated column in `specialist_jobs` table (backfilled from status_json)

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

Example with structured-friendly settings and stall controls (JSON format):

```json
{
  "specialist": {
    "metadata": {
      "name": "executor",
      "version": "1.0.0",
      "description": "General-purpose execution specialist",
      "category": "codegen"
    },
    "execution": {
      "model": "openai-codex/gpt-5.3-codex",
      "fallback_model": "anthropic/claude-sonnet-4-6",
      "timeout_ms": 0,
      "stall_timeout_ms": 120000,
      "response_format": "text",
      "permission_required": "HIGH",
      "thinking_level": "medium"
    },
    "prompt": {
      "system": "You are a production implementation specialist.",
      "task_template": "$prompt\n\nWorking directory: $cwd"
    },
    "stall_detection": {
      "running_silence_warn_ms": 60000,
      "running_silence_error_ms": 300000,
      "waiting_stale_ms": 3600000,
      "tool_duration_warn_ms": 120000
    }
  }
}
```

Authoring notes:

- **JSON-first**: Specialist configs use `.specialist.json` format (YAML deprecated but supported)
- `response_format` controls requested format (`text|json|markdown`) at specialist config level
- `stall_timeout_ms` handles session protocol silence
- `stall_detection` handles Supervisor state/timeline warnings and error promotion
- `permission_required` controls post-job GitNexus reindex (see below)
- For bead-driven specialists, rely on `$bead_context` / `$bead_id` in templates
- Additional fields: `author`, `tags`, `created`, `output_type`, `max_retries`, `beads_write_notes`, `communication`


---

## 7) Configuration presets (`--preset`)

Presets provide one-shot configuration profiles for quick adaptation to different task types without editing specialist configs.

### Available presets

Presets are defined in `config/presets.json`:

| Preset | Model | Thinking | Stall Timeout | Use Case |
|--------|-------|----------|---------------|----------|
| `cheap` | `dashscope/qwen3.5-plus` | `off` | 60s | Exploration, simple tasks, quick lookups |
| `medium` | `anthropic/claude-sonnet-4-6` | `low` | 120s | Balanced cost/quality — default for most tasks |
| `power` | `openai-codex/gpt-5.4` | `high` | 300s | Complex implementation, deep reasoning |

### Usage

Apply a preset to a specialist config:

```bash
sp edit executor --preset cheap
sp edit executor --preset medium
sp edit executor --preset power
```

This mutates the specialist's JSON config in place, updating:
- `specialist.execution.model`
- `specialist.execution.thinking_level`
- `specialist.execution.stall_timeout_ms`

### When to use

- **cheap**: Quick exploration, documentation lookups, simple refactors
- **medium**: Standard implementation work, bug fixes, feature development
- **power**: Complex architecture changes, multi-file refactors, difficult debugging

---

## 8) Configuration format: JSON-first with YAML fallback

Specialist configurations migrated from YAML to JSON in v2.1.15+.

### File locations

Specialist configs live in:
- `config/specialists/<name>.specialist.json` (canonical)
- `.specialists/default/<name>.specialist.json` (project-local defaults)
- `.specialists/user/<name>.specialist.json` (user overrides)

### Loading precedence

The loader uses **JSON-first** with **YAML fallback**:

1. Look for `<name>.specialist.json` — use if found
2. Fall back to `<name>.specialist.yaml` — use if JSON missing (deprecated)
3. Emit warning to stderr when YAML is used:
   ```
   [specialists] DEPRECATED: YAML specialist config detected at <path>. Please migrate to .specialist.json
   ```

### Migration from YAML

YAML configs remain functional but are deprecated. To migrate:

```bash
# YAML (deprecated)
config/specialists/executor.specialist.yaml

# JSON (preferred)
config/specialists/executor.specialist.json
```

JSON supports all YAML fields plus additional metadata:
- `author`: Config author
- `tags`: Array of categorization tags
- `created`: Creation date
- `output_type`: Expected output format
- `max_retries`: Retry count for transient failures
- `beads_write_notes`: Whether to write bead notes
- `communication`: Communication preferences

### Schema validation

All configs are validated against `src/specialist/schema.ts` at load time. Invalid configs are skipped with an error message.

---
## 9) Auto GitNexus reindex after high-permission jobs

Supervisor automatically triggers a GitNexus reindex after jobs with elevated file access complete.
### Trigger conditions

```json
{
  "specialist": {
    "execution": {
      "permission_required": "MEDIUM"
    }
  }
}
```

When `permission_required` is `MEDIUM` or `HIGH`

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

## 10) Debugger v2.0 — Keep-alive iterative debugging

The `debugger` specialist was upgraded to v2.0 with enhanced capabilities for iterative debug-fix-verify cycles.

### Configuration

```json
{
  "specialist": {
    "metadata": {
      "name": "debugger",
      "version": "2.0.0",
      "description": "Autonomous debugger: given any symptom, error, or stack trace, systematically traces call chains with GitNexus, identifies root cause at file:line precision, applies targeted fixes, and verifies the fix works. Keep-alive for iterative debug-fix-verify cycles."
    },
    "execution": {
      "permission_required": "HIGH",
      "interactive": true
    }
  }
}
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

## 11) Worktree isolation (`--worktree`, `--job`)

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

