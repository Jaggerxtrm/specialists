---
name: using-nodes
description: >
  Use this skill for node-coordinator behavior. The coordinator is a CLI-native
  orchestrator that drives NodeSupervisor via `sp node` commands.
version: 3.1
---

# Using Nodes

## Purpose

This skill is the coordinator playbook for `NodeSupervisor` runs.

The coordinator is **CLI-native**:
- reason about the node objective,
- call `sp node` commands,
- read JSON command responses,
- synthesize member evidence at phase boundaries,
- decide the next command,
- avoid direct file edits and direct member internals.

NodeSupervisor owns side effects and lifecycle transitions.

---

## Hard constraints

1. **Use only `sp node` command surface for orchestration**
   - Do not emit legacy contract JSON plans as the primary control mechanism.
   - Do not call deprecated node action channels.

2. **No nested nodes**
   - Do not spawn `node-coordinator` as a member.
   - Do not route work to other node configs from inside a node run.

3. **Use JSON responses for control decisions**
   - Call commands with `--json` whenever output informs next steps.
   - Treat command response payloads as the coordinator’s state inputs.

4. **Respect phase barriers**
   - A phase is not complete until `sp node wait-phase ...` reports completion.
   - After each completed barrier, read the participating member results before deciding the next step.

5. **Do not steer yourself**
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
| `sp node complete --node $SPECIALISTS_NODE_ID --strategy <pr\|manual> [--json]` | Coordinator | Finish the node once evidence, gates, and follow-ups are handled. |
| `sp node feed <node-id>` | Operator | Inspect node event history. |
| `sp node members <node-id> [--json]` | Operator | Inspect member registry and lineage. |
| `sp node memory <node-id> [--json]` | Operator | Inspect persisted node memory entries. |
| `sp node attach <node-id>` | Operator | Attach to the coordinator tmux session. |
| `sp node stop <node-id>` | Operator | Stop the coordinator process. |
| `sp node promote <node-id> <finding-id> --to-bead <bead-id> [--json]` | Operator | Promote a finding into a bead note. |
| `sp node steer <node-id> <message> [--json]` | Operator-only | Steer the coordinator externally. Never call this from the coordinator. |
| `sp steer <job_id> "message"` | Coordinator | Redirect a **running** member mid-execution. `job_id` is in the resume payload member registry. |
| `sp resume <job_id> "message"` | Coordinator | Send the next task to a **waiting** (keep-alive) member. `job_id` is in the resume payload member registry. |

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

5. **Complete node**
   - once goals and gates are satisfied (or terminally blocked with explicit reason),
   - call `sp node complete --node $SPECIALISTS_NODE_ID --strategy <pr|manual> --json`.

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
7. choose next action or `complete`

### Synthesis mandate

Before `sp node complete`, the coordinator **MUST** read the persisted results for the members that produced the evidence the completion decision depends on.

Do not complete based only on status transitions. `wait-phase` tells you the members are terminal; `sp node result` tells you what they actually found or changed.

### Steering guidance

After `wait-phase`, read member results. If a result reveals a gap, contradiction, or missed scope — act on it before completing or advancing.

**Redirect a running member:**
```bash
sp steer <job_id> "focus only on the retry logic in supervisor.ts, ignore the rest"
```

**Send the next task to a waiting member:**
```bash
sp resume <job_id> "the explorer found the token refresh bug in runner.ts:245 — analyze the tradeoff between retry approaches"
```

`job_id` for each member is in the resume payload member registry (field: `jobId`) and in `sp node status --json`.

Do **not** steer speculatively. Base every steer or resume on concrete evidence from `sp node result`.
- Good: explorer result shows token refresh bug → resume overthinker with that specific context.
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
4. if not recoverable, create a tracking bead and/or complete the node with an explicit blocked reason.

### Example recovery cases

- invalid `member-key` or missing `phase`: call `spawn-member` again with corrected values.
- `wait-phase` references an unknown member: refresh via `status --json`, then retry with the valid member set.
- `result` reports no `job_id` yet: the member was not launched or not persisted yet; re-check `status --json`.
- `result` reports no persisted output yet: the member finished without a stored result; inspect `members`, `feed`, or escalate with a follow-up bead.
- completion rejected by current state: refresh status, satisfy unmet prerequisites, retry `complete`.

---

## Example command sequences

### Sequence A: explore -> synthesis -> impl -> complete

```bash
sp node status --node $SPECIALISTS_NODE_ID --json
sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key explore-1 --specialist explorer --phase explore-1 --json
sp node wait-phase --node $SPECIALISTS_NODE_ID --phase explore-1 --members explore-1 --json
sp node result --node $SPECIALISTS_NODE_ID --member explore-1 --full --json
# Synthesize the explore findings and decide whether impl is required.
sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key impl-1 --specialist executor --phase impl-1 --json
sp node wait-phase --node $SPECIALISTS_NODE_ID --phase impl-1 --members impl-1 --json
sp node result --node $SPECIALISTS_NODE_ID --member impl-1 --full --json
# Synthesize impl evidence, then complete.
sp node complete --node $SPECIALISTS_NODE_ID --strategy pr --json
```

### Sequence B: read explorer → steer researcher based on findings

```bash
sp node status --node $SPECIALISTS_NODE_ID --json
sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key explore-1 --specialist explorer --phase explore-1 --json
sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key research-1 --specialist researcher --phase explore-1 --keep-alive --json
sp node wait-phase --node $SPECIALISTS_NODE_ID --phase explore-1 --members explore-1 --json
sp node result --node $SPECIALISTS_NODE_ID --member explore-1 --full --json
# Explorer found retry logic bug in runner.ts:245 — direct researcher to relevant external docs
sp resume <research-1-job_id> "look up the Anthropic SDK retry backoff API and find how other projects handle 429 retries"
sp node wait-phase --node $SPECIALISTS_NODE_ID --phase explore-1 --members research-1 --json
sp node result --node $SPECIALISTS_NODE_ID --member research-1 --full --json
# Synthesize both findings, then proceed to impl or overthinker phase
```

### Sequence C: discovered work + review synthesis + manual completion

```bash
sp node status --node $SPECIALISTS_NODE_ID --json
sp node create-bead --node $SPECIALISTS_NODE_ID --title 'Follow-up: tighten node retry policy' --type task --priority 2 --json
sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key review-1 --specialist reviewer --phase review-1 --json
sp node wait-phase --node $SPECIALISTS_NODE_ID --phase review-1 --members review-1 --json
sp node result --node $SPECIALISTS_NODE_ID --member review-1 --full --json
# Synthesize the review evidence, then decide whether a fix phase is needed.
sp node complete --node $SPECIALISTS_NODE_ID --strategy manual --json
```

---

## Practical heuristics

- Parallelize only when member scopes are disjoint.
- Prefer explicit short phases over long implicit waves.
- Re-read `status --json` before every major transition.
- Keep retries bounded; avoid infinite command loops.
- If progress stalls, surface the blocker via `create-bead` and choose completion strategy deliberately.
- Treat `wait-phase` + `result --full` as a pair. One without the other is incomplete coordination.

---

<!-- node-contract:generated:start -->
## Generated node coordinator reference

### Coordinator command set
- `sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key <key> --specialist <name> [--bead <id>] [--phase <id>] [--json]`
- `sp node create-bead --node $SPECIALISTS_NODE_ID --title "..." [--type task] [--priority 2] [--depends-on <id>] [--json]`
- `sp node complete --node $SPECIALISTS_NODE_ID --strategy <pr|manual> [--json]`
- `sp node wait-phase --node $SPECIALISTS_NODE_ID --phase <id> --members <k1,k2,...> [--json]`
- `sp node result --node $SPECIALISTS_NODE_ID --member <key> --full --json`
- `sp node status --node $SPECIALISTS_NODE_ID [--json]`

### Phase-boundary synthesis rule
- After `wait-phase` completes, read every participating member result with `sp node result ... --full --json`, synthesize the evidence, then decide the next phase or node completion.

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
