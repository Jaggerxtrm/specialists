# Quality Gates

**PostToolUse code quality hooks** for Claude Code. Runs automatically after file edits to enforce linting, type checking, and formatting standards.

## What This Installs

**TypeScript Quality Gate** (`.ts`, `.tsx`, `.js`, `.jsx`):
- TypeScript compilation check
- ESLint validation + auto-fix
- Prettier formatting + auto-fix

**Python Quality Gate** (`.py`):
- Ruff linting + auto-fix
- Ruff formatting + auto-fix
- Mypy type checking

## Installation

```bash
# 1. Install this skill
xtrm install project quality-gates

# 2. Install language dependencies
npm install --save-dev typescript eslint prettier  # TypeScript
pip install ruff mypy                               # Python
```

## What Gets Installed

```
.claude/
├── settings.json              # PostToolUse hook registration
├── hooks/
│   ├── quality-check.cjs      # TypeScript/JavaScript checks
│   ├── quality-check.py       # Python checks
│   └── hook-config.json       # TS hook configuration
├── skills/
│   └── using-quality-gates/   # Skill documentation
└── docs/
    └── quality-gates-readme.md
```

## How It Works

After every file edit:
1. Hook detects file type (TS/JS or Python)
2. Runs appropriate quality checks
3. Auto-fixes issues when possible
4. Returns exit code:
   - `0` = All checks passed
   - `2` = Blocking errors (Claude must fix)

## Configuration

### TypeScript

Edit `.claude/hooks/hook-config.json`:

```json
{
  "typescript": { "enabled": true, "showDependencyErrors": false },
  "eslint": { "enabled": true, "autofix": true },
  "prettier": { "enabled": true, "autofix": true }
}
```

### Python

Set environment variables:

```bash
export CLAUDE_HOOKS_RUFF_ENABLED=true
export CLAUDE_HOOKS_MYPY_ENABLED=true
export CLAUDE_HOOKS_AUTOFIX=true
```

## TDD Guard (Separate Installation)

For test-first enforcement, install TDD Guard separately:

```bash
# 1. Global CLI
npm install -g tdd-guard

# 2. Project skill for hooks
xtrm install project tdd-guard

# 3. Test reporter (choose one)
npm install --save-dev tdd-guard-vitest    # Vitest
npm install --save-dev tdd-guard-jest      # Jest
pip install tdd-guard-pytest               # pytest
```

See: https://github.com/nizos/tdd-guard

## Troubleshooting

| Error | Fix |
|-------|-----|
| "ESLint not found" | `npm install --save-dev eslint prettier` |
| "Ruff not found" | `pip install ruff mypy` |
| "tdd-guard: command not found" | `npm install -g tdd-guard` |
| Hook not running | Check `.claude/settings.json` exists |

## Related

- **TDD Guard**: https://github.com/nizos/tdd-guard
- **Ruff**: https://docs.astral.sh/ruff/
- **Mypy**: https://mypy.readthedocs.io/