# sync-docs --fix — Result

**Date:** 2026-03-18
**Project root (worktree):** /home/dawid/projects/xtrm-tools/.claude/worktrees/agent-a84e4a4c
**Script:** skills/sync-docs/scripts/doc_structure_analyzer.py

---

## What Was Done

### Step 1: Pre-fix analysis

Ran `doc_structure_analyzer.py --root=<worktree>` (no --fix) to establish baseline:

- **Total issues:** 14
- **README:** EXTRACTABLE (192 lines, 5 sections with extraction candidates, under 200-line bloat threshold)
- **CHANGELOG:** STALE — last entry 2026-03-12, last commit 2026-03-18; package.json at v2.4.0 but latest CHANGELOG entry is v2.0.0
- **docs/ MISSING (5 files):** hooks.md, pi-extensions.md, mcp-servers.md, policies.md, skills.md
- **docs/ INVALID_SCHEMA (7 files):** cleanup.md, delegation-architecture.md, hook-system-summary.md, mcp-servers-config.md, pi-extensions-migration.md, pre-install-cleanup.md, todo.md

### Step 2: --fix mode

Ran `doc_structure_analyzer.py --root=<worktree> --fix`:

**Scaffolded (MISSING):**
- `docs/hooks.md` — triggered by hooks/ directory signal
- `docs/pi-extensions.md` — triggered by config/pi/extensions/ directory signal
- `docs/mcp-servers.md` — triggered by .mcp.json signal
- `docs/policies.md` — triggered by policies/ directory signal
- `docs/skills.md` — triggered by skills/ directory signal

**Frontmatter injected (INVALID_SCHEMA):**
- `docs/cleanup.md`
- `docs/delegation-architecture.md`
- `docs/hook-system-summary.md`
- `docs/mcp-servers-config.md`
- `docs/pi-extensions-migration.md`
- `docs/pre-install-cleanup.md`
- `docs/todo.md`

**Post-fix summary:** 12 issues fixed, 2 remaining (CHANGELOG stale, README extractable — both require manual/Serena intervention, not handled by --fix).

### Step 3: Validate

Ran `validate_doc.py docs/` on the worktree:

**Result: 12/12 files passed**

All files passed schema validation. INDEX tables were auto-generated for 11 files (WARN: INDEX regenerated — expected on first validation pass). `docs/todo.md` already had no headings and passed cleanly.

### Step 4: bd remember

Ran `bd remember` from the main repo root (`/home/dawid/projects/xtrm-tools`):

```
bd remember "sync-docs --fix run 2026-03-18: created 5 scaffold docs/ files (hooks.md, pi-extensions.md, mcp-servers.md, policies.md, skills.md); injected YAML frontmatter into 7 existing schema-invalid files (cleanup.md, delegation-architecture.md, hook-system-summary.md, mcp-servers-config.md, pi-extensions-migration.md, pre-install-cleanup.md, todo.md). All 12/12 docs/ files now pass validate_doc.py. Remaining: CHANGELOG stale (v2.0.0 vs package.json v2.4.0) and README has 5 extraction candidates." --key sync-docs-fix-2026-03-18
```

**Outcome:** `Updated [sync-docs-fix-2026-03-18]` — memory persisted successfully.

Note: `bd remember` must be run from the main repo root where `.beads/` lives, not from a worktree path. The worktree's `.git` is a file (not a directory), and `bd` resolves the database relative to the main repo.

---

## Remaining Issues (not fixable by --fix)

| Issue | Reason | Fix |
|---|---|---|
| CHANGELOG stale (v2.0.0 vs v2.4.0) | Undocumented releases since 2026-03-12 | Run `changelog/add_entry.py` for each missing version |
| README EXTRACTABLE (5 candidates) | Sections exist that belong in docs/ | Use Serena to extract sections into the newly created docs/ files |

---

## Summary

- Ran `doc_structure_analyzer.py --fix` on the worktree
- Fixed 12 of 14 issues: 5 MISSING scaffold files created, 7 INVALID_SCHEMA files had frontmatter injected
- All 12/12 docs/ files pass `validate_doc.py`
- `bd remember` persisted under key `sync-docs-fix-2026-03-18`
