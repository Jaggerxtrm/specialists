# Nodes: coordinator contract, runtime architecture, and operator flow

## Doc contract

- **Source of truth:**
  - `src/specialist/node-contract.ts`
  - `src/specialist/node-supervisor.ts`
  - `src/specialist/job-control.ts`
  - `src/cli/node.ts`
  - `src/specialist/observability-sqlite.ts`
- **Drift rule:** update this doc in the same change whenever node contract, lifecycle, or `sp node` CLI behavior changes.

---

## 1) Architecture (redesigned runtime)

Node execution follows a strict split:

- **Coordinator specialist**: READ_ONLY JSON planner.
- **NodeSupervisor**: effect executor (spawn/control/complete/persist).
- **Members**: worker specialists started and managed by NodeSupervisor.

Coordinator never performs direct side effects. It emits typed intent (`phases`, `memory_patch`, `actions`) and NodeSupervisor executes that intent.

### Why this split exists

- deterministic control plane,
- explicit contract validation,
- resumable state machine,
- auditable event timeline in SQLite,
- safer multi-member orchestration than free-form coordinator control.

---

## 2) Coordinator action model

Canonical schema lives in `node-contract.ts`.

### Top-level output

Coordinator must emit one JSON object containing:
- `summary`
- `node_status` (`in_progress | complete | blocked | aborted`)
- `phases[]`
- `memory_patch[]`
- `actions[]`
- `validation`

### Phase/member declarations (`spawn_member` intent)

`spawn_member` is represented by `phases[].members[]` entries, not by direct side-effect commands.

Each member declaration includes:
- `member_key`
- `role` (specialist)
- `bead_id`
- `scope.paths[]` + `scope.mutates`
- `depends_on[]`
- `failure_policy`
- schema-reserved fields: `isolated`, `retry_of`

### Action vocabulary

`actions[]` supports:

- `create_bead`
- `complete_node`

No direct `resume/steer/stop` action is accepted in coordinator payload; these are internal NodeSupervisor dispatch concerns.

---

## 3) Lifecycle and state machine

Node states:
- `created`
- `starting`
- `running`
- `waiting`
- `degraded`
- `awaiting_merge`
- `fixing_after_review`
- `failed`
- `error`
- `done`
- `stopped`

Terminal set for runtime loop handling includes:
- `error`, `done`, `stopped`, `failed`, `awaiting_merge`

`awaiting_merge` is terminal from NodeSupervisor perspective when completion strategy is PR-based and publication is pending outside the node run.

---

## 4) Completion behavior

Completion behavior is driven by `complete_node` action + runtime completion strategy.

### Strategies

- `pr` (default):
  - NodeSupervisor performs completion flow,
  - can create PR metadata,
  - transitions to `awaiting_merge` on successful completion intent.

- `manual`:
  - no PR requirement,
  - transitions to `done` when gates pass.

### Gate behavior

- failing gates with `force_draft_pr=false` cause rejection/failure behavior,
- failing gates with `force_draft_pr=true` allow draft PR completion intent,
- quality gates are executed by NodeSupervisor, not coordinator.

---

## 5) Intentional behavior change: member idle-wait bootstrap

Members now start with an idle bootstrap prompt:
- acknowledge readiness,
- wait for explicit coordinator resume/steer instructions,
- do not begin substantive work immediately.

This replaces earlier eager startup behavior and is intentional to prevent uncontrolled member rampage before coordinator routing.

---

## 6) Context-depth chaining

Node run context depth precedence:
1. member-level override (`context_depth` in raw phase member payload when present),
2. node default (`defaultContextDepth` in node config),
3. runtime fallback (`2`).

CLI `sp node run --context-depth <n>` sets run-level context depth that feeds coordinator/member options unless overridden downstream by member-level declaration.

---

## 7) Worktree inheritance and fix loops

NodeSupervisor supports worktree-aware spawning and replacement metadata.

Coordinator guidance:
- keep mutating scopes disjoint for safe parallelism,
- use explicit phase ordering for overlapping mutating work,
- model fix loops via `review -> fix -> re_review`,
- use retry lineage fields (`retry_of`, parent metadata) for replacements.

Worktree inheritance intent can be supplied through member metadata (`worktree_from`/`worktree` in runtime payload handling). Coordinator declares intent; NodeSupervisor resolves execution details.

---

## 8) Observability and events

Node state is persisted in SQLite tables:
- `node_runs`
- `node_members`
- `node_events`
- `node_memory`

### Event taxonomy

Canonical dispatch event is `action_written` (legacy `action_dispatched` is removed).

Key event families:
- node lifecycle (`node_created`, `node_started`, `node_state_changed`, ...)
- member lifecycle (`member_started`, `member_state_changed`, `member_spawned_dynamic`, `member_replaced`, ...)
- coordinator lifecycle (`coordinator_resumed`, `coordinator_output_received`, `coordinator_output_invalid`, ...)
- memory lifecycle (`memory_updated`, `memory_patch_rejected`, `memory_patch_deduplicated`)
- action lifecycle (`action_queued`, `action_written`, `action_observed`, `action_completed`, `action_failed`, `action_dropped`)
- completion lifecycle (`pr_created`, `node_completed`)

### CLI inspection paths

- `sp node status [--node <id>] [--json]`
- `sp node feed <id> [--json]`
- `sp node members <id> [--json]`
- `sp node memory <id> [--json]`

`members`/`status` JSON includes generation and lineage (`reused_from_job_id`, `worktree_owner_job_id`) where available.

---

## 9) `sp node` command surface (current)

- `sp node run <config-or-name> [--inline JSON] [--bead <id>] [--context-depth <n>] [--json]`
- `sp node list [--json]`
- `sp node status [--node <id>] [--json]`
- `sp node feed <node-id> [--json]`
- `sp node members <node-id> [--json]`
- `sp node memory <node-id> [--json]`
- `sp node steer <node-id> <message> [--json]`
- `sp node stop <node-id> [--json]`
- `sp node attach <node-id>`
- `sp node promote <node-id> <finding-id> --to-bead <bead-id> [--json]`

---

## 10) Backward compatibility and additive changes

### Backward-compatible additions

- expanded node schema fields (phases/member metadata, completion metadata, lineage metadata) are additive,
- event stream expanded with new lifecycle events while keeping JSON-first payload model,
- CLI expanded with non-breaking new `sp node` subcommands.

### Intentional behavior changes

- member bootstrap switched to idle-wait mode,
- completion flow now models `awaiting_merge` and explicit completion strategy,
- coordinator contract now centers on `create_bead` / `complete_node` + phase member declarations instead of direct control actions.

---

## 11) Practical coordinator heuristics

- Parallelize only disjoint mutating scopes.
- Serialize dependent or overlapping edits.
- Prefer short, explicit phases over implicit long-running waves.
- Emit memory entries only when they change downstream decisions.
- Emit `complete_node` only when completion evidence + gate intent are explicit.
