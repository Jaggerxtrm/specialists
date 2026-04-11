# Nodes: CLI-native coordinator, runtime architecture, and operator flow

## Doc contract

- **Source of truth:**
  - `src/specialist/node-contract.ts`
  - `src/specialist/node-supervisor.ts`
  - `src/specialist/job-control.ts`
  - `src/cli/node.ts`
  - `src/specialist/observability-sqlite.ts`
- **Drift rule:** update this doc in the same change whenever node contract, lifecycle, or `sp node` CLI behavior changes.

---

## 1) Architecture

Node execution is split into three roles:

- **Coordinator specialist (LOW permission):** CLI-native orchestrator.
- **NodeSupervisor:** effect executor and lifecycle authority.
- **Members:** worker specialists managed by NodeSupervisor.

Coordinator decides *what to do next* and does so by calling `sp node` commands. NodeSupervisor executes, persists state, and enforces lifecycle semantics.

---

## 2) Coordinator behavior (CLI-native)

The coordinator no longer emits a JSON orchestration schema as its control output.

Instead it:
1. Calls `sp node ... --json` commands,
2. Reads structured responses,
3. Issues follow-up commands,
4. Uses `wait-phase` as the phase barrier,
5. Calls `complete` when node goals are satisfied.

### Required command set

- `sp node spawn-member --node $NODE_ID --member-key <key> --specialist <name> [--bead <id>] [--phase <id>] [--json]`
- `sp node create-bead --node $NODE_ID --title '...' [--type task] [--priority 2] [--depends-on <id>] [--json]`
- `sp node complete --node $NODE_ID --strategy <pr|manual> [--json]`
- `sp node wait-phase --node $NODE_ID --phase <id> --members <k1,k2,...> [--json]`
- `sp ps` (or `sp ps --node <id>` when available) for node snapshot/status
- `sp feed --node <id> [--json]` for node event stream
- `sp steer <coordinator-job-id> "..."` for coordinator steering
- `sp attach <coordinator-job-id>` for coordinator attach
- `sp result --node <id> --member <key>` for member result retrieval

---

## 3) CLI command reference

| Command | Purpose | Typical usage |
|---|---|---|
| `sp ps` | Read node snapshot and job health | Before and after every orchestration step |
| `sp node spawn-member` | Start a member for a phase/task | Launch explore/impl/review workers |
| `sp node wait-phase` | Enforce phase barrier for declared members | Block transition until phase members finish |
| `sp node create-bead` | Create tracked follow-up work | Persist discovered blockers/tasks |
| `sp node complete` | Finalize node run with strategy | End run via `pr` or `manual` completion |

---

## 4) Wait-phase semantics

`sp node wait-phase` is the canonical phase barrier.

- Coordinator must provide the phase id and explicit member key set.
- Progression to the next phase is blocked until wait-phase reports completion.
- This applies equally to review/fix/re-review loops.

Recommended pattern:
1. spawn all members for phase N,
2. call `wait-phase` for phase N,
3. read `sp ps --node <id> --json`,
4. decide next phase (or completion).

---

## 5) Error handling model

Coordinator handles command errors by reading error JSON and adapting.

Recovery loop:
1. run command with `--json`,
2. inspect error payload,
3. correct arguments or sequencing,
4. retry boundedly,
5. if unrecoverable, track via `create-bead` and choose explicit completion strategy.

Examples:
- unknown member in `wait-phase` -> refresh via `status`, retry with valid members.
- invalid spawn args -> correct `member-key` / `phase` / `specialist`, retry.
- completion rejected by state -> satisfy unmet prerequisites, then retry `complete`.

---

## 6) Lifecycle and state machine

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

`awaiting_merge` is terminal for the node runtime loop under PR-based completion.

---

## 7) Completion behavior

`sp node complete --strategy <pr|manual>` decides publication semantics:

- `pr`: run ends in `awaiting_merge` when completion intent succeeds.
- `manual`: run ends in `done` when completion checks pass.

Coordinator should call `complete` only after phase barriers and status checks indicate readiness.

---

## 7.5) `completion_strategy` in node configs

The `completion_strategy` field in `.node.json` configs controls how NodeSupervisor handles coordinator completion:

```json
{
  "completion_strategy": "manual"  // or "pr" (default)
}
```

### Values

| Strategy | Behavior | Use case |
|---|---|---|
| `pr` (default) | When coordinator job reaches `done` with valid output, node auto-closes to `done` state. | Implementation nodes — auto-publish work via PR |
| `manual` | When coordinator job reaches `done` with valid output, node transitions to `waiting`. Operator must close via `sp node stop`. | Research/interactive nodes — operator reviews findings before closure |

### Key behavior

When the coordinator completes synthesis and its job status becomes `done`:

1. NodeSupervisor checks `completion_strategy` from node config.
2. If `manual`: node enters `waiting` state (coordinator_done_manual_completion transition).
3. If `pr`: node enters `done` state directly (coordinator_done transition).

This allows research nodes to persist in `waiting` after coordinator synthesis, giving the operator time to review findings, steer for more work, or close explicitly.

### Example configs

```json
// config/nodes/research.node.json (interactive research)
{
  "completion_strategy": "manual",
  "members": [...]
}

// Implementation nodes (auto-publish via PR)
{
  "completion_strategy": "pr",
  "members": [...]
}
```

---

## 8) Member bootstrap behavior

Members start in idle-wait bootstrap mode:
- acknowledge readiness,
- wait for coordinator steering,
- avoid eager autonomous execution before routing.

This is intentional and remains part of runtime safety behavior.

---

## 9) Observability and inspection

Persisted SQLite surfaces:
- `node_runs`
- `node_members`
- `node_events`
- `node_memory`

Useful CLI inspection commands:
- `sp ps` (or `sp ps --node <id>` when available)
- `sp feed --node <id> [--json]`
- `sp steer <coordinator-job-id> "..."`
- `sp attach <coordinator-job-id>`
- `sp result --node <id> --member <key>`
- `sp node members <id> [--json]`
- `sp node memory <id> [--json]`

Canonical dispatch event remains `action_written`.

---

## 10) Current `sp node` surface

- `sp node run <config-or-name> [--inline JSON] [--bead <id>] [--context-depth <n>] [--json]`
- `sp node list [--json]`
- `sp node members <node-id> [--json]`
- `sp node memory <node-id> [--json]`
- `sp node stop <node-id> [--json]`
- `sp node promote <node-id> <finding-id> --to-bead <bead-id> [--json]`

Related top-level commands for node operations:
- `sp ps` / `sp ps --node <id>`
- `sp feed --node <id> [--json]`
- `sp steer <coordinator-job-id> <message>`
- `sp attach <coordinator-job-id>`
- `sp result --node <id> --member <key>`

---

## 11) Practical coordinator heuristics

- Re-check `sp ps --node <id> --json` before every phase transition.
- Use `wait-phase` as mandatory barrier, not advisory.
- Parallelize only disjoint mutating scopes.
- Keep retries bounded and explicit.
- Prefer explicit follow-up beads over silent failure when blocked.
