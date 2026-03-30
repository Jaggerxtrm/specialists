# sync-docs --fix Run Summary

**Date:** 2026-03-18
**Working directory:** /home/dawid/projects/xtrm-tools
**Skill:** sync-docs v1.0.0

---

## Command Run

```
python3 skills/sync-docs/scripts/doc_structure_analyzer.py --fix --bd-remember
```

Note: The skill references `$HOME/.claude/skills/sync-docs/scripts/doc_structure_analyzer.py` but the scripts were not installed globally. The script was run from the local project path `skills/sync-docs/scripts/doc_structure_analyzer.py` instead.

---

## Script Output (stdout + stderr)

```
Fixing 3 missing docs/ files...
  CREATED docs/pi-extensions.md
  CREATED docs/mcp-servers.md
  CREATED docs/policies.md

  Persisted to bd memory: sync-docs-fix-2026-03-18
{
  "project_root": "/home/dawid/projects/xtrm-tools",
  "summary": {
    "total_issues": 11,
    "needs_attention": true
  },
  "readme": {
    "status": "EXTRACTABLE",
    "path": "README.md",
    "line_count": 192,
    "section_count": 24,
    "threshold": 200,
    "extraction_candidates": [
      {
        "section": "## Policy System",
        "suggest": "docs/policies.md",
        "reason": "Policy reference"
      },
      {
        "section": "### Policy Files",
        "suggest": "docs/policies.md",
        "reason": "Policy reference"
      },
      {
        "section": "## MCP Servers",
        "suggest": "docs/mcp-servers.md",
        "reason": "MCP server configuration"
      }
    ],
    "issues": []
  },
  "changelog": {
    "status": "OK",
    "path": "CHANGELOG.md",
    "last_entry_date": "2026-03-12",
    "last_commit_date": "2026-03-18",
    "issues": []
  },
  "docs_gaps": [
    {
      "status": "MISSING",
      "path": "docs/pi-extensions.md",
      "reason": "Pi extensions directory exists",
      "signal": "config/pi/extensions/"
    },
    {
      "status": "MISSING",
      "path": "docs/mcp-servers.md",
      "reason": ".mcp.json present",
      "signal": ".mcp.json"
    },
    {
      "status": "MISSING",
      "path": "docs/policies.md",
      "reason": "policies/ directory exists",
      "signal": "policies/"
    }
  ],
  "existing_docs": [
    {
      "status": "INVALID_SCHEMA",
      "path": "docs/hooks.md",
      "line_count": 106,
      "has_frontmatter": false,
      "issues": ["Missing YAML frontmatter — run validate_doc.py to fix"]
    },
    {
      "status": "INVALID_SCHEMA",
      "path": "docs/mcp.md",
      "line_count": 84,
      "has_frontmatter": false,
      "issues": ["Missing YAML frontmatter — run validate_doc.py to fix"]
    },
    {
      "status": "INVALID_SCHEMA",
      "path": "docs/pre-install-cleanup.md",
      "line_count": 107,
      "has_frontmatter": false,
      "issues": ["Missing YAML frontmatter — run validate_doc.py to fix"]
    },
    {
      "status": "INVALID_SCHEMA",
      "path": "docs/project-skills.md",
      "line_count": 78,
      "has_frontmatter": false,
      "issues": ["Missing YAML frontmatter — run validate_doc.py to fix"]
    },
    {
      "status": "INVALID_SCHEMA",
      "path": "docs/skills.md",
      "line_count": 89,
      "has_frontmatter": false,
      "issues": ["Missing YAML frontmatter — run validate_doc.py to fix"]
    },
    {
      "status": "INVALID_SCHEMA",
      "path": "docs/testing.md",
      "line_count": 125,
      "has_frontmatter": false,
      "issues": ["Missing YAML frontmatter — run validate_doc.py to fix"]
    },
    {
      "status": "INVALID_SCHEMA",
      "path": "docs/todo.md",
      "line_count": 4,
      "has_frontmatter": false,
      "issues": ["Missing YAML frontmatter — run validate_doc.py to fix"]
    }
  ],
  "fix_created": [
    "docs/pi-extensions.md",
    "docs/mcp-servers.md",
    "docs/policies.md"
  ],
  "bd_remember": {
    "stored": true,
    "key": "sync-docs-fix-2026-03-18",
    "insight": "sync-docs --fix created 3 scaffold(s) in docs/: pi-extensions.md, mcp-servers.md, policies.md. Fill in content using Serena — run validate_doc.py docs/ to confirm schema."
  }
}
```

---

## Files Created by --fix

Three scaffold files were created by `validate_doc.py --generate` (called internally):

| File | Signal that triggered it | Title |
|---|---|---|
| `/home/dawid/projects/xtrm-tools/docs/pi-extensions.md` | `config/pi/extensions/` directory exists | Pi Extensions Reference |
| `/home/dawid/projects/xtrm-tools/docs/mcp-servers.md` | `.mcp.json` present | MCP Servers Configuration |
| `/home/dawid/projects/xtrm-tools/docs/policies.md` | `policies/` directory exists | Policy Reference |

All three files were created with valid YAML frontmatter, including `title`, `scope`, `category`, `version`, `updated`, and `source_of_truth_for` fields, plus an empty `<!-- INDEX -->` block and stub content sections.

---

## bd Memory Stored

**Key:** `sync-docs-fix-2026-03-18`

**Insight stored:**
> sync-docs --fix created 3 scaffold(s) in docs/: pi-extensions.md, mcp-servers.md, policies.md. Fill in content using Serena — run validate_doc.py docs/ to confirm schema.

The memory was confirmed stored (`"stored": true`) and was verified with `bd recall sync-docs-fix-2026-03-18`.

---

## Analysis Summary

| Check | Status | Notes |
|---|---|---|
| README.md | EXTRACTABLE | 192 lines (under 200 threshold). 3 sections (Policy System, Policy Files, MCP Servers) have matching docs/ candidates. |
| CHANGELOG.md | OK | Last entry 2026-03-12, last commit 2026-03-18 — within 7-day tolerance. |
| docs/ gaps | 3 MISSING -> FIXED | pi-extensions.md, mcp-servers.md, policies.md created by --fix. |
| Existing docs/ schema | 7 INVALID_SCHEMA | docs/hooks.md, mcp.md, pre-install-cleanup.md, project-skills.md, skills.md, testing.md, todo.md all lack YAML frontmatter. |

**Total issues detected:** 11 (3 gaps fixed by --fix, 7 schema invalids and 1 EXTRACTABLE remain for manual attention)

### Remaining Work (not auto-fixed)

- Run `validate_doc.py` on the 7 existing docs/ files missing frontmatter to add schema headers
- Consider extracting the "Policy System", "Policy Files", and "MCP Servers" sections from README.md into the newly created docs/ files using Serena tools (required for extraction — content judgment needed)
- Fill in stub content in the 3 newly created scaffold files using Serena

---

## No Commits Made

As instructed, no git commits were made. The 3 scaffold files are left in place for review.
