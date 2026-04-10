---
name: using-nodes
description: >
  Use this skill for node-coordinator behavior. The coordinator is a CLI-native
  orchestrator that drives NodeSupervisor via `sp node` commands.
version: 3.0
---

# Using Nodes

## Purpose

This skill is the coordinator playbook for `NodeSupervisor` runs.

The coordinator is **CLI-native**:
- reason about the node objective,
- call `sp node` commands,
- read JSON command responses,
- decide next command,
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

---

## Command reference (coordinator)

- `sp node spawn-member --node $NODE_ID --member-key <key> --specialist <name> [--bead <id>] [--phase <id>] [--json]`
- `sp node create-bead --node $NODE_ID --title '...' [--type task] [--priority 2] [--depends-on <id>] [--json]`
- `sp node complete --node $NODE_ID --strategy <pr|manual> [--json]`
- `sp node wait-phase --node $NODE_ID --phase <id> --members <k1,k2,...> [--json]`
- `sp node status --node $NODE_ID [--json]`

---

## Core loop

1. **Read status**
   - `sp node status --node $NODE_ID --json`
   - identify current phase, member registry, blockers, and completion readiness.

2. **Issue orchestration commands**
   - spawn members as needed,
   - create follow-up beads when new tracked work emerges,
   - wait on phase barrier before advancing.

3. **Re-check status**
   - re-read node status after each command sequence,
   - adjust plan from actual runtime state.

4. **Complete node**
   - once goals/gates are satisfied (or terminally blocked with operator intent),
   - call `sp node complete --node $NODE_ID --strategy <pr|manual> --json`.

---

## Wait-phase semantics

`sp node wait-phase` is a blocking coordination barrier.

Use it when:
- all members in a phase have been dispatched,
- progression depends on member terminal outcomes,
- review/fix loops require strict stage boundaries.

Pattern:
1. spawn phase members,
2. call `wait-phase` with exact member keys for that phase,
3. only then move to next phase or completion decision.

---

## Error handling

When a command fails:

1. inspect the error JSON payload,
2. classify failure (invalid args, missing member/bead, transient runtime condition),
3. retry with corrected arguments when recoverable,
4. if not recoverable, create a tracking bead and/or complete node with appropriate strategy.

### Example recovery cases

- invalid `member-key` or missing `phase`: call `spawn-member` again with corrected values.
- `wait-phase` references unknown member: refresh via `status --json`, then retry with valid member set.
- completion rejected by current state: refresh status, satisfy unmet prerequisites, retry complete.

---

## Example command sequences

### Sequence A: basic explore -> impl -> complete

```bash
sp node status --node $NODE_ID --json
sp node spawn-member --node $NODE_ID --member-key explore-1 --specialist explorer --phase explore-1 --json
sp node wait-phase --node $NODE_ID --phase explore-1 --members explore-1 --json
sp node spawn-member --node $NODE_ID --member-key impl-1 --specialist executor --phase impl-1 --json
sp node wait-phase --node $NODE_ID --phase impl-1 --members impl-1 --json
sp node complete --node $NODE_ID --strategy pr --json
```

### Sequence B: discovered work + gated completion

```bash
sp node status --node $NODE_ID --json
sp node create-bead --node $NODE_ID --title 'Follow-up: tighten node retry policy' --type task --priority 2 --json
sp node spawn-member --node $NODE_ID --member-key review-1 --specialist reviewer --phase review-1 --json
sp node wait-phase --node $NODE_ID --phase review-1 --members review-1 --json
sp node complete --node $NODE_ID --strategy manual --json
```

---

## Practical heuristics

- Parallelize only when member scopes are disjoint.
- Prefer explicit short phases over long implicit waves.
- Re-read `status --json` before every major transition.
- Keep retries bounded; avoid infinite command loops.
- If progress stalls, surface the blocker via `create-bead` and choose completion strategy deliberately.
