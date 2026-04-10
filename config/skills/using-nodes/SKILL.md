---
name: using-nodes
description: >
  Use this skill for node-coordinator behavior. The coordinator is a READ_ONLY
  JSON emitter that declares phases/actions while NodeSupervisor executes side effects.
version: 2.0
---

# Using Nodes

## Purpose

This skill is the coordinator playbook for `NodeSupervisor` runs.

The coordinator is **declarative only**:
- emit one strict JSON object matching the node contract,
- declare intent (`phases`, `memory_patch`, `actions`),
- never execute side effects directly.

NodeSupervisor owns all side effects (spawn jobs, steer/resume, create beads, completion flow, PR/create/stop behavior).

---

## Hard constraints

1. **READ_ONLY coordinator**
   - No tool calls.
   - No shell, git, bd, file edits, or direct CLI orchestration.
   - Output is JSON intent only.

2. **Single JSON object only**
   - No markdown fences.
   - No prose before/after JSON.

3. **No nested nodes**
   - Do not route work to `node-coordinator` as a member role.
   - Do not emit node-config paths in member bead fields.

4. **Use only supported action vocabulary**
   - `spawn_member` is declared via `phases[].members[]` entries.
   - `actions[]` supports `create_bead` and `complete_node`.

---

## Decision model

### 1) Plan phases first

Always build explicit `phases[]` in execution order.

Use `phase_kind` to communicate intent:
- `explore` → gather evidence
- `design` → evaluate options and constraints
- `impl` → perform code edits
- `review` → validate quality/correctness
- `fix` → apply review corrections
- `re_review` → verify fixes
- `custom` → explicit custom stage

Barrier is currently fixed:
- `barrier: "all_members_terminal"`

Interpretation: all members in a phase should reach terminal/idle completion before next phase intent should advance.

### 2) Choose parallel vs sequential

Use this heuristic:

- **Parallel within phase** when scopes are disjoint and mutating paths do not overlap.
- **Sequential via dependencies/phases** when:
  - one member output is required by another,
  - paths overlap,
  - lock/contention risk is high,
  - correctness order matters.

If mutating scopes overlap, split into separate phases or separate dependent members.

### 3) Declare member spawns in `phases[].members[]`

Each member declaration is a spawn intent envelope:
- stable `member_key`
- `role` (specialist name)
- `bead_id` target
- `scope.paths[]` and `scope.mutates`
- `failure_policy`
- `depends_on[]` for per-phase sequencing
- reserved forward-compat fields: `isolated`, `retry_of`

### 4) Memory discipline

Emit compact, useful `memory_patch[]` entries only when they add reusable signal:
- `entry_type`: fact | question | decision
- `summary`: concise and actionable
- `source_member_id`: required provenance
- `confidence`: 0..1
- optional `entry_id` for idempotent/dedup updates

### 5) Action discipline

Use `actions[]` only for node lifecycle intent:

- **`create_bead`**
  - use when new tracked follow-up work is discovered,
  - include title/description/type/priority,
  - add dependency linkage when needed.

- **`complete_node`**
  - emit when node objective is complete or terminally blocked,
  - include `gate_results` and `report_payload_ref`,
  - if gates fail but delivery must proceed as draft, set `force_draft_pr: true`.

`node_status: "complete"` must pair with a `complete_node` action.

---

## Context-depth chaining and inheritance

Node execution context depth resolution:
1. member declaration override (`context_depth`) when provided,
2. node default (`defaultContextDepth`),
3. runtime fallback (`2`) if not otherwise set.

Use higher context depth when member work depends heavily on completed blockers; keep it lower for focused tasks to reduce context pressure.

---

## Worktree behavior and inheritance

NodeSupervisor controls worktrees.

Coordinator responsibilities:
- choose clean member boundaries (`scope.paths`),
- declare parent/repair lineage clearly,
- avoid overlapping mutating scopes.

Runtime supports inherited worktree intent for replacement/fix loops (`worktree_from` / `worktree`) where provided by schema/runtime.

Do not assume direct filesystem control from coordinator output.

---

## Fix loops and retries

When review/fix cycles are required:

1. model `review` → `fix` → `re_review` phase progression,
2. keep replacement lineage explicit (`retry_of` / parent linkage when needed),
3. keep retries bounded (`max_retries` exists at node config/runtime level),
4. stop cycling when convergence fails; emit a terminal `complete_node` (blocked/aborted intent).

Prefer short corrective loops with explicit failure reasons in memory.

---

## Member bootstrap behavior (intentional change)

Members now start in **idle-wait bootstrap mode**.

Expected behavior:
- acknowledge readiness,
- do not begin substantive investigation/work until explicit coordinator resume/steer intent arrives.

This is intentional and replaces earlier eager member startup behavior.

---

## Backward compatibility guarantees

- Existing coordinator payload fields remain additive-compatible where possible.
- New behavior is introduced via additive schema/runtime fields (e.g. phase/member metadata, lifecycle extensions) rather than destructive removals.
- Reserved fields (`isolated`, `retry_of`) are schema-level forward-compat hooks and must not be treated as guaranteed execution semantics beyond current runtime support.

---

## Output template (shape)

```json
{
  "summary": "...",
  "node_status": "in_progress",
  "phases": [
    {
      "phase_id": "explore-1",
      "phase_kind": "explore",
      "barrier": "all_members_terminal",
      "members": [
        {
          "member_key": "explorer-1",
          "role": "explorer",
          "bead_id": "unitAI-123",
          "scope": { "paths": ["src/cli"], "mutates": false },
          "depends_on": [],
          "failure_policy": "blocking",
          "isolated": false,
          "retry_of": null
        }
      ]
    }
  ],
  "memory_patch": [],
  "actions": [],
  "validation": {
    "ok": true,
    "issues": [],
    "notes": ""
  }
}
```

---

## Generated node contract reference

<!-- node-contract:generated:start -->
## Generated node contract reference

### Phase kinds
- `explore`: Discovery and evidence gathering.
- `design`: Design options and decision framing.
- `impl`: Code/config implementation and edits.
- `review`: Structured quality or correctness review.
- `fix`: Apply corrections for review findings.
- `re_review`: Verification pass after fixes.
- `custom`: Project-specific phase with explicit intent.

### Actions
- `create_bead`
  - `type`: Literal action discriminator.
  - `title`: Bead title for created work item.
  - `description`: Detailed bead description.
  - `bead_type`: One of task|bug|feature|epic|chore|decision.
  - `priority`: Integer priority 0..4.
  - `parent_bead_id`: Optional parent bead link.
  - `depends_on`: Optional dependency bead ids.
- `complete_node`
  - `type`: Literal action discriminator.
  - `gate_results`: Quality gate statuses to attach to completion report.
  - `report_payload_ref`: Reference to external report payload.
  - `force_draft_pr`: Allow completion while gates fail by forcing draft PR intent.

### Completion strategies
- `pr`
- `manual`

### State machine
```json
{
  "states": [
    "created",
    "starting",
    "running",
    "waiting",
    "degraded",
    "awaiting_merge",
    "fixing_after_review",
    "failed",
    "error",
    "done",
    "stopped"
  ],
  "transitions": {
    "created": [
      "starting",
      "stopped"
    ],
    "starting": [
      "running",
      "error",
      "stopped"
    ],
    "running": [
      "waiting",
      "degraded",
      "awaiting_merge",
      "done",
      "error",
      "stopped",
      "failed"
    ],
    "waiting": [
      "running",
      "degraded",
      "awaiting_merge",
      "done",
      "error",
      "stopped",
      "failed"
    ],
    "degraded": [
      "running",
      "fixing_after_review",
      "failed",
      "error",
      "stopped"
    ],
    "awaiting_merge": [
      "done",
      "fixing_after_review",
      "failed",
      "error",
      "stopped"
    ],
    "fixing_after_review": [
      "awaiting_merge",
      "running",
      "failed",
      "error",
      "stopped"
    ],
    "failed": [],
    "error": [],
    "done": [],
    "stopped": []
  }
}
```
<!-- node-contract:generated:end -->