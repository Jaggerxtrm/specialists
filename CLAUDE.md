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
| **Memory** | Auto-fires at Stop if issue closed this session | `bd remember "<insight>"` then run the `bd kv set` command shown in the gate message |

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
bd close <id>                          # Close issue
bd close <id> --reason="Done: ..."     # Close with context
bd close <id1> <id2> <id3>            # Batch close

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

# CLAUDE.md - AI Agent Development Guide

> **Purpose**: Operational guidance for the current Specialists codebase and MCP surface.

## Project Overview

**Specialists** is a project-scoped MCP server that discovers `.specialist.yaml` files and executes them through `pi` RPC sessions. The runtime is bead-first: when a run is bead-linked, the bead is the task source and run metadata keeps bead linkage throughout execution and feed output.

## Architecture (current)

### Core surfaces

- **CLI**: `specialists run|resume|feed|result|status|stop|list|init|doctor`
- **MCP tools**: `specialist_init`, `list_specialists`, `use_specialist`, `start_specialist`, `feed_specialist`, `stop_specialist`, `steer_specialist`, `resume_specialist`, `run_parallel`, `specialist_status`
- **Runtime persistence**: `.specialists/jobs/<job-id>/{status.json,events.jsonl,result.txt}`

### pi usage (preferred)

In pi sessions, run specialists through CLI/bash and monitor long jobs via the process extension.

- Start: `process start "specialists run <name> --bead <id> --background" name="sp-<name>"`
- Monitor: `process list`, `process output id="sp-<name>"`, `process logs id="sp-<name>"`
- Control: `process kill id="sp-<name>"`, `process clear`
- TUI shortcuts: `/ps`, `/ps:pin`, `/ps:logs`, `/ps:kill`, `/ps:clear`, `/ps:dock`, `/ps:settings`

### Current execution semantics

1. `run --bead <id>` / `use_specialist({bead_id})`
   - Reads bead via `bd show --json`
   - Builds prompt from bead context + optional completed blockers
   - Threads bead linkage as `inputBeadId`
2. Supervisor writes `status.json` immediately (including `bead_id` when available)
3. Timeline emits structured events (`run_start`, `meta`, `tool`, `text`, `thinking`, `run_complete`)
4. Feed/observers expose the same run with event envelope metadata (`jobId`, `specialist`, `model`, `backend`, `beadId`, `elapsed_ms`)

### Important behavioral updates

- `follow-up` is deprecated in favor of `resume` semantics
- `--json` = NDJSON event stream; `--raw` = legacy raw progress deltas
- `required_tools` is validated against `permission_required` before run start
- `feed_specialist` is the canonical MCP observation tool (cursor-paginated)

## Key Files Reference (current)

- `src/cli/run.ts` — run command parsing, `--bead`, output modes (`human|json|raw`), event tailing
- `src/cli/resume.ts` — resume keep-alive jobs in `waiting`
- `src/cli/follow-up.ts` — deprecated alias to `resume`
- `src/cli/feed.ts` — merged feed stream, envelope metadata, cursor behavior
- `src/specialist/runner.ts` — specialist execution, `required_tools` validation vs permission
- `src/specialist/supervisor.ts` — job lifecycle persistence (`status.json`, `events.jsonl`, `result.txt`)
- `src/specialist/beads.ts` — bead prompt construction and blocker context
- `src/tools/specialist/use_specialist.tool.ts` — foreground MCP run (`bead_id` aware)
- `src/tools/specialist/start_specialist.tool.ts` — async MCP run returning `job_id`
- `src/tools/specialist/feed_specialist.tool.ts` — cursor-paginated MCP event observation

## Operator Notes

- Prefer bead-linked runs for tracked work: `specialists run <name> --bead <id>`
- Observe background jobs with `specialists feed -f` or MCP `feed_specialist`
- Use `specialists result <job-id>` for final output text
- `required_tools` is enforced pre-run against `permission_required`
- `resume` is for waiting keep-alive jobs; `steer` is for running jobs

## Legacy

Historical architecture notes were removed from this section because they referenced pre-refactor runtime details and deprecated backend assumptions. Use:
- `README.md` for user-facing workflow
- `docs/workflow.md` for canonical run semantics
- `docs/cli-reference.md` for CLI flags and behavior
- `docs/background-jobs.md` for runtime file/state layout
