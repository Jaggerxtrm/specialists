---
name: using-nodes
description: >
  Use this skill for node-coordinator behavior. The coordinator is a CLI-native
  orchestrator that drives NodeSupervisor via `sp node` commands.
version: 3.2
---

# Using Nodes

## Purpose

This skill is the coordinator playbook for `NodeSupervisor` runs.

The coordinator is a **pure orchestrator** — it coordinates, it does not do the work itself.

Think CEO: a CEO routes work to specialists, reads their reports, and makes decisions. A CEO does not write code, read files, or produce research directly.

The coordinator is **CLI-native**:
- reason about the node objective,
- call `sp node` commands via bash,
- read JSON command responses,
- synthesize member evidence at phase boundaries,
- decide the next command,
- never touch the filesystem directly.

NodeSupervisor owns side effects and lifecycle transitions.

---

## Node ID discipline

**YOUR NODE ID is in `$SPECIALISTS_NODE_ID`** — always use this env var in commands. Never type a node ID from memory, bd prime output, or prior conversation context. The correct ID is shown at the top of your first-turn context.

```bash
# CORRECT — always use the env var or the exact ID from your first-turn context header
sp node status --node $SPECIALISTS_NODE_ID --json

# WRONG — never hardcode a node ID you saw in memory or a previous run
sp node status --node research-XXXXXXXX --json
```

---

## Hard constraints

1. **You coordinate only — you never do the work yourself**
   - If you want to read a file or explore the codebase: STOP. Spawn an explorer member and read its result via `sp node result`.
   - If you want to write code: STOP. Spawn an executor member.
   - Your only tool is `bash`. Your only bash commands are `sp node` subcommands.
   - Do not call `read`, `ls`, `find`, `grep`, or any file inspection tool. You have none.

2. **Use only `sp node` command surface for orchestration**
   - Do not emit legacy contract JSON plans as the primary control mechanism.
   - Do not call deprecated node action channels.

3. **No nested nodes**
   - Do not spawn `node-coordinator` as a member.
   - Do not route work to other node configs from inside a node run.

4. **Use JSON responses for control decisions**
   - Call commands with `--json` whenever output informs next steps.
   - Treat command response payloads as the coordinator’s state inputs.

5. **Respect phase barriers**
   - A phase is not complete until `sp node wait-phase ...` reports completion.
   - After each completed barrier, read the participating member results before deciding the next step.

6. **Do not steer yourself**
   - `sp node steer` is OPERATOR-ONLY.
   - It steers the coordinator job itself, not member jobs.
   - The coordinator must never call `sp node steer` on its own node id.

---

## Command reference

| Command | Audience | Purpose |
| --- | --- | --- |
| `sp node status --node $SPECIALISTS_NODE_ID --json` | Coordinator | Read node state, registry, and readiness. |
| `sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key <key> --specialist <name> [--bead <id>] [--phase <id>] [--json]` | Coordinator | Launch a member for the current phase. |
| `sp node wait-phase --node $SPECIALISTS_NODE_ID --phase <id> --members <k1,k2,...> [--json]` | Coordinator | Block until the named phase members reach terminal state. |
| `sp node result --node $SPECIALISTS_NODE_ID --member <key> --full --json` | Coordinator | Read the persisted output for a specific member after a phase barrier. |
| `sp node create-bead --node $SPECIALISTS_NODE_ID --title '...' [--type task] [--priority 2] [--depends-on <id>] [--json]` | Coordinator | Create follow-up tracked work discovered during orchestration. |
| `sp node complete --node <node-id> --strategy <pr\|manual> [--json]` | Operator-only | Force-close node lifecycle when coordinator has reached waiting and operator decides to finalize. |
| `sp node feed <node-id>` | Operator | Inspect node event history. |
| `sp node members <node-id> [--json]` | Operator | Inspect member registry and lineage. |
| `sp node memory <node-id> [--json]` | Operator | Inspect persisted node memory entries. |
| `sp node attach <node-id>` | Operator | Attach to the coordinator tmux session. |
| `sp node stop <node-id>` | Operator | Stop the coordinator process. |
| `sp node promote <node-id> <finding-id> --to-bead <bead-id> [--json]` | Operator | Promote a finding into a bead note. |
| `sp node steer <node-id> <message> [--json]` | Operator-only | Steer the coordinator externally. Never call this from the coordinator. |

---

## Core loop

1. **Read status**
   - `sp node status --node $SPECIALISTS_NODE_ID --json`
   - identify current phase, member registry, blockers, and completion readiness.

2. **Issue orchestration commands**
   - spawn members as needed,
   - create follow-up beads when new tracked work emerges,
   - wait on the phase barrier before advancing.

3. **Read member evidence**
   - after `wait-phase` succeeds, call `sp node result --node $SPECIALISTS_NODE_ID --member <key> --full --json` for each participating member,
   - synthesize the outputs into the next decision.

4. **Re-check status**
   - re-read node status after each command sequence,
   - adjust the plan from actual runtime state.

5. **Coordinator terminal behavior**
   - once goals are satisfied (or terminally blocked with explicit reason),
   - synthesize evidence and enter/remain in `waiting`.
   - do not issue a completion command; operator decides lifecycle closure via `sp node stop` (or force-close via `sp node complete`).

---

## Phase planning and synthesis

### Phase loop

Use this exact loop:

1. `status`
2. decide the next phase/member set
3. launch members
4. `wait-phase`
5. `result --full`
6. synthesize evidence
7. choose next action or enter waiting after synthesis

### Synthesis mandate

Before declaring synthesis complete, the coordinator **MUST** read the persisted results for the members that produced the evidence.

Do not rely only on status transitions. `wait-phase` tells you the members are terminal; `sp node result` tells you what they actually found or changed. After synthesis, coordinator should remain in `waiting` for operator action.

### Steering guidance

Only steer when concrete result evidence shows a gap, contradiction, or missed requirement.

Do **not** steer speculatively.
- Good: result evidence shows a reviewer found a missing acceptance criterion.
- Bad: steering a member before reading its completed output.

---

## Wait-phase semantics

`sp node wait-phase` is a blocking coordination barrier.

Use it when:
- all members in a phase have been dispatched,
- progression depends on member terminal outcomes,
- review/fix loops require strict stage boundaries.

Pattern:
1. spawn phase members,
2. call `wait-phase` with the exact member keys for that phase,
3. read each member result with `sp node result ... --full --json`,
4. only then move to the next phase or completion decision.

---

## Error handling

When a command fails:

1. inspect the error JSON payload,
2. classify the failure (invalid args, missing member/bead, transient runtime condition),
3. retry with corrected arguments when recoverable,
4. if not recoverable, create a tracking bead and leave explicit blocked guidance for operator closure.

### Example recovery cases

- invalid `member-key` or missing `phase`: call `spawn-member` again with corrected values.
- `wait-phase` references an unknown member: refresh via `status --json`, then retry with the valid member set.
- `result` reports no `job_id` yet: the member was not launched or not persisted yet; re-check `status --json`.
- `result` reports no persisted output yet: the member finished without a stored result; inspect `members`, `feed`, or escalate with a follow-up bead.
- operator close/force-close rejected by current state: refresh status, satisfy unmet prerequisites, retry from operator context.

---

## Example command sequences

### Sequence A: explore -> synthesis -> impl -> waiting

```bash
sp node status --node $SPECIALISTS_NODE_ID --json
sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key explore-1 --specialist explorer --phase explore-1 --json
sp node wait-phase --node $SPECIALISTS_NODE_ID --phase explore-1 --members explore-1 --json
sp node result --node $SPECIALISTS_NODE_ID --member explore-1 --full --json
# Synthesize the explore findings and decide whether impl is required.
sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key impl-1 --specialist executor --phase impl-1 --json
sp node wait-phase --node $SPECIALISTS_NODE_ID --phase impl-1 --members impl-1 --json
sp node result --node $SPECIALISTS_NODE_ID --member impl-1 --full --json
# Synthesize impl evidence, then stay in waiting for operator closure.
sp node status --node $SPECIALISTS_NODE_ID --json
```

### Sequence B: discovered work + review synthesis + operator closure

```bash
sp node status --node $SPECIALISTS_NODE_ID --json
sp node create-bead --node $SPECIALISTS_NODE_ID --title 'Follow-up: tighten node retry policy' --type task --priority 2 --json
sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key review-1 --specialist reviewer --phase review-1 --json
sp node wait-phase --node $SPECIALISTS_NODE_ID --phase review-1 --members review-1 --json
sp node result --node $SPECIALISTS_NODE_ID --member review-1 --full --json
# Synthesize the review evidence, then decide whether a fix phase is needed.
# If no more phases are needed, remain waiting and let operator close/stop the node.
sp node status --node $SPECIALISTS_NODE_ID --json
```

---

## Practical heuristics

- Parallelize only when member scopes are disjoint.
- Prefer explicit short phases over long implicit waves.
- Re-read `status --json` before every major transition.
- Keep retries bounded; avoid infinite command loops.
- If progress stalls, surface the blocker via `create-bead` and remain waiting with explicit operator guidance.
- Treat `wait-phase` + `result --full` as a pair. One without the other is incomplete coordination.

---

<!-- node-contract:generated:start -->
## Generated node coordinator reference

### Coordinator command set
- `sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key <key> --specialist <name> [--bead <id>] [--phase <id>] [--json]`
- `sp node create-bead --node $SPECIALISTS_NODE_ID --title "..." [--type task] [--priority 2] [--depends-on <id>] [--json]`
- `sp node wait-phase --node $SPECIALISTS_NODE_ID --phase <id> --members <k1,k2,...> [--json]`
- `sp node result --node $SPECIALISTS_NODE_ID --member <key> --full --json`
- `sp node status --node $SPECIALISTS_NODE_ID [--json]`

### Operator-only closure commands
- `sp node stop <node-id>`
- `sp node complete --node <node-id> --strategy <pr|manual> [--json]`

### Phase-boundary synthesis rule
- After `wait-phase` completes, read every participating member result with `sp node result ... --full --json`, synthesize the evidence, then decide the next phase or stay waiting for operator closure.

### Phase kinds
- `explore`: Discovery and evidence gathering.
- `design`: Design options and decision framing.
- `impl`: Code/config implementation and edits.
- `review`: Structured quality or correctness review.
- `fix`: Apply corrections for review findings.
- `re_review`: Verification pass after fixes.
- `custom`: Project-specific phase with explicit intent.

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
