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

> **Purpose**: This file provides AI agents (especially Claude) with comprehensive context about the OmniSpecialist project architecture, development environment, and coding conventions.

## Project Overview

**OmniSpecialist** is a unified Model Context Protocol (MCP) server that orchestrates multiple AI backends (Gemini, Cursor, Droid) with intelligent workflows, circuit breaker resilience, and specialized agent roles.

**Core Philosophy**: "One MCP Server. Multiple AI Backends. Intelligent Orchestration."

**Target Users**: This tool is designed primarily for **AI agents (like Claude) to use autonomously** for offloading heavy tasks to specialized backends.

## Architecture

### System Components (v2 — Specialist System)

```
OmniSpecialist MCP Server v2
├── MCP Surface (11 tools)
│   ├── specialist_init    — session bootstrap: bd init + list specialists
│   ├── list_specialists   — discover .specialist.yaml across 3 scopes
│   ├── use_specialist     — full lifecycle: load → agents.md → pi → output
│   ├── run_parallel       — concurrent or pipeline execution
│   ├── specialist_status  — circuit breaker health + staleness detection
│   ├── start_specialist   — async job start, returns job ID
│   ├── feed_specialist    — poll job status/delta events by ID (replaces poll_specialist)
│   ├── stop_specialist    — cancel a running job by ID
│   ├── steer_specialist   — send mid-run message to a running job
│   └── resume_specialist  — resume a waiting keep-alive session with next-turn prompt
├── Specialist System
│   ├── SpecialistLoader   — 3-scope discovery (project/user/system), caching
│   ├── SpecialistRunner   — agents.md injection, pre/post scripts, circuit breaker
│   │                        BeadsClient injected via RunnerDeps — MUST be passed
│   │                        from server.ts constructor or beads lifecycle is a no-op
│   ├── BeadsClient        — spawnSync bd q/close/audit; wired in server.ts constructor
│   ├── HookEmitter        — 4-point lifecycle hooks, JSONL sink at .specialists/trace.jsonl
│   └── pipeline.ts        — sequential $previous_result chaining
├── Execution Substrate
│   └── PiAgentSession     — spawns coding-agent CLI, handles agent_end event
├── Resilience
│   └── CircuitBreaker     — 3-state CLOSED/HALF_OPEN/OPEN per backend
└── Analytics (kept)
    ├── ActivityRepository
    └── ActivityAnalytics
```

### Key Design Patterns

1. **Backend Specialization**: Each backend has a defined role (Architect/Implementer/Tester)
2. **Circuit Breaker**: Automatic fallback when primary backend fails
3. **Workflow Composition**: Multi-phase agentic processes for complex tasks
4. **Permission Tiers**: READ_ONLY → LOW → MEDIUM → HIGH
5. **Tool Registry**: Zod schema validation for all tool invocations

## Directory Structure

```
OmniSpecialist/
├── src/                      # Source code (TypeScript)
│   ├── agents/              # Agent role definitions
│   ├── cli/                 # CLI commands and dashboards
│   ├── repositories/        # Data persistence (SQLite)
│   ├── services/            # Core services (permission, analytics)
│   ├── tools/               # MCP tool implementations
│   │   ├── meta/           # Git, file operations
│   │   └── registry.ts     # Tool registration
│   ├── utils/              # Utilities
│   │   ├── aiExecutor.ts   # Backend execution engine
│   │   └── permissionManager.ts
│   ├── workflows/          # Smart workflow implementations
│   │   ├── overthinker.workflow.ts
│   │   ├── init-session.workflow.ts
│   │   └── types.ts
│   ├── constants.ts        # AI_MODELS, BACKENDS, CLI flags
│   ├── dependencies.ts     # Tool dependencies
│   ├── server.ts           # MCP server setup
│   └── index.ts            # Entry point
├── dist/                    # Compiled JavaScript
├── tests/                   # Vitest test suites
│   ├── unit/
│   └── integration/
├── .serena/                 # Serena SSOT documentation
│   └── memories/           # Single Source of Truth files
│       ├── ssot_architecture_backends_2026-02.md
│       ├── ssot_workflow_overthinker_status.md
│       └── ssot_workflows_init_session_2026-01-22.md
├── .unitai/                 # Workflow outputs
│   └── overthinking.md     # Overthinker workflow results
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md
│   ├── WORKFLOWS.md
│   └── plans/              # Design documents
├── .claude/                 # Claude CLI extensions (optional)
│   ├── commands/           # Slash commands
│   ├── skills/             # Reusable skills
│   └── hooks/              # Event hooks
├── package.json            # NPM metadata (version, dependencies)
├── tsconfig.json           # TypeScript configuration
├── vitest.config.ts        # Test configuration
├── README.md               # User-facing documentation
├── CHANGELOG.md            # Version history
└── CLAUDE.md               # This file (AI agent guide)
```

## Key Files Reference

### Core Configuration

| File | Purpose | When to Modify |
|------|---------|----------------|
| `src/constants.ts` | AI models, backends, CLI flags | Adding new backends or models |
| `src/dependencies.ts` | Tool dependency requirements | Defining tool prerequisites |
| `src/server.ts` | MCP server setup and tool registration | Adding new MCP tools |
| `package.json` | Version, dependencies, scripts | Updating version or adding deps |

### Backend Execution

| File | Purpose | When to Use |
|------|---------|-------------|
| `src/utils/aiExecutor.ts` | Core backend execution logic | Invoking AI backends programmatically |
| `src/tools/registry.ts` | Tool registration and validation | Understanding available tools |
| `src/utils/permissionManager.ts` | Autonomy level enforcement | Checking permission requirements |

### Workflows

| File | Purpose | Current Status |
|------|---------|----------------|
| `src/workflows/overthinker.workflow.ts` | Deep reasoning workflow | **v1.0 - Active** |
| `src/workflows/init-session.workflow.ts` | Session initialization | **Active** |
| `docs/plans/2026-01-21-overthinker-enhancements-design.md` | Overthinker v2.0 plan | **NOT Implemented** |

### Documentation

| File | Purpose | Audience |
|------|---------|----------|
| `README.md` | User guide, installation, features | End users |
| `CLAUDE.md` | AI agent development context | AI agents |
| `CHANGELOG.md` | Version history and changes | Developers |
| `.serena/memories/*.md` | SSOT technical documentation | Developers and AI agents |

## Development Environment

### Prerequisites

- **Node.js**: 18.x or higher
- **TypeScript**: 5.0+
- **Package Manager**: npm or pnpm
- **CLI Tools**:
  - `gemini` - Google Gemini CLI
  - `cursor-agent` - Cursor Agent CLI
  - `droid` - Factory Droid CLI (GLM-4.6)

### Setup

```bash
# Clone repository
git clone https://github.com/Jaggerxtrm/omnispecialist.git
cd omnispecialist

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Start development server
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run dev` | Build and run MCP server |
| `npm run lint` | TypeScript type checking |
| `npm test` | Run Vitest tests |

## Coding Conventions

### TypeScript Standards

- **Strict mode enabled**: All files use TypeScript strict checks
- **Zod schemas**: All tool parameters validated with Zod
- **Error handling**: Use try-catch with descriptive error messages
- **Async/await**: Prefer async/await over promises
- **Type exports**: Export types from definition files

### File Organization

- **Tool files**: `src/tools/<category>/<tool-name>.tool.ts`
- **Workflow files**: `src/workflows/<workflow-name>.workflow.ts`
- **Utility files**: `src/utils/<utility-name>.ts`
- **Test files**: `tests/<unit|integration>/<file-name>.test.ts`

### Naming Conventions

- **Constants**: UPPER_SNAKE_CASE (e.g., `AI_MODELS`, `BACKENDS`)
- **Functions**: camelCase (e.g., `executeOverthinker`, `formatWorkflowOutput`)
- **Types/Interfaces**: PascalCase (e.g., `WorkflowDefinition`, `OverthinkerParams`)
- **Files**: kebab-case (e.g., `overthinker.workflow.ts`, `ai-executor.ts`)

### Code Style

```typescript
// Good: Use constants from constants.ts
import { AI_MODELS, BACKENDS } from './constants.js';
const model = AI_MODELS.GEMINI.FLASH;

// Bad: Hardcode model strings
const model = "gemini-3-flash-preview";

// Good: Zod schema validation
const schema = z.object({
  prompt: z.string(),
  model: z.string().optional()
});

// Good: Descriptive error messages
throw new Error(`Failed to execute ${backend}: ${e.message}`);

// Good: Async/await with try-catch
try {
  const result = await executeAIClient({ backend, prompt });
} catch (e: any) {
  onProgress?.(`Error: ${e.message}`);
}
```

## Working with Backends

### Backend Selection Logic

```typescript
// Use constants for backend selection
import { BACKENDS } from './constants.js';

// Architect role (design, reasoning)
const backend = BACKENDS.GEMINI;

// Implementer role (code generation)
const backend = BACKENDS.DROID;

// Tester role (test generation)
const backend = BACKENDS.CURSOR;
```

### Model Selection

```typescript
import { AI_MODELS } from './constants.js';

// Fast tasks, context gathering
const model = AI_MODELS.GEMINI.FLASH;  // gemini-3-flash-preview

// Deep reasoning, architecture
const model = AI_MODELS.GEMINI.PRIMARY; // gemini-3-pro-preview

// Budget-conscious testing
const model = AI_MODELS.CURSOR_AGENT.HAIKU_5;
```

### Executing AI Clients

```typescript
import { executeAIClient, BACKENDS } from './utils/aiExecutor.js';

const result = await executeAIClient({
  backend: BACKENDS.GEMINI,
  prompt: "Analyze this architecture",
  outputFormat: "text",  // or "json"
  model: AI_MODELS.GEMINI.FLASH  // optional override
});
```

## Workflow Development

### Creating a New Workflow

1. **Define schema** (Zod validation):
```typescript
const myWorkflowSchema = z.object({
  inputPrompt: z.string(),
  iterations: z.number().default(3).optional()
});

export type MyWorkflowParams = z.infer<typeof myWorkflowSchema> & BaseWorkflowParams;
```

2. **Implement workflow function**:
```typescript
export async function executeMyWorkflow(
  params: MyWorkflowParams,
  onProgress?: ProgressCallback
): Promise<string> {
  const { inputPrompt, iterations } = params;

  onProgress?.("Starting workflow...");

  // Phase 1: Initial processing
  const phase1 = await executeAIClient({
    backend: BACKENDS.GEMINI,
    prompt: inputPrompt
  });

  // Return formatted result
  return formatWorkflowOutput(phase1);
}
```

3. **Register workflow** in `src/workflows/types.ts` or tool registry

4. **Add tests** in `tests/integration/workflows.test.ts`

### Workflow Best Practices

- **Progress callbacks**: Use `onProgress?.()` for user feedback
- **Error handling**: Wrap AI calls in try-catch with fallbacks
- **Context gathering**: Read project files when needed
- **Output persistence**: Save results to `.unitai/` directory
- **Iterative refinement**: Allow multiple review cycles

## SSOT Documentation System

### Serena Memories (`.serena/memories/`)

Single Source of Truth files for project knowledge:

- **Naming**: `ssot_<domain>_<subdomain>_YYYY-MM-DD.md`
- **Metadata**: YAML frontmatter with version, changelog, scope
- **Categories**: ssot, pattern, plan, reference
- **Purpose**: Permanent technical knowledge, not temporary analysis

### When to Create SSOT

**Do create SSOT for**:
- New workflow implementations
- Backend architecture changes
- Design patterns and conventions
- Component behaviors and quirks

**Don't create SSOT for**:
- Temporary investigation results (use git commits)
- One-off analysis (use Serena memory)
- Bug fix summaries (use changelog)

### SSOT Template

```markdown
---
title: <Descriptive Title>
version: 1.0.0
updated: YYYY-MM-DD
scope: <workflow|architecture|pattern>
category: ssot
subcategory: <specific area>
domain: [<domain>, <subdomain>]
applicability: all
changelog:
  - 1.0.0 (YYYY-MM-DD): Initial creation. <Brief description>
---

## Purpose
<What this SSOT documents>

## <Content sections>
...
```

## Common Development Tasks

### Adding a New AI Backend

1. Update `src/constants.ts`:
```typescript
export const AI_MODELS = {
  NEW_BACKEND: {
    PRIMARY: "model-id-here"
  }
};

export const BACKENDS = {
  NEW_BACKEND: "ask-new-backend"
};
```

2. Create CLI wrapper in `src/utils/aiExecutor.ts`

3. Add to agent roles if applicable

4. Update SSOT: `ssot_architecture_backends_YYYY-MM-DD.md`

### Updating Model Versions

1. Update `src/constants.ts` → `AI_MODELS`
2. Update workflow defaults if affected
3. Update SSOT files referencing old versions
4. Add migration note to `CHANGELOG.md`
5. Test workflows with new model

### Releasing a New Version

1. Update `package.json` version
2. Add entry to `CHANGELOG.md` under `[X.Y.Z]`
3. Move `[Unreleased]` items to new version section
4. Commit: `git commit -m "chore: release vX.Y.Z"`
5. Tag: `git tag -a vX.Y.Z -m "Release X.Y.Z"`
6. Push: `git push && git push --tags`
7. Publish: `npm publish` (if applicable)

## Troubleshooting

### Common Issues

**Backend not responding**:
- Check CLI tool availability: `which gemini`, `which cursor-agent`, `which droid`
- Verify API keys/authentication for backend
- Check circuit breaker status in logs

**Workflow fails mid-execution**:
- Review `onProgress` logs for specific phase failure
- Check permission level requirements
- Verify context files exist and are readable

**Tests failing**:
- Run `npm run lint` for TypeScript errors
- Check for hardcoded model versions (should use constants)
- Verify test mocks match current backend signatures

## Related Documentation

- **README.md** - User guide and installation
- **CHANGELOG.md** - Version history
- **docs/ARCHITECTURE.md** - System architecture details
- **docs/WORKFLOWS.md** - Workflow specifications
- **.serena/memories/** - SSOT technical documentation

## Questions?

For development questions or contributions:
- GitHub Issues: https://github.com/Jaggerxtrm/omnispecialist/issues
- Beta Testing Guide: `beta-testing.md`
- Discord Community: (see `gsd:join-discord` if available)

---

**Last Updated**: 2026-03-07
**Version**: 2.0.0
**Target AI Agents**: Claude, Gemini, Cursor, Droid

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

<!-- mulch:start -->
## Project Expertise (Mulch)
<!-- mulch-onboard-v:1 -->

This project uses [Mulch](https://github.com/jayminwest/mulch) for structured expertise management.

**At the start of every session**, run:
```bash
mulch prime
```

This injects project-specific conventions, patterns, decisions, and other learnings into your context.
Use `mulch prime --files src/foo.ts` to load only records relevant to specific files.

**Before completing your task**, review your work for insights worth preserving — conventions discovered,
patterns applied, failures encountered, or decisions made — and record them:
```bash
mulch record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
```

Link evidence when available: `--evidence-commit <sha>`, `--evidence-bead <id>`

Run `mulch status` to check domain health and entry counts.
Run `mulch --help` for full usage.
Mulch write commands use file locking and atomic writes — multiple agents can safely record to the same domain concurrently.

### Before You Finish

1. Discover what to record:
   ```bash
   mulch learn
   ```
2. Store insights from this work session:
   ```bash
   mulch record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
   ```
3. Validate and commit:
   ```bash
   mulch sync
   ```
<!-- mulch:end -->

<!-- seeds:start -->
## Issue Tracking (Seeds)
<!-- seeds-onboard-v:1 -->

This project uses [Seeds](https://github.com/jayminwest/seeds) for git-native issue tracking.

**At the start of every session**, run:
```
sd prime
```

This injects session context: rules, command reference, and workflows.

**Quick reference:**
- `sd ready` — Find unblocked work
- `sd create --title "..." --type task --priority 2` — Create issue
- `sd update <id> --status in_progress` — Claim work
- `sd close <id>` — Complete work
- `sd dep add <id> <depends-on>` — Add dependency between issues
- `sd sync` — Sync with git (run before pushing)

### Before You Finish
1. Close completed issues: `sd close <id>`
2. File issues for remaining work: `sd create --title "..."`
3. Sync and push: `sd sync && git push`
<!-- seeds:end -->

<!-- canopy:start -->
## Prompt Management (Canopy)
<!-- canopy-onboard-v:1 -->

This project uses [Canopy](https://github.com/jayminwest/canopy) for git-native prompt management.

**At the start of every session**, run:
```
cn prime
```

This injects prompt workflow context: commands, conventions, and common workflows.

**Quick reference:**
- `cn list` — List all prompts
- `cn render <name>` — View rendered prompt (resolves inheritance)
- `cn emit --all` — Render prompts to files
- `cn update <name>` — Update a prompt (creates new version)
- `cn sync` — Stage and commit .canopy/ changes

**Do not manually edit emitted files.** Use `cn update` to modify prompts, then `cn emit` to regenerate.
<!-- canopy:end -->
