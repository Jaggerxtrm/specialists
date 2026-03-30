# sync-docs --fix Evaluation Result

**Date:** 2026-03-18
**Working directory:** `/home/dawid/projects/xtrm-tools/.claude/worktrees/agent-ad500878`

---

## Command Executed

```bash
python3 /home/dawid/projects/xtrm-tools/skills/sync-docs/scripts/doc_structure_analyzer.py \
  --fix --bd-remember \
  --root=/home/dawid/projects/xtrm-tools/.claude/worktrees/agent-ad500878
```

Note: The script was invoked from the main repo path (not the worktree) because `skills/sync-docs/` is not present in the worktree. `--root` was passed explicitly to target the worktree.

---

## Full Script Output

```
Fixing 5 missing docs/ files...
  CREATED docs/hooks.md
  CREATED docs/pi-extensions.md
  CREATED docs/mcp-servers.md
  CREATED docs/policies.md
  CREATED docs/skills.md

Injecting frontmatter into 7 schema-invalid docs/ files...
  FIXED   docs/cleanup.md
  FIXED   docs/delegation-architecture.md
  FIXED   docs/hook-system-summary.md
  FIXED   docs/mcp-servers-config.md
  FIXED   docs/pi-extensions-migration.md
  FIXED   docs/pre-install-cleanup.md
  FIXED   docs/todo.md
{
  "project_root": "/home/dawid/projects/xtrm-tools/.claude/worktrees/agent-ad500878",
  "summary": {
    "total_issues": 14,
    "needs_attention": true
  },
  "readme": {
    "status": "EXTRACTABLE",
    "path": "README.md",
    "line_count": 192,
    "section_count": 24,
    "threshold": 200,
    "extraction_candidates": [
      { "section": "### Skills", "suggest": "docs/skills.md", "reason": "Skills catalog" },
      { "section": "## Policy System", "suggest": "docs/policies.md", "reason": "Policy reference" },
      { "section": "### Policy Files", "suggest": "docs/policies.md", "reason": "Policy reference" },
      { "section": "## Hooks Reference", "suggest": "docs/hooks.md", "reason": "Hooks reference" },
      { "section": "## MCP Servers", "suggest": "docs/mcp-servers.md", "reason": "MCP server configuration" }
    ],
    "issues": []
  },
  "changelog": {
    "status": "STALE",
    "path": "CHANGELOG.md",
    "last_entry_date": "2026-03-12",
    "last_commit_date": "2026-03-18",
    "package_version": "2.4.0",
    "latest_changelog_version": "2.0.0",
    "issues": [
      "package.json is at v2.4.0 but latest CHANGELOG entry is v2.0.0 — release is undocumented"
    ]
  },
  "docs_gaps": [
    { "status": "MISSING", "path": "docs/hooks.md", "reason": "hooks/ directory exists", "signal": "hooks/" },
    { "status": "MISSING", "path": "docs/pi-extensions.md", "reason": "Pi extensions directory exists", "signal": "config/pi/extensions/" },
    { "status": "MISSING", "path": "docs/mcp-servers.md", "reason": ".mcp.json present", "signal": ".mcp.json" },
    { "status": "MISSING", "path": "docs/policies.md", "reason": "policies/ directory exists", "signal": "policies/" },
    { "status": "MISSING", "path": "docs/skills.md", "reason": "skills/ directory exists", "signal": "skills/" }
  ],
  "existing_docs": [
    { "status": "INVALID_SCHEMA", "path": "docs/cleanup.md", "line_count": 438, "has_frontmatter": false },
    { "status": "INVALID_SCHEMA", "path": "docs/delegation-architecture.md", "line_count": 185, "has_frontmatter": false },
    { "status": "INVALID_SCHEMA", "path": "docs/hook-system-summary.md", "line_count": 176, "has_frontmatter": false },
    { "status": "INVALID_SCHEMA", "path": "docs/mcp-servers-config.md", "line_count": 364, "has_frontmatter": false },
    { "status": "INVALID_SCHEMA", "path": "docs/pi-extensions-migration.md", "line_count": 56, "has_frontmatter": false },
    { "status": "INVALID_SCHEMA", "path": "docs/pre-install-cleanup.md", "line_count": 107, "has_frontmatter": false },
    { "status": "INVALID_SCHEMA", "path": "docs/todo.md", "line_count": 4, "has_frontmatter": false }
  ],
  "fix_created": [
    "docs/hooks.md",
    "docs/pi-extensions.md",
    "docs/mcp-servers.md",
    "docs/policies.md",
    "docs/skills.md"
  ],
  "fix_schema_fixed": [
    "docs/cleanup.md",
    "docs/delegation-architecture.md",
    "docs/hook-system-summary.md",
    "docs/mcp-servers-config.md",
    "docs/pi-extensions-migration.md",
    "docs/pre-install-cleanup.md",
    "docs/todo.md"
  ],
  "bd_remember": {
    "stored": false,
    "key": "sync-docs-fix-2026-03-18",
    "insight": "sync-docs --fix: created 5 scaffold(s): hooks.md, pi-extensions.md, mcp-servers.md, policies.md, skills.md; added frontmatter to 7 existing file(s): cleanup.md, delegation-architecture.md, hook-system-summary.md, mcp-servers-config.md, pi-extensions-migration.md, pre-install-cleanup.md, todo.md. Fill in content and run validate_doc.py docs/ to confirm schema."
  }
}
```

---

## Files Created (scaffolds for MISSING docs/ gaps)

| File | Reason |
|---|---|
| `docs/hooks.md` | `hooks/` directory exists |
| `docs/pi-extensions.md` | `config/pi/extensions/` directory exists |
| `docs/mcp-servers.md` | `.mcp.json` present |
| `docs/policies.md` | `policies/` directory exists |
| `docs/skills.md` | `skills/` directory exists |

## Files Schema-Fixed (frontmatter injected into INVALID_SCHEMA files)

| File | Lines before fix |
|---|---|
| `docs/cleanup.md` | 438 |
| `docs/delegation-architecture.md` | 185 |
| `docs/hook-system-summary.md` | 176 |
| `docs/mcp-servers-config.md` | 364 |
| `docs/pi-extensions-migration.md` | 56 |
| `docs/pre-install-cleanup.md` | 107 |
| `docs/todo.md` | 4 |

---

## bd Memory

- **Key attempted:** `sync-docs-fix-2026-03-18`
- **Insight:** `sync-docs --fix: created 5 scaffold(s): hooks.md, pi-extensions.md, mcp-servers.md, policies.md, skills.md; added frontmatter to 7 existing file(s): cleanup.md, delegation-architecture.md, hook-system-summary.md, mcp-servers-config.md, pi-extensions-migration.md, pre-install-cleanup.md, todo.md. Fill in content and run validate_doc.py docs/ to confirm schema.`
- **Stored:** false — `bd` could not persist because no `.beads/` directory exists in the worktree (the script guards on `(root / ".beads").exists()`). The key and insight were computed and are recorded here for reference.

---

## validate_doc.py docs/ Result

```
 docs/cleanup.md [PASS]
    WARN:  INDEX regenerated

 docs/delegation-architecture.md [PASS]
    WARN:  INDEX regenerated

 docs/hook-system-summary.md [PASS]
    WARN:  INDEX regenerated

 docs/hooks.md [PASS]
    WARN:  INDEX regenerated

 docs/mcp-servers-config.md [PASS]
    WARN:  INDEX regenerated

 docs/mcp-servers.md [PASS]
    WARN:  INDEX regenerated

 docs/pi-extensions-migration.md [PASS]
    WARN:  INDEX regenerated

 docs/pi-extensions.md [PASS]
    WARN:  INDEX regenerated

 docs/policies.md [PASS]
    WARN:  INDEX regenerated

 docs/pre-install-cleanup.md [PASS]
    WARN:  INDEX regenerated

 docs/skills.md [PASS]
    WARN:  INDEX regenerated

 docs/todo.md [PASS]
    All checks passed.

Result: 12/12 files passed
```

**Exit code:** 0

---

## Remaining Issues (not handled by --fix)

1. **README.md EXTRACTABLE** — 192 lines, 5 sections flagged for extraction into docs/ (Skills, Policy System, Policy Files, Hooks Reference, MCP Servers). README extraction requires Serena tools per the skill protocol — content judgment is needed to split correctly.
2. **CHANGELOG.md STALE** — `package.json` is at v2.4.0 but the latest CHANGELOG entry is v2.0.0. Versions 2.1.0, 2.2.0, 2.3.0, and 2.4.0 are undocumented.
