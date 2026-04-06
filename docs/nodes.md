# Nodes: NodeSupervisor architecture, CLI, and lifecycle

## Doc contract (sync-docs style)

- **Source of truth:** implementation-first, generated from runtime code paths.
- **Validated against:**
  - `src/specialist/node-supervisor.ts`
  - `src/specialist/job-control.ts`
  - `src/cli/node.ts`
  - `src/specialist/observability-sqlite.ts` (z5ml tables)
  - `node-coordination.md`
- **Drift policy:** if any state/event/CLI/schema changes, update this document in the same PR.

---

## 1) Overview

A **node** is a long-lived multi-agent orchestration run managed by `NodeSupervisor`.

Instead of running one specialist in isolation, a node coordinates:

- one **coordinator** specialist (decision engine), and
- N **member** specialists (workers with explicit `memberId`s).

Why this exists:

- Some tasks need **parallel specialist work** + iterative coordination.
- The coordinator can react to member outputs/status changes over time.
- Shared node memory captures findings and supports downstream promotion to beads.
- Node run state is persisted in SQLite so runs are inspectable/recoverable.

---

## 2) Architecture

### Core components

- **`NodeSupervisor`** (`src/specialist/node-supervisor.ts`)
  - Owns node state machine.
  - Spawns coordinator + members.
  - Polls member status/output.
  - Resumes coordinator with member/memory context.
  - Validates coordinator JSON contract.
  - Dispatches coordinator actions (`resume|steer|stop`) to members.
  - Persists node runs/events/memory best-effort to SQLite.

- **`JobControl`** (`src/specialist/job-control.ts`)
  - Thin adapter over `Supervisor` for member/coordinator jobs.
  - Starts keep-alive jobs with injected `node_id` + `member_id` variables.
  - Sends control messages via FIFO (`resume`, `steer`, `close`).
  - Reads status/result (SQLite-first, file fallback).

- **Node CLI surface** (`src/cli/node.ts`)
  - `sp node run` starts a node.
  - `sp node status` inspects one/all nodes.
  - `sp node feed` streams node event log.
  - `sp node promote` moves a node memory finding into bead notes.

### Coordinator/member model

- Coordinator speaks in logical `memberId` references only.
- `NodeSupervisor` is the translation layer from `memberId -> jobId/controller`.
- Members are started once, then resumed/steered/stopped based on coordinator actions.
- Coordinator is resumed when member changes arrive and coordinator is `waiting`.

---

## 3) State machine

`NodeRunStatus` states (8 total):

1. `created`
2. `starting`
3. `running`
4. `waiting`
5. `degraded`
6. `error` (terminal)
7. `done` (terminal)
8. `stopped` (terminal)

### Valid transitions (from `VALID_TRANSITIONS`)

- `created -> starting | stopped`
- `starting -> running | error | stopped`
- `running -> waiting | degraded | done | error | stopped`
- `waiting -> running | degraded | done | error | stopped`
- `degraded -> running | error | stopped`
- terminal states: no outbound transitions

> Historical planning docs call this “17 transitions”; current implementation table validates **18** directed transitions (including `waiting -> done`).

### Terminal states

- `error`
- `done`
- `stopped`

### Degraded recovery behavior

`NodeSupervisor` moves to `degraded` when:

- any member status becomes `error`, or
- any member context health reaches `CRITICAL`.

It recovers from `degraded -> running` when health/status conditions normalize.

---

## 4) CLI surface

## `sp node run`

Run a node from config file or inline JSON.

```bash
sp node run ./node-config.json
sp node run ./node-config.json --bead unitAI-123
sp node run --inline '{"name":"research","coordinator":"node-coordinator","members":[{"memberId":"explorer-1","specialist":"explorer"}],"initialPrompt":"Investigate X"}' --json
```

## `sp node status`

Show one node or list all.

```bash
sp node status
sp node status --node research-abc12345
sp node status --node research-abc12345 --json
```

## `sp node feed`

Read node-only event stream.

```bash
sp node feed research-abc12345
sp node feed research-abc12345 --json
```

## `sp node promote`

Promote one node memory finding into bead notes.

```bash
sp node promote research-abc12345 finding-001 --to-bead unitAI-999
sp node promote research-abc12345 finding-001 --to-bead unitAI-999 --json
```

---

## 5) Node config format

`sp node run` accepts JSON with this shape:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["name", "coordinator", "members", "initialPrompt"],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable node name; used in generated node_id prefix"
    },
    "coordinator": {
      "type": "string",
      "minLength": 1,
      "description": "Specialist name for coordinator job"
    },
    "members": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["memberId", "specialist"],
        "properties": {
          "memberId": {
            "type": "string",
            "minLength": 1,
            "description": "Stable logical identifier used by coordinator actions"
          },
          "specialist": {
            "type": "string",
            "minLength": 1,
            "description": "Specialist to run for this member"
          },
          "model": {
            "type": "string",
            "description": "Optional model override metadata"
          },
          "role": {
            "type": "string",
            "description": "Optional role prompt for initial member spawn"
          }
        }
      }
    },
    "initialPrompt": {
      "type": "string",
      "minLength": 1,
      "description": "First prompt sent when coordinator starts"
    },
    "memoryNamespace": {
      "type": "string",
      "description": "Optional namespace for node memory segmentation"
    }
  }
}
```

Field notes:

- `name` + random suffix produce runtime `node_id` (`<name>-<8char>`).
- `memberId` must be stable: coordinator contract references this ID.
- `role` defaults to a generic member prompt when omitted.

---

## 6) Coordinator contract

Coordinator output is strict JSON validated with Zod:

```json
{
  "summary": "string (required)",
  "memory_patch": [
    {
      "entry_type": "fact|question|decision",
      "summary": "string",
      "entry_id": "string (optional)",
      "source_member_id": "string (optional)",
      "confidence": "number 0..1 (optional)",
      "provenance": "object (optional)"
    }
  ],
  "actions": [
    { "type": "resume", "memberId": "string", "task": "string" },
    { "type": "steer", "memberId": "string", "message": "string" },
    { "type": "stop", "memberId": "string" }
  ],
  "validation": {
    "ok": "boolean (optional)",
    "issues": ["string"],
    "notes": "string"
  }
}
```

### Runtime contract enforcement

`NodeSupervisor.handleCoordinatorOutput()` enforces:

1. valid JSON parse,
2. schema conformance,
3. runtime member-state compatibility (`memberId` exists, enabled, has `jobId`, has controller).

If invalid, supervisor sends a **repair prompt** and retries.

### 3-attempt repair loop

- Failure classes:
  - `invalid_json`
  - `schema_validation_failure`
  - `runtime_state_mismatch`
- Max attempts: **3**
- After 3 failures: node transitions to `error` with reason `coordinator_output_invalid_after_3_attempts`.

---

## 7) Feed isolation

Node jobs are isolated from standalone specialist jobs in two ways:

1. **Tagging at job start**
   - `JobControl.startJob()` injects `node_id` and `member_id` into run variables.
   - Status rows include `node_id` for member/coordinator jobs.

2. **Read-path filtering**
   - General job feed/status helpers classify jobs with `node_id` as node-owned.
   - `sp node feed <node-id>` reads only `node_events` for that node.

Result: node orchestration logs do not pollute standalone feed workflows.

---

## 8) Memory system

Memory is coordinator-authored via `memory_patch` entries.

Flow:

1. Coordinator emits `memory_patch[]`.
2. `NodeSupervisor.applyMemoryPatch()` upserts into `node_memory`.
3. For each entry, supervisor appends `memory_updated` event.
4. `sp node promote <node-id> <finding-id> --to-bead <id>`:
   - reads `node_memory` by `entry_id`,
   - builds “Node finding promoted” notes,
   - appends notes to target bead with `bd update --notes`.

This gives structured node memory + explicit human workflow promotion.

---

## 9) Context health

Each coordinator resume payload includes `member_updates` with:

- `context_pct`
- `context_health`

Current thresholds implemented in `toContextHealth()`:

- `OK`: `< 60`
- `MONITOR`: `60..75`
- `WARN`: `>75..90`
- `CRITICAL`: `> 90`
- `UNKNOWN`: no metric available

`context_pct` source is SQLite query over member job metrics (`queryMemberContextHealth`).

When a member is `CRITICAL`, node can transition into `degraded`.

---

## 10) SQLite tables (z5ml)

Node runtime persistence lives in schema v4:

### `node_runs`

- `id` (PK)
- `node_name`
- `status`
- `coordinator_job_id`
- `started_at_ms`
- `updated_at_ms`
- `waiting_on`
- `error`
- `memory_namespace`
- `status_json`

### `node_members`

- `id` (PK autoincrement)
- `node_run_id`
- `member_id`
- `job_id`
- `specialist`
- `model`
- `role`
- `status`
- `enabled`

### `node_events`

- `id` (PK autoincrement)
- `node_run_id`
- `t`
- `type`
- `event_json`

Supported event types (`NodeEventType`, 17 total):

- `node_created`
- `node_started`
- `node_state_changed`
- `member_started`
- `member_state_changed`
- `member_output_received`
- `member_failed`
- `member_recovered`
- `coordinator_resumed`
- `coordinator_output_received`
- `coordinator_output_invalid`
- `memory_updated`
- `action_dispatched`
- `node_waiting`
- `node_done`
- `node_error`
- `node_stopped`

### `node_memory`

- `id` (PK autoincrement)
- `node_run_id`
- `namespace`
- `entry_type`
- `entry_id`
- `summary`
- `source_member_id`
- `confidence`
- `provenance_json`
- `created_at_ms`
- `updated_at_ms`

---

## 11) E2E lifecycle walkthrough

Validated path from bootstrap to completion:

1. **Bootstrap**
   - `NodeSupervisor.run()` calls `bootstrap()`.
   - SQLite `bootstrapNode()` writes:
     - `node_runs` row with `created`,
     - `node_created` + `node_started` events.

2. **Starting**
   - State `created -> starting`.
   - `spawnMembers()` starts keep-alive member jobs via `JobControl`.
   - `spawnCoordinator()` starts coordinator job.
   - State `starting -> running`.

3. **Polling loop**
   - Every `POLL_INTERVAL_MS` (5s), supervisor reads member statuses.
   - Status/output changes emit `member_state_changed` and update registry.

4. **Coordinator resume**
   - If coordinator status is `waiting` and member changes exist:
     - build `node_resume_payload` containing:
       - member updates + context health,
       - full registry snapshot,
       - recent memory patch summary,
     - `resumeJob()` coordinator.
     - emit `coordinator_resumed`.
     - state can move `running -> waiting`.

5. **Coordinator output handling**
   - New coordinator output hash triggers parse/validate path.
   - Valid output:
     - emit `coordinator_output_received`,
     - apply `memory_patch` -> `node_memory` + `memory_updated` events,
     - dispatch `actions[]` to target members (`action_dispatched`).
   - Invalid output:
     - emit `coordinator_output_invalid`,
     - run up to 3 repair attempts.

6. **Health + degradation**
   - Member error/critical context can transition to `degraded`.
   - Recovery can return to `running`.

7. **Terminal completion**
   - When all members are terminal (`done|error|stopped`):
     - transition to `done`,
     - emit `node_done`,
     - optionally append completion summary to source bead.

8. **Promotion flow (post-run)**
   - Operator promotes selected node finding(s) to bead via `sp node promote`.

---

## Practical notes

- Node persistence is **best-effort** in supervisor paths (orchestration continues even if SQLite writes fail).
- Runtime control path (`resume|steer|stop`) is FIFO-based through job status metadata.
- Node contract deliberately separates:
  - orchestration decisions (`coordinator` JSON),
  - execution control (`JobControl`),
  - storage (`observability-sqlite`).
