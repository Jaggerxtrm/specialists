---
title: Specialists Runtime Architecture
scope: architecture
category: reference
version: 2.1.0
updated: 2026-04-05
synced_at: a7dee4b5
description: Event pipeline, Pi RPC adapter boundaries, Supervisor lifecycle ownership, stuck detection, GitNexus tracking, worktree isolation, and bead ownership semantics.
source_of_truth_for:
  - "src/specialist/job-root.ts"
  - "src/specialist/worktree.ts"
  - "src/specialist/timeline-events.ts"
  - "src/pi/session.ts"
  - "src/specialist/supervisor.ts"
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
- `events.jsonl` — append-only timeline stream (SQLite-backed when available)
- `result.txt` — final assistant output text (SQLite-backed when available)

### SQLite integration

Supervisor optionally uses `ObservabilitySqliteClient` for:

- Status persistence (`upsertStatus`) — faster reads, atomic writes
- Event append (`appendEvent`) — durable timeline storage
- Result storage (`upsertResult`) — final output persistence

File-based storage remains as fallback when SQLite is unavailable.

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

Context utilization (`context_pct`) is captured on `turn_summary` events and emitted via `status` events for observability.

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
| `turn_summary` | Turn completion | `turn_index`, `token_usage`, `finish_reason`, **`context_pct`** |
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
| Durable lifecycle | `src/specialist/supervisor.ts` | Status, events, results, GitNexus tracking, FIFO steering |
| Timeline schema | `src/specialist/timeline-events.ts` | Feed v2 event vocabulary, mapping, constructors |
| Worktree docs | `docs/worktrees.md` | Operator-facing worktree isolation reference |
