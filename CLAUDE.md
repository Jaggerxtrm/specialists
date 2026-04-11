# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.


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

## Node Coordination

Nodes are multi-agent research/execution groups with a coordinator + members. The coordinator is **CLI-native** (LOW permission, bash access, no file edits) and drives members via `sp node` commands.

### Coordinator model
- Permission: LOW (bash, no edits). Config: `config/specialists/node-coordinator.specialist.json`
- Calls `sp node` commands via bash, reads structured JSON responses
- `$SPECIALISTS_NODE_ID` env var available in coordinator bash sessions (injected by runner)
- Skill: `config/skills/using-nodes/SKILL.md` (v3.0, CLI-native)
- SSoT: `src/specialist/node-contract.ts` — state machine, phase kinds, renderers

### CLI surface (`sp node`)
```bash
sp node run <config> --bead <id>                    # start a node
sp node spawn-member --node <id> --member-key <key> --specialist <name> [--json]
sp node create-bead --node <id> --title "..." [--json]
sp node complete --node <id> --strategy <pr|manual> [--json]
sp node wait-phase --node <id> --phase <id> --members <k1,k2> [--json]
sp node members [--json]                             # member registry
sp node stop <node-id>                               # stop node
```

Node operations that moved to top-level CLI:
- status/snapshot: `sp ps` (optionally scoped to node jobs)
- event stream: `sp feed` (optionally scoped with `--node <id>`)
- steering: `sp steer <coordinator-job-id> "message"`
- attach: `sp attach <coordinator-job-id>`
- member output: `sp result <node-ref>:<member-key>` (node refs accept any unique prefix: `research`, `research-5eaf`, or full ID)

### Key files
- `src/cli/node.ts` — CLI command routing + action handlers
- `src/specialist/node-supervisor.ts` — node lifecycle, member spawning, action execution
- `src/specialist/node-contract.ts` — Zod schema, state machine, renderers
- `config/nodes/research.node.json` — research node config (explorer + overthinker + researcher)

### Completion strategy
Node configs declare `completion_strategy` (manual or pr):
- **manual**: coordinator synthesis → node waits for operator closure via `sp node stop`
- **pr** (default): coordinator synthesis → node auto-closes to `done`
Use `manual` for research/interactive nodes, `pr` for implementation nodes.


# CLAUDE.md - AI Agent Development Guide

> **Purpose**: Operational guidance for the current Specialists codebase and MCP surface.

## Project Overview

**Specialists** is a project-scoped MCP server that discovers `.specialist.json` files and executes them through `pi` RPC sessions. The runtime is bead-first: when a run is bead-linked, the bead is the task source and run metadata keeps bead linkage throughout execution and feed output.

## Architecture (current)

### Core surfaces

- **CLI**: `specialists run|resume|steer|feed|result|status|ps|stop|list|init|edit|epic|end|doctor|merge`
- **MCP tools**: `use_specialist` only (foreground, returns result directly to conversation context)
- **Runtime persistence**: `.specialists/jobs/<job-id>/{status.json,events.jsonl,result.txt,steer.pipe}`

### Job status lifecycle

```
starting → running → waiting → (resume) → running → ... → done/error/cancelled
```

**Terminal statuses**:
- `done` — normal completion with `run_complete` event
- `error` — failure (exception, timeout, crash)
- `cancelled` — intentional stop without completion evidence

**`sp stop` behavior**:
- Checks for `run_complete` event before SIGTERM
- If found → writes `done` to `status.json`
- If not found → writes `cancelled` to `status.json`
- Prevents zombie "waiting" jobs after external kills

### Execution semantics

1. `run --bead <id>` / `use_specialist({bead_id})`
   - Reads bead via `bd show --json`
   - Builds prompt from bead context + optional completed blockers
   - Injects "Specialist Run Context" override (claim provided bead, don't `bd create`)
   - **Injects project memory context**: `.xtrm/memory.md` + `bd prime` output (~3800 tokens total)
   - **Injects GitNexus cheatsheet**: when `.gitnexus/meta.json` exists (~100 tokens)
   - Sets bead-claim KV key for edit gate: `bead-claim:<bead-id>`
   - Threads bead linkage as `inputBeadId`
2. Supervisor writes `status.json` immediately (including `bead_id` when available)
3. FIFO steer pipe created for all jobs (enables mid-run `specialists steer`)
4. Timeline emits structured events (`run_start`, `meta`, `tool`, `text`, `thinking`, `run_complete`)
5. Feed/observers expose the same run with event envelope metadata
6. On completion: READ_ONLY specialists auto-append output to input bead notes
7. Retry on transient errors: exponential backoff + jitter, controlled by `execution.max_retries`

### Key behavioral notes

- `--background` is the preferred async path — `specialists run <name> --prompt "..." --background`
- `steer` works for **all running jobs** (not just keep-alive) — sends message via FIFO pipe
- `resume` is for **waiting keep-alive jobs** only — sends next-turn prompt
- `response_format` + `output_schema` are injected into system prompt by runner
- `required_tools` is validated against `permission_required` before run start
- MCP is intentionally minimal: `use_specialist` only
- `start_specialist` is legacy/deprecated: if encountered, output includes a deprecation warning and points to CLI `--background`; remove from MCP tool surface in the next major

## Key Files Reference (current)

- `src/cli/run.ts` — run command, `--bead`, `--epic`, output modes (`human|json|raw`), event tailing
- `src/cli/resume.ts` — resume keep-alive jobs in `waiting`
- `src/cli/steer.ts` — mid-run steering via FIFO pipe (all running jobs)
- `src/cli/feed.ts` — merged feed stream, envelope metadata, cursor behavior
- `src/cli/status.ts` — health check + `--job <id>` single-job detail view
- `src/cli/ps.ts` — process snapshot: worktree trees, context%, bead titles, urgency sort, epic/chain grouping
- `src/cli/stop.ts` — SIGTERM with terminal status resolution (`done` vs `cancelled` based on `run_complete` evidence)
- `src/cli/epic.ts` — epic lifecycle: `list|status|merge|resolve`, merge-gated publication
- `src/cli/merge.ts` — chain merge with epic guard, `src/` validation, TypeScript gate
- `src/cli/end.ts` — session close: epic-aware, `--pr` publication, auto-redirect to `sp epic merge`
- `src/specialist/epic-lifecycle.ts` — epic state machine (`open→resolving→merge_ready→merged/failed`)
- `src/specialist/chain-identity.ts` — chain→epic linkage persistence
- `src/specialist/epic-readiness.ts` — merge readiness detection (all chains terminal, tsc pass)
- `src/specialist/runner.ts` — execution, retry logic, output contract injection, bead-aware prompt
- `src/specialist/supervisor.ts` — job lifecycle, FIFO creation, READ_ONLY output auto-append
- `src/specialist/beads.ts` — bead prompt construction, parent epic context, blocker context
- `src/specialist/schema.ts` — JSON schema incl. `max_retries`, `response_format`, `output_schema`
- `src/tools/specialist/use_specialist.tool.ts` — foreground MCP run (`bead_id` aware)

## Operator Notes

- Prefer bead-linked runs for tracked work: `specialists run <name> --bead <id>`
- Steer running specialists: `specialists steer <job-id> "new direction"`
- Resume waiting keep-alive jobs: `specialists resume <job-id> "next task"`
- Observe jobs with `specialists feed -f`
- Monitor all active jobs: `specialists ps` (live: `specialists ps --follow`)
- Stop jobs with terminal status resolution: `specialists stop <job-id>`
- Use `specialists result <job-id>` for final output text
- Edit specialist configs with dot-path syntax: `specialists edit <name> specialist.execution.model anthropic/claude-sonnet-4-6`
- Apply presets for common configurations: `specialists edit <name> --preset cheap|medium|power`
- List available presets: `specialists edit --list-presets`
- READ_ONLY specialist output auto-appends to input bead notes
- `max_retries` in JSON controls transient error retry (default: 0)
- **Memory injection**: Specialists receive `.xtrm/memory.md` + `bd prime` + GitNexus cheatsheet at spawn
- **Edit gate**: Specialists with `--bead` set `bead-claim:<id>` KV key for write access
- **Worktree opt-out**: Set `requires_worktree: false` to bypass isolation guard (workflow specialists)

## Crash Recovery

Supervisor runs `crashRecovery()` at startup to reconcile orphaned jobs:

**Dead running/starting jobs**:
- Dead PID → `error` ("Process crashed or was killed")
- Node members → `waiting`/`recovery_pending` (preserved for NodeSupervisor)

**Dead waiting jobs**:
- Emits `stale_warning` if idle past threshold
- Does NOT auto-close — keep-alive sessions remain recoverable
- Node members preserved

## Epic/Chain Lifecycle (wave-bound publication)

- `sp epic list` — enumerate epics with status and chain counts
- `sp epic status <id>` — chains, blockers, readiness, merge readiness check
- `sp epic merge <id>` — canonical publication for wave-bound chains (topological merge, tsc gate)
- Epic chain membership auto-syncs on job completion (both success/error paths)
- `sp epic resolve <id>` — transition `open→resolving` (operator marks epic as merge-ready target)
- `--epic <id>` on `sp run` — explicit epic membership (prep jobs, chain-root seeding)
- `sp merge <chain>` — guarded: refuses if chain belongs to unresolved epic
- `sp end [--epic <id>] [--pr]` — session close with PR publication; auto-redirects to `sp epic merge` for epic-bound chains

## Documentation

- `docs/cli-reference.md` — complete CLI command reference
- `docs/ARCHITECTURE.md` — event pipeline, RPC adapter, Supervisor lifecycle
- `docs/features.md` — structured output, observation, beads, resume, stuck detection
- `docs/pi-rpc-boundary.md` — what pi owns vs what Specialists owns
- `docs/mcp-tools.md` — single MCP tool contract (`use_specialist`) plus CLI-first guidance

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **specialists** (3492 symbols, 7945 relationships, 297 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
