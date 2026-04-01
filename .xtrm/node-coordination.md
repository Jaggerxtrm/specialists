# Node Architecture — Coordination Plan

> Three parallel work streams to advance the Research Node architecture.
> Each orchestrator gets their own scope, starting prompt, and beads to claim.

## Stream 1: Validate Node Concept (unitAI-0jm9)

### Prereq: unitAI-b8ac (wire response_format + output_schema into runner)

### Scope
- Fix output_schema/response_format injection in runner.ts (unitAI-b8ac)
- Create `node_coordinator.specialist.json` in `.specialists/user/` with:
  - `response_format: json`
  - `output_schema`: coordinator action contract
  - System prompt: READ_ONLY orchestrator, emit JSON decisions only
  - `interactive: true`, `permission_required: READ_ONLY`
- Run manual validation: start coordinator + explorer + overthinker, manually play NodeSupervisor
- 3+ turns of coordinator→member→coordinator flow
- Freeze spec in unitAI-16ov after validation

### Starting prompt for orchestrator
```
Take issues unitAI-b8ac and unitAI-0jm9.

unitAI-b8ac: response_format and output_schema are dead schema fields in specialist YAML/JSON —
defined in schema.ts but never read by runner.ts. Fix: runner.ts must inject them into the
system prompt. If response_format is 'json', append JSON-only instruction. If output_schema
is present, append the schema definition.

After b8ac lands: create node_coordinator.specialist.json (see 0jm9 notes for full spec).
Then run the manual validation described in 0jm9 notes — start 3 keep-alive specialists,
manually orchestrate 3+ coordinator turns, verify JSON output contract works.

Key files: src/specialist/runner.ts, src/specialist/schema.ts
Key context: bd show unitAI-b8ac, bd show unitAI-0jm9
```

### Beads to claim
- unitAI-b8ac (bug fix)
- unitAI-0jm9 (validation)
- unitAI-16ov (spec freeze — after validation)

---

## Stream 2: SQLite Foundation (unitAI-0c0w → unitAI-08zd)

### Scope
- Implement `specialists db setup` TTY-gated human-only command (unitAI-0c0w)
- Begin 08zd Phase 1: RPC completeness (stop losing stopReason, tool results, compaction/retry events)
- Continue into Phase 2: pipeline linkage
- unitAI-4qam: surface waiting state in feed/result/status

### Starting prompt for orchestrator
```
Take issues unitAI-0c0w and start on unitAI-08zd Phase 1.

unitAI-0c0w: Create 'specialists db setup' command. Human-only, TTY-gated
(process.stdin.isTTY check at top of run()). Never in AGENTS.md/SKILL.md.
Only appears in --help. Initializes SQLite observability database.
See bead notes for full spec and user-preferred approach (NOT chmod, NOT auto-create).

After 0c0w: begin 08zd Phase 1 — enrich session.ts callbacks to capture stopReason,
tool_execution_end.result.content[], compaction/retry events. Extend timeline-events.ts
with new event types. See 08zd notes for the 3-phase arc and implementation order.

Key files: src/cli/ (new db.ts), src/pi/session.ts, src/specialist/timeline-events.ts
Key context: bd show unitAI-0c0w, bd show unitAI-08zd
```

### Beads to claim
- unitAI-0c0w (db setup)
- unitAI-08zd Phase 1 tasks (may need sub-issues)
- unitAI-4qam (after db infrastructure exists)

---

## Stream 3: Node Persistence Model (unitAI-z5ml)

### Prereq: unitAI-08zd Phase 3 must be at least partially landed (tables exist)

### Scope
- Design SQLite tables: node_runs, node_members, node_events, node_memory, action_dispatch_log
- node_id FK from jobs table
- Schema must support: NodeSupervisor state machine states, coordinator action log, memory patches with provenance/confidence
- Wire into existing Supervisor/job infrastructure

### Starting prompt for orchestrator
```
Take issue unitAI-z5ml — Node SQLite persistence model.

Design and implement SQLite tables for the node runtime. This builds on top of
the specialists SQLite database (unitAI-08zd). Tables needed:

- node_runs: id, node_name, status, coordinator_job_id, started_at, updated_at,
  waiting_on, error, memory_namespace
- node_members: node_run_id FK, member_id, job_id, specialist, model, role,
  status, enabled
- node_events: node_run_id FK, timestamp, type, data (JSON)
  Types: node_created, node_started, node_state_changed, member_started,
  member_state_changed, member_output_received, member_failed, member_recovered,
  coordinator_resumed, coordinator_output_received, coordinator_output_invalid,
  memory_updated, action_dispatched, node_degraded, node_waiting, node_done,
  node_error, node_stopped
- node_memory: node_run_id FK, namespace, entry_type (fact|question|decision),
  entry_id, summary, source_member_id, confidence, provenance JSON, created_at, updated_at
- action_dispatch_log: node_run_id FK, action_type, target_member_id, prompt/message,
  reason, dispatched_at, result_status

Also: add node_id column to existing jobs table (nullable FK to node_runs) so
sp feed -f can filter node-owned member jobs.

Key context: bd show unitAI-z5ml, bd show unitAI-2b3m (parent epic with full design)
```

### Beads to claim
- unitAI-z5ml (persistence model)

---

## Parallelization

```
Stream 1 (validation)     Stream 2 (SQLite)        Stream 3 (node DB)
─────────────────────     ──────────────────        ──────────────────
b8ac (output_schema fix)  0c0w (db setup)           z5ml (design tables)
         ↓                       ↓                  [blocked until 08zd
0jm9 (manual validation)  08zd Phase 1              Phase 3 has tables]
         ↓                       ↓
16ov (freeze spec)         08zd Phase 2
                                 ↓
                           08zd Phase 3 ──→ unblocks Stream 3
                                 ↓
                           4qam (waiting state)
```

Streams 1 and 2 can run fully in parallel.
Stream 3 starts with design work but implementation waits for Stream 2 to deliver Phase 3 tables.

## Key Risk

Stream 2 (SQLite) is the longest and heaviest. If it slips, Streams 1 and 3 outputs
sit idle. Mitigation: Stream 1 validation findings inform all downstream work regardless
of when SQLite lands. Stream 3 design can be complete and ready to implement the moment
Phase 3 delivers table infrastructure.

## After All Streams Converge

With spec frozen (Stream 1), SQLite ready (Stream 2), and node tables designed (Stream 3):
- unitAI-69rw: NodeSupervisor state machine
- unitAI-iy5g: Coordinator contract enforcement
- unitAI-w0cg: Feed isolation
- unitAI-780u: Memory patch pipeline
- unitAI-u9my: Beads promotion
- unitAI-i6up: v1A preset definitions
