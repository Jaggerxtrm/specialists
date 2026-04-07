---
title: Specialists Runtime Architecture
scope: architecture
category: reference
version: 2.3.0
updated: 2026-04-08
synced_at: 86c4baba
description: Event pipeline, Pi RPC adapter boundaries, Supervisor lifecycle ownership, schema v1→v4 migration chain, JSON-first dual-write persistence, node runtime tables, context window tracking, job lineage fields, context denormalization, sp ps CLI surface, and worktree/bead ownership semantics.
source_of_truth_for:
  - "src/specialist/job-root.ts"
  - "src/specialist/worktree.ts"
  - "src/specialist/timeline-events.ts"
  - "src/pi/session.ts"
  - "src/specialist/supervisor.ts"
  - "src/cli/ps.ts"
  - "pi/rpc/"
domain:
  - architecture
  - rpc
  - supervisor
  - timeline
  - worktrees
  - jobs
---

# Specialists Runtime Architecture

This document defines the runtime boundary between:

- **Pi RPC protocol** (`pi/rpc/`) — canonical transport and event contract
- **RPC adapter** (`src/pi/session.ts`) — process bridge + request/response correlation
- **Lifecycle owner** (`src/specialist/supervisor.ts`) — durable state, persistence, completion semantics, GitNexus tracking
- **Timeline model** (`src/specialist/timeline-events.ts`) — persisted event vocabulary for feed v2
- **Worktree isolation** (`src/specialist/worktree.ts`) — isolated git workspaces per executor
- **Job registry anchor** (`src/specialist/job-root.ts`) — git-common-root-anchored job state

## 1) Canonical protocol boundary: `pi/rpc/`

`pi/rpc/` is the protocol source of truth for:

- JSONL framing (`jsonl.ts`)
- command/response/event types (`rpc-types.ts`)
- runtime behavior (`rpc-mode.ts`)
- typed client semantics (`rpc-client.ts`)

Specialists does **not** redefine protocol semantics. It consumes Pi events and commands through an adapter layer.

## 2) `src/pi/session.ts` = RPC adapter (not lifecycle owner)

`PiAgentSession` is an in-memory adapter over `pi --mode rpc`.

### Responsibilities

- Spawns Pi in RPC mode and parses stdout as NDJSON lines
- Sends commands over stdin with unique request IDs
- Correlates `response` events back to pending promises via `_pendingRequests`
- Emits normalized callbacks for Supervisor/Runner (`onEvent`, `onToolStart`, `onToolEnd`, `onMeta`)
- Enforces liveness timeout (`stallTimeoutMs`) at session level
- Pins absolute cwd at spawn time to prevent TMUX path drift in worktrees
- Resolves npm package extensions (gitnexus, serena) from global node_modules

### ID-mapped dispatch + ack checks

- `sendCommand()` assigns incrementing IDs (`_nextRequestId`) and stores resolver/rejecter in `_pendingRequests`
- `_handleEvent()` matches `type === "response"` with `event.id` and resolves the matching pending request
- timeouts reject outstanding calls with `RPC timeout...` (default timeout: 30s)
- command methods enforce explicit ack success:
  - `prompt()` throws if `response.success === false`
  - `steer()` throws if `response.success === false`

### Extension resolution

npm package extensions (gitnexus, serena) are resolved from global node_modules:
- gitnexus: `~/.nvm/versions/node/<version>/lib/node_modules/pi-gitnexus`
- serena: `~/.nvm/versions/node/<version>/lib/node_modules/pi-serena-tools`

This is the key adapter contract: **transport-level correctness and command acknowledgement**, not durable job semantics.

## 3) Job registry anchored to git common root (`job-root.ts`)

`src/specialist/job-root.ts` ensures all worktrees converge on the same job registry.

### `resolveJobsDir()` — common-root anchoring

```typescript
export function resolveCommonGitRoot(cwd: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf-8' });
  // Returns the main repo root from any worktree
  return dirname(resolve(cwd, result.stdout.trim()));
}

export function resolveJobsDir(cwd = process.cwd()): string {
  const commonRoot = resolveCommonGitRoot(cwd) ?? cwd;
  return join(commonRoot, '.specialists', 'jobs');
}
```

**Note:** `resolveCommonGitRoot` is exported for reuse (e.g., worktree.ts deduplication).

**Why this matters:** In a worktree, `git rev-parse --git-common-dir` returns the shared `.git/` directory in the main checkout. Taking `dirname` gives us the common project root, so all worktrees read/write `.specialists/jobs/` at the same absolute path.

### `resolveCurrentBranch()` — branch detection

Returns the current branch name, or `undefined` when HEAD is detached. Used by Supervisor to persist `branch` in `status.json`.

## 4) Worktree isolation (`worktree.ts`)

`src/specialist/worktree.ts` provisions isolated git workspaces for edit-permission specialists.

### Key constraints

- Shells out to `bd worktree create` exclusively — no silent git fallback
- Fails loud: throws on bd error instead of degrading silently
- No Pi bootstrap logic (extensions are global via `~/.pi/`)

### Branch and path derivation

```typescript
// Convention: feature/<beadId>-<specialist-slug>
export function deriveBranchName(beadId: string, specialistName: string): string {
  return `feature/${beadId}-${slugify(specialistName)}`;
}

// Convention: <beadId>-<specialist-slug>
export function deriveWorktreeName(beadId: string, specialistName: string): string {
  return `${beadId}-${slugify(specialistName)}`;
}
```

### `provisionWorktree()` — creation and reuse

1. Derives canonical branch name and worktree path
2. Checks `git worktree list --porcelain` for existing worktree on that branch
3. If exists: returns `reused: true`
4. If not: calls `bd worktree create <path> --branch <branch>` (hard — throws on failure)

### `listWorktrees()` / `findExistingWorktree()` — discovery

Parses `git worktree list --porcelain` output into a `Map<branch, absolute-path>`. Detached-HEAD worktrees are omitted.

## 5) Supervisor is the sole durable lifecycle source

`src/specialist/supervisor.ts` owns persisted lifecycle and job state.

### Durable artifacts (authoritative)

For each run (`.specialists/jobs/<id>/`):

- `status.json` — mutable current state (`starting/running/waiting/done/error`, pid, last event timestamps, model/backend, worktree_path, branch, **`node_id`**)
- `events.jsonl` — append-only canonical timeline stream (JSON-first source of truth)
- `result.txt` — final assistant output text

### JSON-first storage + atomic dual-write

Persistence is **JSON-first**:

- Files under `.specialists/jobs/<id>/` are the canonical write path and crash-recovery source.
- SQLite mirrors the same payloads (`status_json`, `event_json`) for fast listing/querying and node-level analytics.

Dual-write behavior is intentionally split by durability role:

1. Write canonical file artifact (`status.json`, `events.jsonl`, `result.txt`).
2. Best-effort mirror into SQLite.

For coupled SQLite rows, writes are atomic inside a DB transaction:

- `upsertStatusWithEvent(...)` → status + event in one transaction
- `upsertStatusWithEventAndResult(...)` → status + event + result in one transaction

This yields: canonical durability from files, atomic relational consistency inside SQLite, and resilient operation when SQLite is unavailable.

### SQLite integration

Supervisor optionally uses `ObservabilitySqliteClient` for:

- Status mirror (`upsertStatus`) — indexed reads by status/bead/node
- Event mirror (`appendEvent`) — ordered timeline queries from `event_json`
- Result mirror (`upsertResult`) — quick result retrieval without reading `result.txt`
- Transactional compound updates (`upsertStatusWithEvent*`) — single-commit relational state changes

File-based storage remains authoritative and always available.

### Observability schema evolution (`schema_version` v1 → v4)

`src/specialist/observability-sqlite.ts` initializes and migrates schema idempotently through:

- **v1**: base observability tables (`schema_version`, `specialist_jobs`, `specialist_events`, `specialist_results`) + v1 rebuild of `specialist_jobs` to normalized columns (`worktree_column`, `last_output`).
- **v2**: bead-aware indexing (`bead_id` in jobs + `idx_jobs_bead`).
- **v3**: explicit job lifecycle indexing (`status`, `node_id`, `idx_jobs_status_updated`) and status denormalization for faster list/filter operations.
- **v4**: node-runtime observability tables:
  - `node_runs`
  - `node_members`
  - `node_events`
  - `node_memory`

Migrations are safe to rerun: each step checks `schema_version`, applies forward-only DDL, and recreates required indexes with `IF NOT EXISTS`.

### Node runtime tables (v4)

v4 adds first-class storage for multi-member node orchestration state:

- `node_runs` — coordinator-level run status (`node_name`, `status`, `coordinator_job_id`, `waiting_on`, `memory_namespace`, `status_json`)
- `node_members` — per-member participation (`member_id`, linked `job_id`, `specialist`, `model`, `role`, `status`, `enabled`)
- `node_events` — node-scoped timeline stream (`type`, `event_json`, ordered by `t,id`)
- `node_memory` — node memory/materialization (`namespace`, `entry_type`, `entry_id`, `summary`, `source_member_id`, `confidence`, `provenance_json`)

### Lifecycle ownership rules

Supervisor determines and persists:

- job creation and initial `starting` state
- transitions to `running`, `waiting`, `done`, `error`
- run completion and terminal event emission
- crash recovery and stale-state reconciliation

**Design rule:** completion and state are read from Supervisor files, not inferred directly from raw Pi adapter callbacks.

### GitNexus tracking accumulator

Supervisor accumulates GitNexus usage across a run:

```typescript
const gitnexusAccumulator = {
  files_touched: new Set<string>(),
  symbols_analyzed: new Set<string>(),
  highest_risk: undefined as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
  tool_invocations: 0,
};
```

- `edit`/`write` tool results: extract `path` → add to `files_touched`
- `gitnexus_*` tool results: extract `files`, `symbols_analyzed`, `risk_level`
- Emits `gitnexus_summary` in `run_complete` event

### FIFO-based steering

Supervisor creates a named FIFO (`steer.pipe`) for cross-process steering:

```typescript
const fifoPath = join(dir, 'steer.pipe');
execFileSync('mkfifo', [fifoPath]);
```

**Synchronous fd closing:** The FIFO fd is opened with `'r+'` (O_RDWR) to prevent blocking, and closed synchronously in the `finally` block before destroying the read stream. This prevents event loop hangs in batch test suites.

Message types:
- `{ type: 'steer', message: '...' }` — steer running session
- `{ type: 'resume', task: '...' }` — resume waiting keep-alive session
- `{ type: 'close' }` — close keep-alive session
- `{ type: 'prompt', message: '...' }` — DEPRECATED, use `resume`

### Keep-alive session support

Supervisor supports non-streaming keep-alive sessions via `onResumeReady` callback:

1. Session completes first turn → transitions to `waiting` status
2. Session stays alive (not killed) awaiting explicit `resume` or `close`
3. Orchestrator sends `{ type: 'resume', task: '...' }` via FIFO
4. Session processes next turn → returns to `waiting` or `done`

**State machine:**
- `running` → actively processing
- `waiting` → alive, awaiting next-turn action (valid: `resume`, `close`)
- `done` → terminal, session closed
- `error` → terminal, session closed with error

### Job lineage fields

When `--job <id>` is passed at run time, Supervisor persists two lineage fields in `status.json` (and mirrors them to SQLite):

```typescript
interface SupervisorStatus {
  reused_from_job_id?: string;      // the job whose workspace was borrowed via --job
  worktree_owner_job_id?: string;   // the transitive root owner of the worktree
}
```

The resolver walks the target job's `status.json`: if it already carries a `worktree_owner_job_id`, that value is inherited; otherwise the target job's own `id` becomes the owner. This keeps ownership consistent across arbitrarily deep reuse chains.

These fields are the primary inputs for `sp ps` tree construction — they replace fragile `worktree_path` inference.

### Context denormalization in `status.json`

On every `turn_summary` metric event, Supervisor writes `context_pct` and `context_health` directly into `status.json` via `setStatus()`:

```typescript
setStatus({
  context_pct: contextUtilization?.context_pct,
  context_health: contextUtilization?.context_health,
});
```

This avoids event-log scanning for any consumer that only needs the latest value (e.g. `sp ps` reads `status.json` and displays a `ctx%` column without touching `events.jsonl`).

### Context window tracking

Supervisor tracks context utilization for long-running sessions:

```typescript
type ContextHealth = 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL';

const MODEL_CONTEXT_WINDOWS: Array<{ matcher: (model: string) => boolean; windowTokens: number }> = [
  { matcher: (model) => model.includes('gemini-3.1-pro'), windowTokens: 1_000_000 },
  { matcher: (model) => model.includes('qwen3.5') || model.includes('glm-5'), windowTokens: 128_000 },
  { matcher: (model) => model.includes('claude'), windowTokens: 200_000 },
];

function getContextHealth(contextPct: number): ContextHealth {
  if (contextPct < 40) return 'OK';
  if (contextPct <= 65) return 'MONITOR';
  if (contextPct <= 80) return 'WARN';
  return 'CRITICAL';
}
```

Context utilization (`context_pct`) is captured on every `turn_summary` event, rounded/validated into status snapshots, and surfaced by CLI/status views for long-run monitoring and compaction risk detection.

**Per-turn text accumulation**:
- `turnTextAccumulator` collects streamed `text` deltas per assistant message
- Emits as `text_content` on `turn_summary` events (survives crashes via JSON persistence in `event_json`)
- Feed displays 80-char preview on `TURN+` lines
- Context health warnings shown at WARN (80%) and CRITICAL (95%) thresholds

### Stuck detection model

Stall/staleness is enforced at two layers:

#### Session-level liveness (`session.ts`)

- `_markActivity()` resets a timer on each parsed event
- if no activity for `stallTimeoutMs`, session throws `StallTimeoutError` and kills Pi

#### Supervisor-level staleness (`supervisor.ts`)

Defaults (`STALL_DETECTION_DEFAULTS`):

| Threshold | Default | Action |
|-----------|---------|--------|
| `running_silence_warn_ms` | 60s | Emit `stale_warning` event |
| `running_silence_error_ms` | 300s | Transition to `error`, kill session |
| `waiting_stale_ms` | 1h | Emit `stale_warning` event (do NOT auto-close) |
| `tool_duration_warn_ms` | 120s | Emit `stale_warning` with tool name |

Periodic checker (10s interval) monitors silence duration and tool execution time.

### Crash recovery

On `run()`, Supervisor scans job dirs for:

- `running`/`starting` jobs with dead PID → mark as `error`
- `running` jobs with prolonged silence → mark as `error`
- `waiting` jobs with prolonged silence → emit `stale_warning` event (preserve state)

### Bead ownership and lifecycle semantics

Ownership comes from Runner + Supervisor behavior:

- If `inputBeadId` is provided, that bead is orchestrator-owned (inherited)
- If no input bead and creation policy permits, Runner creates an owned bead

Supervisor post-run policy:

- always persists bead ID in status when available
- appends notes to owned bead, or (READ_ONLY + input bead) appends result back to input bead
- closes bead **only when runner owns it** (`!runOptions.inputBeadId`)
- never closes orchestrator-provided input beads

This prevents sub-bead/lifecycle conflicts and keeps orchestrator ownership explicit.

## 6) Timeline event model (`timeline-events.ts`)

`src/specialist/timeline-events.ts` defines the canonical feed v2 event vocabulary.

### Event layers

1. **Message construction layer** (nested under `message_update`):
   - `text_start`, `text_delta`, `text_end`
   - `thinking_start`, `thinking_delta`, `thinking_end`
   - `toolcall_start`, `toolcall_delta`, `toolcall_end`
   - `done` (message-level completion)
   - `error` (message-level failure)

2. **Tool execution layer** (top-level):
   - `tool_execution_start`
   - `tool_execution_update` (optional, streaming)
   - `tool_execution_end`

3. **Tool result layer** (message role: `toolResult`):
   - `message_start` (role: `toolResult`)
   - `message_end`

4. **Turn boundary layer**:
   - `turn_start`
   - `turn_end` (includes assistant message + `toolResults[]`)

5. **Run boundary layer**:
   - `agent_start`
   - `agent_end` (run completion, contains all `messages[]`)

### Canonical timeline events (persisted to `events.jsonl`)

| Event | When emitted | Key fields |
|-------|-------------|------------|
| `run_start` | Job begins | `specialist`, `bead_id` |
| `meta` | Model/backend known | `model`, `backend` |
| `thinking` | Reasoning detected | `char_count` |
| `tool` (start/update/end) | Tool execution | `tool`, `phase`, `tool_call_id`, `args`, `result_summary`, `result_raw`, `is_error` |
| `text` | Text output detected | `char_count` |
| `message` (start/end) | Message boundary | `phase`, `role` |
| `turn` (start/end) | Turn boundary | `phase` |
| `token_usage` | Token metrics from RPC | `token_usage`, `source` |
| `finish_reason` | Finish reason from RPC | `finish_reason`, `source` |
| `turn_summary` | Turn completion | `turn_index`, `token_usage`, `finish_reason`, **`context_pct`**, **`text_content`** |
| `compaction` (start/end) | Context compaction | `phase` |
| `retry` | Auto-retry event | `phase` |
| `stale_warning` | Stuck detection | `reason`, `silence_ms`, `threshold_ms`, `tool` |
| `run_complete` | **THE canonical completion** | `status`, `elapsed_s`, `model`, `backend`, `bead_id`, `error`, `output`, `metrics`, `gitnexus_summary` |

### Completion semantic

For feed v2, the canonical completion event is a single `run_complete` event. This resolves the historical ambiguity between:

- callback-level `done` (synthetic, from `agent_end`)
- persisted `agent_end` (added after runner returns)

The `run_complete` event is emitted once per job and contains:
- final status (`COMPLETE` | `ERROR` | `CANCELLED`)
- elapsed time
- model/backend
- error message if applicable
- aggregated metrics (`token_usage`, `finish_reason`, `tool_calls`, `exit_reason`)
- GitNexus summary if any `gitnexus_*` tools were invoked

Legacy completion events (`done`, `agent_end`) are parse-compatible for old history but ignored on the write path.

### Bun SQLite loading model

`ObservabilitySqliteClient` is Bun-aware and lazy-loaded:

- `bun:sqlite` is required dynamically (`require('bun:sqlite')`) only on first probe.
- Under Node/vitest (where `bun:sqlite` is unavailable), the probe returns `null` and runtime continues file-only.
- If SQLite exists, schema init (`initSchema`) runs first, then a persistent client is opened with WAL + busy timeout.

This keeps tests/tooling portable while enabling SQLite acceleration in Bun environments.

### `mapCallbackEventToTimelineEvent()` — mapping table

| Callback event | Timeline event | Notes |
|---------------|----------------|-------|
| `thinking` | `thinking` | — |
| `tool_execution_start` | `tool` (start) | Includes `args`, `started_at` |
| `tool_execution_update` | `tool` (update) | — |
| `tool_execution_end` | `tool` (end) | Includes `result_summary`, `result_raw`, `is_error` |
| `text` | `text` | Presence only, not deltas |
| `message_start_assistant` | `message` (start, assistant) | — |
| `message_end_assistant` | `message` (end, assistant) | — |
| `message_start_tool_result` | `message` (start, toolResult) | — |
| `message_end_tool_result` | `message` (end, toolResult) | — |
| `turn_start` | `turn` (start) | — |
| `turn_end` | `turn` (end) | — |
| `auto_compaction_start` | `compaction` (start) | — |
| `auto_compaction_end` | `compaction` (end) | — |
| `auto_retry` | `retry` (end) | — |
| `agent_end`, `done`, `message_done` | **IGNORED** | Supervisor emits `run_complete` instead |

## 7) How Session, Timeline, and Supervisor connect

End-to-end flow:

1. Supervisor allocates job ID and writes initial `status.json`
2. Supervisor starts Runner; Runner starts `PiAgentSession`
3. Session parses Pi RPC stream and emits normalized callbacks
4. Supervisor maps callbacks through `mapCallbackEventToTimelineEvent(...)`
5. Supervisor appends normalized timeline records to `events.jsonl` (and SQLite when available)
6. Supervisor updates `status.json` on every lifecycle change
7. On terminal outcome, Supervisor writes `result.txt` and emits exactly one `run_complete`

Result: **Pi provides protocol events; Session adapts transport; Supervisor persists lifecycle truth.**

## 8) Canonical references

| Component | Path | Responsibility |
|-----------|------|----------------|
| Protocol | `pi/rpc/` | JSONL framing, RPC types, client semantics |
| Protocol docs | `docs/pi-rpc.md` | Human-readable protocol notes |
| RPC adapter | `src/pi/session.ts` | Spawns Pi, parses NDJSON, correlates requests |
| Job registry | `src/specialist/job-root.ts` | Git-common-root-anchored jobs dir |
| Worktree isolation | `src/specialist/worktree.ts` | Provisioning, branch naming, reuse detection |
| Durable lifecycle | `src/specialist/supervisor.ts` | Status, events, results, GitNexus tracking, FIFO steering, lineage fields, context denorm |
| Timeline schema | `src/specialist/timeline-events.ts` | Feed v2 event vocabulary, mapping, constructors |
| Process snapshot CLI | `src/cli/ps.ts` | Job tree view, context%, bead titles, urgency sort, JSON output |
| Worktree docs | `docs/worktrees.md` | Operator-facing worktree isolation reference |
