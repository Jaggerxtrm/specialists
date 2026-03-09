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
├── MCP Surface (8 tools)
│   ├── specialist_init    — session bootstrap: bd init + list specialists
│   ├── list_specialists   — discover .specialist.yaml across 3 scopes
│   ├── use_specialist     — full lifecycle: load → agents.md → pi → output
│   ├── run_parallel       — concurrent or pipeline execution
│   ├── specialist_status  — circuit breaker health + staleness detection
│   ├── start_specialist   — async job start, returns job ID
│   ├── poll_specialist    — poll job status/output by ID + beadId
│   └── stop_specialist    — cancel a running job by ID
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
# GitNexus MCP

This project is indexed by GitNexus as **unitAI** (626 symbols, 1239 relationships, 41 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/refactoring/SKILL.md` |

## Tools Reference

| Tool | What it gives you |
|------|-------------------|
| `query` | Process-grouped code intelligence — execution flows related to a concept |
| `context` | 360-degree symbol view — categorized refs, processes it participates in |
| `impact` | Symbol blast radius — what breaks at depth 1/2/3 with confidence |
| `detect_changes` | Git-diff impact — what do your current changes affect |
| `rename` | Multi-file coordinated rename with confidence-tagged edits |
| `cypher` | Raw graph queries (read `gitnexus://repo/{name}/schema` first) |
| `list_repos` | Discover indexed repos |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource | Content |
|----------|---------|
| `gitnexus://repo/{name}/context` | Stats, staleness check |
| `gitnexus://repo/{name}/clusters` | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
