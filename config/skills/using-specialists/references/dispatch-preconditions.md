# Dispatch preconditions

> Checks that must pass BEFORE any dependent chain dispatch: git state, conflict clusters, test-failure maps, graph shapes.
> Loaded on demand from [SKILL.md](../SKILL.md) — not eagerly injected.
> Always-needed policy (rules, gates, escalation, specialist choice) stays in the router; it is not repeated here.

## Git State Precondition (before any chain dispatch)

Specialist worktrees fork from the current HEAD of the orchestrator's branch at dispatch time. If prior chain edits aren't merged in yet, the new chain works on a stale base, will conflict at integration, and debugger-restitch becomes mandatory. The fix is upstream: don't dispatch until prior work has landed.

Required pre-flight before dispatching any chain that depends on prior chain output:

```bash
# 1. Working tree clean — no uncommitted edits to inherit or lose
git status                          # MUST report "working tree clean"

# 2. HEAD contains prior chain's work
git log -1 --oneline                # confirm latest commit
git log main..HEAD --oneline        # confirm prior chain branch merged in

# 3. No orphaned worktrees from prior chains
git worktree list                   # all prior chain worktrees should be removed
git worktree prune                  # drop stale metadata

# 4. If on an integration branch
git log integration/<date>..HEAD    # MUST be empty (in sync with integration target)
```

Decision rule: if any of the four checks fail, finish the merge/commit/cleanup first. Do not dispatch. A specialist forked from a stale base produces conflict work that costs more turns than the time saved by dispatching early.

Strictness by scenario:

| Scenario | Strictness |
|---|---|
| Sequential chains where child.B depends on child.A's edits | **Strict.** child.A merged before child.B dispatch. |
| Parallel chains in same epic with disjoint file scopes | Relaxed. Each dispatches off the shared base; integration reconciles. |
| Chain after orchestrator-direct edit (rule #13 exception epics) | **Strict.** Orchestrator commits + pushes their direct edits before dispatching any dependent chain. |
| Standalone chain (no upstream dependency) | Relaxed. Just `git status` clean. |

## Pre-Dispatch: Conflict Cluster Identification

Before dispatching N parallel chains, build the file-overlap matrix:

| Chain | Touches | Overlap with |
|-------|---------|--------------|
| chain-A | src/cli/update.ts | chain-B, chain-C |
| chain-B | src/cli/update.ts, src/cli/install.ts | chain-A, chain-C, chain-D |
| chain-C | src/cli/update.ts, src/cli/install.ts, src/cli/doctor.ts | chain-A, chain-B |

For each cluster of overlapping chains, choose **one** of:

1. **Serial dispatch** — execute chains in dependency order, each waits for previous to land. Slowest but cleanest. Encode the order with `blocks`, not notes.
2. **Unified bead** — collapse all chains into one bead/executor pass. Larger reviewer scope but no merge conflicts. Mark obsolete split beads with `bd supersede <old> --with <unified>`.
3. **Parallel dispatch + debugger restitch at integration** — dispatch in parallel, plan for ~40% conflict rate (empirical), budget debugger-restitch passes during integration. Link overlapping siblings with `bd dep relate <chain-a> <chain-b>` so the future restitch has visible context without creating fake blockers.

Example graph rewiring:

```bash
# soft conflict-cluster context; does not change schedule
bd dep relate <chain-a> <chain-b>

# serializing because both chains edit src/cli/update.ts
bd dep add <chain-b> <chain-a> --type blocks

# replacing scattered duplicate/split beads with one unified implementation
bd supersede <old-chain-a> --with <unified-chain>
bd supersede <old-chain-b> --with <unified-chain>
```

Default heuristic: if 3+ chains touch the same file, **serial-dispatch them**. Conflict-resolution time at integration usually exceeds the time saved by parallel dispatch. Run `bd find-duplicates --status open --method ai --json` before launching a large wave; merge or supersede duplicate work before specialists spend tokens on it.

## Pre-Epic: Test-Failure-Map Pattern

Use when:
- A test suite shows ≥ ~5 failures and the operator says "fix all"
- The failures span multiple files / subsystems
- Root causes are not yet attributed per failure

### Step-by-step

1. **Run the suite once**, save the full log. Do not interpret yet.
2. **File one mapping bead** titled per the Bead Title Convention (e.g., `test-runner: refresh <epic> failure map`) with contract:
   - `PROBLEM:` exact command + exit status + raw failure count.
   - `SUCCESS:` cluster table grouping every failure by **likely shared root cause and file scope**, plus recommended fix-chain order.
   - `SCOPE:` the log file path + bounded test files involved.
   - `CONSTRAINTS:` READ_ONLY, no source/test edits, no fix attempts.
3. **Dispatch test-runner / explorer / debugger** for this bead READ_ONLY (or fill inline by reading the log).
4. **Build the cluster table**: cluster name | files (counts) | representative error | root-cause hypothesis | likely-owner area | targeted validation command. Save in bead notes.
5. **Wire root-cause relationships** so the graph is navigable:
   ```bash
   bd dep add <failure-cluster-bead> <root-cause-bead> --type caused-by
   bd dep add <test-runner-bead> <fix-bead> --type validates
   ```
   Use `caused-by` for attribution, not `blocks`; use `validates` for the evidence-producing test bead.
6. **Plan fix chains** off the cluster table:
   - One chain per cluster, file scopes disjoint where possible.
   - Order by leverage (largest cluster first), then by simplicity.
   - Debugger when root cause unclear; executor when bead constraint is concrete.
7. **Save the topology insight as `bd remember`** — patterns about where a codebase's test fragility concentrates are reusable.

### Why this beats dispatch-blind

When 34 failures collapsed under 5 clusters in one observed run, 56% of failures shared a single root cause. A blind parallel dispatch would have over-dispatched 19 fixes instead of 1. Net specialist spend ~3× higher without the mapping pass.

### Failure modes to watch for

- Clusters that look shared but aren't — same error string in unrelated tests may hide different root causes. Confirm via stack traces, not error text alone.
- One cluster's fix introduces another's regression — each chain's VALIDATION must span all known-failing areas with "no regressions in other clusters."
- Pre-existing failures vs new regressions — name pre-existing failures explicitly in each chain's NON_GOALS so reviewers don't FAIL on them.

## Dependency Graph Shapes

Draw graph before dispatch.

Simple chain:

```text
task -> explore -> impl -> review
```

Fix loop:

```text
debug -> exec -> seconder? -> security-auditor? -> reviewer
                ^                                     |
                |------ resume PARTIAL --------------|
```

Epic:

```text
epic
├─ prep/planner
├─ impl-a
├─ impl-b
├─ test-batch
└─ merge/review chain(s)
```

What differs: orchestrator sees edge shape up front, so can pick sequential chain, fix loop, or multi-chain epic without graph drift.

