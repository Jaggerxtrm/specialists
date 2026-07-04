---
name: using-specialists-v3
description: >
  Canonical specialist orchestration skill. Use proactively for substantial work
  that should be delegated, tracked, reviewed, fixed, tested, or merged through
  specialists: code review, debugging, implementation, planning, doc sync,
  security checks, multi-step chains, integration-phase reconciliation,
  debugger-restitch on conflicting chains, pre-dispatch conflict-cluster
  mapping, test-failure-map epics, and questions about specialist workflow.
version: 3.7
---

# Using Specialists v3

You are the orchestrator. Turn user intent into a strong bead contract, choose right specialist from live registry, launch chain, monitor it, consume results, drive fixes, and publish through specialist merge path.

Keep skill practical. Core behavior belongs here; volatile detail stays in live commands.

> **MANDATORY — Run on skill load and before every new substantial task or epic:**
> ```bash
> specialists list --full
> ```
> Do not rely on remembered roles, models, or permissions. The registry is the source of truth.
> Run it again before dispatching any new chain or starting any epic — specialists change between sessions.

## Specialist File Locations

Specialists live in three layers. Know which layer you are reading or editing:

| Layer | Path | Purpose |
|-------|------|---------|
| Package (shipped) | `config/specialists/*.specialist.json` | Canonical role definitions; versioned with the repo |
| User override | `.specialists/user/*.specialist.json` | Per-project customizations; wins over package layer for same name |
| Default mirror | `.specialists/default/*.specialist.json` | Repo-managed mirror of package defaults; overrides package fallback |

The loader resolves in priority order: user → default-mirror → package. A same-name file in `.specialists/user/` fully replaces the package version for that specialist. When creating or editing a specialist, use `config/specialists/` for shipped roles and `.specialists/user/` for project-specific overrides. Never edit `.specialists/default/` by hand — it is managed by `update-specialists`.

`specialists list --full` shows the resolved set (which layer each specialist comes from) so you always know what will actually run.

### Editing Specialist Fields: `sp edit` Is Required

Direct JSON editing is error-prone and bypasses schema validation. Use `sp edit` for all field changes — it validates dot-paths, handles array append/remove, and writes to the correct layer.

```bash
# Read a field
sp edit executor --get specialist.execution.model

# Set a field (schema-validated)
sp edit executor specialist.execution.model <model-id>

# Set prompt.system or task_template from a file (required for multi-line content)
sp edit executor --set specialist.prompt.system _ --file ./my-system-prompt.txt

# Append or remove tags
sp edit executor --set specialist.metadata.tags review,security --append
sp edit executor --set specialist.metadata.tags old-tag --remove

# Apply a named preset (run sp edit --list-presets for current options)
sp edit executor --preset power
sp edit executor --preset cheap --dry-run   # preview first

# Target a specific scope when name exists in multiple layers
sp edit executor --scope user --set specialist.execution.model <model-id>

# Bulk read across all specialists
sp edit --all --get specialist.execution.model
```

**When `sp edit` is required vs. direct JSON edit:**
- Model, thinking level, timeout, tags, permission, description → always `sp edit`
- `prompt.system` or `task_template` longer than one line → `sp edit --file`
- Structural schema fields (execution flags, output_schema) → `sp edit` with dot-path
- Net-new specialist creation → `specialists-creator` skill, then `sp edit` for tuning
- Bulk cross-specialist reads → `sp edit --all --get <path>`
- Available presets → `sp edit --list-presets` (do not hardcode; varies by install)

## Orchestration Discipline (Paranoid Mode)

You are an orchestrator, not a hero. Move slowly enough to be correct.

- Run `specialists list --full` and `sp help` again at the start of every new substantial task. Do not skip because "you remember." Roles, models, and flags drift between sessions.
- Re-read the bead before dispatch. If you cannot defend each contract field out loud, the bead is not ready.
- Never dispatch a chain you cannot describe end-to-end (which specialist, which bead, which workspace, which merge target).
- Verify worktree and job state before and after each dispatch with `sp ps` and `git worktree list`. Drift is silent until merge.
- Treat reviewer `PARTIAL` and seconder `FINDINGS` as mandatory fix loops, not advisory noise.
- When unsure, prefer extra explorer/debugger passes over an over-eager executor. Wrong code merged is more expensive than slow research.

## Project-Specific Specialists

Users define their own specialists in `.specialists/user/*.specialist.json` to fit project shape (domain knowledge, language, framework, conventions). These override package defaults and may not match generic role descriptions.

- Always run `specialists list --full` to see the resolved set, including project-specific roles, before choosing.
- Read `sp help` and the specialist's description/tags to confirm fit. Do not assume a name maps to its package-default behavior — a `.specialists/user/` override may have a different prompt, model, or scope.
- Pick the project-specific specialist when its role matches the task shape. Do not fall back to a generic role just because it is more familiar.
- If the task does not match any project-specific role, use the package default and consider whether a new project-specific specialist would help (use `specialists-creator` skill).

## Mandatory Gates: Seconder, Obligations, Security (Iron-style)

For any substantive production diff, the chain shape is the canonical pipeline from [`docs/design/chain-templates.md` §2](../../../docs/design/chain-templates.md#2-the-canonical-pipeline):

```
writer (executor/debugger) → seconder → test-engineer → test-runner → security-auditor (if surface) → obligations-scanner → reviewer → Release Checklist
```

Reviewer consumes final QA evidence together with Iron gates: test-engineer output, test-runner classification, smoke/E2E proof, telemetry/log assertions, obligations-scanner, and security-auditor when applicable.

`seconder`, `test-engineer`, `test-runner`, `obligations-scanner`, and `reviewer` are mandatory on production diffs (shipped via Opp 14 / `unitAI-sfwe1` + Opp 15 / `unitAI-4e194`). `security-auditor` is mandatory when the diff touches a sensitive surface. Reviewer follows canon §2.2 SCRUTINY as a chain-property, not reviewer input.

### Seconder Gate — `seconder`

Mandatory READ_ONLY scope/compliance + smell/type-safety/simplicity dual-verdict gate (canon §2.3). Every change gets one cheap second pair of eyes before QA and reviewer. If `overall_verdict` is FAIL or UNCLEAR where not allowed, route back to writer.

- Skip permitted ONLY for: test-only diffs (entirely under `test/`, `tests/`, `__tests__/`, `*.spec.*`, `*.test.*`, `*.fixture.*`) or new-file-only diffs (no modifications to existing symbols).
- Any other skip = escalation event. Small diffs hide the worst regressions.

### Obligations Gate — `obligations-scanner`

Mandatory READ_ONLY marker scan. Catches new TODO/FIXME/HACK/XXX/TEMP/WIP/NOTE(release) in production code that would otherwise leak unaccounted. Cheap (<30s, gpt-5.4-mini, bare).

- Accepts structured `// TODO(<bead-id>): reason` markers if the linked bead exists and is in current bead's NON_GOALS.
- Rejects unstructured markers in production code → reviewer issues PARTIAL "obligation: must resolve or accept".
- Markers under test/fixture/mock/e2e/docs paths are noted but never block.

The scanner produces JSON; the reviewer consumes its output directly via job feed.

### Security Gate — `security-auditor`

Mandatory when diff touches: auth, secrets, input handling (user/network/file), dependency lockfiles, agent/MCP/config surfaces, token-storage paths, migrations, permissions/hooks. Scan-only; recommendations only; executor applies fixes.

- Never skip on sensitive-surface diff "because the diff looks small."
- Auto-triggered by reviewer's SCRUTINY auto-escalation table when surface patterns match.

### Dispatch mechanics for all three gates

All run with their own bead and `--job <exec-job>` so they enter the executor workspace.

Routing across chain phases:

- **Per-chain dispatch**: gates run on the chain's job in canon order: seconder → test-engineer → test-runner → security-auditor (if surface) → obligations-scanner → reviewer. Seconder FAIL/UNCLEAR routes back to writer; test-runner misclassifications route to test-engineer or writer per canon §2.5.
- **Debugger-restitch**: same gate order on the debugger's job AFTER the restitch turn, BEFORE reviewer.
- **E2E smoke phase**: cross-cutting security-auditor on cumulative integrated diff if any landed chain touched a sensitive surface.
- **Reviewer rebuttal**: seconder OK and security-auditor "no findings" are legitimate evidence in reviewer rebuttals (cite the advisory job id).

## Monitoring Long-Running Jobs: Sleep Timers Are Mandatory

Specialists run async. You will lose the chain if you do not actively monitor it.

**Required pattern after every dispatch:**

```bash
sp run <role> --bead <id> --background ...   # dispatch
sleep 10 && sp ps                             # confirm started
```

Then cycle sleeps based on average completion time per role, checking `sp ps` each cycle:

| Role | Typical duration | Initial sleep cycle |
|------|------------------|---------------------|
| sync-docs, changelog-keeper | 60–180s | `sleep 60` then `sleep 60` |
| seconder, security-auditor | 60–180s | `sleep 60` then `sleep 60` |
| reviewer | 90–240s | `sleep 90` then `sleep 60` |
| explorer, debugger, planner, overthinker | 120–300s | `sleep 120` then `sleep 90` |
| executor | 180–600s+ | `sleep 180` then `sleep 120` |
| test-runner | varies with suite | start at `sleep 120`, adjust |

Rules:
- After dispatch, **always** `sleep 10 && sp ps` first to confirm the job is `running`, not stuck in `queued` or already `failed`.
- Then sleep again per the table; check `sp ps` each cycle.
- Do not poll faster than every 30s after the initial check — it wastes context.
- When status flips to `completed`, run `sp result <job-id>` immediately to consume output before context grows.
- If a job exceeds 2× its typical duration without completing, inspect with `sp feed <job-id>` before assuming hang.

You are not "done" until every dispatched job is `completed` or `failed` and consumed.

## Worktree Cleanup After Merge

Merge is now manual (see `Merge And Publication` below). You own cleanup after every merge.

After every merge, verify:

```bash
git worktree list                 # any orphaned worktrees from this session?
sp ps                             # any leftover jobs?
git worktree prune                # drop stale worktree metadata
```

Always remove the merged feature/epic worktree explicitly:

```bash
git worktree remove <path>
git branch -d <merged-branch>     # only after confirming merged into target
```

`sp ps` must have no active jobs and no unresolved terminal problems before session close. If it only shows old terminal history that you have intentionally acknowledged, run `sp clean --ps --dry-run` and then `sp clean --ps` to soft-hide those rows from the default dashboard. This does not delete SQLite history or change job status; use `sp ps --include-cleaned` or `sp ps --all` for audit visibility. Stale worktrees and stale jobs both block future dispatches.

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
14. Before dispatching any chain whose work depends on prior chain output, verify git state per the Git State Precondition section: `git status` clean, HEAD contains prior chain commits, no orphaned worktrees. Stale-base dispatch produces guaranteed debugger-restitch loops downstream.
15. Never dispatch a specialist against a bead tagged `contract:draft` (`bd state <id> contract` returns `draft` or nothing). Promote it first — see Draft Beads And The Promotion Gate. A draft is a sanctioned capture format, not a shortcut around bead quality.

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

## Live Registry And Help

Use live registry for role details, permissions, current models, and skills:

```bash
specialists list --full
```

Use help for command flags and subcommands:

```bash
sp help
sp run --help
sp ps --help
sp feed --help
sp result --help
sp resume --help
sp steer --help
sp stop --help
```

Do not rely on stale remembered flags when help is available. (Omitted: `sp finalize`, `sp merge`, `sp epic` — see rule #9. They exist in the binary but the skill prohibits their use.)

## Writing Bead Contracts Well

Bead quality controls specialist quality. A title-only bead produces wandering output because specialist has no contract to optimize against. Write contract before dispatch. Tighten vague scope before launch.

Bad bead:

```text
TITLE: Fix bug
PROBLEM: Something is broken.
SUCCESS: It works.
SCOPE: src/
NON_GOALS: N/A
CONSTRAINTS: Be careful.
VALIDATION: Tests pass.
OUTPUT: Done.
```

Good bead:

```text
TITLE: Fix feed cursor regression in sp result
PROBLEM: specialists feed follow skips events after restart because cursor tracks count, not last seq.
SUCCESS: feed follow resumes from last seen seq; result still reads terminal output.
SCOPE: src/cli/feed.ts, src/cli/result.ts, tests/unit/cli/feed.test.ts
NON_GOALS: No new runtime format, no DB schema change, no unrelated poll changes.
CONSTRAINTS: Preserve existing job IDs, keep backwards-compatible CLI output, avoid file-based fallback drift.
VALIDATION: Add regression test for restart resume; run targeted CLI tests.
OUTPUT: Changed files, test evidence, residual risks.
```

Fix three bad smells fast:

- Title-only bead. Add problem, scope, validation, output.
- Vague SCOPE like `src/`. Name files, symbols, or bounded docs.
- Missing VALIDATION. Say what proves done, not just that work is “finished.”

What differs: orchestrator writes contract before dispatch, so specialist does less guessing and more useful work.

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

## Dependency Linking And Relationship Vocabulary

Link beads with correct edge shape. The edge tells orchestrator what blocks execution, what only preserves context, which bead verifies another, and which issue has been replaced. Do not overload `blocks` for follow-ups, root-cause links, verification pairs, duplicates, or restitch replacements.

Core commands:

- `bd dep add <issue> <depends-on>`: issue depends on depends-on; depends-on blocks issue. Default type is `blocks`. Use only for hard sequencing. [source: bd dep add --help]
- `bd dep <blocker> --blocks <blocked>`: reverse phrasing of the same hard sequencing edge. [source: bd dep --help]
- `bd dep add <issue> <other> --type <type>`: store a typed relationship. Supported types: `blocks`, `tracks`, `related`, `parent-child`, `discovered-from`, `until`, `caused-by`, `validates`, `relates-to`, `supersedes`. [source: bd dep add --help]
- `bd dep relate <a> <b>` / `bd dep unrelate <a> <b>`: bidirectional non-blocking `relates_to` link. Use for context, not order. [source: bd dep --help]
- `bd create --parent <bead-id>`: hierarchical child edge; auto-names child `<parent>.1`, `<parent>.2`, … and nests recursively — a child's own child becomes `<parent>.1.1`. `<bead-id>` can be an epic, a plain task, or an already-nested child; bd does not restrict `--parent` by issue type (`bd create --help` describes it generically as "Parent issue ID for hierarchical child"). [source: bd create --help]
- `bd create --deps discovered-from:<id>` or `bd dep add <new> <source> --type discovered-from`: follow-up work discovered from a source bead.
- `bd duplicate <new> --of <canonical>`: close duplicate issue and point at canonical. Use when two beads describe the same required work.
- `bd duplicates` / `bd find-duplicates --status open --method ai --json`: find exact or semantic duplicates before dispatching parallel chains.
- `bd supersede <old> --with <new>` or `bd dep add <new> <old> --type supersedes`: mark a replacement when a better-scoped fix bead replaces an obsolete/abandoned one.
- `bd dep cycles`, `bd dep tree <id>`, and `bd graph <id>`: sanity-check the execution graph before merge/publication.

**Default to nesting, not loose beads.** When a chain is dispatched to service an existing bead — a top-level task, an epic, or an already-nested child like `bd-x.1` — create the new bead with `bd create --parent <that-bead>` so it inherits the next sequential child ID (`bd-x.1`, or `bd-x.1.1` if the parent is itself a child). This applies uniformly, not only under epics — the common failure mode is orchestrators treating `--parent` as epic-only and defaulting every explorer/executor/reviewer/seconder/security bead spawned mid-chain to a loose top-level bead linked solely by a typed dep. `--parent` (hierarchy/ID) and a typed `bd dep add ... --type <blocks|validates|discovered-from>` edge (semantic relationship) are independent flags — combine both when the relationship needs naming beyond parentage. Only skip `--parent` when the new bead is a genuine standalone sibling concern, not work done on behalf of the bead it services.

Relationship vocabulary for specialist chains:

| Relationship | Reach for it when | Example command |
| --- | --- | --- |
| `blocks` | Hard must-happen-before sequencing: planner before executor, implementation before reviewer, restitch before publish. | `bd dep add <impl> <plan> --type blocks` |
| `tracks` | A local bead mirrors upstream or cross-project work whose status matters but is not owned here. | `bd dep add <local> external:xtrm-tools:<capability> --type tracks` |
| `related` | Loose topical association when no direction or scheduling effect is intended. Prefer `bd dep relate` for bidirectional relation. | `bd dep add <a> <b> --type related` |
| `parent-child` | Any bead spawns tracked child work — epic owning chains, a task spawning its explorer/executor/reviewer, or an already-nested child spawning its own sub-chain. Prefer `bd create --parent <bead>` (not only `<epic>`) so IDs nest and parentage stays canonical instead of drifting into loose top-level beads. | `bd create --parent <bead-id> --title "executor: Impl auth retry" ...` |
| `discovered-from` | Reviewer, debugger, explorer, or test-runner surfaces new follow-up work from a run. | `bd dep add <follow-up> <reviewer-bead> --type discovered-from` |
| `until` | Time-bounded or event-bounded precondition that blocks only until a stated condition lands. | `bd dep add <chain> <precondition> --type until` |
| `caused-by` | Failure bead points to the root-cause bead/cluster that explains it. Makes test-failure-map epics navigable. | `bd dep add <failing-test> <root-cause> --type caused-by` |
| `validates` | Reviewer, test-runner, seconder, or security-auditor bead verifies an implementation/debugger bead. | `bd dep add <review> <impl> --type validates` |
| `relates-to` | Bidirectional context edge for conflict clusters, sibling designs, or rebuttal patterns. Prefer dedicated relate command. | `bd dep relate <chain-a> <chain-b>` |
| `supersedes` | New fix/design/restitch bead replaces an older bead that should no longer be executed or merged. Prefer `bd supersede`. | `bd supersede <old> --with <new>` |

Worked high-value patterns:

```bash
# Reviewer discovers a separate follow-up during review. Do not block the impl.
bd create --title "Follow up: tighten retry metrics" --type task --priority 3 --description "..."
bd dep add <follow-up> <review> --type discovered-from

# Test-failure-map root cause: many failures point at one underlying issue.
bd create --title "Root cause: stale fixture factory" --type bug --priority 2 --description "..."
bd dep add <failing-test-bead> <root-cause> --type caused-by

# Verification bead validates implementation. This is not a hard prerequisite edge.
bd dep add <test-runner-bead> <impl> --type validates
bd dep add <reviewer-bead> <impl> --type validates

# Replacement bead supersedes an abandoned or wrongly scoped implementation.
bd create --title "Restitch auth retry onto integration state" --type task --priority 2 --description "..."
bd supersede <old-impl> --with <restitch>

# Before merging an epic or integration branch, prove the graph is sane.
bd dep cycles
bd graph <epic> --compact
```

Use each form for a different reason:

- `blocks` / `--blocks` for must-happen-before dependency only.
- `validates` for review, test, sanity, and security evidence.
- `discovered-from` for spawned follow-up beads.
- `caused-by` for failure-to-root-cause attribution.
- `relates-to` / `bd dep relate` for soft linkage with no schedule effect.
- `parent-child` / `--parent` for hierarchy and child naming — use for any bead spawned to do work on behalf of another bead, not only epic ownership. Nests recursively: a chain dispatched from an already-nested child (e.g. `bd-x.1`) becomes `bd-x.1.1`, not a new loose top-level bead.
- `supersedes` / `bd supersede` for replacement work; `duplicate` for same-work issues.

Cross-repo consistency: keep this vocabulary aligned with the xtrm-tools triaging skill and sibling triage bead `xtrm-drkk`; both should use the same relationship names when rewiring issue graphs.

What differs: orchestrator chooses edge type deliberately, so graph stays correct for chain execution, epic publish, duplicate cleanup, root-cause navigation, verification evidence, and follow-up traceability.

## Bead Contract By Bead Type

Use shape that fits specialist.

> **SCRUTINY field is universal.** Every substantive bead should carry `SCRUTINY: none|low|medium|high|critical` at creation. It is a chain-property, not reviewer behavior; it controls chain structure and gate strictness per the SCRUTINY taxonomy section and canon §2.2. Reviewer may auto-escalate but never lower it. Canon refs: §2.2, §2.3, §2.5, §2.6.

Task/epic bead:

```text
PROBLEM: User-facing or project-facing objective.
SUCCESS: End-state across all child beads.
SCRUTINY: none|low|medium|high|critical    # required at creation; chain-property, not reviewer input
SCOPE: Area of project affected.
REFERENCES: Optional files, skills, or docs specialist reads only if work needs them.
NON_GOALS: Boundaries for entire effort.
CONSTRAINTS: Sequencing, compatibility, branch/merge rules.
VALIDATION: Final checks before close.
OUTPUT: What orchestrator reports back.
```

`SCOPE` is always loaded as context. `REFERENCES` is progressive disclosure: name what exists, but do not force load unless task needs it. Use this when a file would bloat payload today, like citing a huge skill file in scope and dragging in all lines before specialist even knows it must read them.

Example:

```text
SCOPE: config/skills/using-specialists-v3/SKILL.md, docs/specialists/handoff-schema.md
REFERENCES: config/skills/prompt-improving/SKILL.md (xml_core conventions), sibling beads per-turn-handoff-schema and bead-id-verbatim once landed
```

Explorer bead:

```text
PROBLEM: What is unknown.
SUCCESS: Questions answered with evidence.
SCOPE: Code areas, docs, commands, or symbols to inspect.
NON_GOALS: No implementation, no broad audit outside scope.
CONSTRAINTS: READ_ONLY, cite files/symbols/flows.
VALIDATION: Findings cite evidence.
OUTPUT: Findings, risks, recommended implementation track, stop condition.
```

Debugger bead:

```text
PROBLEM: Symptom, regression, or failing test.
SUCCESS: Root cause plus minimal fix path.
SCOPE: Logs, reproduction, code paths, and related tests.
NON_GOALS: No broad refactor.
CONSTRAINTS: Preserve behavior outside fault line.
VALIDATION: Repro steps and diagnosis.
OUTPUT: Root cause, fix options, confidence, remaining unknowns.
```

Executor bead:

```text
PROBLEM: Exact behavior or artifact to change.
SUCCESS: Observable acceptance criteria.
SCRUTINY: none|low|medium|high|critical    # required at creation; chain-property, not reviewer input
SCOPE: Target files/symbols; include do-not-touch boundaries.
NON_GOALS: Related improvements explicitly excluded. (Include any accepted in-code obligation markers tracked in follow-up beads.)
CONSTRAINTS: API compatibility, style, migrations, safety.
VALIDATION: Lint/typecheck/tests or manual checks.
OUTPUT: Changed files, verification, residual risks.
```

Reviewer bead:

```text
PROBLEM: Verify executor output against requirements.
SUCCESS: PASS only if requirements + validation + Release Checklist satisfied.
SCRUTINY: none|low|medium|high|critical    # required at creation; chain-property, not reviewer input
SCOPE: Executor job, diff, task bead, acceptance criteria.
NON_GOALS: Do not rewrite unless explicitly asked.
CONSTRAINTS: Code-review mindset; findings first; emit Release Checklist.
VALIDATION: Run or inspect required checks; consume obligations-scanner output.
OUTPUT: PASS/PARTIAL/FAIL with file/line findings + Release Checklist block.
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

Sync-docs bead:

```text
PROBLEM: Exactly one doc drifted from source truth.
SUCCESS: One doc updated and drift checked clean.
SCOPE: One doc only.
NON_GOALS: No source-code rewrite.
CONSTRAINTS: Keep doc and source aligned.
VALIDATION: Drift scan or bounded source cross-check.
OUTPUT: Updated doc, drift evidence, remaining doc gaps.
```

What differs: orchestrator gives each specialist a contract shape that matches job, so role stays narrow and reviewable.

For evidence-heavy or multi-item beads, let `SCOPE`, `CONSTRAINTS`, and `EXAMPLES` carry opt-in XML tags. Follow prompt-improving `xml_core` style: wrap only the subpart that needs structure, not whole bead. Example: a debugger bead can put stack trace lines in `<evidence>` and do-not-touch items in `<constraints>`, so specialist can scan facts fast without turning every field into markup.

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

## Bug Diagnosis Chain

For symptoms, errors, regressions, flakes, or failing tests where cause is unknown, start with diagnosis — not implementation. Do not dispatch executor while cause is unknown; executor is for clear implementation scope only.

Default chain:

1. **test-runner** or **debugger** establishes a fast deterministic feedback loop. If no loop can be built, debugger reports the blocker — do not patch in the dark.
2. **debugger** reproduces the symptom, writes 3–5 falsifiable hypotheses, and tests one variable at a time. Any temporary instrumentation must be tagged `[DEBUG-<id>]` and removed before completion.
3. **debugger** applies the minimal root-cause fix on the fault line and verifies via targeted lint/typecheck plus the focused repro.
4. **test-runner** reruns the original repro/regression command (full-suite validation is its job, not debugger's).
5. **seconder** runs if the fix smells brittle, overcomplicated, or type-risky. **security-auditor** runs if the fix touches auth/session/secrets/input handling, dependency logic, or agent/MCP/hook config.
6. **reviewer** gates the final diff against the bead contract.
7. If no correct regression-test seam exists, route the architecture/testability finding to **overthinker** or **planner** — do not force a brittle test just to close the loop.

Explorer is useful before diagnosis only when no concrete symptom exists and architecture is unknown. For real bugs with a symptom, use debugger.

## Seconder

The mandatory post-writer gate (canon §2.3): one READ_ONLY dual-verdict pass over the writer's diff that checks **scope/compliance** (does the diff satisfy the bead contract sections?) and **implementation quality** (complexity, duplication, type safety, brittle async/error handling) together, before test-engineer and reviewer.

Bead shape:

```text
PROBLEM: Verify the writer diff satisfies the bead contract and is implementation-sound before expensive QA.
SUCCESS: Dual-verdict isolates any scope or quality issue, or confirms the diff is clean.
SCOPE: Writer diff, risky files, and any nearby helpers.
NON_GOALS: No edits, no broad refactor, no release blessing, no security audit, no broad reviewer phase-2.
CONSTRAINTS: READ_ONLY, keep feedback cheap, cite exact sections/lines/symbols.
VALIDATION: scope_verdict + quality_verdict + overall_verdict with concrete findings.
OUTPUT: JSON dual-verdict (scope_verdict / scope_findings / quality_verdict / quality_findings / overall_verdict).
```

The chain reducer reads `overall_verdict`: PASS advances to test-engineer; FAIL routes back to the writer. Hand findings back with `sp resume <exec-job> "Seconder overall_verdict=FAIL — scope: ...; quality: ..."`.

A seconder PASS is the upstream scope gate for the reviewer; it is not itself a reviewer PASS.

What differs: orchestrator uses seconder as cheap smell screen, not as merge gate.

## Security-auditor

Use security-auditor when diff touches auth, secrets, input handling, dependency logic, or agent/config surfaces. Keep it advisory and scan-only.

Bead shape:

```text
PROBLEM: Diff may open auth, secrets, input, dependency, or agent-config risk.
SUCCESS: Findings isolate real security concern or confirm no obvious issue.
SCOPE: Executor diff, touched configs, and security-relevant paths.
NON_GOALS: No edits, no package updates, no destructive scans, no live exploit tests.
CONSTRAINTS: LOW permissions, scan-only, recommendations only.
VALIDATION: Findings cite risk surface and why it matters.
OUTPUT: Recommendations for executor to apply in a separate bead.
```

Use `sp resume <exec-job> "Security findings: ..."` or `sp resume <exec-job> "Security scan clean; continue to reviewer."`.

No findings is not reviewer PASS. Executor still applies fixes if any, then reviewer decides publish.

What differs: orchestrator uses security-auditor to surface risk early, not to bless merge.

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

## Canonical Single-Chain Flow

Use for one implementation branch.

```bash
# 1. Create or claim root task bead with complete contract
bd create --title "Fix token refresh retry" --type task --priority 2 --description "PROBLEM: login and refresh flow have a retry bug when transient token refresh fails before backoff clears stale state. SUCCESS: token refresh retries once, login survives transient failure, and terminal failure stays clear. SCOPE: src/auth/refresh.ts, src/cli/login.ts, tests/unit/auth/refresh.test.ts. NON_GOALS: no auth provider redesign, no storage migration, no UI changes. CONSTRAINTS: preserve token format, keep error text backward-compatible, avoid broad retry changes outside auth flow. VALIDATION: add regression test for fail-then-succeed path and run targeted auth tests. OUTPUT: changed files, test proof, residual risks."
bd update <task> --claim

# 2. Optional discovery when path is unknown — nested under task (bd-x.1) + typed edge for relationship semantics
bd create --parent <task> --title "explorer: map auth refresh path" --type task --priority 2 --description "PROBLEM: token refresh retry path is undocumented and likely drifts on failure handling. SUCCESS: evidence-backed plan names exact files, symbols, and risk. SCOPE: src/auth/refresh.ts, src/cli/login.ts, tests/unit/auth/*.test.ts. NON_GOALS: no implementation, no broad audit. CONSTRAINTS: READ_ONLY, cite files/symbols/flows, stay within live repo evidence. VALIDATION: findings cite code path and recommended sequence. OUTPUT: tracked discovery plan with stop condition."
bd dep add <explore> <task> --type discovered-from
specialists run explorer --bead <explore> --context-depth 3
specialists result <explore-job>

# 3. Implementation — nested under task (bd-x.2)
bd create --parent <task> --title "executor: implement token refresh retry" --type task --priority 2 --description "PROBLEM: login fails after transient token refresh error because retry path returns before backoff and clear error state. SUCCESS: retry waits once, preserves session on success, and surfaces final failure clearly. SCOPE: src/auth/refresh.ts, src/cli/login.ts, tests/unit/auth/refresh.test.ts. NON_GOALS: no auth redesign, no storage migration, no UI refresh. CONSTRAINTS: preserve existing token format, keep backward-compatible error text, avoid broad retry changes elsewhere. VALIDATION: add regression test for transient failure then success; run targeted auth tests. OUTPUT: changed files, test evidence, residual risks."
bd dep add <impl> <explore-or-task> --type blocks
specialists run executor --bead <impl> --context-depth 3
specialists result <exec-job>

# 4. Advisory passes when diff smells risky — nested under impl (bd-x.2.1, bd-x.2.2), since they service impl's diff specifically
bd create --parent <impl> --title "seconder: sanity check token retry diff" --type task --priority 2 --description "PROBLEM: auth retry diff has control-flow and state-handling smell that could hide bug. SUCCESS: findings identify concrete simplification or confirm clean shape. SCOPE: executor diff in auth refresh and login flow. NON_GOALS: no edits, no merge gate decision. CONSTRAINTS: READ_ONLY, keep feedback cheap, cite exact lines or symbols. VALIDATION: findings name concrete improvement or say OK. OUTPUT: FINDINGS with severity or OK with caveats."
bd dep add <sanity-bead> <impl> --type validates
specialists run seconder --bead <sanity-bead> --job <exec-job> --context-depth 3

bd create --parent <impl> --title "security-auditor: scan token retry diff" --type task --priority 2 --description "PROBLEM: auth refresh code touches secrets and session handling, so security regression is possible. SUCCESS: findings isolate real risk surface or confirm no obvious issue. SCOPE: executor diff in auth, token storage, and login path. NON_GOALS: no edits, no package updates, no destructive scans, no live exploit tests. CONSTRAINTS: LOW permissions, scan-only, recommendations only. VALIDATION: findings cite auth/secrets/input surface and why it matters. OUTPUT: recommendations for executor to apply in separate bead."
bd dep add <security-bead> <impl> --type validates
specialists run security-auditor --bead <security-bead> --job <exec-job> --context-depth 3

# 5. Final review — nested under impl (bd-x.2.3)
bd create --parent <impl> --title "reviewer: verify token refresh retry" --type task --priority 2 --description "PROBLEM: verify executor output against auth retry requirements. SUCCESS: PASS only if retry behavior, error handling, and tests satisfy contract. SCOPE: executor job, diff, acceptance criteria, and target auth files. NON_GOALS: do not rewrite unless explicitly asked. CONSTRAINTS: code-review mindset; findings first; verify security and sanity findings were handled. VALIDATION: inspect targeted checks and regression coverage. OUTPUT: PASS/PARTIAL/FAIL with file/line findings."
bd dep add <review> <impl> --type validates
specialists run reviewer --bead <review> --job <exec-job> --context-depth 3
specialists result <review-job>

# 6. Close any waiting keep-alive specialists explicitly
sp ps                              # confirm which jobs are still waiting
sp stop <waiting-job-id>           # repeat per waiting job

# 7. Publish via manual git merge (rule #9 — sp merge is prohibited)
git checkout master
git pull --ff-only origin master
git merge --no-ff feature/<impl-bead>-<slug> -m "Merge <impl-bead>: <summary>"
git push origin master
git worktree remove <chain-worktree-path>
git branch -d feature/<impl-bead>-<slug>
bd close <task> --reason "Reviewer PASS; merged to master."
```

Edit-capable specialists with `--bead` auto-provision a clean git worktree. This does **not** provision ignored project dependency artifacts (`node_modules/`, `.venv/`, build caches). If validation tools are missing inside that worktree, have the specialist run the repo's standard bootstrap command (`make bootstrap`, `just setup`, `npm ci`, `uv sync`, etc.) or report that bootstrap is required; do not solve it by tracking dependency directories. `--worktree` is accepted for clarity but usually unnecessary. Use `--job <exec-job>` for reviewer/fix passes that must enter existing executor workspace.

What differs: orchestrator carries full bead contract inline, so downstream specialists inherit the actual job shape, not a title.

## Multi-Chain Epic Flow

Use epic when multiple implementation chains publish together.

```bash
# Epic bead
bd create --title "Epic: auth refresh hardening" --type epic --priority 2 --description "PROBLEM: login and refresh flow have retry drift, weak error surfacing, and unclear follow-up ownership. SUCCESS: epic closes with stable retry behavior, tests, docs, and clean publish. SCOPE: src/auth/*, src/cli/login.ts, tests/unit/auth/*, docs/auth-refresh.md. NON_GOALS: no auth provider swap, no storage migration, no unrelated session revamp. CONSTRAINTS: preserve token format, keep login compatible, sequence risky fixes before merge, use child beads for parallelizable slices. VALIDATION: targeted tests, seconder or security pass if risk appears, final reviewer PASS. OUTPUT: merged chain set with notes on remaining gaps."

# Planner bead — bd-epic.1
bd create --parent <epic> --title "planner: plan auth refresh split" --type task --priority 2 --description "PROBLEM: epic needs disjoint chains before executor starts. SUCCESS: child beads, dependency edges, and file ownership split are explicit. SCOPE: auth refresh epic area. NON_GOALS: no code changes. CONSTRAINTS: keep chains disjoint, identify security-sensitive slice, name review order. VALIDATION: plan names beads and edges. OUTPUT: parallel-ready plan with risk notes."
specialists run planner --bead <plan> --context-depth 3

# Parallel impl beads — bd-epic.2, bd-epic.3
bd create --parent <epic> --title "executor: impl auth retry" --type task --priority 2 --description "PROBLEM: transient refresh failure breaks login flow. SUCCESS: retry path succeeds after one transient failure and preserves session state. SCOPE: src/auth/refresh.ts, tests/unit/auth/refresh.test.ts. NON_GOALS: no UI changes, no storage migration, no unrelated retry framework edits. CONSTRAINTS: preserve error text, keep backoff bounded, avoid side effects outside auth flow. VALIDATION: regression test for fail-then-succeed path. OUTPUT: code diff, test proof, residual risk list."
bd create --parent <epic> --title "executor: impl login handoff" --type task --priority 2 --description "PROBLEM: login CLI does not surface refresh outcome clearly enough for operators. SUCCESS: login shows clear success/failure handoff and no stale token state. SCOPE: src/cli/login.ts, tests/unit/cli/login.test.ts. NON_GOALS: no auth protocol redesign. CONSTRAINTS: preserve CLI flags and error codes, keep output terse. VALIDATION: CLI regression test. OUTPUT: login diff and test evidence."

specialists run executor --bead <impl-a> --context-depth 3
specialists run executor --bead <impl-b> --context-depth 3

# Per-chain review — nested under each impl (bd-epic.2.1, bd-epic.3.1)
bd create --parent <impl-a> --title "reviewer: verify auth retry" --type task --priority 2 --description "..."
bd create --parent <impl-b> --title "reviewer: verify login handoff" --type task --priority 2 --description "..."
bd dep add <review-a> <impl-a> --type validates
bd dep add <review-b> <impl-b> --type validates
specialists run reviewer --bead <review-a> --job <exec-a-job> --context-depth 3
specialists run reviewer --bead <review-b> --job <exec-b-job> --context-depth 3

# Close waiting keep-alive specialists explicitly (per chain)
sp ps                          # see what's still waiting
sp stop <waiting-job-id>       # repeat per waiting job in each chain

# Publish via Cherry-Pick Playbook (canonical multi-chain merge — see Integration Phase section)
bd dep cycles                  # stop if relationship rewiring introduced a cycle
git checkout -b integration/$(date +%Y%m%d)-$EPIC_TAG
# For each PASS chain in dependency order:
git merge --squash feature/<chain-bead>-<slug>
git restore --staged .beads .pi AGENTS.md CLAUDE.md   # noise filter
git commit -m "<type>(<scope>): <summary> (<bead-id>)"
# Operator FF-merges integration → master when satisfied.
```

Use `--epic <id>` when job belongs to epic but bead is not direct child. Avoid parallel executors on same file; sequence them or consolidate work.

What differs: orchestrator splits graph first, then launches parallel work only when file scopes are provably disjoint.

## Review And Fix Loop

A chain stays alive until merged or abandoned.

```text
executor/debugger -> waiting
optional seconder/security-auditor -> advisory findings
reviewer -> PASS | PARTIAL | FAIL
```

- `PASS`: verify expected commit/diff + clean Release Checklist. Close any waiting keep-alive jobs explicitly with `sp stop <job-id>`. Then publish via manual git workflow (per-chain `git merge --no-ff` or Cherry-Pick Playbook for multi-chain epics).
- `PARTIAL`: resume same executor/debugger with exact findings, then re-review (`sp resume <reviewer-job>`).
- `FAIL`: stop and decide whether to replace chain, re-scope bead, or ask operator if judgment is required. If replacing a bad chain with a narrower one, use `bd supersede <failed-impl> --with <replacement>`; if reviewer discovered separate follow-up work, use `bd dep add <follow-up> <reviewer-bead> --type discovered-from`.

Prefer resume over new fix executor when original job is waiting and context is healthy:

```bash
sp resume <exec-job> "Reviewer PARTIAL. Fix only these findings: ..."
```

Do not treat job completion, seconder OK, security no-findings, or test-runner pass as equivalent to reviewer PASS.

What differs: orchestrator uses PASS/PARTIAL/FAIL as real control flow, not just status labels.

## Mini-Flows For Under-Promoted Specialists

Planner:
- Use when epic needs bead split, dependency graph, or file ownership before code starts.
- Bead shape: task/epic contract with clear success criteria, child beads, and edge plan.
- Chain position: first or pre-impl.

Debugger:
- Use when symptom exists and root cause is unclear.
- Bead shape: reproduction, logs, expected vs actual, scope to investigate.
- Chain position: before executor, or after a failing review when cause is unclear.

Overthinker:
- Use for risky design, cross-cutting tradeoffs, or premortem before lock-in.
- Bead shape: options, risks, constraint conflicts, decision asked for.
- Chain position: before planner/executor when design uncertainty is high.

Researcher:
- Dispatch **BEFORE** answering any library/API/framework/CLI question from training data. Training is months stale; APIs change; cheap CLI lookups (`ctx7`, `deepwiki`, `ghgrep`) replace the guess.
- Use for: API syntax checks, config options, version migrations, library-specific debugging, "how do others implement X", recent releases, public repo internals.
- Anti-pattern to break: "I think Library X works like Y…" → instead dispatch researcher with the exact question. The cost (~30s, `openai-codex/gpt-5.4-mini` via tool mode) is far less than shipping wrong API usage.
- Bead shape: source list (which libraries/repos), question set, required citations (library ID or `npx ctx7 docs /org/project "..."` output).
- Chain position: before executor when outside facts matter; alongside explorer when a question mixes local code with external behavior.
- Keep-alive: ask follow-ups in the same job rather than re-dispatching — researcher stays in waiting state after each turn.

Three modes — researcher picks automatically based on bead shape; you write the bead, not the mode:

- **Targeted lookup** (most common): "How do I configure X in library Y v1.2?" / "What does Z.method() return now?" / "Are foo and bar still the canonical replacements for baz?" → researcher resolves library ID via `ctx7 library`, then `ctx7 docs /org/project "<intent-rich query>"`. For repo-specific internals (e.g. "How does Vite handle X internally?"), `deepwiki ask <owner/repo> "..."`.
- **Discovery**: "How do production codebases handle X?" / "Find good examples of pattern Y" / "What does the ecosystem do for Z?" → `ghgrep "<literal pattern>" --lang <langs> --repo <maybe>`, scan results, drill into the best repos with `deepwiki toc` + `deepwiki ask`.
- **Media / discussion-recency** (rare): YouTube transcripts, social-media trends. Triggers on URLs or "what are people saying about X right now". Researcher loads `last30days` skill on-demand for this — don't fold its setup into the bead.

### Dispatch triggers — when the orchestrator should reach for researcher

Concrete agent thoughts that MUST be replaced with a researcher dispatch:

| Agent thought | Researcher bead |
|---|---|
| "I think `useEffect` cleanup works like…" | `ctx7 docs /facebook/react "useEffect cleanup with async operations"` |
| "Next.js app router middleware should be…" | `ctx7 docs /vercel/next.js "app router middleware patterns"` |
| "Let me check if `--target` is a valid flag for tool X" | `ctx7 docs /org/tool-x "--target flag"` or `tool-x --help` (orchestrator-side if it's installed) |
| "Production code probably handles X by…" | `ghgrep "<X-pattern>" --lang TypeScript --limit 5` then `deepwiki ask <best-repo> "<design question>"` |
| "Library Y added feature Z in v3 (I think)" | `ctx7 library <Y> "Z"` → `ctx7 docs /org/Y/<version> "Z"` to verify version + behavior |
| "Repo X's authentication architecture is…" | `deepwiki ask owner/X "How does the auth middleware work? What stores tokens? What controls expiry?"` |
| "Cross-library: do A and B compose like Z?" | `deepwiki ask repo-A repo-B "How do these interact for use-case Z?"` |

If you catch yourself making any of these claims without first dispatching researcher, you are about to ship stale information. Stop and dispatch.

### Cost framing

Researcher runs on `openai-codex/gpt-5.4-mini` via tool mode, keep-alive. Typical turn: 20-40s wall clock, ~$0.005-0.02 per call. The cost of shipping a wrong API call (debugger turn + executor fix + reviewer re-run, or worse, production regression) is orders of magnitude higher. Default to dispatch.

### What researcher does NOT do

- Local code mapping → use `explorer` (READ_ONLY, traces project code without external CLI cost).
- Bug root-cause when symptoms are local → use `debugger`.
- Reading internal docs already in this repo → use direct file read or `explorer`.
- Security audit of third-party packages → use `security-auditor`; researcher's job is the API surface, not the threat model.

Test-runner:
- Use when commands need to run and failures need classification, not fixes.
- Bead shape: exact command list, suites, and expected failure taxonomy.
- Chain position: after executor or between fix loops.

Sync-docs:
- Use when one doc drifts and must be synced to source truth.
- Bead shape: one-doc scope, source cross-check, drift checks.
- Chain position: parallel to code only when doc scope is isolated; otherwise after code settles.

What differs: orchestrator uses specialists beyond the common trio, so planning, diagnosis, research, tests, and docs do not collapse into executor work.

## Specialist Rebuttal As Routine

Several specialists default to over-cautious verdicts when an evidence gate looks unsatisfied. The orchestrator's job is to challenge that verdict with cited evidence, not to accept it. Common rebuttal-worthy patterns:

### Overthinker

- "Hold for operator decision" without specifying what decision is needed → push: "Cite file/line evidence for why this is a product decision rather than a mechanical resolution."
- "Close as superseded by X" without verification → push: "Read the current state of `<file>` and check whether feature Y from this bead is actually present." If verified, record it structurally with `bd supersede <old> --with <new>` instead of burying the replacement in notes.
- "Run separate small beads" or "run one big bead" without rationale → push: "Pick one and explain operationally — cost difference, conflict expectations, reviewer scope." If one big bead wins, mark replaced split beads with `bd supersede`; if the small beads remain parallel siblings, link overlap with `bd dep relate`, not `blocks`.

### Reviewer

- "PARTIAL — missing `gitnexus_impact` evidence" on a test-only diff → rebut: "Diff is entirely under `test/` (N files). `gitnexus_impact` analyzes runtime call graphs; test fixture mocks have no callers in the production graph. Bead's impact-gate constraint is conditional on modifying a runtime entrypoint, which did not happen here."
- "PARTIAL — missing `gitnexus_impact`" on a small LOW-blast-radius production diff where executor used `gitnexus_detect_changes` instead → rebut: cite the executor's `impact_report.highest_risk: LOW`, the LOC count, single helper / single consumer scope. The reviewer prompt accepts `gitnexus_impact` OR `$gitnexus_summary` OR `gitnexus_detect_changes` OR LOW `impact_report` as evidence.
- "FAIL — full suite shows N+1 fails" where one is a known concurrent-run flake → rebut: rerun the suspect test in isolation, paste clean output, resume reviewer with "Isolated rerun: P/P. Re-evaluate."

### General rule

Resume with explicit ammunition: file/line refs, exact rerun output, link to the bead memory documenting the rebuttal pattern. Don't argue from authority; argue from new evidence. **Findings from seconder / security-auditor are legitimate rebuttal evidence** — a clean seconder OK or a security-auditor "no findings" is concrete proof against a reviewer's "looks too complex" or "may have security risk" gate. Cite the advisory job id when rebutting on this axis.

**One rebuttal per reviewer is the limit.** Second FAIL after rebuttal means stop and report. After a successful rebuttal, save the rebuttal text to `bd remember "<key>"` so the next session inherits it.

## Monitoring And Steering

Use `sp ps` for state and `sp result` for completed turns.

```bash
sp ps                         # active jobs + unresolved terminal problems
sp ps --active                # active jobs only
sp ps --health                # include detailed process tables
sp ps --include-terminal      # include uncleaned terminal history
sp ps --include-cleaned       # include rows hidden by sp clean --ps
sp ps --all                   # full audit view, including cleaned/dead/history
sp feed <job-id>
sp result <job-id>
```

Default `sp ps` is the actionable dashboard, not raw history. Error/cancelled terminal rows stay visible until an operator acknowledges them with `sp clean --ps`; cleaned rows remain in SQLite and are visible via `--include-cleaned`/`--all`.

If job is running, use `sp feed`. If it is waiting, use `sp result` and decide whether to resume, review, merge, or stop. Avoid tight polling; sleep based on task size, then check once.

Use `steer` for running jobs and `resume` for waiting jobs:

```bash
sp steer <job-id> "Stop broad audit. Answer only the three bead questions."
sp resume <job-id> "Continue with the next scoped fix. Do not refactor."
```

Context usage is an action signal when available:

- 0-40%: healthy.
- 40-65%: monitor.
- 65-80%: steer toward conclusion.
- Above 80%: finish, summarize, or replace job.

Raw token totals are not context percentages.

### Long autonomous runs — dual-mechanism monitoring

For sessions where the operator is offline (overnight, async windows), use both:

1. **Bash sleep timers per dispatch**, sized per role (see Monitoring Long-Running Jobs above). Bash sleep waits for an expected completion.
2. **External cron loop** (Claude Code: `/loop 180s sp ps`) as a heartbeat at fixed cadence regardless of orchestrator's bash sleeps. Cron catches specialists that finished while the orchestrator was busy reading other results, and catches stalls.

The two complement: bash sleep waits for an expected completion; cron catches unexpected completions and stalls. Without the cron, the orchestrator can miss specialists that completed during a long bash poll cycle and waste turns re-polling.

## Bead Lifecycle And Parallel Commit Ordering

The bd commit-gate is **project-wide**, not per-worktree. While **any** bead in the project is `in_progress`, **no** worktree can commit. Practical consequences for parallel-chain epics:

- You CAN dispatch two executors in parallel — they work in separate worktrees, no commit-time collision.
- But once executor A returns and executor B is still running, you CANNOT commit A's worktree until B's bead is closed (or vice versa).
- Workflow: close the finished chain's executor bead FIRST (memory-ack + `bd close`), THEN commit that chain's worktree, THEN wait on the other chain.
- This forces a serial-tail on the commit step. Plan for it: parallel-dispatch saves time on the *thinking* step, not the commit step.

If the commit-gate blocks unexpectedly mid-orchestration, `bd query "status=in_progress"` reveals which claim is holding it open.

### Memory-gate batch close

`bd close` is blocked until `memory-acked:<id>` exists. For batch-closing many orchestrator-internal beads (sanity beads, reviewer beads, decomposition trackers), use:

```bash
for id in <impl> <sanity?> <review>; do
  bd kv set "memory-acked:$id" "saved:<chain-memory-key>"   # OR "nothing novel: <reason>"
done
bd close <impl> <sanity?> <review> <parent> --reason "..."
```

The chain memory key holds the actual durable insight (one per real fix). Sanity/review beads get "nothing novel" — the parent insight covers them.

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

## Adjacent xt commands

Source: latest xt report + `xt --help`; keep commands here, not full CLI surface.
- `xt report` — session report input for release synthesis; see `/session-close-report`.
- `xt end` — close worktree session: push, PR, merge, cleanup; see `/xt-end`.
- `xt claude` — launch Claude in sandboxed worktree; see `/using-xtrm`.
- `xt update` — refresh xtrm-managed files in one repo or many; see `/update-xt`.
- `xt doctor` — diagnose xtrm drift in current project; see `/update-xt`.
- `xt init` — bootstrap xtrm in project; see xtrm-tools docs.
- `xt release prepare/publish` — legacy release path; canonical flow is `/releasing`.
- `bd prime` — refresh beads workflow context; see `CLAUDE.md`.
- `memory-processor` — memory synthesis specialist; see `/documenting`.
- `xt-merge` — defer merge-queue internals to `/xt-merge`.

## Merge And Publication (manual git is canonical)

> **Rule #9:** `sp merge` and `sp epic merge` are prohibited — known broken, awaiting a separate rework epic. Even if `sp help` shows them, do not use. The Cherry-Pick Playbook below is the canonical merge path for specialist-owned work.

### Per-chain merge (standalone or one chain at a time inside an epic)

After reviewer PASS on a chain whose work lives in `feature/<bead-id>-<slug>` worktree:

```bash
# 1. Verify reviewer PASS verdict was recorded (Release Checklist clean)
bd show <bead-id>   # check notes for the verdict

# 2. Verify the chain's gates passed:
#    seconder OK | obligations-scanner CLEAN | security-auditor clean (if surface)
#    Reviewer's Release Checklist block enumerates these.

# 3. Switch to target branch (master or integration/<date>) and FF or merge
git checkout <target>
git pull --ff-only origin <target>
git merge --no-ff feature/<bead-id>-<slug> -m "Merge <bead-id>: <summary>"
git push origin <target>

# 4. Cleanup the chain worktree + branch
git worktree remove <chain-worktree-path>
git branch -d feature/<bead-id>-<slug>
git worktree prune
```

Use `git update-ref` for FF-equivalent when checkout is blocked by transient working-tree state (e.g., bd auto-export churn on `.beads/issues.jsonl`):

```bash
git merge-base --is-ancestor <target> feature/<bead-id>-<slug> && \
  git update-ref refs/heads/<target> feature/<bead-id>-<slug> && \
  git push origin <target>
```

### Multi-chain epic merge

Use the Cherry-Pick Playbook (below). Each chain lands as one squash commit on an integration branch (visible to operator before main), then operator FF-merges integration → main when satisfied.

### Closing the keep-alive specialists

If reviewer/executor jobs are still `waiting` after PASS:

```bash
sp stop <waiting-job-id>   # explicit close per job; verify with sp ps before
```

No automatic cascade-finalizer. Close each waiting job explicitly. (Yes, this is more ceremony than `sp finalize` provided — but `sp finalize` lived inside the broken sp merge path.)

### Rules

- Merge only after reviewer PASS + clean Release Checklist unless operator explicitly accepts a draft.
- Always use `git merge --no-ff` for chain merges to keep the chain branch visible in history.
- If merge reports a dirty worktree on the target branch, inspect what's dirty. Revert generated noise (e.g., `.beads/issues.jsonl` churn) only when clearly unrelated; otherwise ask the operator.
- After merge, always remove the chain worktree + delete the branch + prune.
- Stale-base failures: per Git State Precondition section, dispatch chains only when target branch HEAD contains all prior dependent chains' commits.

## Integration Phase — Cherry-Pick Playbook (canonical multi-chain merge)

The canonical path for landing multiple specialist chains. Operator gets visibility on an integration branch before the work hits main.

### Step-by-step

1. Stash uncommitted state on working branch: `git stash push -u -m "pre-integration"`.
2. Create integration branch off the working branch: `git checkout -b integration/<date>-orchestrator`.
3. For each non-overlapping chain (security/critical first, then test-baseline, then features):
   - `git merge --squash <chain-branch>`
   - Restore noise files (see "Chain noise filter checklist" below)
   - **Advisory passes** before commit: if the staged diff smells overcomplicated/duplicative/type-risky, dispatch `seconder --job <last-exec-job-of-chain>`; if it touches auth/secrets/input/agent-config, dispatch `security-auditor --job <last-exec-job-of-chain>`. Link those beads with `bd dep add <advisory-bead> <chain-bead> --type validates`. Apply findings or document why skipped.
   - `git commit -m "<type>(<scope>): <summary> (<bead-id>)"` — one squash commit per chain.
4. For each overlapping chain, add `bd dep relate <overlap-a> <overlap-b>` if not already linked, then switch to the **debugger-restitch** pattern (next section).
5. Before publication, run `bd dep cycles`; fix any accidental cycle before operator FF-merges integration → main.
6. After all chains land, run E2E smoke phase (below) before declaring done.
7. Operator FF-merges integration → main when satisfied.

### Chain noise filter checklist

For manual cherry-pick / squash flows, unstage these before committing (otherwise the chain commit will carry orchestrator-bookkeeping noise):

- `.pi/npm` — accidentally created by xt commands inside worktrees
- `cli/pnpm-lock.yaml`, `cli/pnpm-workspace.yaml` — pnpm side-effects
- `AGENTS.md`, `CLAUDE.md` — gitnexus stat-refresh hook noise
- `.beads/issues.jsonl`, `.beads/interactions.jsonl` — bd state churn
- `.specialists/executor-result.md` — transient specialist output

```bash
git restore --staged .beads .pi AGENTS.md CLAUDE.md
git checkout HEAD -- .beads AGENTS.md CLAUDE.md
rm -f .pi/npm
```

If a chain commits its own `.beads` symlink (older bd-in-worktree behavior), `rm -f .beads` then `git checkout HEAD -- .beads` to restore the real directory.

## Debugger-Restitch Pattern

When chain X conflicts with already-landed chain Y on shared files, raw `git cherry-pick` will revert Y's work. The debugger-restitch pattern preserves both, but only when the debugger gets an explicit "preserve already-landed work" contract.

1. **Reopen X**: `bd reopen <X> --reason="integration stitch onto post-Y state"`. If the old X chain is no longer publishable, create a restitch bead and mark replacement explicitly: `bd supersede <X> --with <X-restitch>`. Link X and Y with `bd dep relate <X-restitch> <Y>` for conflict context; use `caused-by` only when a concrete failure bead is attributable to Y's already-landed change.
2. **Strengthen the bead contract** with these fields:
   - `## CRITICAL CONSTRAINTS:` heading at the top.
   - "Fork off `integration/<date>-orchestrator`. Verify with `git log integration/...$..HEAD` empty before any commits."
   - List the symbols/lines from Y that MUST be preserved verbatim (with file paths).
   - "ADD X's intent ON TOP" with a numbered list of the additions.
   - "Reference original `feature/<X>-executor` for symbol shapes only — do NOT cherry-pick or merge. Re-implement on integration's current state."
   - `## VALIDATION:` includes both Y's tests passing AND X's new tests passing.
   - `## OUTPUT:` mandates a 5-line code excerpt showing both Y and X features coexisting.
3. **Dispatch debugger** with `--force-stale-base` if X is an epic child:
   ```bash
   sp run debugger --bead <X> --force-stale-base --keep-alive --background
   ```
4. **Sanity check the result**: when debugger reports back:
   ```bash
   git log integration/<date>..feature/<X>-debugger --oneline
   git diff integration/<date>...feature/<X>-debugger -- <key-files>
   ```
   Confirm the debugger's diff is **additive** — no reverts of Y's lines.
5. **Advisory passes**: before landing the restitch, dispatch `seconder --job <debugger-job>` if the restitch added control-flow complexity, and `security-auditor --job <debugger-job>` if it touched a sensitive surface. Link each advisory bead back with `bd dep add <advisory> <X-restitch-or-X> --type validates`. Restitched diffs are higher-risk than fresh executor diffs because the debugger had to thread around already-landed work.
6. **Land via FF or cherry-pick the named commit** (NOT the checkpoint commit). Look for the commit with the proper `<type>(<scope>):` message; ignore `checkpoint(debugger):` commits above it.
7. **Verify tests** before marking done.

### Failure mode to watch for

If the debugger forks off the OLD baseline (pre-Y) instead of integration, its commit will revert Y. Symptom: `git diff integration..feature/<X>-debugger -- <Y's-file>` shows DELETIONS of Y's symbols. Fix: resume the debugger with explicit "cd to a fresh worktree forked from `integration/<date>-orchestrator`" instruction. Re-verify with `git log integration..HEAD` empty. If the bad restitch became a tracked bead, supersede it with the corrected restitch bead so nobody merges the obsolete chain.

## E2E Smoke Phase

Run **every** npm script + entry point that any chain added or modified. The smoke phase is the only way to catch missed chains, false-positive CI gates, missing intermediate files, and runtime regressions invisible to unit tests.

### Procedure

```bash
# Build sanity
bun run build   # or equivalent

# Test sanity — record PRE-baseline first
git checkout <baseline-branch>
bun test 2>&1 | tail -5   # record N failed / M passed

# Switch back and re-run
git checkout integration/<date>-orchestrator
bun test 2>&1 | tail -5   # MUST be ≥ baseline. Net regression is a stop-the-line.

# Run every check:* script the integration added
for s in $(jq -r '.scripts | keys[] | select(startswith("check:"))' package.json); do
  echo "=== $s ==="
  npm run "$s" 2>&1 | tail -10
done

# Targeted unit tests for chains touching the same files
bunx vitest run <chain-test-files>
```

For each smoke that fails, decide before continuing:
- False positive (script flags itself) → file follow-up bead, document, continue
- Missing dependency (vendor not run) → expected gate, document
- Real regression → stop, dispatch debugger to fix, re-smoke

### Cross-cutting security-auditor pass

If any landed chain in this integration touched auth, secrets, input handling, dependency lockfiles, or agent/MCP/config surfaces, dispatch one `security-auditor` on the cumulative integration diff BEFORE declaring smoke done:

```bash
git diff <baseline>..integration/<date>-orchestrator > /tmp/integration-diff.patch
sp run security-auditor --bead <sec-bead> --context-depth 3 --background
```

Per-chain security-auditor passes catch chain-local risks; this cross-cutting pass catches interaction risks that only appear once all chains coexist (e.g. one chain weakens an input validator that another newly relies on). Skipping this on a sensitive-surface integration is an escalation event.

Record all smoke results in the session-close-report under a `## Smoke test results` table (see `/session-close-report` skill).

## Failure Recovery

When something fails:

```bash
sp ps <job-id>
sp feed <job-id>
sp result <job-id>
sp doctor
```

Then choose one action:

- Resume waiting executor/debugger with exact findings.
- Re-run with better bead if contract was weak.
- Re-scope bead if scope was wrong.
- Escalate if human decision is needed.
- Replace specialist only if failure mode repeats.

### Common failure patterns (and the canonical fix)

| Symptom | Cause | Fix |
|---|---|---|
| `git checkout <branch>` aborts with "would overwrite untracked/changes" mid-orchestration | bd auto-export keeps re-staging `.beads/issues.jsonl` after every bd op | Use `git update-ref refs/heads/<target> <source>` for FF-equivalent without checkout; or commit the .beads churn as a separate "chore(beads): export state" commit before switching |
| Stale `.git/index.lock` blocks git commands | bd hooks or other tooling crashed mid-operation | Check no real git process is running (`ps -ef \| grep "git "`); if clear, `rm -f .git/index.lock` and retry |
| `git add .beads/issues.jsonl` says "ignored by gitignore" but `git status` shows it modified | File is in `.git/info/exclude` but already tracked in the index | The staged change can still be committed directly (`git commit` without `git add`); don't fight the exclude |
| Validation fails with `command not found`, `vitest: not found`, missing Python tools, or `ERR_MODULE_NOT_FOUND` in a fresh worktree | Normal git worktree behavior: ignored dependency dirs (`node_modules/`, `.venv/`) are not copied into new worktrees | Run the repo's standard bootstrap inside that worktree (`make bootstrap`, `just setup`, `npm ci`, `uv sync`, etc.) or report bootstrap-required. Do not track dependency artifacts. |
| `sp ps` shows old terminal jobs after a session | Default dashboard keeps unresolved terminal problems visible until acknowledged | `sp clean --ps --dry-run`, then `sp clean --ps` to soft-hide from default ps; use `sp ps --include-cleaned`/`--all` for audit history |
| Reviewer keeps returning PARTIAL on functional contracts already met | Reviewer demanding tool-event evidence — typically obsoleted after the gate relaxation, but if it persists check the executor's `gitnexus_detect_changes` ran and use the rebuttal pattern (see Specialist Rebuttal As Routine) | Rebut with cited evidence; second FAIL = escalate |
| Multiple `sp run` background launches drop silently under shell parallelism | Known launch-ceremony race | Re-check `sp ps` after each dispatch and retry the missing one; serialize when reliability matters |
| `sp run` returns `Warning: job started but ID not yet available` and nothing appears in `sp ps --bead <id>` after 30s | Dispatch was refused by epic guard or base-staleness check; stderr now surfaces the refusal reason (see `sp run --background` post-fix) | Read the surfaced reason; retry with `--force-stale-base` if intentional, or fix the bead/lineage |
| `sp feed <job-id>` returns short tail with no tool events | Confirms DB-backed replay is active; if you see ≤10 lines on a real run, the DB is missing events for that job — verify with raw SQL on observability.db | If DB truly lacks events: re-run job; if DB has events but feed truncates: file bug bead — should not happen on current build |
| bd "database not found" or per-project Dolt server respawn | bd has spawned a per-project Dolt instead of routing to the shared server | `ps aux \| grep "<repo>/.beads/dolt" \| awk '{print $2}' \| xargs -r kill -9`; ensure `.beads/config.yaml` contains `dolt.shared-server: true`; `bd ready` should now route to `~/.beads/shared-server/` |
| Dolt journal corruption (`possible data loss detected at offset N`) | bd-internal | Operator-only — do NOT auto-recover. Stop bd writes, snapshot `~/.beads/shared-server/dolt`, run `dolt fsck` (read-only) first. Operator decides on `--revive-journal-with-data-loss` after reviewing the warning |

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
