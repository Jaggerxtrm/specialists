<!-- xtrm:start -->
# XTRM Agent Workflow

> Full reference: [XTRM-GUIDE.md](XTRM-GUIDE.md) | Session manual: `/using-xtrm` skill
> Run `bd prime` at session start (or after `/compact`) for live beads workflow context.

## Session Start

1. `bd prime` — load workflow context and active claims
2. `bd memories <keyword>` — retrieve memories relevant to today's task
3. `bd recall <key>` — retrieve a specific memory by key if needed
4. `bv --robot-triage` — graph-aware triage: ranked picks, unblock targets, project health
5. `bd update <id> --claim` — claim before any file edit

## Execution Interaction Policy

- Proceed by default on standard implementation tasks once scope is clear.
- Do **not** ask repetitive “Proceed? Yes/No” confirmations.
- Ask for confirmation only when actions are destructive, irreversible, or high-risk (e.g. `rm`, history rewrite, mass deletes, credential rotation, prod-impacting ops).
- Prefer concise clarifying questions only when requirements are genuinely ambiguous.

## Active Gates (hooks enforce these — not optional)

| Gate | Trigger | Required action |
|------|---------|-----------------|
| **Edit** | Write/Edit without active claim | `bd update <id> --claim` |
| **Commit** | `git commit` while claim is open | `bd close <id>` first, then commit |
| **Stop** | Session end with unclosed claim | `bd close <id>` |
| **Memory** | `bd close <id>` without issue ack | First run `bd remember "<insight>"` (or decide nothing novel), then `bd kv set "memory-acked:<id>" "saved:<key>"` or `"nothing novel:<reason>"`, then retry `bd close <id> --reason="..."` (Stop hook remains fallback reminder) |

## bd Command Reference

```bash
# Work discovery
bd ready                               # Unblocked open issues
bd show <id>                           # Full detail + deps + blockers
bd list --status=in_progress           # Your active claims
bd query "status=in_progress AND assignee=me"  # Complex filter
bd search <text>                       # Full-text search across issues

# Claiming & updating
bd update <id> --claim                 # Claim (sets you as owner, status→in_progress)
bd update <id> --notes "..."           # Append notes inline
bd update <id> --status=blocked        # Mark blocked
bd update                              # Update last-touched issue (no ID needed)

# Creating
bd create --title="..." --description="..." --type=task --priority=2
# --deps "discovered-from:<parent-id>"  link follow-ups to source
# priority: 0=critical  1=high  2=medium  3=low  4=backlog
# types: task | bug | feature | epic | chore | decision

# Closing
# Memory gate: ack per issue before close
#   bd kv set "memory-acked:<id>" "saved:<key>"  OR  "nothing novel:<reason>"
bd close <id>                          # Close issue (blocked until memory-acked:<id> exists)
bd close <id> --reason="Done: ..."     # Close with context
bd close <id1> <id2> <id3>            # Batch close (each id needs its own memory ack)

# Dependencies
bd dep add <issue> <depends-on>        # issue depends on depends-on (depends-on blocks issue)
bd dep <blocker> --blocks <blocked>    # shorthand: blocker blocks blocked
bd dep relate <a> <b>                  # non-blocking "relates to" link
bd dep tree <id>                       # visualise dependency tree
bd blocked                             # show all currently blocked issues

# Persistent memory
bd remember "<insight>"                # Store across sessions (project-scoped)
bd memories <keyword>                  # Search stored memories
bd recall <key>                        # Retrieve full memory by key
bd forget <key>                        # Remove a memory

# Health & pre-flight
bd stats                               # Open/closed/blocked counts
bd preflight --check                   # Pre-PR readiness (lint, tests, beads)
bd doctor                              # Diagnose installation issues
```

## Git Workflow (strict: one branch per issue)

```bash
git checkout -b feature/<issue-id>-<slug>   # or fix/... chore/...
bd update <id> --claim                       # claim before any edit
# ... write code ...
bd close <id> --reason="..."                 # closes issue
xt end                                       # push, PR, merge, worktree cleanup
```

**Never** continue new work on a previously used branch.

## bv — Graph-Aware Triage

bv is a graph-aware triage engine for the beads issue board. Use it instead of `bd ready` when you need ranked picks, dependency-aware scheduling, or project health signals.

> **CRITICAL: Use ONLY `--robot-*` flags. Bare `bv` launches an interactive TUI that blocks your session.**

```bash
bv --robot-triage             # THE entry point — ranked picks, quick wins, blockers, health
bv --robot-next               # Single top pick + claim command (minimal output)
bv --robot-triage --format toon  # Token-optimized output for lower context usage
```

**Scope boundary:** bv = *what to work on*. `bd` = creating, claiming, closing issues.

| Command | Returns |
|---------|---------|
| `--robot-plan` | Parallel execution tracks with unblocks lists |
| `--robot-insights` | PageRank, betweenness, HITS, cycles, critical path |
| `--robot-forecast <id\|all>` | ETA predictions with dependency-aware scheduling |
| `--robot-alerts` | Stale issues, blocking cascades, priority mismatches |
| `--robot-diff --diff-since <ref>` | Changes since ref: new/closed/modified |

```bash
bv --recipe actionable --robot-plan    # Pre-filter: ready to work
bv --robot-triage --robot-triage-by-track  # Group by parallel work streams
bv --robot-triage | jq '.quick_ref'   # At-a-glance summary
bv --robot-insights | jq '.Cycles'    # Circular deps — must fix
```

## Code Intelligence (mandatory before edits)

Use **Serena** (`using-serena-lsp` skill) for all code reads and edits:
- `find_symbol` → `get_symbols_overview` → `replace_symbol_body`
- Never grep-read-sed when symbolic tools are available

Use **GitNexus** MCP tools before touching any symbol:
- `gitnexus_impact({target: "symbolName", direction: "upstream"})` — blast radius
- `gitnexus_context({name: "symbolName"})` — callers, callees, execution flows
- `gitnexus_detect_changes()` — verify scope before every commit
- `gitnexus_query({query: "concept"})` — explore unfamiliar areas

Stop and warn the user if impact returns HIGH or CRITICAL risk.

## Quality Gates (automatic)

Run on every file edit via PostToolUse hooks:
- **TypeScript/JS**: ESLint + tsc
- **Python**: ruff + mypy

Gate output appears as hook context. Fix failures before proceeding — do not commit with lint errors.

## Worktree Sessions

- `xt claude` — launch Claude Code in a sandboxed worktree
- `xt end` — close session: commit / push / PR / cleanup
<!-- xtrm:end -->

# Specialists Project Guide

@.wolf/OPENWOLF.md

Project uses OpenWolf for context management. Read `.wolf/OPENWOLF.md` every session. Check `.wolf/cerebrum.md` before generating code and `.wolf/anatomy.md` before broad file reads.

## Operating Loop

Use this loop for normal project work. It merges beads, bv, GitNexus, specialists, and quality gates into one sequence.

1. Prime context: `bd prime`.
2. Pull relevant memory only when useful: `bd memories <keyword>` or `bd recall <key>`.
3. Pick work: `bv --robot-triage --format toon`; inspect a candidate with `bd show <id>`.
4. Specify the bead before dispatch or edits. A vague bead is a vague prompt.
5. Claim before file edits: `bd update <id> --claim`.
6. Before editing code symbols, run GitNexus impact/context on the touched symbol or execution flow.
7. Execute directly for small deterministic work; use specialists for substantial discovery, implementation, review, testing, docs, or orchestration.
8. Verify with relevant gates: lint, typecheck, tests, `git diff --stat`, and `gitnexus_detect_changes()` before commit.
9. Close tracked work only after memory ack: `bd remember` if novel, `bd kv set "memory-acked:<id>" ...`, then `bd close <id> --reason="..."`.
10. Publish through the project workflow: close bead before commit; use `xt end`, `sp merge`, or `sp epic merge` as appropriate.

## Bead Task Contract

`--bead` is the prompt. Do not run a specialist or start implementation until the bead is a usable task contract.

Every dispatchable bead should include:

```text
PROBLEM: What is wrong or needed.
SUCCESS: Observable completion criteria.
SCOPE: Files, symbols, commands, docs, or discovery area.
NON_GOALS: Explicitly out of scope.
CONSTRAINTS: Compatibility, safety, style, permissions, sequencing.
VALIDATION: Checks/tests/review expected before closure.
OUTPUT: Expected handoff format.
```

For an explorer bead, `SCOPE` may be a code area and `OUTPUT` should name the questions to answer plus the stop condition. For an executor bead, `SCOPE`, `SUCCESS`, `CONSTRAINTS`, and `VALIDATION` should be concrete enough that the executor can act without rediscovering the whole problem. For a reviewer bead, include the executor job, requirements to verify, and expected verdict format: `PASS`, `PARTIAL`, or `FAIL`.

Use `bd update <id> --notes "CONTRACT: ..."` to strengthen an existing bead before dispatch. Do not compensate for vague beads with `--prompt` for tracked work.

## Beads And Triage

Beads are the source of truth for tracked work.

Core commands:

```bash
bd show <id>                         # full issue detail
bd update <id> --claim               # required before edits
bd update <id> --notes "..."         # append task contract or findings
bd dep add <issue> <depends-on>      # issue depends on blocker
bd close <id> --reason="..."         # close after memory ack
bv --robot-triage --format toon      # ranked work and health
bv --robot-plan                      # dependency-aware tracks
bv --robot-insights                  # graph metrics and cycles
```

Use `bv` to decide what to work on. Use `bd` to specify, claim, relate, and close the work. Never use bare `bv`; it opens an interactive TUI.

## GitNexus Rules

Use GitNexus before modifying functions, classes, methods, or execution-flow-sensitive modules.

Required before code edits:

```text
gitnexus_impact({target: "SymbolName", direction: "upstream"})
gitnexus_context({name: "SymbolName"})
```

Required before commit:

```text
gitnexus_detect_changes()
```

For unfamiliar areas, query by concept before grepping:

```text
gitnexus_query({query: "auth validation"})
```

If impact is HIGH or CRITICAL, warn the user before editing. If the GitNexus index is stale, run `npx gitnexus analyze`; preserve embeddings with `npx gitnexus analyze --embeddings` when `.gitnexus/meta.json` shows embeddings exist.

## Specialists Policy

Specialists are project-scoped agents executed through `pi` RPC sessions. Runtime is bead-first: `specialists run <name> --bead <id>` reads the bead, parent context, completed blockers, and injected project rules.

Use specialists for substantial discovery, debugging, implementation, review, tests, docs, planning, or multi-chain orchestration. Do small deterministic edits directly when the scope is already clear and delegation adds ceremony.

Tracked work uses `--bead`, not `--prompt`. If the specialist needs better instructions, update the bead notes first.

Specialist selection:

| Need | Specialist | Notes |
| --- | --- | --- |
| Codebase mapping | `explorer` | READ_ONLY; answer explicit questions. |
| Root-cause investigation | `debugger` | Use for failures, traces, regressions. |
| Planning or issue breakdown | `planner` | Produces scoped beads/dependencies. |
| Tradeoff/design analysis | `overthinker` | Use before risky or ambiguous implementation. |
| Implementation | `executor` | `--bead` auto-provisions a worktree; runs lint/type gates, not full tests. |
| Post-implementation review | `reviewer` | Use `--job <executor-job>` and own review bead. |
| Test execution/interpretation | `test-runner` | Use after implementation/review. |
| Documentation audit/sync | `sync-docs` | Use for doc drift and targeted sync. |
| Specialist config authoring | `specialists-creator` | Use before editing specialist JSON. |
| Service/script integration | (script-class) | Use `sp script` or `sp serve` — see `using-script-specialists` skill. Not bead-driven. |

Core commands:

```bash
specialists list
specialists list-rules                            # rule × specialist matrix
specialists run <name> --bead <id> --background   # --context-depth defaults to 3
specialists run executor --bead <impl-bead> --background       # worktree auto-provisioned
specialists run reviewer --bead <review-bead> --job <exec-job> --keep-alive --background
specialists ps
specialists feed <job-id>
specialists result <job-id>                       # works on waiting jobs (returns last turn + footer)
specialists steer <job-id> "new direction"
specialists resume <job-id> "next task"
specialists stop <job-id>
specialists doctor
```

`sp poll` is deprecated — use `sp ps` for state and `sp feed` for streams. `--no-worktree` is removed; `--bead` on edit-capable specialists auto-provisions. Use `--force-stale-base` only when you accept overriding the sibling-chain unmerged-commits guard.

For one-shot synchronous specialists from services/scripts (`sp script`, `sp serve`), see the `using-script-specialists` skill — separate runtime, READ_ONLY only, template-driven, no beads.

## Specialist Chain Pattern

Use a chain when implementation needs independent workspace isolation and review.

1. Create a task bead with the full task contract.
2. Create an explorer bead only if the implementation path is unclear.
3. Create an implementation bead with scope, non-goals, constraints, and validation.
4. Run executor with `--worktree`.
5. Create a reviewer bead and run reviewer with `--job <executor-job>`.
6. If reviewer returns `PARTIAL`, resume the same executor when possible; otherwise create a fix bead and re-enter with `--job`.
7. Repeat review until `PASS`.
8. Merge with `sp merge <chain-root-bead>` for standalone chains or `sp epic merge <epic-id>` for epic-owned chains.

Invariants:

- `--bead` on edit-capable specialists auto-provisions a worktree; pass `--worktree` explicitly only when you want it without a bead.
- `--job` reuses an existing job workspace; bead_id auto-resolves from the target job if `--bead` is omitted.
- `--worktree` and `--job` are mutually exclusive.
- `--context-depth` default is 3 (own bead + predecessor + parent task).
- Stale-base guard blocks worktree provisioning when sibling epic chains have unmerged substantive commits; merge-time rebase happens automatically. Override with `--force-stale-base` only with cause.
- Executor and debugger auto-checkpoint substantive worktree changes on `waiting` (`auto_commit: checkpoint_on_waiting`); noise paths are filtered.
- Per-turn output auto-appends to the input bead notes for **all** specialists with `[WAITING]`/`[DONE]` headers — `bd show <bead-id>` shows the full handoff.
- Keep executor/debugger jobs alive through review so they can be resumed.
- Do not manually `git merge` specialist branches.
- Do not allow specialists to perform destructive or irreversible actions.

## Epic And Parallel Work

Use an epic when multiple chains must publish together or when stages depend on prior merged output.

Canonical pattern:

```text
epic
  -> shared explorer/planner prep
  -> impl-a, impl-b, impl-c in parallel only if file scopes are disjoint
  -> reviewer per implementation chain
  -> one batched test bead when useful
  -> sp epic status <epic>
  -> sp epic merge <epic>
```

Rules:

- Chains in the same stage may run in parallel only with disjoint write scopes.
- Do not start the next stage until the prior stage is complete and merged when downstream code depends on it.
- Use `--epic <id>` for prep jobs that should appear under the epic but do not have the epic as parent.
- `sp merge <chain>` is for standalone chains only; epic-owned chains publish through `sp epic merge <epic>`.

## Runtime Architecture

Core surfaces:

- CLI (orchestration): `specialists run|resume|steer|feed|result|status|ps|stop|list|list-rules|init|edit|epic|end|doctor|merge`.
- CLI (script-class): `specialists script|serve` — synchronous, READ_ONLY, template-driven (see `using-script-specialists`).
- MCP: `use_specialist` only.
- Library export: `/lib` subpath for Node consumers embedding the runner.
- Job storage: `.specialists/jobs/<job-id>/{status.json,events.jsonl,result.txt,steer.pipe}`.
- Observability DB: `.specialists/db/observability.db` (shared by `sp run` and `sp script`/`sp serve`).
- Beads storage is separate from specialist job storage.

Job lifecycle:

```text
starting -> running -> waiting -> running -> done|error|cancelled
```

Important runtime behavior:

- `run --bead <id>` reads the bead via `bd show --json`.
- Runner builds prompt from bead context, parent context, completed blockers, mandatory rules, memory, and GitNexus cheatsheet when available.
- `--bead` sets `bead-claim:<id>` for edit-gate access.
- Supervisor writes status immediately and emits timeline events.
- Per-turn specialist output auto-appends to the input bead notes for **all** specialists on every `run_complete` (status-aware headers: `[WAITING]` / `[DONE]`).
- Linked beads auto-close on terminal job status (with memory-ack still required by the close gate).
- `steer` works for running jobs; `resume` works for waiting keep-alive jobs.
- `sp result <job-id>` returns last completed turn for waiting jobs with a footer prompting `sp resume`. Use `--wait --timeout <s>` to block until terminal.
- `sp stop` marks terminal status based on run completion evidence.

## Key Files

- `src/cli/run.ts` — run command, `--bead`, `--epic`, `--force-stale-base`, output modes.
- `src/cli/ps.ts` — job/worktree snapshot, context usage, epic grouping.
- `src/cli/feed.ts` — event stream.
- `src/cli/result.ts` — result reader (handles waiting/running/done).
- `src/cli/list-rules.ts` — mandatory-rules × specialist matrix.
- `src/cli/script.ts`, `src/cli/serve.ts` — script-class CLI/HTTP entry points.
- `src/cli/stop.ts` — terminal status resolution.
- `src/cli/epic.ts` — epic lifecycle and merge commands.
- `src/cli/merge.ts` — standalone chain merge guard and gates.
- `src/specialist/runner.ts` — execution, prompt construction, retry behavior.
- `src/specialist/script-runner.ts` — script-class one-shot runner (compatGuard, template rendering).
- `src/specialist/beads.ts` — bead prompt construction and context loading.
- `src/specialist/supervisor.ts` — job lifecycle, FIFO, per-turn bead output append, auto-checkpoint.
- `src/specialist/chain-identity.ts` — chain to epic linkage.
- `src/specialist/epic-readiness.ts` — merge readiness checks.
- `src/specialist/node-contract.ts` — node state machine and renderers.
- `src/tools/specialist/use_specialist.tool.ts` — MCP foreground run.

## Node Coordination

Nodes are multi-agent groups with a LOW-permission coordinator that drives members through CLI commands. Use `config/skills/using-nodes/SKILL.md` for node-specific workflows.

Core node commands:

```bash
sp node run <config> --bead <id>
sp node spawn-member --node <id> --member-key <key> --specialist <name> --json
sp node wait-phase --node <id> --phase <id> --members <keys> --json
sp node complete --node <id> --strategy <pr|manual> --json
sp node stop <node-id>
```

## Quality Gates

Automatic hooks run on file edits:

- TypeScript/JavaScript: ESLint and `tsc`.
- Python: `ruff` and `mypy`.

Before finishing code changes, run the most relevant manual checks:

```bash
npm run lint
npx tsc --noEmit
npm test
git diff --stat
```

Do not commit with unresolved gate failures. If a full test suite is too expensive or unstable, state what was not run and why.

## Recovery Cheatsheet

- No current work: `bv --robot-triage --format toon`.
- Need full bead detail: `bd show <id>`.
- Specialist appears stuck: `specialists ps <job-id>`, then `specialists feed <job-id>`.
- Specialist context may be rotting: inspect `TOKNS ... tokens=<total> in=<delta> out=<delta> cost=<cost>` in feed; around 50k tokens, steer toward conclusion or handoff unless the deep run is intentional.
- Running job needs correction: `specialists steer <job-id> "..."`.
- Waiting keep-alive should continue: `specialists resume <job-id> "..."`.
- Dead/zombie job: `specialists stop <job-id>` or `specialists clean --processes`.
- Epic state unclear: `sp epic status <epic-id>`, then `sp epic sync <epic-id> --apply` if needed.
- Specialist config/runtime issue: `specialists doctor`.
- CLI reference: `docs/cli-reference.md`.
- Architecture reference: `docs/ARCHITECTURE.md`.
- Beads/features reference: `docs/features.md`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **specialists** (4396 symbols, 9591 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/specialists/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/specialists/context` | Codebase overview, check index freshness |
| `gitnexus://repo/specialists/clusters` | All functional areas |
| `gitnexus://repo/specialists/processes` | All execution flows |
| `gitnexus://repo/specialists/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
