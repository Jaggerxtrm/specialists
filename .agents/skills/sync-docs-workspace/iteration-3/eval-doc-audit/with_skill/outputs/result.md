# Doc Audit — xtrm-tools

**Date:** 2026-03-18
**Mode:** Audit only (no files modified)
**Tool:** sync-docs skill, Phases 1–3
**Worktree:** `/home/dawid/projects/xtrm-tools/.claude/worktrees/agent-a4b9e492`

---

## Summary

| Category | Count |
|---|---|
| README extraction candidates | 5 sections |
| CHANGELOG version gap | v2.4.0 vs v2.0.0 (4 undocumented releases) |
| docs/ files missing (expected) | 5 |
| docs/ files with invalid schema | 7 |
| Total issues | 14 |

---

## README.md — Status: EXTRACTABLE

Line count: **192** (threshold: 200 — just under the BLOATED threshold, but 5 sections are prime extraction candidates).

The README currently duplicates what should live in dedicated docs/ files. These sections should be extracted:

| README Section | Suggested Target | Reason |
|---|---|---|
| `### Skills` (lines ~44–49) | `docs/skills.md` | Skills catalog with 23+ skills in `skills/` |
| `## Policy System` + `### Policy Files` (lines ~67–86) | `docs/policies.md` | `policies/` directory exists with 7 policy files |
| `## Hooks Reference` (lines ~114–141) | `docs/hooks.md` | `hooks/` directory exists with 14+ hook scripts |
| `## MCP Servers` (lines ~143–158) | `docs/mcp-servers.md` | `.mcp.json` present; existing `docs/mcp-servers-config.md` covers this topic already |

**Notable:** `docs/mcp-servers-config.md` already exists (364 lines) but lacks frontmatter. The README's `## MCP Servers` section and this file are redundant — consolidation is warranted.

The `## Version History` table in README (lines ~179–186) is also a truncated duplicate of CHANGELOG. It should either be removed or replaced with a link.

---

## CHANGELOG.md — Status: STALE

- `package.json` version: **2.4.0**
- Latest CHANGELOG entry: **[2.0.0] - 2026-03-12**
- Gap: **4 undocumented versions** (2.1.x through 2.4.0)

The `[Unreleased]` section exists but the releases have not been cut. Given the volume of recent closed issues (plugin architecture, Pi extension parity, service skills, gitnexus integration), multiple CHANGELOG entries are owed.

README itself lists versions 2.2.0 and 2.3.0 with dates and highlights — those entries are not in CHANGELOG.

---

## docs/ — Missing Files

These docs/ files are expected based on project subsystems but do not exist:

| Missing File | Signal | Priority |
|---|---|---|
| `docs/hooks.md` | `hooks/` dir with 14 scripts + `hooks.json` | HIGH — hooks are a core subsystem |
| `docs/pi-extensions.md` | `config/pi/extensions/` exists | HIGH — Pi extension system is active |
| `docs/mcp-servers.md` | `.mcp.json` present | MEDIUM — content partially covered by `docs/mcp-servers-config.md` |
| `docs/policies.md` | `policies/` dir with 7 `.json` files | HIGH — policy compiler is a key feature |
| `docs/skills.md` | `skills/` dir with 23 entries | MEDIUM — skills list exists in README already |

---

## docs/ — Invalid Schema (7 files)

All 7 existing non-plan docs/ files lack YAML frontmatter. They are functional but not schema-compliant:

| File | Lines | Notes |
|---|---|---|
| `docs/cleanup.md` | 438 | Large operational notes — likely internal/transient |
| `docs/delegation-architecture.md` | 185 | Architecture content — may belong in `.serena/memories/` |
| `docs/hook-system-summary.md` | 176 | Overlaps with missing `docs/hooks.md` |
| `docs/mcp-servers-config.md` | 364 | Overlaps with missing `docs/mcp-servers.md` + README section |
| `docs/pi-extensions-migration.md` | 56 | Migration notes — likely transient |
| `docs/pre-install-cleanup.md` | 107 | Operational notes — likely internal/transient |
| `docs/todo.md` | 4 | Stub — should be removed or absorbed into bd issues |

All need `validate_doc.py` run to add frontmatter, or need to be evaluated for deletion/migration.

---

## Structural Observations

### Overlap Between Existing and Missing Files

Three cases where a docs/ file partially covers a missing counterpart:

1. `docs/hook-system-summary.md` (existing, no schema) covers the same ground as the missing `docs/hooks.md`. Likely the right fix is to promote `hook-system-summary.md` → `hooks.md` with frontmatter added.

2. `docs/mcp-servers-config.md` (existing, no schema) overlaps with missing `docs/mcp-servers.md` and the README `## MCP Servers` section. Rename + add frontmatter rather than create from scratch.

3. `docs/pi-extensions-migration.md` (existing, 56 lines) is a migration notes doc, not the full extension catalog. The missing `docs/pi-extensions.md` is still warranted.

### docs/plans/ is Well-Populated

`docs/plans/` has 13 files including active and completed work plans. This is healthy. Plans in `docs/plans/complete/` may be archivable.

### docs/reference/ Subdirectory

`docs/reference/` exists with subdirectories (`claude-documentation/`, `gemini-documentation/`, `plans/`). This sub-tree was not analyzed in depth — it may contain content that belongs at the top-level `docs/` or in `.serena/memories/`.

---

## Recommended Next Steps (when executing)

1. **CHANGELOG**: Cut entries for 2.1.x–2.4.0 using `add_entry.py`. Source: `[Unreleased]` section + closed bd issues.
2. **README `## Hooks Reference`**: Extract to `docs/hooks.md` (or promote `hook-system-summary.md`). Replace README section with one-line link.
3. **README `## Policy System`**: Extract to `docs/policies.md`. Replace with summary + link.
4. **README `## MCP Servers`**: Consolidate with `docs/mcp-servers-config.md` → rename to `docs/mcp-servers.md` + add frontmatter. Remove redundant README section.
5. **README `### Skills`**: Extract to `docs/skills.md`. Replace with link.
6. **Add frontmatter** to all 7 invalid-schema docs/ files, or delete stubs (`todo.md`, `pre-install-cleanup.md`).
7. **README `## Version History` table**: Remove or replace with link to CHANGELOG — this is a maintenance liability.

---

## Audit Scope

- Phase 1 (context): bd closed issues gathered (30-day window, 20+ issues found)
- Phase 2 (drift detection): Skipped — `drift_detector.py` requires `pyyaml` (not installed)
- Phase 3 (structure analysis): Complete — `doc_structure_analyzer.py` ran successfully
- Phase 4 (execute): **NOT run** — audit-only task, no files modified
- Phase 5 (validate): **NOT run** — no changes to validate
