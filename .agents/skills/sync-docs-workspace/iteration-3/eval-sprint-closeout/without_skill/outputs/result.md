# Doc Sync Result — Sprint Closeout (without sync-docs skill)

## Context Gathered

- Read `README.md`, `XTRM-GUIDE.md`, `CHANGELOG.md`, `ROADMAP.md` in full
- Ran `git log --oneline --since="2026-03-10"` to identify sprint commits
- Ran `git log --oneline --merges` to identify merged PRs
- Ran `git diff --stat 10d6433..HEAD` to enumerate changed files since v2.4.0 release
- Ran `git diff 10d6433..HEAD -- README.md` and `-- XTRM-GUIDE.md` to see what was already updated during the sprint

## What Was Found

### Sprint Activity (post v2.4.0 tag, plus the v2.4.0 release itself)

**3 PRs merged (most recent sprint):**
- PR #111 — Install official Claude plugins and remove duplicate MCP servers
- PR #110 — Release v2.4.0
- PR #109 — Eliminate tdd-guard completely

**Post-v2.4.0 commits (unreleased, on current branch `feature/jaggers-agent-tools-4xr6`):**
1. `86b3900` — Add Pi extension drift checks and guard-rules parity
2. `54d9978` — Centralize guard tool rules and matcher expansion
3. `f8e37f9` — Deprecate install project command in favor of xtrm init
4. `c1d5182` — Add global-first architecture regression tests
5. `d83384e` — Add project detection and service registry scaffolding to xtrm init
6. `e35fa46` — Promote service and quality skills to global sync set
7. `b6c057f` — Make service-skills extension CWD-aware and global
8. `02fe064` — Move quality gates to global Claude hooks
9. `6476a44` — Install official Claude plugins and remove duplicate MCP servers (#111)

### README Staleness Issues Identified

| Issue | Location | Status |
|-------|----------|--------|
| Version badge said 2.3.0 | Header + Quick Start verify comment | Fixed |
| Skills table missing 5 new global skills | `## What's Included > Skills` | Fixed |
| `using-xtrm` was labelled "Project" type | Skills table | Fixed (now "Global") |
| CLI Commands missing `init` command | `## CLI Commands` | Fixed |
| `install project <name>` not marked deprecated | CLI Commands table | Fixed |
| `project init` description was vague | CLI Commands table | Fixed |
| Version history missing v2.4.0 | `## Version History` | Fixed |
| Policy table missing `serena.json` and `service-skills.json` | `## Policy System` | Fixed |

### What Was Already Correct

- MCP Servers section (updated by PR #111 sprint commit — already reflected official Claude plugins)
- XTRM-GUIDE.md (updated by commit `f8e37f9` during the sprint — `xtrm init` alias, project detection details, deprecated CLI commands, updated Skills Catalog and Project Data sections)
- CHANGELOG.md (contains full history through v2.0.0; [Unreleased] section covers earlier sprint work)
- Plugin Structure section
- Hooks Reference section
- Beads section

## Changes Made to README.md

File: `/home/dawid/projects/xtrm-tools/README.md`

1. **Version bump**: `2.3.0` → `2.4.0` in header and Quick Start verify comment
2. **Skills table**: Added 5 new global skills (`using-quality-gates`, `using-service-skills`, `creating-service-skills`, `scoping-service-skills`, `updating-service-skills`); corrected `using-xtrm` type from "Project" to "Global"
3. **CLI Commands table**: Added `init` row; updated `project init` description to include bd/gitnexus/service-registry; marked `install project <name>` as deprecated
4. **Policy table**: Added `serena.json` (claude) and `service-skills.json` (pi); reordered to group by runtime
5. **Version History**: Added v2.4.0 row with accurate highlights

## No Changes Needed

- `XTRM-GUIDE.md` — already updated by sprint commits
- `CHANGELOG.md` — accurate; [Unreleased] section should be promoted to v2.5.0 when that release happens
- `ROADMAP.md` — remains accurate; no completed items from this sprint that need to be ticked off (the global-first arch work isn't specifically called out there)

## Observations

The README was about 1.5 versions behind HEAD (it still said 2.3.0 while the codebase was at 2.4.0 with unreleased post-v2.4.0 work on top). The XTRM-GUIDE was kept more current by the sprint commits themselves. The CHANGELOG [Unreleased] section is still empty — it should capture the post-v2.4.0 sprint work (global-first arch, guard-rules centralization, Pi drift checks, `xtrm init` project detection) before the next release.
