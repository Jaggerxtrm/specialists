---
title: Specialists Runtime Architecture
scope: architecture
category: reference
version: 1.0.0
updated: 2026-03-30
description: Event pipeline, Pi RPC adapter boundaries, Supervisor lifecycle ownership, stuck detection, and bead ownership semantics.
source_of_truth_for:
  - "src/specialist/timeline-events.ts"
  - "src/pi/session.ts"
  - "src/specialist/supervisor.ts"
  - "pi/rpc/"
domain:
  - architecture
  - rpc
  - supervisor
  - timeline
---

# Specialists Runtime Architecture

This document defines the runtime boundary between:

- **Pi RPC protocol** (`pi/rpc/`) — canonical transport and event contract
- **RPC adapter** (`src/pi/session.ts`) — process bridge + request/response correlation
- **Lifecycle owner** (`src/specialist/supervisor.ts`) — durable state, persistence, completion semantics
- **Timeline model** (`src/specialist/timeline-events.ts`) — persisted event vocabulary for feed v2

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

### ID-mapped dispatch + ack checks

- `sendCommand()` assigns incrementing IDs (`_nextRequestId`) and stores resolver/rejecter in `_pendingRequests`
- `_handleEvent()` matches `type === "response"` with `event.id` and resolves the matching pending request
- timeouts reject outstanding calls with `RPC timeout...`
- command methods enforce explicit ack success:
  - `prompt()` throws if `response.success === false`
  - `steer()` throws if `response.success === false`

This is the key adapter contract: **transport-level correctness and command acknowledgement**, not durable job semantics.

## 3) Supervisor is the sole durable lifecycle source

`src/specialist/supervisor.ts` owns persisted lifecycle and job state.

### Durable artifacts (authoritative)

For each run (`.specialists/jobs/<id>/`):

- `status.json` — mutable current state (`starting/running/waiting/done/error`, pid, last event timestamps, model/backend)
- `events.jsonl` — append-only timeline stream
- `result.txt` — final assistant output text

### Lifecycle ownership rules

Supervisor determines and persists:

- job creation and initial `starting` state
- transitions to `running`, `waiting`, `done`, `error`
- run completion and terminal event emission
- crash recovery and stale-state reconciliation

**Design rule:** completion and state are read from Supervisor files, not inferred directly from raw Pi adapter callbacks.

## 4) Timeline event model (`timeline-events.ts`)

`src/specialist/timeline-events.ts` defines the canonical feed v2 event vocabulary.

### Event layers

1. message construction layer (text/thinking/toolcall deltas, nested in `message_update`)
2. tool execution layer (`tool_execution_start/update/end` top-level)
3. tool result message layer (`message_start/end` with role `toolResult`)
4. turn boundaries (`turn_start/end`)
5. run boundary (`agent_start/end`)

### Persistence model

Persisted timeline events are normalized for operator use:

- `run_start`
- `meta`
- `thinking`
- `tool` (`start|update|end`)
- `text` (presence, not token deltas)
- `message` / `turn`
- `stale_warning`
- **`run_complete`** (canonical single completion event)

Legacy completion events (`done`, `agent_end`) are parse-compatible for old history but ignored on the write path.

## 5) How Session, Timeline, and Supervisor connect

End-to-end flow:

1. Supervisor allocates job ID and writes initial `status.json`
2. Supervisor starts Runner; Runner starts `PiAgentSession`
3. Session parses Pi RPC stream and emits normalized callbacks
4. Supervisor maps callbacks through `mapCallbackEventToTimelineEvent(...)`
5. Supervisor appends normalized timeline records to `events.jsonl`
6. Supervisor updates `status.json` on every lifecycle change
7. On terminal outcome, Supervisor writes `result.txt` and emits exactly one `run_complete`

Result: **Pi provides protocol events; Session adapts transport; Supervisor persists lifecycle truth.**

## 6) Stuck detection model

Stall/staleness is enforced at two layers:

### Session-level liveness (`session.ts`)

- `_markActivity()` resets a timer on each parsed event
- if no activity for `stallTimeoutMs`, session throws `StallTimeoutError` and kills Pi

### Supervisor-level staleness (`supervisor.ts`)

Defaults (`STALL_DETECTION_DEFAULTS`):

- `running_silence_warn_ms` (60s)
- `running_silence_error_ms` (300s)
- `waiting_stale_ms` (1h)
- `tool_duration_warn_ms` (120s)

Supervisor emits `stale_warning` events and can transition to `error` for prolonged running silence.

## 7) Bead ownership and lifecycle semantics

Ownership comes from Runner + Supervisor behavior:

- If `inputBeadId` is provided, that bead is orchestrator-owned (inherited)
- If no input bead and creation policy permits, Runner creates an owned bead

Supervisor post-run policy:

- always persists bead ID in status when available
- appends notes to owned bead, or (READ_ONLY + input bead) appends result back to input bead
- closes bead **only when runner owns it** (`!runOptions.inputBeadId`)
- never closes orchestrator-provided input beads

This prevents sub-bead/lifecycle conflicts and keeps orchestrator ownership explicit.

## 8) Canonical references

- Protocol and framing: `pi/rpc/` (`rpc-types.ts`, `rpc-mode.ts`, `rpc-client.ts`, `jsonl.ts`)
- Human-readable protocol notes: `docs/pi-rpc.md`
- Adapter: `src/pi/session.ts`
- Durable lifecycle: `src/specialist/supervisor.ts`
- Timeline schema/mapping: `src/specialist/timeline-events.ts`
