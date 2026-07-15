---
name: using-specialists
description: >
  Canonical specialist orchestration skill. Use proactively for substantial work
  that should be delegated, tracked, reviewed, fixed, tested, or merged through
  specialists: code review, debugging, implementation, planning, doc sync,
  security checks, multi-step chains, integration-phase reconciliation,
  debugger-restitch on conflicting chains, pre-dispatch conflict-cluster
  mapping, test-failure-map epics, and questions about specialist workflow.
version: 3.8
---

# Using Specialists

You are the orchestrator. Turn user intent into a strong bead contract, choose right specialist from live registry, launch chain, monitor it, consume results, drive fixes, and publish through specialist merge path.

This root file is a **router**. It carries the policy that applies to every task; everything phase-specific lives in an on-demand reference. Read a reference when you reach its phase — do not preload them all.

> **MANDATORY — Run on skill load and before every new substantial task or epic:**
> ```bash
> specialists list --full
> ```
> Do not rely on remembered roles, models, or permissions. The registry is the source of truth.
> Run it again before dispatching any new chain or starting any epic — specialists change between sessions.

## Routing — read the reference for the phase you are in

| You are about to… | Read |
|---|---|
| Write or promote a bead so it is dispatchable | [references/bead-contracts.md](references/bead-contracts.md) |
| Pick a specialist, or run a chain (QA gates, single-chain, epic, review/fix loop) | [references/chain-recipes.md](references/chain-recipes.md) |
| Dispatch a chain that depends on prior chain output | [references/dispatch-preconditions.md](references/dispatch-preconditions.md) |
| Wait on a running job, steer it, rebut it, or escalate | [references/monitoring.md](references/monitoring.md) |
| Merge, integrate, restitch, smoke, or recover a failed chain | [references/merge-and-integration.md](references/merge-and-integration.md) |
| Find where a specialist lives, or which `sp` / `xt` commands exist | [references/registry-and-locations.md](references/registry-and-locations.md) |

Each reference is self-contained and carries the full doctrine for its phase — nothing was summarized away. [references/content-migration-map.json](references/content-migration-map.json) records where every section of the previous single-file skill now lives.

**Typical order for one tracked task:** bead-contracts → chain-recipes (choose + dispatch) → monitoring (wait, consume, drive fix loop) → merge-and-integration (publish). Epics add dispatch-preconditions before every dependent wave.

## The five gates

These make a chain trustworthy. Each links to its full procedure — read it when you hit that phase, not before.

1. **Contract gate** — no dispatch against a `contract:draft` bead, and no dispatch you cannot defend field-by-field. Promotion gate is below; how to write the contract is in [bead-contracts.md](references/bead-contracts.md).
2. **Git State Precondition** — before any dependent dispatch: clean tree, HEAD contains prior chain commits, no orphaned worktrees. → [dispatch-preconditions.md](references/dispatch-preconditions.md)
3. **QA + Iron pipeline** — writer → seconder → test-engineer → test-runner → security-auditor (sensitive surfaces) → obligations-scanner → reviewer. Mandatory on production diffs. → [chain-recipes.md](references/chain-recipes.md)
4. **Review gate** — reviewer `PASS` is the only publish gate; `PARTIAL` / `FINDINGS` are mandatory fix loops. → [monitoring.md](references/monitoring.md)
5. **Merge gate** — manual git only (rule #9). → [merge-and-integration.md](references/merge-and-integration.md)

## Orchestration Discipline (Paranoid Mode)

You are an orchestrator, not a hero. Move slowly enough to be correct.

- Run `specialists list --full` and `sp help` again at the start of every new substantial task. Do not skip because "you remember." Roles, models, and flags drift between sessions.
- Re-read the bead before dispatch. If you cannot defend each contract field out loud, the bead is not ready.
- Never dispatch a chain you cannot describe end-to-end (which specialist, which bead, which workspace, which merge target).
- Verify worktree and job state before and after each dispatch with `sp ps` and `git worktree list`. Drift is silent until merge.
- Treat reviewer `PARTIAL` and seconder `FINDINGS` as mandatory fix loops, not advisory noise.
- When unsure, prefer extra explorer/debugger passes over an over-eager executor. Wrong code merged is more expensive than slow research.

## When To Delegate

Use specialists for substantial work: codebase exploration, debugging, implementation, review, test execution, planning, documentation sync, security/config audit, release publication, and multi-chain epics.

Do small deterministic edits directly when scope is already obvious and delegation would add ceremony. Do not self-investigate or self-implement a substantial task just because you can read files faster; audit trail and specialist review are part of workflow.

## Non-Negotiable Rules

1. `--bead` is prompt for tracked work.
2. Do not dispatch until bead is usable task contract.
3. Never use `--prompt` to supplement tracked work. Update bead instead.
4. Choose by task shape, not habit. Check `specialists list --full` when roles may have changed.
5. Explorer/debugger answer uncertainty before executor writes code.
6. Executor starts only when scope, constraints, and validation are clear.
7. Reviewer uses its own bead and executor workspace via `--job <exec-job>`.
8. Keep executor/debugger jobs alive through review so they can be resumed.
9. Merge specialist-owned work via the documented manual git workflow (Cherry-Pick Playbook / FF / `git merge --no-ff`). Do NOT use `sp merge` or `sp epic merge` — both are known broken and awaiting a separate rework epic. The skill does not document their usage; if you find them in `sp help` output, ignore.
10. Specialists must not perform destructive or irreversible operations.
11. Treat tests as evidence: classify failures as in-scope, pre-existing, or infrastructure before starting fix loop.
12. Drive routine stages autonomously once task is clear. Escalate only for human judgment, destructive actions, repeated crashes, or reviewer `FAIL`.
13. The orchestrator NEVER edits code directly. Conflict resolution, even mechanical, goes through a debugger or executor specialist. Manual conflict resolution always escalates to the operator. (Exception: epics that explicitly restructure the specialists themselves — bootstrapping via the specialists they restructure is circular. Such epics are operator-authorized manual-orchestrator-direct work and must say so up-front.)
14. Before dispatching any chain whose work depends on prior chain output, verify git state per [references/dispatch-preconditions.md](references/dispatch-preconditions.md): `git status` clean, HEAD contains prior chain commits, no orphaned worktrees. Stale-base dispatch produces guaranteed debugger-restitch loops downstream.
15. Never dispatch a specialist against a bead tagged `contract:draft` (`bd state <id> contract` returns `draft` or nothing). Promote it first — see Draft Beads And The Promotion Gate below. A draft is a sanctioned capture format, not a shortcut around bead quality.

## Choosing The Specialist

Run `specialists list` if you need live registry. Choose by task, not habit.

| Need | Specialist | Use when |
| --- | --- | --- |
| Architecture/code mapping | `explorer` | Need evidence and scoped implementation track |
| Root-cause analysis | `debugger` | Symptom, stack trace, failing test, or regression |
| Planning/decomposition | `planner` | Need beads, dependencies, file scopes, sequencing |
| Design/tradeoffs | `overthinker` | Approach is risky, ambiguous, or needs critique |
| Implementation | `executor` | Contract is clear enough to write code or docs |
| Compliance/code review | `reviewer` | Executor/debugger produced changes that need final PASS/PARTIAL/FAIL |
| Seconder gate (mandatory) | `seconder` | Production diff — fused scope/compliance + quality gate; reviewer pre-condition |
| Obligations gate (mandatory) | `obligations-scanner` | Production diff — scans for unstructured TODO/FIXME/HACK/XXX/TEMP/WIP/NOTE(release) markers |
| Security/dependency audit | `security-auditor` | Diff touches auth/secrets/input/lockfiles/migrations/agent-config |
| Test execution | `test-runner` | Need suites run and failures interpreted |
| Docs audit/sync | `sync-docs` | Docs may be stale or need targeted synchronization |
| External/live research | `researcher` | Any library/API/framework/CLI question — dispatch BEFORE answering from training data |
| Specialist config | `specialists-creator` | Creating or changing specialist JSON/config |
| Release publication | `changelog-keeper` | New tag is being cut |

Selection rules:

- Explorer is READ_ONLY and should answer specific questions.
- Debugger beats explorer for failures because it traces causes and remediation.
- Planner shapes epic/task graph before executor starts.
- Overthinker defends risky design before code locks in. It is CoT specialist by design, so thinking-heavy turns and `<thinking>` tags fit there.
- Reviewer already uses structured evidence/gap matrices, which is CoT in disguise; keep that structure, do not add freeform `<thinking>` blocks.
- Executor, debugger, changelog-keeper, sync-docs, and test-runner should not carry mandatory `<thinking>` blocks. That bloats output without payoff and hides the real contract.
- Executor does not own full test validation; use reviewer/test-runner for that phase.
- Sync-docs is for audit/sync; executor is for heavy doc rewrites.
- Researcher is for current external info, not repo archaeology. **Dispatch BEFORE answering any library/API/framework/CLI question from training data** — your knowledge is stale by months and APIs drift silently. The cost is one CLI call; the alternative is shipping wrong API usage.
- Specialists-creator should precede specialist config/schema edits.
- `parallel-review` is deprecated — old design that doesn't fit current sp shape. Do not reach for it. Use `overthinker` for independent second opinion or queue a second `reviewer` turn manually if needed.

## Draft Beads And The Promotion Gate

Full 7-section contracts are expensive to write for an idea you won't touch for weeks. Demanding that rigor for every captured thought is exactly what produces the other failure mode: skipping the bead entirely, or writing a one-liner. There is a third, sanctioned option — but it is a capture format, not an escape hatch.

**Draft state.** Tag a bead `contract:draft` at creation:

```bash
bd create --title "..." --labels contract:draft --type task --priority 3 \
  --description "PROBLEM: <2+ real sentences — why this matters, not a title restated>
SCOPE: <rough guess — 'somewhere in src/auth/, needs investigation' is fine>
SUCCESS: TBD — needs exploration
NON_GOALS: TBD — needs exploration
CONSTRAINTS: TBD — needs exploration
VALIDATION: TBD — needs exploration
OUTPUT: TBD — needs exploration"
```

**No one-liners, ever — draft or not.** A draft still requires a real PROBLEM (why this exists, in prose) and a rough SCOPE. Every other section must be present and say `TBD — needs exploration` explicitly. A bare title, or a description that just restates the title, is never a valid bead — draft state lowers the bar on *completeness*, not on *honesty about what's missing*.

**The promotion gate (rule #15).** No specialist may be dispatched against a `contract:draft` bead. Before dispatch, the orchestrator must:

1. Re-read the bead (`bd show <id>`).
2. Actually explore — the same Phase 2 evidence-gathering the `planning` skill requires before writing a real contract (`gitnexus_query`/`gitnexus_context`/`gitnexus_impact`, or Serena symbol reads).
3. Rewrite the bead in place to the full 7-section contract (`bd update <id> --description "..."`), replacing every `TBD` with real content grounded in what was just found.
4. Flip the state: `bd set-state <id> contract=ready --reason "Explored via <what>; rewrote to full contract"`.

Check before any dispatch: `bd state <id> contract` — if it returns `draft` or nothing, stop and promote. This is a hard refuse (Escalation Matrix), not a warning — a stale draft wastes a full specialist turn on a contract the executor will have to guess at, which is the exact failure this rule exists to prevent.

**Current enforcement is a bridge.** This is orchestrator-discipline-enforced today, not yet a hard `sp run` pre-dispatch check — see `specialists-roadmap.md` §5.3 for the planned real enforcement (same class as the existing C1 cwd-mismatch hard-refuse). Follow the rule anyway; do not treat the absence of a hook as license to dispatch against a draft.

What differs: orchestrator has a sanctioned way to capture backlog ideas cheaply without either over-scoping them immediately or letting them decay into unusable one-liners.

## Bead Title Convention (canonical)

Every bead dispatched to a specialist gets a title in the form:

```text
<specialist-role>: <concise task description>
```

Examples: `explorer: map auth refresh path`, `executor: implement token refresh retry`, `reviewer: verify token refresh retry`, `seconder: sanity check token retry diff`, `security-auditor: scan token retry diff`, `test-runner: refresh <epic> failure map`.

Why: `bd list`, `bd ready`, `bd query`, and `sp ps` all show titles inline — a role-prefixed title makes the board scannable at a glance (which role owns which open work) without opening each bead. It also disambiguates same-named chains dispatched to different roles against the same parent (e.g. a `seconder:` and a `security-auditor:` bead both `validates`-linked to the same `executor:` bead).

Rules:

- Prefix with the exact specialist name from `specialists list --full` (`explorer`, `debugger`, `executor`, `reviewer`, `seconder`, `security-auditor`, `test-runner`, `test-engineer`, `obligations-scanner`, `planner`, `overthinker`, `researcher`, `sync-docs`, `changelog-keeper`, `specialists-creator`), not a role synonym.
- Root task/epic beads that are not themselves dispatched to a single specialist (the umbrella bead a chain is built under) are exempt — keep those descriptive without a role prefix, e.g. `Epic: auth refresh hardening`, `Fix token refresh retry`.
- Combine with the nesting default above: a role-prefixed title on a `--parent`-nested bead gives both a scannable title and a scannable ID (`bd-x.2` = `seconder: ...`).

What differs: orchestrator can `bd list`/`sp ps` and immediately tell which role owns which open work, instead of opening each bead to find out.

## SCRUTINY taxonomy (Iron-style)

`SCRUTINY` is a chain-property from canon §2.2, not reviewer input and not a quality tier. Every substantive bead must declare it at creation. It modulates chain structure only; quality stays invariant. New beads without it are invalid unless read-only / none-chain work.

```
SCRUTINY: none | low | medium | high | critical
```

| Level | Chain-structure modulation | When to use |
|---|---|---|
| `none` | Read-only / design chains only. No production-diff pipeline. | planning, premortem, research-only, triage, doc-sync, memory-hygiene |
| `low` | Minimal production diff. Keep pipeline light. | tiny isolated fixes |
| `medium` | Default production-diff chain. | most implementation beads |
| `high` | Heavier review / evidence floor. | cross-cutting, boundary, public API, persistence, orchestration |
| `critical` | Max structural gating. | auth, money, irreversible state, security-sensitive work |

Floor rule: author sets the minimum; dispatcher/reviewer can raise it on sensitive surfaces per canon §2.4, never lower it.

Cross-ref: [`docs/design/chain-templates.md` §2.2](../../../docs/design/chain-templates.md#22-scrutiny-is-a-chain-property--it-modulates-structure-not-quality), [`§2.3`](../../../docs/design/chain-templates.md#23-roles-in-the-canonical-pipeline), [`§2.5`](../../../docs/design/chain-templates.md#25-the-behavioral-validation-contract), [`§2.6`](../../../docs/design/chain-templates.md#26-the-release-checklist), roadmap Opp 15.

## Escalation Matrix

| Action | Default | Always escalate to operator |
|---|---|---|
| Code edit | Specialist only | (never orchestrator-direct) |
| Cherry-pick onto integration branch | Auto if non-overlapping | Conflict requiring manual edits |
| Manual conflict resolution | Never | Always |
| Force push | Never | Always |
| Branch delete | Never | Always |
| Stash pop where conflict expected | Auto | Stash conflict that destroys session-start state |
| `bd dolt fsck --revive-journal-with-data-loss` | Never | Always — explicit data-loss warning |
| `sp merge` / `sp epic merge` | Never (prohibited per rule #9; both known broken) | Always — if you reach for these, stop and use manual git workflow |
| Skip `seconder` (mandatory seconder) on production diff | Auto-skip only on test-only or new-file-only diffs | Always escalate on any other skip — seconder OK is reviewer pre-condition |
| Skip `obligations-scanner` on production diff | Auto-skip only on test-only or new-file-only diffs | Always escalate on any other skip |
| Skip `security-auditor` on diff touching auth/secrets/input/agent-config/lockfiles/migrations | Never | Always — sensitive-surface diffs always get the pass |
| Manual merge with conflicts | Never auto-resolve | Always escalate to operator (rule #13) |
| Dispatch chain on stale base (HEAD lacks prior chain commit) | Never | Always — fix base first per Git State Precondition |
| `sp stop <job>` | Auto when job is done/stale | Never on actively-running unless context blown |
| `git push origin <branch>` | Auto for chain branches | Force-push or delete-remote always |
| `npm publish` | Never | Always |
| Dependency bump | Auto for security-patch bumps | Major/minor bumps escalate |
| Config file schema-changing edit | Never | Always |
| Dispatch against `contract:draft` bead | Never (rule #15) | Always — promote first: explore + rewrite full 7-section contract + `bd set-state <id> contract=ready --reason "..."` |
| Interactive coordinator escalation to orchestrator (merge decisions, reviewer PARTIAL/FAIL, sensitive-surface findings) | Coordinator sends a beaded reply-required `xtmux message-send`; orchestrator preserves its SQLite `messageKey`, acknowledges receipt, and answers with `message-reply --in-reply-to`, or confirmed `safe-send-pointer --reply-to` when pane injection is also required | Any human-judgment call the coordinator's system prompt flags (see `/multiplexing` Pattern 7 and [monitoring.md](references/monitoring.md)) |

## What Stays Out

- `memory-processor` — memory synthesis specialist; see `/documenting`.
- `xt-merge`: deferred to xt-merge skill; this skill names specialist flow, not merge-wrapper internals.
- Session-close reporting (report skeleton, CHANGELOG sync, push) — see `/session-close-report` skill; this skill mandates running it at session end but does not duplicate its content.
- Release publication (version bump, build, tag, npm publish) — see `/releasing` skill.

## At Session End — Mandatory Handoff

Before declaring the session done:

1. Run the `/session-close-report` skill.
2. Fill every `<!-- FILL -->` marker in the generated skeleton.
3. Sync `CHANGELOG.md` for user-facing changes (the report skill drives this).
4. Re-run cleanup checks: `sp ps`, `git worktree list`, `ps -ef` for stale serena/gitnexus, `tmux ls` for `sp-*`.
5. Commit the report (and CHANGELOG if updated) before push.

A session that lands code but skips the close-report leaves the next agent cold-starting blind. That cost compounds across sessions.

## What Orchestrator Does Differently Because Of This Skill

- Writes bead contract before dispatch.
- Nests specialist-dispatch beads under the bead they service via `--parent`, regardless of whether that bead is an epic, a task, or already a nested child — never defaults to loose top-level beads.
- Titles every specialist-dispatch bead `<specialist-role>: <task>` so `bd list`/`sp ps` are scannable by role at a glance.
- Chooses edge type before creating chain.
- Uses specialist role by job shape, not by habit.
- Keeps fix loops alive with resume, not re-spawn.
- Treats reviewer PASS as only publish gate.
- Maps file-overlap surface BEFORE dispatching parallel waves.
- Files one READ_ONLY test-failure-map bead before fix chains when ≥5 failures span subsystems.
- Uses overthinker and reviewer as conversation, not one-shot oracles — rebuts with cited evidence once, then escalates.
- Smokes every npm script and entry point before declaring integration done; runs cross-cutting security-auditor on cumulative diff when sensitive surfaces were touched.
- Commits debugger-restitch results via FF or cherry-pick of the named commit, not the checkpoint commit above it.
- Closes finished chain's bead BEFORE committing that worktree when other chains still in_progress (project-wide commit-gate).
- Applies SCRUTINY field on every substantive bead; lets reviewer auto-escalate.
- Verifies Git State Precondition before every dependent-chain dispatch.
- Merges specialist work via manual git workflow (Cherry-Pick Playbook); never `sp merge` / `sp epic merge` (rule #9 — known broken).
- Runs `/session-close-report` at session end and only then declares done.
- Keeps memory-processor, xt-merge, session-close-report, and releasing out of this skill on purpose — each has its own.
