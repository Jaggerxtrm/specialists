# Node Architecture — Coordination Plan

> Three parallel work streams to advance the Research Node architecture.
> Each orchestrator gets their own scope, starting prompt, and beads to claim.

## Assignments

| Stream | Owner |
|--------|-------|
| Stream 1 — 0jm9 manual validation + 16ov spec freeze | another agent |
| Stream 2 — 08zd (Phases 1→3) + 4qam | **this orchestrator** |
| Stream 3 — z5ml implementation | another agent (unblocked after 08zd Phase 3) |

## Live Status (updated 2026-04-04)

### Stream 1 — Output Contract + Validation — ✅ COMPLETE
| Bead | Job | Status | Notes |
|------|-----|--------|-------|
| unitAI-93rt | e92066 (executor) | ✅ CLOSED | Redesigned: semantic output_type enum. Base+extension+yaml merge in runner. Warn-only validation. Overthinker-validated (2 turns). Both SKILL.md files + all default specialist YAMLs updated. |
| unitAI-c02w | — | ✅ CLOSED | specialists-creator YAML skill paths → .xtrm/skills/active/pi/ |
| unitAI-w2w6 | b670f1 (explorer) | ✅ CLOSED | Schema audit: 8 missing output_type, researcher keep_alive→interactive, xt-merge path, memory-processor null paths, model prefixes. All fixed. |
| unitAI-8f4v | e30c62 (executor) | ✅ CLOSED | All schema fixes applied. node-coordinator.specialist.yaml created in default scope. |
| unitAI-0jm9 | ed2e4e (node-coordinator) | ✅ CLOSED | Manual validation: 2 coordinator turns, valid JSON both turns, correct schema. Gaps found: JSON in fences, spawn→resume semantic, member ID injection needed. node-coordinator performs well. |
| unitAI-z61d | a031c1 (explorer) | ✅ CLOSED | Full issue scan: no existing specs for context window awareness or blast radius propagation. Clean design space. member_health + impact_report both greenfield. |
| unitAI-4qez | a50ffb (explorer) | ✅ CLOSED | Confirmed: Pi RPC tool_execution_end has full event.result for all tools incl. gitnexus. findToolResultContent() discards structure (500-char text only). No protocol changes needed — extraction layer fix in session.ts + accumulator in supervisor.ts. |
| unitAI-g5np | cbdbef (executor) | ✅ CLOSED — commit c601a032 | findToolResultRaw in session.ts, resultRaw→runner→supervisor, gitnexusAccumulator, result_raw+gitnexus_summary in timeline-events.ts. Merged master 23e4d875. |
| unitAI-16ov | — | ✅ CLOSED | Spec frozen: JSON fence fix (prompt+runner strip), spawn→resume semantic, member ID injection protocol, context window awareness (member_health 60/75/90% tiers, needs 08zd Ph3), blast radius propagation (impact_report in codegen/analysis, needs g5np), pipeline forwarding contract. See bead design field. |

### Stream 2 — SQLite Foundation
| Bead | Job | Status | Notes |
|------|-----|--------|-------|
| unitAI-0c0w | 13d71f (executor) | ✅ CLOSED | `specialists db setup`: TTY-gated, git-root DB path, chmod 644, clean safety, gitignore. 50 tests pass. |
| unitAI-08zd Phase 1 | b0bb4a (executor) | ❌ crashed (13min, context limit) | Partial work in tree — lint clean, tests hang. See bead notes. |
| unitAI-08zd Phase 1 retry | 00df5e (executor) | ❌ crashed again (FIFO test hang — pre-existing) | supervisor.test.ts keep-alive test hangs in original code too — not a regression. All other tests pass. |
| unitAI-08zd Phase 1 | — | ✅ CLOSED — commit 200b0eb9 | session.ts onMetric, timeline-events.ts 5 metric types, supervisor.ts mergeRunMetrics, observability-sqlite.ts + db.ts new. |
| unitAI-08zd Phase 1b | 7d7d78 (executor) | ✅ CLOSED — commit 98df33a2 | onToolEnd result param, auto_compaction_start/end distinct, result_summary + char_count on timeline events. |
| unitAI-08zd Phase 2 | 623cdd (executor) | ❌ did nothing (15s, no output) | Stopped — explorer-first required |
| unitAI-30k2 review | d8fb3c (reviewer, keep-alive) | ✅ PASS 82/100 | Phase 1 approved. Gaps: no schema migration, cwd not passed to SQLite client, auto_compaction dead-end, output_type not in run_complete. |
| unitAI-9twy explore | c1c2fc (explorer) | ✅ CLOSED | Phase 2 scope: CLI surface only — format-helpers.ts (cost_usd/turns/tool_calls), status.ts metrics display, result.ts --json mode, tests. |
| unitAI-08zd Phase 2 | 4726a6 (executor) | ✅ CLOSED — commit 84889edc | format-helpers.ts (cost_usd/turns/tool_calls), status.ts metrics display, result.ts --json, tests. |
| unitAI-08zd Phase 3 | — | 🔜 unblocked — planner done, executors ready | SQLite dual-write, WAL mode, worktree column. Merge order: A→C→B→D. |
| unitAI-3chh | cdb342 (planner) | ✅ CLOSED | Decomposed into ky4c/fqxo/afl9/hhs6 + test beads mhra/lcv6/pi8m. Merge order: A→C→B→D. |
| unitAI-ky4c | — | 🔜 unblocked — first task | Phase 3A: schema_version table + worktree_column (observability-sqlite.ts) |
| unitAI-fqxo | — | 🔜 blocked on ky4c | Phase 3C: WAL enforcement + DB exports (observability-sqlite.ts, observability-db.ts) |
| unitAI-afl9 | — | 🔜 blocked on fqxo | Phase 3B: supervisor dual-write (supervisor.ts) |
| unitAI-hhs6 | — | 🔜 blocked on afl9 | Phase 3D: CLI read paths (feed.ts, status.ts, result.ts) |
| unitAI-mhra/lcv6/pi8m | — | 🔜 test beads for 3A/3B/3D | Each blocks its impl bead |
| unitAI-4qam | — | blocked on Phase 3 | Surface waiting state in feed/result/status |
| unitAI-hgpu | — | 🔜 open P0 | --worktree CLI flag + Supervisor worktree_path record. Partly depends on Phase 3 (worktree_column). CLI flag can parallel Phase 3 waves. |
| unitAI-1san | — | ✅ CLOSED | Consistency check passed — no contradictions or dead code. Follow-ups: e90j/brbb/hpjg (P3). |

### Stream 3 — Node Persistence (another agent) + Stage 3 Core (post-convergence)
| Bead | Job | Status | Notes |
|------|-----|--------|-------|
| unitAI-z5ml | — | 🔜 blocked on hhs6 (Phase 3D) | Node SQLite tables: node_runs, node_members, node_events, node_memory, action_dispatch_log. Circular FK: coordinator_job_id nullable, 4-step bootstrap. |
| unitAI-69rw | — | 🔜 blocked on z5ml + 4qam | NodeSupervisor state machine: spawn/resume/pause/rotate members, member_id→job_id registry, member_health every turn |
| unitAI-iy5g | — | 🔜 blocked on 69rw | Coordinator JSON contract enforcement + 3-attempt repair loop |
| unitAI-w0cg | — | 🔜 blocked on 69rw + z5ml | Node feed isolation: sp node feed, node_id tagging in member jobs |
| unitAI-780u | — | 🔜 blocked on iy5g + z5ml | Shared memory patch validation + SQLite persistence (node_memory table) |
| unitAI-u9my | — | 🔜 blocked on 69rw | Beads-first reporting + sp node promote flow |
| unitAI-i6up | — | 🔜 blocked on 16ov✅ + e242 + 22tq | Research node v1A preset definitions |

**Dep chain**: hhs6 → z5ml → 69rw → {iy5g, w0cg, u9my} → {780u}

**Deps wired 2026-04-04**: z5ml→hhs6, 69rw→4qam, w0cg→z5ml, 780u→z5ml, i6up→e242, i6up→22tq

---

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

## Stream 2 Handoff: Phase 3 Planner (unitAI-3chh)

> **Prerequisite**: Phases 1, 1b, and 2 are all committed and green. Planner is unblocked.
> **Worktree rule**: Any executor with edit permission runs in its own worktree. Reviewer/test-runner must `cd` into that same worktree. Orchestrator merges in dependency order.

---

### What was completed (Phases 1 → 1b → 2)

#### Phase 1 — commit 200b0eb9
- `src/pi/session.ts`: `SessionMetricEvent` union + `SessionRunMetrics`. `onMetric` fires for 5 types: `token_usage`, `finish_reason`, `turn_summary`, `compaction`, `retry`
- `src/specialist/timeline-events.ts`: interfaces + factory functions for all 5 metric types + `stale_warning`
- `src/specialist/supervisor.ts`: `onMetric` wired as 4th runner param, `mergeRunMetrics()`, `metrics` in `status.json`, best-effort `sqliteClient`
- `src/specialist/runner.ts`: `onMetric` 4th param, output contract injection
- `src/specialist/observability-db.ts` (NEW): git-root DB path, `resolveObservabilityDbLocation()`, gitignore
- `src/specialist/observability-sqlite.ts` (NEW): best-effort SQLite via `execFileSync('sqlite3')`. Tables: `specialist_jobs`, `specialist_events`, `specialist_results`
- `src/cli/db.ts` (NEW): `specialists db setup` — TTY-gated, chmod 644

#### Phase 1b — commit 98df33a2
- `src/pi/session.ts`: `onToolEnd` now passes `result` content string. Emits distinct `auto_compaction_start` / `auto_compaction_end` strings (was same for both)
- `src/specialist/runner.ts`: forwards `result` through `onToolEndCallback`
- `src/specialist/supervisor.ts`: captures `result_summary` in tool context, persists on `tool_execution_end`
- `src/specialist/timeline-events.ts`: `result_summary?: string` on `TimelineEventTool` (phase:end); auto_compaction phase preserved; `char_count?: number` on `TimelineEventText` + `TimelineEventThinking`

#### Phase 2 — commit 84889edc
- `src/cli/format-helpers.ts`: cost_usd, turns, tool_calls formatting
- `src/cli/status.ts`: metrics human-readable display
- `src/cli/result.ts`: metrics in `--json` mode
- Specialist YAML fixes: output_type on 8 specialists, researcher `interactive`, xt-merge skill path

---

### Complete event map for planner — what flows through events.jsonl NOW

Every `appendTimelineEvent` call in `supervisor.ts` writes one of these to `events.jsonl`. Phase 3 must persist ALL of them to SQLite via dual-write.

| Event type | Key fields | Source |
|-----------|-----------|--------|
| `run_start` | specialist, bead_id | job init |
| `meta` | model, backend | first assistant message_start |
| `thinking` | char_count? | message construction |
| `text` | char_count? | streaming text delta |
| `tool` (start) | tool, tool_call_id, args, started_at | tool_execution_start |
| `tool` (update) | tool, tool_call_id | tool_execution_update |
| `tool` (end) | tool, tool_call_id, is_error, result_summary?, result_raw? | tool_execution_end |
| `message` (start/end) | role (assistant\|toolResult) | message_start/end |
| `turn` (start/end) | — | turn_start/end |
| `token_usage` | input/output/cache tokens, cost_usd, source | onMetric |
| `finish_reason` | finish_reason, source | onMetric |
| `turn_summary` | turn_index, token_usage?, finish_reason? | onMetric (turn_end) |
| `compaction` (start/end) | phase | auto_compaction_start/end |
| `retry` (start/end) | phase | auto_retry_start/end |
| `stale_warning` | reason, silence_ms, threshold_ms, tool? | stuck detector |
| `run_complete` | status, elapsed_s, model, backend, bead_id, output, token_usage, finish_reason, tool_calls[], metrics, gitnexus_summary? | job end |

**Intentionally NOT captured:**
- `agent_end` → replaced by `run_complete`
- `message_done` → not persisted by design
- `extension_error` → not yet wired (future bead)

**Pi RPC ground truth**: `pi/rpc/rpc-mode.ts` line 316 — `session.subscribe(event => output(event))` broadcasts ALL `AgentSessionEvent` objects verbatim. `session.ts` handles a curated subset; unknown types hit `default: return null`.

**g5np addition (commit c601a032)**: `tool` (end) now includes `result_raw` (full MCP tool result payload). `run_complete` includes `gitnexus_summary` (accumulated files_touched, symbols_analyzed, highest_risk, tool_invocations) when any gitnexus tool was used during the run.

---

### Phase 3 Schema — DENORMALIZED (revised 2026-04-04)

The original schema stored everything in `event_json TEXT` blobs — making 18+ event types unqueryable. **Revised: every field from every event type gets a real SQL column.** The blob stays for forward compat and full replay.

#### specialist_events (denormalized)

```sql
specialist_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id          TEXT NOT NULL,
  specialist      TEXT NOT NULL,
  bead_id         TEXT,
  t               INTEGER NOT NULL,
  type            TEXT NOT NULL,

  -- tool events (type='tool')
  tool_name       TEXT,
  tool_call_id    TEXT,
  tool_phase      TEXT,              -- start, update, end
  tool_args       TEXT,              -- JSON (start only)
  tool_started_at TEXT,              -- ISO (start only)
  is_error        INTEGER,           -- 0/1 (end only)
  result_summary  TEXT,              -- truncated text (end only)
  result_raw      TEXT,              -- full JSON payload (end only, from g5np)

  -- text/thinking events
  char_count      INTEGER,

  -- message events
  message_phase   TEXT,              -- start, end
  message_role    TEXT,              -- assistant, toolResult

  -- turn events
  turn_phase      TEXT,              -- start, end

  -- token_usage events
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  cache_read_tokens  INTEGER,
  cache_write_tokens INTEGER,
  cost_usd        REAL,
  token_source    TEXT,

  -- finish_reason events
  finish_reason   TEXT,
  finish_source   TEXT,

  -- turn_summary events
  turn_index      INTEGER,
  turn_tokens     TEXT,              -- JSON
  turn_finish     TEXT,

  -- compaction/retry events
  phase           TEXT,              -- start, end

  -- stale_warning events
  stale_reason    TEXT,
  silence_ms      INTEGER,
  threshold_ms    INTEGER,
  stale_tool      TEXT,

  -- run_complete events
  run_status      TEXT,              -- COMPLETE, ERROR, CANCELLED
  elapsed_s       REAL,
  run_model       TEXT,
  run_backend     TEXT,
  run_bead_id     TEXT,
  run_output      TEXT,
  run_token_usage TEXT,              -- JSON summary
  run_finish_reason TEXT,
  run_tool_calls  TEXT,              -- JSON array
  run_metrics     TEXT,              -- JSON full metrics
  run_error       TEXT,

  -- gitnexus summary (run_complete only, from g5np)
  gitnexus_files_touched    TEXT,    -- JSON array
  gitnexus_symbols_analyzed TEXT,    -- JSON array
  gitnexus_highest_risk     TEXT,    -- LOW/MEDIUM/HIGH/CRITICAL
  gitnexus_tool_invocations INTEGER,

  -- archive blob (always present)
  event_json      TEXT NOT NULL
);

CREATE INDEX idx_events_job_t    ON specialist_events(job_id, t, id);
CREATE INDEX idx_events_type     ON specialist_events(type);
CREATE INDEX idx_events_tool     ON specialist_events(tool_name) WHERE tool_name IS NOT NULL;
CREATE INDEX idx_events_bead     ON specialist_events(bead_id) WHERE bead_id IS NOT NULL;
```

#### specialist_jobs (enriched)

```sql
specialist_jobs (
  job_id              TEXT PRIMARY KEY,
  specialist          TEXT NOT NULL,
  worktree_column     TEXT,
  bead_id             TEXT,
  model               TEXT,
  backend             TEXT,
  status              TEXT NOT NULL,
  total_turns         INTEGER DEFAULT 0,
  total_tool_calls    INTEGER DEFAULT 0,
  total_cost_usd      REAL DEFAULT 0,
  input_tokens        INTEGER DEFAULT 0,
  output_tokens       INTEGER DEFAULT 0,
  exit_reason         TEXT,
  highest_gitnexus_risk TEXT,
  files_touched       TEXT,             -- JSON array
  started_at_ms       INTEGER,
  elapsed_s           REAL,
  node_id             TEXT,             -- nullable FK → node_runs.id
  status_json         TEXT NOT NULL,    -- full blob for backward compat
  updated_at_ms       INTEGER NOT NULL
);

CREATE INDEX idx_jobs_specialist ON specialist_jobs(specialist);
CREATE INDEX idx_jobs_bead       ON specialist_jobs(bead_id) WHERE bead_id IS NOT NULL;
CREATE INDEX idx_jobs_status     ON specialist_jobs(status);
CREATE INDEX idx_jobs_node       ON specialist_jobs(node_id) WHERE node_id IS NOT NULL;
```

#### specialist_results — unchanged

#### schema_version — bump to version=2

---

### Phase 3 Concurrency — SQLite in Parallel Worktrees (from overthinker unitAI-tjaz)

**Problem**: 5+ specialists running in parallel worktrees all write to one shared SQLite DB. WAL mode handles read/write concurrency but write/write collisions cause `SQLITE_BUSY`.

**Decision**: WAL + busy_timeout + bounded retry + no silent drops.

1. **Persistent in-process `bun:sqlite` connection** — not `execFileSync('sqlite3')` shell-out per statement
2. **`PRAGMA journal_mode=WAL`** — multiple readers + one writer, readers never blocked
3. **`PRAGMA busy_timeout=5000`** — SQLite handles brief lock waits internally
4. **Bounded app-level retry on `SQLITE_BUSY`**: 3-5 attempts, exponential backoff + jitter (25ms→50ms→100ms→200ms)
5. **NEVER silently swallow final write failures** — emit stderr, set degradation flag in status.json
6. **Keep transactions tiny** — one row per insert, no batching in Phase 3

**Failure mode accepted**: worst case is loss of ONE in-flight event on process crash (atomic rollback). No partial row corruption (SQLite guarantee).

**Not in Phase 3 scope**: write batching (later optimization), writer broker/daemon (never), append-log primary (conflicts with SQLite-as-primary).

---

### Worktree DB Path — `--git-common-dir` Fix (fqxo scope)

`resolveObservabilityDbLocation()` uses `git rev-parse --show-toplevel` which returns the **worktree root** in a worktree — each worktree gets its own isolated DB, fragmenting all data.

**Fix**: use `--git-common-dir` instead:
```
const gitCommonDir = execSync('git rev-parse --git-common-dir').toString().trim()
const root = path.resolve(gitCommonDir, '..')  // parent of .git = always main repo root
```

Must land in fqxo alongside WAL mode so all worktrees share one DB and concurrent access is safe.

---

### Starting prompt for next agent

```
Take issue unitAI-3chh — planner decomposition for 08zd Phase 3.

Phases 1, 1b, and 2 are all committed and green (commits 200b0eb9, 98df33a2, 84889edc).
The events.jsonl timeline is now complete. The full event map is in node-coordination.md
under "Complete event map for planner". Read it — that is exactly what Phase 3 must
persist to SQLite via dual-write alongside the existing events.jsonl writes.

Phase 3 is SQLite persistence ONLY — no new event types, no new callbacks.
The complete event surface is already wired. Phase 3 persists it durably.

Core scope:
1. observability-sqlite.ts: extend schema to include all Phase 1b fields
   (result_summary, char_count, auto_compaction phase distinction). Add schema_version table.
2. supervisor.ts: dual-write every appendTimelineEvent call to SQLite in addition
   to events.jsonl. File-based fallback stays — no breaking change.
3. WAL mode: PRAGMA journal_mode=WAL on DB open
4. observability-db.ts + observability-sqlite.ts: add worktree_column (nullable TEXT)
   to specialist_jobs table — needed for unitAI-hgpu worktree isolation feature
5. feed/status/result CLI: read from SQLite when DB exists, fall back to file paths

Your job is PLANNING ONLY — produce sub-task beads with:
- One bead per executor (scope ~200 lines max, fits in one session without crashing)
- EXPLICIT file ownership per bead — no two beads touch the same file
- Dependency order between beads (expressed as bd dep add)
- Each bead: title, description, files owned, prerequisite beads

Worktree rule (MANDATORY): each executor bead runs in its own git worktree branch.
Use `bd worktree create` — NOT `git worktree add` or `xt claude`. Only bd worktree
preserves beads context (claims, edit-gate, memory gate) inside the worktree session.
Reviewer/test-runner for that bead CDs into the same worktree — not main.
Orchestrator merges in dependency order, runs lint+tests after each merge.

Key context: bd show unitAI-3chh, bd show unitAI-08zd, bd show unitAI-hgpu
Key files to plan around:
  src/specialist/observability-sqlite.ts  ← schema + queries
  src/specialist/observability-db.ts      ← DB path resolution
  src/specialist/supervisor.ts            ← dual-write caller
  src/cli/feed.ts                         ← read path
  src/cli/status.ts                       ← read path
  src/cli/result.ts                       ← read path
  tests/unit/specialist/supervisor.test.ts ← NOTE: run alone, not batched
```

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

## Key Design Decisions (captured from session 2026-04-03)

### Context Window — Continuous Monitoring, Not Threshold Gating

**Revised design**: `member_health` must be injected into the coordinator resume prompt on **every turn**, even at 50% usage. The original 60/75/90% tiered approach was wrong — it only alerts after degradation has begun.

**Why**: "Context rot" — specialist reasoning quality degrades before the context window fills. Compressed/lost early context causes inconsistency, missed facts, and silent instruction drift. By the time a 75% warning fires, the specialist may already be reasoning poorly. Continuous telemetry gives the coordinator the data to make proactive rotation decisions.

**Corrected member_health injection**:
- Inject on **every** `specialists resume <coordinator-job-id>` call
- Include all members, not just those above a threshold
- Let the coordinator decide when to act — don't hide data from it

```
## Member Health (every turn)
| member_id   | turns | token_usage | context_pct | status  |
|-------------|-------|-------------|-------------|---------|
| explorer-1  | 4     | 31,200      | 15%         | OK      |
| executor-1  | 12    | 89,400      | 44%         | MONITOR |
| debugger-1  | 2     | 8,100       | 4%          | OK      |
```

Status labels:
- `OK` — < 40%
- `MONITOR` — 40–65% (show but no action required)
- `WARN` — 65–80% (coordinator should plan rotation)
- `CRITICAL` — > 80% (NodeSupervisor may force-pause)

**context_pct formula**: `(cumulative_input_tokens / model_context_window) * 100`

Approximate context windows:
| Model | Window |
|-------|--------|
| claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 | 200k |
| gemini-3.1-pro-preview | 1M |
| qwen3.5-plus, glm-5 | 128k |

**Source**: `status.json` → `metrics.token_usage`. Requires 08zd Phase 3 to be available per-job in SQLite; Phase 1b already captures token_usage in `run_complete` event.

---

### NodeSupervisor — member_id Registry is the Sole Translation Layer

Coordinator uses logical `member_id` references only (e.g. `explorer-1`). NodeSupervisor owns the `member_id → job_id` map. After spawning, NodeSupervisor resumes coordinator with a Member Registry Update. This pattern means the coordinator YAML never needs to change when the underlying job infrastructure changes.

---

### JSON Fence Problem — Belt-and-Suspenders Fix Required

`response_format: json` alone does not prevent models from wrapping output in ` ```json ``` ` fences. Fix requires both:
1. Explicit anti-fence instruction in system prompt: *"Emit raw JSON only. Never wrap in markdown fences."*
2. Runner-level post-process strip: trim leading ` ```json\n ` and trailing ` ``` ` before `JSON.parse`

The runner strip is a safety net for ALL `json`-format specialists, not just node-coordinator.

---

### gitnexus RPC Extraction — No Protocol Changes Needed

Pi RPC `tool_execution_end` already contains the full `event.result` for all MCP tools including gitnexus. The current `findToolResultContent()` in `session.ts` discards everything beyond 500 chars of text. Fix is extraction layer only:
1. Extend `onToolEnd` to pass raw result object alongside text summary
2. Add gitnexus-specific accumulator in `supervisor.ts` (collects `files_touched`, `symbols_analyzed`, `highest_risk` across a run)
3. Add `result_raw?: Record<string, unknown>` to `TimelineEventTool`
4. Emit accumulated `gitnexus_summary` in `run_complete`

Tracked in unitAI-g5np. Prerequisite for blast radius propagation (impact_report in 16ov spec).

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
