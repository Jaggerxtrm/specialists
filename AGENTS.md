<!-- xtrm:start -->
# XTRM Agent Workflow

> Full reference: [XTRM-GUIDE.md](XTRM-GUIDE.md)
> Run `bd prime` at session start (or after context reset) for live beads workflow context.

## Session Start

1. `bd prime` — load workflow context and active claims
2. `bd memories <keyword>` — retrieve memories relevant to today's task
3. `bd recall <key>` — retrieve a specific memory by key if needed
4. `bv --robot-triage` — graph-aware triage: ranked picks, unblock targets, project health
5. `bd update <id> --claim` — claim before any file edit

## Active Gates (extensions enforce these — not optional)

| Gate | Trigger | Required action |
|------|---------|-----------------|
| **Edit** | Write/Edit without active claim | `bd update <id> --claim` |
| **Commit** | `git commit` while claim is open | `bd close <id>` first, then commit |
| **Stop** | Session end with unclosed claim | `bd close <id>` |
| **Memory** | Auto-fires at session end if issue closed | `bd remember "<insight>"` then run the `bd kv set` command shown in the gate message |

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

## Quality Gates (automatic)

Run on every file edit via PostToolUse extension:
- **TypeScript/JS**: ESLint + tsc
- **Python**: ruff + mypy

Gate output appears as extension context. Fix failures before proceeding — do not commit with lint errors.

## bv — Graph-Aware Triage

bv is a graph-aware triage engine for the beads issue board. Use it instead of `bd ready` when you need ranked picks, dependency-aware scheduling, or project health signals.

> **CRITICAL: Use ONLY `--robot-*` flags. Bare `bv` launches an interactive TUI that blocks your session.**

```bash
bv --robot-triage             # THE entry point — ranked picks, quick wins, blockers, health
bv --robot-next               # Single top pick + claim command (minimal output)
bv --robot-triage --format toon  # Token-optimized output for lower context usage
```

**Scope boundary:** bv = *what to work on*. `bd` = creating, claiming, closing issues.

### Planning & Analysis

| Command | Returns |
|---------|---------|
| `--robot-plan` | Parallel execution tracks with unblocks lists |
| `--robot-priority` | Priority misalignment detection |
| `--robot-insights` | Full graph metrics: PageRank, betweenness, HITS, eigenvector, critical path, cycles |
| `--robot-forecast <id\|all>` | ETA predictions with dependency-aware scheduling |
| `--robot-alerts` | Stale issues, blocking cascades, priority mismatches |
| `--robot-diff --diff-since <ref>` | Changes since ref: new/closed/modified, cycles introduced/resolved |

### Scoping & Filtering

```bash
bv --robot-plan --label backend        # Scope to label's subgraph
bv --recipe actionable --robot-plan    # Pre-filter: ready to work (no blockers)
bv --recipe high-impact --robot-triage # Pre-filter: top PageRank scores
bv --robot-triage --robot-triage-by-track  # Group by parallel work streams
```

### Understanding Output

- `data_hash` — fingerprint of beads state (verify consistency across calls)
- Phase 1 (instant): degree, topo sort, density
- Phase 2 (async, 500ms): PageRank, betweenness, HITS, cycles — check `status` flags

```bash
bv --robot-triage | jq '.quick_ref'              # At-a-glance summary
bv --robot-triage | jq '.recommendations[0]'     # Top recommendation
bv --robot-plan | jq '.plan.summary.highest_impact'
bv --robot-insights | jq '.Cycles'               # Circular deps — must fix
```

## Worktree Sessions

- `xt pi` — launch Pi in a sandboxed worktree
- `xt end` — close session: commit / push / PR / cleanup
<!-- xtrm:end -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **specialists** (702 symbols, 1583 relationships, 51 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs via Dolt:

- Each write auto-commits to Dolt history
- Use `bd dolt push`/`bd dolt pull` for remote sync
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->

## Specialists

Call `specialist_init` at the start of every session to bootstrap context and
see available specialists. Use `use_specialist` or `start_specialist` to
delegate heavy tasks (code review, bug hunting, deep reasoning) to the right
specialist without user intervention.

Add custom specialists to `.specialists/user/specialists/` to extend the defaults.
