# Documentation Sync Report — Sprint Closeout

**Date:** 2026-03-18
**Branch:** feature/jaggers-agent-tools-4xr6
**Assessed by:** Manual review (git log, gh issue/pr, file reads)

---

## Sprint Activity Summary

### bd Issues Closed This Sprint

| # | Title | Closed |
|---|-------|--------|
| #38 | xtrm install: Pi coding agent setup with template-based config | 2026-03-15 |
| #33 | gitnexus: fix MCP + CLI DB lock contention (enable read-only MCP mode) | 2026-03-15 |

Both are enhancement-labeled. Only 3 issues exist in the bd tracker total (including the older #1 bug). The tracker is thin — most sprint work was tracked through GitHub PRs directly rather than bd issues.

### Merged PRs This Sprint (March 17–18)

| PR | Title | Merged |
|----|-------|--------|
| #111 | Install official Claude plugins and remove duplicate MCP servers | 2026-03-18 |
| #110 | chore: release v2.4.0 | 2026-03-18 |
| #109 | chore: eliminate tdd-guard completely | 2026-03-18 |
| #108 | fix(quality-gates): wire PostToolUse hooks into project settings.json | 2026-03-18 |
| #107 | docs(xtrm-guide): fix skills catalog, Pi events, policy table, version history | 2026-03-18 |
| #106 | docs: pre-install cleanup guide for plugin migration | 2026-03-18 |
| #105 | fix: context7 free stdio + commit gate stale-claim bug | 2026-03-18 |
| #104 | fix(p0): MCP sync guard, manifest hash drift detection, dead code removal | 2026-03-18 |
| #103 | docs: add comprehensive XTRM-GUIDE.md and update README.md | 2026-03-18 |
| #102 | feat(tests): cross-runtime policy parity test suite | 2026-03-17 |

The user said "3 PRs" — likely referring to the three feature/fix PRs since the v2.4.0 release: #111 (plugins), #109 (tdd-guard removal), and #108 (quality-gates wiring). PRs #107 and #106 are documentation PRs; #103 introduced XTRM-GUIDE.md and updated README.

### Current Branch Unmerged Commits (8 commits ahead of main)

```
86b3900 Add Pi extension drift checks and guard-rules parity
54d9978 Centralize guard tool rules and matcher expansion
f8e37f9 Deprecate install project command in favor of xtrm init
c1d5182 Add global-first architecture regression tests
d83384e Add project detection and service registry scaffolding to xtrm init
e35fa46 Promote service and quality skills to global sync set
b6c057f Make service-skills extension CWD-aware and global
02fe064 Move quality gates to global Claude hooks
```

These 8 commits represent active work on this branch that has not yet been merged to main.

---

## Documentation State Assessment

### Files Reviewed

| File | Size | Status |
|------|------|--------|
| `README.md` | ~190 lines | Drifted (version stale) |
| `XTRM-GUIDE.md` | ~360 lines | Partially updated, minor drift |
| `CHANGELOG.md` | Long | Missing v2.4.0 entry; Unreleased content present |
| `ROADMAP.md` | Long | Stale — references old architecture, old commands |
| `plugins/xtrm-tools/.claude-plugin/plugin.json` | Small | Drifted (version stale) |

---

## Drift Findings

### 1. Version Numbers Are Stale in README.md and XTRM-GUIDE.md

**Actual package version:** `2.4.1` (cli/package.json), `2.4.0` released via PR #110.

**README.md shows:**
- Line 5: `**Version 2.3.0**`
- Line 20: `# → xtrm-tools@xtrm-tools  Version: 2.3.0  Status: ✔ enabled`
- Line 183 (Version History table): Only goes up to `2.3.0 | 2026-03-17`

**XTRM-GUIDE.md shows:**
- Line 1 (heading): `> **Version 2.3.0**`
- Line 80 (install verify example): `Version: 2.3.0`
- Line 121 (plugin.json snippet): `"version": "2.3.0"`
- Version History table: Stops at `2.3.0 | 2026-03-18`

**plugins/xtrm-tools/.claude-plugin/plugin.json:**
- `"version": "2.3.0"` — not bumped to reflect the 2.4.x releases

Both the README and XTRM-GUIDE need a `2.4.0` row added to their version history tables, and their header version badges updated. The plugin.json manifest version also needs bumping.

---

### 2. CHANGELOG.md Has No v2.4.0 Entry

The `[Unreleased]` section exists and contains real content, but `## [2.4.0]` has never been written. The release PR #110 only bumped the package version — it did not write a changelog entry. What v2.4.0 actually shipped (based on PRs):

- Eliminated tdd-guard completely (#109)
- Wired PostToolUse quality-gates hooks into project settings.json (#108)
- Installed official Claude plugins (serena, context7, github, ralph-loop) during `xtrm install all` (#111)
- Removed duplicate serena/context7 from root `.mcp.json` (#111)
- Added comprehensive XTRM-GUIDE.md (#103)
- Multiple p0 bugfixes: MCP sync guard, manifest hash drift detection, dead code removal (#104)
- Fixed context7 free stdio transport and commit gate stale-claim bug (#105)

The `[Unreleased]` section currently contains content about `AGENTS.md` bd section and `xtrm install project all` — that content reflects work preceding v2.4.0 (likely v2.3.x or earlier) that was never promoted into a versioned entry.

---

### 3. README.md Version History Table Is Missing v2.4.0

The table in README.md ends at v2.3.0. It needs a `2.4.0` row with a short highlights string covering: tdd-guard removal, official Claude plugins, quality-gates wiring, XTRM-GUIDE.md addition.

---

### 4. README.md CLI Commands Table: `install project` Not Marked Deprecated

The CLI Commands table in README.md (line 99) still shows:

```
| `install project <name>` | Install project skill |
```

On this branch (commit `f8e37f9`), `install project` was deprecated in favor of `xtrm init`. The XTRM-GUIDE.md was already updated on this branch to show:

```
| `install project <name>` | **Deprecated** legacy project-skill installer |
```

README.md was not updated to match. This is an in-branch drift between the two files.

---

### 5. README.md Skills Table Is Incomplete

The README.md Skills section (lines 43–48) lists only 4 skills:

```
| `using-xtrm`          | Project | Session operating manual |
| `documenting`         | Global  | SSOT documentation        |
| `delegating`          | Global  | Task delegation           |
| `orchestrating-agents`| Global  | Multi-model collaboration |
```

The XTRM-GUIDE.md Skills Catalog (already updated via PR #107) lists 23+ global skills. Post-sprint additions include: `test-planning`, `sync-docs`, `creating-service-skills`, `scoping-service-skills`, `updating-service-skills`, `using-service-skills`, `using-quality-gates`, and the full gitnexus skill suite. README is a summary, so full parity is not expected, but the gap is wide enough to be misleading.

---

### 6. ROADMAP.md Is Structurally Stale

ROADMAP.md references architecture from v2.1.9 in several places:

- The "CLI Architecture Improvements" section at the bottom still describes `cli/lib/sync.js`, `cli/lib/transform-gemini.js`, and multi-agent Gemini/Qwen support — all of which were removed in v2.0.0.
- Phase 3 "Namespace Prefixes" references `cli/lib/transform-gemini.js` as a file to modify — this file no longer exists.
- "Phase 5: Transformation Logic Refactoring" describes refactoring `cli/lib/resolver.js` and `cli/lib/transform-gemini.js` — both dead paths.
- References a file at `file:///home/dawid/gemini/antigravity/brain/...` (absolute local path to dev machine — not a repo path).
- `AGENTS.md` installation planned as "Next minor release" in the roadmap — but AGENTS.md now exists in the repo and its bd section was added this sprint.
- The "Completed in v2.1.9" section at the top is frozen — should either be cleaned up or promoted to version-tagged completed items.

ROADMAP.md was not touched in any of the sprint PRs. It is the most stale major doc.

---

### 7. XTRM-GUIDE.md: plugin.json Snippet Shows Wrong Version

Line 121 of XTRM-GUIDE.md contains a code block example:

```json
{
  "name": "xtrm-tools",
  "version": "2.3.0",
  ...
}
```

This is the same drift as the README version badge — it was not updated when v2.4.0 was released.

---

### 8. XTRM-GUIDE.md Version History Is Missing v2.4.0

The XTRM-GUIDE.md version history table (lines 344–350) stops at `2.3.0 | 2026-03-18`. A `2.4.0` row is missing with the same summary needed in README.md.

---

## Summary Matrix

| Document | Issue | Severity |
|----------|-------|----------|
| README.md | Version badge shows 2.3.0, should be 2.4.0 | Medium |
| README.md | CLI table: `install project` not marked deprecated | Medium |
| README.md | Version history table missing 2.4.0 row | Medium |
| README.md | Skills table is significantly incomplete vs XTRM-GUIDE | Low |
| XTRM-GUIDE.md | Version badge and plugin.json snippet show 2.3.0 | Medium |
| XTRM-GUIDE.md | Version history table missing 2.4.0 row | Medium |
| CHANGELOG.md | No `[2.4.0]` entry exists despite release PR merging | High |
| CHANGELOG.md | `[Unreleased]` content never promoted to a version | Medium |
| ROADMAP.md | Multiple references to deleted files (transform-gemini.js, etc.) | Low |
| ROADMAP.md | Local absolute file path reference (non-portable) | Low |
| ROADMAP.md | Completed items (AGENTS.md) still listed as "planned" | Low |
| plugin.json | `"version": "2.3.0"` — not bumped after v2.4.0 release | Medium |

---

## Recommended Actions (Priority Order)

1. **Write the `[2.4.0]` CHANGELOG entry** — this is the most critical gap. The release shipped but has no record.
2. **Update README.md version badge, example output, and version history table** to 2.4.0.
3. **Update XTRM-GUIDE.md version badge, plugin.json snippet, and version history table** to 2.4.0.
4. **Bump `plugins/xtrm-tools/.claude-plugin/plugin.json`** version to 2.4.0.
5. **Mark `install project` as deprecated** in README.md CLI table (already done in XTRM-GUIDE.md on this branch).
6. **Promote `[Unreleased]` CHANGELOG content** into the appropriate version entry, or tag it as part of the current branch work.
7. **Audit ROADMAP.md** — remove or archive references to deleted files and multi-agent architecture; mark AGENTS.md item as done.

---

## What Is in Good Shape

- **XTRM-GUIDE.md structure and content** is the most up-to-date of all docs — PR #107 did a thorough pass on skills catalog, Pi events table, and policy table. The branch commits have also extended it further (CLI command deprecation, project init details).
- **Skills catalog** in XTRM-GUIDE.md accurately reflects the current `skills/` directory.
- **Policy table** in XTRM-GUIDE.md matches `policies/*.json` on the branch.
- **Hooks reference** in XTRM-GUIDE.md is correct including PostToolUse and Compact Save/Restore.
- **MCP Servers section** in README.md is accurate post-PR #111 (official plugins called out separately).
- **CHANGELOG.md `[Unreleased]` section** has real content and is not empty — it just needs to be promoted and a 2.4.0 entry added above it.
