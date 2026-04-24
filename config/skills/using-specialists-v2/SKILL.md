---
name: using-specialists-v2
description: >
  Use this skill to orchestrate substantial work through project specialists with
  a bead-first workflow. It covers when to delegate, how to write complete bead
  task contracts, how to run explorer/executor/reviewer/test chains, how to use
  --worktree/--job/--epic/--context-depth, and how to merge or recover specialist
  work without drift. Trigger for code review, debugging, implementation,
  planning, test generation, doc sync, multi-chain epics, and any question about
  specialist orchestration.
version: 1.0
---

# Specialists V2

You are the orchestrator. Your job is to specify the work, choose the right specialist, launch the right chain, monitor progress, and synthesize results. Do not turn orchestration into vague delegation: `--bead` is the prompt.

Use this skill for substantial work: codebase exploration, debugging, implementation, review, testing, documentation sync, planning, specialist authoring, and multi-chain orchestration. Do small deterministic edits directly when the scope is already clear and delegation would add ceremony.

## Hard Rules

1. `--bead` is the prompt for tracked work.
2. Do not dispatch until the bead is a complete task contract.
3. Never use `--prompt` to supplement tracked work. Update bead notes instead.
4. Use explorer only when the implementation path is unknown.
5. Use executor only after scope, constraints, and validation are clear enough to act.
6. Edit-capable specialists use `--worktree` for the first implementation job.
7. Reviewer gets its own bead and enters the executor workspace with `--job <exec-job>`.
8. Use `--context-depth 2` for chained work unless there is a specific reason not to.
9. Keep executor/debugger jobs alive through review so they can be resumed.
10. Merge specialist branches with `sp merge` or `sp epic merge`, never manual `git merge`.
11. Specialists must not perform destructive or irreversible actions.
12. If a specialist fails, inspect feed/result and either steer, resume, rerun with a better bead, or report the blocker.
13. Drive chains autonomously. Do not ask the operator to approve routine stage transitions. Escalate only on critical events (see Autonomous Drive section).

## Autonomous Drive

Once the operator has approved a plan or specified a task, push the chain to completion without pausing for per-stage confirmation. Dispatch, wait with `sleep`, read results, dispatch the next stage, review, and merge. Treat each stage transition as a mechanical step — not a decision point.

Escalate to the operator only for:

- Reviewer verdict `FAIL` (not `PARTIAL` — fix those autonomously via resume).
- Destructive/irreversible action required (history rewrite, force push, credential rotation, mass delete, prod-impacting op).
- Repeated specialist crashes on the same chain (2+ in a row with same failure mode).
- Context-exhaustion risk above 80% with no clean handoff available.
- Ambiguous requirements the bead cannot resolve (rare — fix by updating the bead contract first and retrying).
- Explicit user-facing question embedded in reviewer output that needs human judgment.

Anything else — stage transitions, routine reviewer `PARTIAL` with concrete findings, merge gates passing, test retries — proceed without asking.

### Sleep-Based Polling

Use `sleep` between dispatch and status check. Size the sleep to the observed median for the specialist and adjust by polling once and checking `sp ps <job-id>`:

| Specialist | First sleep | Poll interval after |
| --- | --- | --- |
| executor | `sleep 180` (3m) | 60-120s |
| reviewer | `sleep 120` (2m) | 60s |
| explorer | `sleep 180` (3m) | 60s |
| debugger | `sleep 480` (8m) | 120s |
| overthinker | `sleep 240` (4m) | 60s |
| planner | `sleep 300` (5m) | 60s |
| sync-docs | `sleep 180` (3m) | 60s |
| researcher | `sleep 120` (2m) | 60s |
| test-runner | `sleep 120` (2m) | 60s |

Medians are empirical (derived from run history). Adjust for observed run complexity. If `sp ps` shows `running` after the first sleep, poll once more before assuming stuck. If `waiting`, read `sp result` — reviewer verdicts and READ_ONLY outputs land in the bead notes automatically.

Do not busy-loop `sp ps` in tight intervals. One sleep + one confirmation poll is enough for routine runs.

### Drive Loop Pattern

```bash
# Dispatch
JOB=$(sp run <specialist> --bead <bead-id> --context-depth 2 --background 2>&1 | tail -1)

# Sleep for median
sleep 180

# Check
sp ps "$JOB"

# Still running? Short follow-up sleep, then re-check
# Waiting or done? Read result
sp result "$JOB"

# Advance to next stage based on output — no operator prompt
```

Launch sleeps in the background when other orchestration work can proceed in parallel; the harness will notify on completion. Return to `sp ps`/`sp result` after the median interval elapses.

## Bead Task Contract

Every specialist-bound bead must be a usable prompt. Title-only beads are not acceptable.

Required fields:

```text
PROBLEM: What is wrong or needed.
SUCCESS: Observable completion criteria.
SCOPE: Files, symbols, commands, docs, or discovery area.
NON_GOALS: Explicitly out of scope.
CONSTRAINTS: Compatibility, safety, style, permissions, sequencing.
VALIDATION: Checks/tests/review expected before closure.
OUTPUT: Expected handoff format.
```

Use `bd update <id> --notes "CONTRACT: ..."` when an existing bead is too vague.

### Contract By Bead Type

Task/epic bead:

```text
PROBLEM: User-facing or project-facing objective.
SUCCESS: End-state across all child beads.
SCOPE: Area of project affected.
NON_GOALS: Boundaries for the entire effort.
CONSTRAINTS: Sequencing, compatibility, branch/merge rules.
VALIDATION: Final checks before close.
OUTPUT: What the orchestrator reports back.
```

Explorer bead:

```text
PROBLEM: What is unknown.
SUCCESS: Questions answered with evidence.
SCOPE: Code areas, docs, commands, or symbols to inspect.
NON_GOALS: No implementation, no broad audit outside scope.
CONSTRAINTS: READ_ONLY, prefer GitNexus/code intelligence when available.
VALIDATION: Findings cite files/symbols/flows.
OUTPUT: Findings, risks, recommended implementation track, stop condition.
```

Executor bead:

```text
PROBLEM: Exact behavior or artifact to change.
SUCCESS: Observable acceptance criteria.
SCOPE: Target files/symbols; include "do not touch" boundaries.
NON_GOALS: Related improvements explicitly excluded.
CONSTRAINTS: API compatibility, style, migrations, safety.
VALIDATION: Lint/typecheck/tests or manual checks.
OUTPUT: Changed files, verification, residual risks.
```

Reviewer bead:

```text
PROBLEM: Verify executor output against requirements.
SUCCESS: PASS only if requirements and validation are satisfied.
SCOPE: Executor job, diff, task bead, acceptance criteria.
NON_GOALS: Do not rewrite unless explicitly asked.
CONSTRAINTS: Code-review mindset; findings first.
VALIDATION: Run or inspect required checks where feasible.
OUTPUT: PASS/PARTIAL/FAIL with file/line findings.
```

Test bead:

```text
PROBLEM: Validate one or more implementation chains.
SUCCESS: Relevant tests/checks pass or failures are diagnosed.
SCOPE: Commands and implementation beads covered.
NON_GOALS: No broad unrelated suite expansion unless requested.
CONSTRAINTS: Avoid destructive cleanup; report flaky/infra failures separately.
VALIDATION: Command output and failure interpretation.
OUTPUT: Pass/fail summary, failing tests, likely owner.
```

## Choosing The Specialist

Run `specialists list` if you need the live registry. Choose by task, not by habit.

| Need | Specialist | Use when |
| --- | --- | --- |
| Architecture/code mapping | `explorer` | You need evidence and a scoped implementation track. |
| Root-cause analysis | `debugger` | There is a symptom, stack trace, failing test, or regression. |
| Planning/decomposition | `planner` | You need beads, dependencies, file scopes, or sequencing. |
| Design/tradeoffs | `overthinker` | The approach is risky, ambiguous, or needs critique. |
| Implementation | `executor` | The contract is clear enough to write code or docs. |
| Compliance/code review | `reviewer` | An executor/debugger produced changes that need a verdict. |
| Multiple review perspectives | `parallel-review` | A critical diff needs independent review passes. |
| Test execution | `test-runner` | You need suites run and failures interpreted. |
| Docs audit/sync | `sync-docs` | Docs may be stale or need targeted synchronization. |
| External/live research | `researcher` | Current library/docs/media lookup is needed. |
| Specialist config | `specialists-creator` | Creating or changing specialist JSON/config. |

Selection rules:

- Explorer is READ_ONLY and should answer specific questions.
- Debugger is better than explorer for failures because it traces causes and remediation.
- Executor does not own full test validation; use reviewer/test-runner for that phase.
- Reviewer always uses its own bead plus `--job <executor-job>`.
- Sync-docs is for audit/sync; executor is for heavy doc rewrites.
- Specialists-creator should precede specialist config/schema edits.

## Command Surface

Daily commands:

```bash
specialists list
specialists doctor
specialists run <name> --bead <id> --context-depth 2 --background
specialists run executor --worktree --bead <impl-bead> --context-depth 2 --background
specialists run reviewer --bead <review-bead> --job <exec-job> --context-depth 2 --keep-alive --background
specialists ps
specialists ps <job-id>
specialists feed <job-id>
specialists feed -f
specialists result <job-id>
specialists steer <job-id> "new direction"
specialists resume <job-id> "next task"
specialists stop <job-id>
```

Publication commands:

```bash
sp merge <chain-root-bead>
sp epic status <epic-id>
sp epic sync <epic-id> --apply
sp epic merge <epic-id>
sp end
```

Avoid `specialists status --job` for normal monitoring; prefer `sp ps <job-id>`.

## Flag Semantics

`--bead <id>` is the task prompt and tracked work identity.

`--context-depth N` controls parent/ancestor bead context. Use `--context-depth 2` for chains so the specialist sees its own bead, predecessor output, and parent task context.

`--worktree` provisions a new isolated workspace and branch for edit-capable work. Use it for the first executor/debugger job that writes files.

`--job <id>` reuses an existing job's workspace. Use it for reviewer and fix passes. The caller's own `--bead` remains authoritative; `--job` only selects the workspace.

`--epic <id>` explicitly associates a job with an epic. Use it for prep jobs whose parent is not the epic but should appear in epic status/readiness.

`--keep-alive` keeps interactive specialists waiting after a turn. Use for reviewer, overthinker, researcher, sync-docs, and any job expected to receive follow-up.

`--worktree` and `--job` are mutually exclusive.

## Golden Path: Single Implementation Chain

Use this when one implementation branch can solve the task.

Create a root task bead:

```bash
bd create --title "Fix token refresh retry on 401" --type bug --priority 2 \
  --description "PROBLEM: API clients fail permanently when token refresh receives a transient 401.
SUCCESS: Refresh retries are bounded, observable, and callers receive the same public error shape after exhaustion.
SCOPE: src/auth/refresh.ts, src/auth/client.ts, related auth tests.
NON_GOALS: Do not redesign auth storage or change public client API.
CONSTRAINTS: Preserve existing telemetry names and backward compatibility.
VALIDATION: lint, tsc, auth refresh tests or documented targeted equivalent.
OUTPUT: Changed files, validation results, residual risk."
```

Create explorer only if the implementation path is unclear:

```bash
bd create --title "Explore token refresh retry path" --type task --priority 2 \
  --description "PROBLEM: Need exact refresh call graph and retry insertion point.
SUCCESS: Identify caller/callee path, current retry behavior, and safest files to modify.
SCOPE: auth refresh/client modules and tests only.
NON_GOALS: No implementation.
CONSTRAINTS: READ_ONLY; cite files/symbols.
VALIDATION: Findings include recommended executor scope and risks.
OUTPUT: Evidence-backed implementation plan."
bd dep add <explore> <task>
specialists run explorer --bead <explore> --context-depth 2 --background
specialists result <explore-job>
```

Create implementation bead:

```bash
bd create --title "Implement bounded token refresh retry" --type task --priority 2 \
  --description "PROBLEM: Implement the retry behavior identified by exploration.
SUCCESS: 401 refresh retry is bounded and preserves public errors after exhaustion.
SCOPE: src/auth/refresh.ts, src/auth/client.ts, auth refresh tests.
NON_GOALS: No storage redesign, no public API change.
CONSTRAINTS: Keep telemetry names stable; avoid broad refactor.
VALIDATION: npm run lint, npx tsc --noEmit, targeted auth tests if available.
OUTPUT: Diff summary, checks run, follow-up risks."
bd dep add <impl> <explore-or-task>
specialists run executor --worktree --bead <impl> --context-depth 2 --background
specialists result <exec-job>
```

Create review bead:

```bash
bd create --title "Review token refresh retry implementation" --type task --priority 2 \
  --description "PROBLEM: Verify executor changes satisfy token refresh retry contract.
SUCCESS: PASS only if behavior, scope, constraints, and validation are satisfied.
SCOPE: executor job <exec-job>, implementation bead, root task contract.
NON_GOALS: Do not request unrelated auth redesign.
CONSTRAINTS: Findings first with file/line references.
VALIDATION: Inspect diff and available checks.
OUTPUT: PASS/PARTIAL/FAIL verdict with required fixes."
bd dep add <review> <impl>
specialists run reviewer --bead <review> --job <exec-job> --context-depth 2 --keep-alive --background
specialists result <review-job>
```

If reviewer returns `PARTIAL`, prefer resuming the same executor:

```bash
specialists resume <exec-job> "Reviewer PARTIAL. Fix only these findings: ..."
```

Then create a new re-review bead and run reviewer again with the same `--job <exec-job>`.

After reviewer `PASS`, publish:

```bash
sp merge <impl>
bd close <task> --reason "Fixed token refresh retry. Reviewer PASS. Merged."
```

## Golden Path: Multi-Chain Epic

Use this when multiple independent implementation chains must publish together.

Create a top-level epic with the complete contract:

```bash
bd create --title "Add specialist bead contract enforcement" --type epic --priority 1 \
  --description "PROBLEM: Specialists drift when --bead issues are under-specified.
SUCCESS: Docs and runtime guidance require complete bead contracts before dispatch.
SCOPE: docs/workflow guidance, skill docs, optional validation entry point.
NON_GOALS: No database migration, no breaking CLI changes.
CONSTRAINTS: Keep examples canonical and avoid title-only beads.
VALIDATION: docs review, lint/typecheck for runtime changes, reviewer PASS per chain.
OUTPUT: Merged epic with documented contract and verification."
```

Create a shared prep bead:

```bash
bd create --title "Plan bead contract enforcement tracks" --type task --priority 2 \
  --description "PROBLEM: Need file-disjoint implementation tracks for the epic.
SUCCESS: Identify independent chains, dependencies, risks, and validation per chain.
SCOPE: workflow docs, CLI/run validation surfaces, tests.
NON_GOALS: No implementation.
CONSTRAINTS: READ_ONLY; produce dependency plan.
VALIDATION: Plan names file scopes and merge order.
OUTPUT: Parallel track plan."
bd dep add <plan> <epic>
specialists run planner --bead <plan> --epic <epic> --context-depth 2 --background
```

Create independent implementation beads only when write scopes are disjoint:

```bash
bd create --title "Implement CLI bead contract warning" --type task --priority 2 \
  --description "PROBLEM: CLI allows specialist dispatch from vague beads.
SUCCESS: Dispatch warns or blocks according to agreed contract policy.
SCOPE: src/cli/run.ts, src/specialist/beads.ts, related tests.
NON_GOALS: No schema migration.
CONSTRAINTS: Preserve --prompt behavior for explicit ad-hoc runs.
VALIDATION: lint, tsc, targeted run/beads tests.
OUTPUT: Diff summary and verification."
bd dep add <impl-cli> <plan>

bd create --title "Update workflow docs for bead contract" --type task --priority 2 \
  --description "PROBLEM: Docs teach title-only specialist beads.
SUCCESS: Canonical examples use complete task contracts.
SCOPE: config/skills/using-specialists/SKILL.md, CLAUDE.md, docs/features.md.
NON_GOALS: No runtime code.
CONSTRAINTS: Keep docs concise and current.
VALIDATION: Review examples for contract fields and stale commands.
OUTPUT: Updated docs summary."
bd dep add <impl-docs> <plan>
```

Run parallel executors only if scopes are disjoint:

```bash
specialists run executor --worktree --bead <impl-cli> --context-depth 2 --background
specialists run executor --worktree --bead <impl-docs> --context-depth 2 --background
```

Review each chain with its own review bead and `--job`.

After every chain has reviewer `PASS`:

```bash
sp epic status <epic>
sp epic merge <epic>
bd close <epic> --reason "All chains reviewer PASS. Epic merged."
```

## Review And Fix Loop

A chain stays alive until merge or abandonment.

Standard loop:

```text
executor --worktree --bead impl
  -> waiting after turn
reviewer --bead review --job exec-job
  -> PASS: verify commit, publish, stop members if needed
  -> PARTIAL: resume executor with exact findings
  -> FAIL: decide whether to resume, replace, or abandon
```

Prefer `sp resume <exec-job>` over a new fix executor when the original job is waiting and context is healthy. Use a new fix bead with `--job <exec-job>` only when the original executor is dead, context exhausted, or a separate audit trail is required.

Reviewer output must be consumed before publishing. Do not treat job completion as equivalent to acceptance.

## Dependency Mapping

The bead graph should mirror execution order.

Simple chain:

```text
task -> explore -> impl -> review
```

Fix loop:

```text
task -> explore -> impl -> review -> re-review
                      ^        |
                      |        v
                    resume executor with findings
```

Epic:

```text
epic -> shared prep -> impl-a -> review-a
                   -> impl-b -> review-b
                   -> test-batch
                   -> epic merge
```

Use `bd dep add <issue> <depends-on>` so downstream beads are blocked until upstream context exists. Test beads can depend on multiple implementation beads.

## Monitoring

Use `sp ps` instead of ad-hoc polling.

```bash
sp ps
sp ps <job-id>
sp ps --follow
sp feed <job-id>
sp result <job-id>
```

Read results at every stage. For READ_ONLY specialists, output also appends to the input bead notes. If result is empty, inspect feed and rerun or switch specialists before relying on it.

Context percentage in `sp ps`/feed is an action signal:

- 0-40%: healthy.
- 40-65%: monitor.
- 65-80%: steer toward conclusion.
- Above 80%: finish, summarize, or replace the job.

## Steering And Resume

Use `steer` for running jobs:

```bash
sp steer <job-id> "Stop broad audit. Answer only the three questions in the bead."
```

Use `resume` for waiting keep-alive jobs:

```bash
sp resume <job-id> "Reviewer PARTIAL. Fix only findings 1 and 2; do not refactor."
```

Do not use `resume` as a substitute for a missing bead contract on a new tracked task. Create or update the bead first.

## Merge Rules

Standalone chain:

```bash
sp merge <chain-root-bead>
```

Epic-owned chains:

```bash
sp epic status <epic-id>
sp epic merge <epic-id>
```

Rules:

- Merge only after reviewer `PASS`.
- Use `sp epic merge` for unresolved epic chains.
- Do not merge within a chain between executor and reviewer.
- Merge between stages only when later stages need the code on the main line.
- Run or confirm required gates before closing the root bead or epic.

## Epic Lifecycle

Epics are merge-gated identities with a persisted state machine:

```text
open -> resolving -> merge_ready -> merged
                  -> failed
                  -> abandoned
```

| State | Meaning | Chains mergeable? |
| --- | --- | --- |
| `open` | Epic created, chains not yet running. | No |
| `resolving` | Chains actively running. | No |
| `merge_ready` | All chains terminal, reviewer PASS, tsc gate passes. | Yes via `sp epic merge` |
| `merged` | Publication complete. | — |
| `failed` | One or more chains failed. | Resolve or abandon. |
| `abandoned` | Cancelled without merge. | — |

Operator transitions:

```bash
sp epic resolve <epic-id>              # open -> resolving (marks epic as merge-ready target)
sp epic merge <epic-id>                # merge_ready -> merged (canonical publication)
sp epic merge <epic-id> --pr           # PR mode (publish via pull request)
sp epic sync <epic-id> --apply         # reconcile DB vs live job state when stuck
sp epic abandon <epic-id> --reason <t> # terminal close for unrecoverable epic
sp epic abandon <epic-id> --reason <t> --force  # force when active pointers still exist
```

`sp merge <chain>` refuses if the chain belongs to an unresolved epic. Use
`sp epic merge` for epic-owned chains.

## Concurrency And Force Flags

Edit-capable specialists (MEDIUM/HIGH permission) are blocked from entering a
workspace while the owner job is `starting` or `running`. This prevents
concurrent file corruption. READ_ONLY specialists (explorer, etc.) are always
allowed.

Override with `--force-job` only when the caller explicitly accepts the write
race (e.g. emergency fix into a stalled-but-not-terminal executor):

```bash
sp run executor --bead <fix-bead> --job <stalled-exec-job> --force-job --context-depth 2 --background
```

Do not use `--force-job` as a routine unblock. Inspect `sp ps <job-id>` and
prefer `sp stop <job-id>` on truly dead jobs first.

## Terminology Bridge

Historical conversations and docs use "waves" for dispatch batches (e.g. "Wave
1" / "Wave 2"). "Waves" are human shorthand only — not persisted. The
merge-gated identity is the epic. Map mental models as follows:

| Legacy speech | Canonical concept |
| --- | --- |
| "Wave 1" / prep wave | Stage 1 / shared prep job, `--epic` for membership |
| "Wave 2" | Implementation chains under one epic |
| "Between waves merge" | `sp epic merge <epic-id>` |
| "Parallel in wave" | Parallel chains under the same epic (disjoint scopes) |

Treat "wave" as speech, "epic" as truth.

## Failure Handling

If a job fails or stalls:

```bash
sp ps <job-id>
sp feed <job-id>
sp result <job-id>
sp doctor
```

Then choose one action:

- Steer a running job back to scope.
- Resume a waiting job with exact next instruction.
- Stop a dead or obsolete job.
- Rerun with a better bead contract.
- Switch specialist if the selected role was wrong.
- Report blocker if destructive/high-risk/manual action is required.

Do not silently fall back to doing substantial specialist work yourself unless the user agrees or the work is genuinely small and deterministic.

## Recovery Cheatsheet

Dead or zombie process:

```bash
sp stop <job-id>
specialists clean --processes
```

Epic state unclear:

```bash
sp epic status <epic-id>
sp epic sync <epic-id> --apply
```

Specialist missing or config skipped:

```bash
specialists list
specialists doctor
```

Worktree already exists:

```text
Rerun with the same bead if it is safe; worktree is reused rather than recreated.
```

Reviewer cannot enter job workspace:

```text
Check target job status with sp ps. MEDIUM/HIGH jobs are blocked from entering a running write-capable workspace unless forced.
```

Explorer produced empty output:

```text
Inspect feed. If no usable final summary exists, rerun with a clearer explorer bead or switch to debugger/planner as appropriate.
```

## What Not To Put In This Skill

Do not add historical migration notes, stale model names, exhaustive command references, internal token counts, long stuck-state postmortems, or title-only examples. Put long reference material in docs and keep this skill focused on current canonical orchestration.
