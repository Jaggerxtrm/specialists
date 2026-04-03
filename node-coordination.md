# Node Architecture — Coordination Plan

> Three parallel work streams to advance the Research Node architecture.
> Each orchestrator gets their own scope, starting prompt, and beads to claim.

## Assignments

| Stream | Owner |
|--------|-------|
| Stream 1 — 0jm9 manual validation + 16ov spec freeze | another agent |
| Stream 2 — 08zd (Phases 1→3) + 4qam | **this orchestrator** |
| Stream 3 — z5ml implementation | another agent (unblocked after 08zd Phase 3) |

## Live Status (updated 2026-04-03)

### Stream 1 — Output Contract + Validation (another agent)
| Bead | Job | Status | Notes |
|------|-----|--------|-------|
| unitAI-93rt | 9f19b9 (executor) | ✅ CLOSED | output_type + response_format + output_schema wired in runner. Warn-only post-run validation. Adopted in executor/explorer/planner. ⚠️ pre-existing lint errors in supervisor.ts (unrelated) |
| unitAI-0jm9 | — | 🔜 open | Create node_coordinator.specialist.json + run 3-turn manual validation loop |
| unitAI-16ov | — | blocked on 0jm9 | Spec freeze after validation |

### Stream 2 — SQLite Foundation
| Bead | Job | Status | Notes |
|------|-----|--------|-------|
| unitAI-0c0w | 13d71f (executor) | ✅ CLOSED | `specialists db setup`: TTY-gated, git-root DB path, chmod 644, clean safety, gitignore. 50 tests pass. |
| unitAI-08zd Phase 1 | b0bb4a (executor) | ❌ crashed (13min, context limit) | Partial work in tree — lint clean, tests hang. See bead notes. |
| unitAI-08zd Phase 1 retry | 00df5e (executor) | ❌ crashed again (FIFO test hang — pre-existing) | supervisor.test.ts keep-alive test hangs in original code too — not a regression. All other tests pass. |
| unitAI-08zd Phase 1 | — | ✅ ready to commit | Lint clean. 9 test files pass. supervisor.test.ts hang is pre-existing. Committing partial + Phase 2 next. |
| unitAI-08zd Phase 2 | 623cdd (executor) | ❌ did nothing (15s, no output) | Stopped — explorer-first required |
| unitAI-30k2 review | b2883e (reviewer, keep-alive) | 🔄 running | Reviewing Phase 1 commit 200b0eb9 |
| unitAI-9twy explore | c1c2fc (explorer) | 🔄 running | Mapping Phase 2 scope: feed/status/result gaps |
| unitAI-08zd Phase 2 | — | ⏳ blocked on review + explore | Executor dispatches after both complete |
| unitAI-08zd Phase 3 | — | blocked on Phase 2 | SQLite migration, WAL mode, worktree column |
| unitAI-4qam | — | blocked on Phase 3 | Surface waiting state in feed/result/status |

### Stream 3 — Node Persistence (another agent)
| Bead | Job | Status | Notes |
|------|-----|--------|-------|
| unitAI-z5ml | — | 🔜 design done, awaiting implementation | Snapshot+append-log schema. Circular FK: coordinator_job_id nullable, 4-step bootstrap. See z5ml bead notes. Blocked on 08zd Phase 3. |

## Stream 1: Validate Node Concept (unitAI-0jm9)

### Prereq: unitAI-93rt (output contract — reopened, was falsely closed)

### Scope
- Implement output contract: base + extension catalog (unitAI-93rt — see bead notes for full design)
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
Take issues unitAI-93rt and unitAI-0jm9.

unitAI-93rt (REOPENED — was falsely closed by executor): Define standardized specialist
output contract. Design: base contract (summary, status, issues_closed/created, follow_ups,
risks) + extension catalog (7 types: codegen, analysis, review, synthesis, orchestration,
workflow, research) + 'custom' escape hatch. Runner merges base + catalog extension by
output_type field. Users never touch runner.ts — just set output_type: 'codegen' etc.
See 93rt bead notes for full design with all 3 updates.

After 93rt lands: create node_coordinator.specialist.json (see 0jm9 notes for full spec,
output_type: 'orchestration'). Then run the manual validation described in 0jm9 notes —
start 3 keep-alive specialists, manually orchestrate 3+ coordinator turns, verify JSON
output contract works.

Key files: src/specialist/runner.ts, src/specialist/schema.ts
Key context: bd show unitAI-93rt, bd show unitAI-0jm9
```

### Before starting: iterate with overthinker on 93rt
Fire an overthinker on unitAI-93rt before implementation. Give it the full bead notes
(3 design updates) and ask it to:
1. Validate the base + extension catalog model
2. Challenge whether 7 extension types is the right number or if some should merge
3. Design the exact runner.ts injection logic (where in the prompt, how to merge)
4. Propose the output_type field addition to specialist schema
5. Consider edge cases: what if output_type is missing? What if custom + output_type both set?
At least 2 turns back and forth to refine before handing to executor.

### Beads to claim
- unitAI-93rt (output contract)
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
93rt (output contract)    0c0w (db setup)           z5ml (design tables)
  ↑ overthinker first
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

---

## Full Dependency Sequence

```
Stage 0 — Validate & Design
  93rt (output contract)  ←  overthinker first, then executor
       ↓
  0jm9 (manual validation)
       ↓
  16ov (freeze spec)

Stage 1 — Config Foundations
  e242 (YAML → JSON migration)
       ↓
  22tq (sp edit enrichment)
       ↓
  6exi (populate all fields on every specialist)
       ↓
  rcxv (sp edit presets: cheap/power/medium)

Stage 2 — SQLite Runtime
  0c0w (db setup command)
       ↓
  08zd Phase 1 (RPC completeness)
       ↓
  08zd Phase 2 (pipeline linkage)
       ↓
  08zd Phase 3 (SQLite migration)
       ↓
  4qam (waiting state visibility)

Stage 3 — Node v1A Core (needs Stage 0 + Stage 2)
  z5ml (node SQLite persistence model)      ← needs 08zd Phase 3 + 16ov
       ↓
  69rw (NodeSupervisor state machine)        ← needs z5ml + 4qam
       ↓
  iy5g (coordinator contract + repair loop)  ← needs 69rw
  w0cg (feed isolation + node_id tagging)    ← needs z5ml + 69rw
  780u (memory patch pipeline)               ← needs z5ml + iy5g
  u9my (beads promotion / sp node promote)   ← needs 69rw
  i6up (v1A preset definitions)              ← needs 16ov + e242 + 22tq

Stage 4 — Node v1B Researcher (needs Stage 3 + MCP wiring)
  gzrx (centralized manifest)
  4abv (MCP extension wiring)
       ↓
  psc2 (researcher activation)               ← needs i6up + 4abv + gzrx
```

### What can run in parallel
- Stage 0 and Stage 1 and Stage 2 — all three fully independent
- Within Stage 3: iy5g, w0cg, 780u, u9my can partially overlap after 69rw
- Stage 4 waits for everything

### Assignments
- **Stream 1 (Stage 0)**: separate orchestrator — output contract + validation
- **Stream 2 (Stage 2)**: longest path orchestrator — SQLite foundation
- **Stream 3 (Stage 3 design)**: separate orchestrator — node DB model design
- **Stage 1 (config)**: can be executor waves between sessions
- **Stage 3 implementation + Stage 4**: after all streams converge
