---
name: using-quality-gates
description: 'Quality Gates workflow for Claude Code. Use when editing code in projects with quality enforcement. Covers the full cycle: TDD guard (write failing test first) → implement → auto-lint/typecheck. Activates on code edits, quality issues, or when user asks about testing/linting workflow.'
---

# Using Quality Gates

**Quality Gates** provides automated code quality enforcement through PostToolUse hooks:

1. **TypeScript Quality Gate** — Runs after TS/JS edits: TypeScript + ESLint + Prettier
2. **Python Quality Gate** — Runs after Python edits: Ruff + Mypy

**Separate Installation Required for TDD:**
- **TDD Guard** is a separate tool (not included) — See "TDD Guard Setup" below

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  QUALITY GATES (this skill)                                     │
│  ─────────────────────────────                                  │
│  PostToolUse Hooks (installed by this skill):                   │
│  • .claude/hooks/quality-check.cjs  → TS/JS files              │
│  • .claude/hooks/quality-check.py   → Python files             │
│  • .claude/settings.json            → Hook registration        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  TDD GUARD (separate installation)                              │
│  ───────────────────────────────────                            │
│  PreToolUse Hook (requires xtrm install project tdd-guard):    │
│  • Global CLI: npm install -g tdd-guard                        │
│  • Test reporter: tdd-guard-vitest / tdd-guard-pytest / etc.   │
│  • Hook: .claude/hooks/tdd-guard-pretool-bridge.cjs            │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

### Step 1: Install This Skill

```bash
xtrm install project quality-gates
```

This installs:
- `.claude/hooks/quality-check.cjs` — TypeScript/JavaScript checks
- `.claude/hooks/quality-check.py` — Python checks
- `.claude/settings.json` — PostToolUse hook registration
- `.claude/skills/using-quality-gates/` — This documentation

### Step 2: Install Language Dependencies

**TypeScript Projects:**
```bash
npm install --save-dev typescript eslint prettier
```

**Python Projects:**
```bash
pip install ruff mypy
```

### Step 3: (Optional) Install TDD Guard

For test-first enforcement, install TDD Guard separately:

```bash
# 1. Install global CLI
npm install -g tdd-guard

# 2. Install project-skill for hook wiring
xtrm install project tdd-guard

# 3. Install test reporter (choose one)
npm install --save-dev tdd-guard-vitest    # Vitest
npm install --save-dev tdd-guard-jest      # Jest
pip install tdd-guard-pytest               # pytest
```

**Configure test reporter** (see https://github.com/nizos/tdd-guard):

**Vitest:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { VitestReporter } from 'tdd-guard-vitest'

export default defineConfig({
  test: {
    reporters: ['default', new VitestReporter('/path/to/project')],
  },
})
```

**pytest:**
```toml
# pyproject.toml
[tool.pytest.ini_options]
tdd_guard_project_root = "/path/to/project"
```

## How Quality Gates Work

### TypeScript Quality Gate (PostToolUse)

**Runs after:** Every `.ts`, `.tsx`, `.js`, `.jsx` file edit

**Checks:**
1. TypeScript compilation (type errors)
2. ESLint validation (style, best practices)
3. Prettier formatting (consistency)

**Configuration** (`.claude/hooks/hook-config.json`):
```json
{
  "typescript": { "enabled": true, "showDependencyErrors": false },
  "eslint": { "enabled": true, "autofix": true },
  "prettier": { "enabled": true, "autofix": true },
  "general": { "autofixSilent": true }
}
```

### Python Quality Gate (PostToolUse)

**Runs after:** Every `.py` file edit

**Checks:**
1. Ruff linting (errors, style, best practices)
2. Ruff formatting (Black-compatible)
3. Mypy type checking (static types)

**Configuration** (environment variables):
```bash
CLAUDE_HOOKS_RUFF_ENABLED=true
CLAUDE_HOOKS_MYPY_ENABLED=true
CLAUDE_HOOKS_AUTOFIX=true
```

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | All checks passed | Continue |
| 1 | Fatal error (missing deps) | Install missing tool |
| 2 | Blocking errors | Claude must fix |

## Handling Quality Gate Errors

When blocked with exit code 2:

1. **Read the error output** — Specific issues listed
2. **Auto-fix applies automatically** — ESLint/Prettier/Ruff fix what they can
3. **Fix remaining issues manually** — Type errors, complex violations
4. **Gate re-runs on next edit** — No manual trigger needed

**Example:**
```
[ERROR] TypeScript compilation failed:
  src/auth.ts:42:5 - error TS2322: Type 'string' is not assignable to type 'number'

[WARN] Auto-fix applied: 2 issues fixed
[BLOCK] 1 issue remains - fix before continuing
```

## TDD Guard Integration

When TDD Guard is installed alongside Quality Gates:

```
User Request: "Add feature X"
        ↓
┌───────────────────────────────────┐
│ TDD Guard (PreToolUse)            │
│ Checks: Failing test exists?      │
│ • NO → BLOCK: "Write test first"  │
│ • YES → Allow implementation      │
└───────────────────────────────────┘
        ↓
Implementation (Write/Edit)
        ↓
┌───────────────────────────────────┐
│ Quality Gates (PostToolUse)       │
│ Runs: Lint + Typecheck + Format   │
│ • Errors → BLOCK, fix issues      │
│ • Pass → Continue                 │
└───────────────────────────────────┘
        ↓
Tests pass → Commit
```

## Troubleshooting

**"ESLint not found" / "Prettier not found"**
```bash
npm install --save-dev eslint prettier
```

**"Ruff not found" / "Mypy not found"**
```bash
pip install ruff mypy
```

**"tdd-guard: command not found"**
```bash
npm install -g tdd-guard
```

**"TDD Guard: No failing test found"**
- Write a failing test first
- Ensure test reporter is configured
- Run tests to generate reporter JSON

**Hook not running**
- Verify `.claude/settings.json` exists
- Check hook script paths are correct
- Ensure file extension matches (`.ts`/`.py`)

## When This Skill Activates

**Triggers:**
- Quality gate reports errors
- User asks about linting, type checking, or quality workflow
- Session starts in a project with quality gates installed

**Response Modes:**

**Full Workflow Mode** (user mentions quality/testing, blocked by gate errors):
- Explain complete quality pipeline
- Provide troubleshooting guidance

**Minimal Mode** (general coding tasks without quality context):
- Complete the task directly
- Brief note: "Consider adding tests. If TDD Guard is installed, write failing test first."

## Files Installed

```
.claude/
├── settings.json              # PostToolUse hook registration
├── hooks/
│   ├── quality-check.cjs      # TypeScript/JavaScript checks
│   ├── quality-check.py       # Python checks
│   └── hook-config.json       # TS hook configuration
├── skills/
│   └── using-quality-gates/   # This skill
└── docs/
    └── quality-gates-readme.md
```

## Related

- **TDD Guard**: https://github.com/nizos/tdd-guard
- **xtrm install project tdd-guard**: Install TDD Guard hooks