# Service Skills Set

**Service Skills** give Claude persistent, project-specific operational knowledge about your Docker services. Instead of re-explaining your architecture every session, each service gets a dedicated skill package that Claude loads on demand.

## What It Does

### Three Workflow Skills (Trinity)

| Skill | Role | Invocation |
|-------|------|------------|
| `creating-service-skills` | Builds new skill packages via 3-phase workflow | `/creating-service-skills` |
| `using-service-skills` | Discovers and activates expert personas | Auto (SessionStart hook) |
| `updating-service-skills` | Detects drift when code changes | Auto (PostToolUse hook) |

### Five Hooks

| Hook | Type | Trigger | Effect |
|------|------|---------|--------|
| `SessionStart` | Claude Code | Session opens | Injects service catalog (~150 tokens) |
| `PreToolUse` | Claude Code | Read/Write/Edit/Grep/Glob/Bash | Checks service territory, activates skills |
| `PostToolUse` | Claude Code | Write/Edit | Detects drift, notifies to sync docs |
| `pre-commit` | Git | `git commit` | Warns if source changed without SSOT update |
| `pre-push` | Git | `git push` | Warns if service skills are stale |

## Installation

```bash
# From your project directory
xtrm install project service-skills-set
```

**Post-install:** The Service Skills Set requires Python scripts to be executable. The installer will:
1. Copy skills to `.claude/skills/`
2. Wire `settings.json` hooks
3. Activate git hooks (`pre-commit`, `pre-push`)

## Creating a Service Skill

After installation, invoke the skill in Claude Code:

```bash
/creating-service-skills
```

This runs a 3-phase workflow:

### Phase 1: Automated Skeleton
- Reads `docker-compose*.yml`, `Dockerfile`, dependency files
- Produces `SKILL.md` with `[PENDING RESEARCH]` markers
- Generates script stubs in `scripts/`
- Creates entry in `.claude/skills/service-registry.json`

### Phase 2: Agentic Deep Dive
- Uses Serena LSP for codebase research (75-80% token savings)
- Fills `[PENDING RESEARCH]` markers with actual knowledge
- Sources troubleshooting tables from real failure modes

### Phase 3: Hook Registration
- Verifies `PreToolUse` hook in `settings.json`
- Confirms service territory globs in registry
- Skill now auto-activates on territory file access

## Generated Skill Structure

```
.claude/skills/<service-name>/
├── SKILL.md                  — architecture, failure modes, operations
├── scripts/
│   ├── health_probe.py       — container status check
│   ├── log_hunter.py         — log pattern analysis
│   ├── data_explorer.py      — read-only DB inspection
│   └── <specialist>.py       — service-type inspector
└── references/
    ├── deep_dive.md          — Phase 2 research notes
    └── architecture_ssot.md  — link to project SSOT
```

## Auto-Activation

Skills activate automatically when Claude:
- Operates on files matching territory globs (e.g., `src/auth/**/*.py`)
- Runs Bash commands mentioning service/container name

## Requirements

- Python 3.8+
- Git repository
- Docker Compose project

## Documentation

- Full guide: `.claude/docs/service-skills-set-readme.md`
- Original: `project-skills/service-skills-set/service-skills-readme.md`
