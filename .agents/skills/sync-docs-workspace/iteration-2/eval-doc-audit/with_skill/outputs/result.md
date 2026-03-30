# Doc Audit Report — xtrm-tools

**Date:** 2026-03-18
**Task:** Audit README for sections that should be in docs/
**Mode:** Audit only (Phase 1–3). No files were modified.

---

## Phase 1: Context Summary

### Recent Activity

**Merged PRs (last ~30 days):**
- PR #15 — release/2.0.1 (2026-03-13)
- PR #14 — chore/update-status-doc (2026-03-13)
- PR #13 — fix/agents-target (2026-03-13)
- PR #12 — feat/project-install-all (2026-03-13)
- PR #8 — phase2-cli-refactor (2026-03-12)

**Recent significant commits (today):**
- Add Pi extension drift checks and guard-rules parity
- Centralize guard tool rules and matcher expansion
- Deprecate install project command in favor of xtrm init
- Add global-first architecture regression tests
- Add project detection and service registry scaffolding to xtrm init

**Active epic:** `jaggers-agent-tools-4xr6` — Global-first plugin architecture (hooks, skills, Pi extensions all go global; `xtrm init` replaces `install project`)

This is a significant structural change cycle. The CLI commands table in README already shows `project init` but also still lists `install project <name>` — these may be in conflict now that install-project is deprecated.

---

## Phase 2: SSOT Drift (Serena Memories)

**5 stale memories detected:**

| Memory | Last Updated | Modified Files |
|---|---|---|
| `ssot_cli_hooks_2026-02-03` | 2026-02-25 | hooks/guard-rules.mjs, hooks/hooks.json, hooks/main-guard.mjs |
| `ssot_cli_universal_hub_2026-02-19` | 2026-02-25 | cli/src/commands/install-pi.ts, cli/src/tests/policy-parity.test.ts |
| `ssot_cli_ux_improvements_2026-02-22` | 2026-02-25 | cli/src/commands/install-pi.ts, cli/src/commands/install-project.ts |
| `ssot_jaggers-agent-tools_installer_architecture_2026-02-03` | 2026-02-25 | cli/src/commands/install-pi.ts, cli/src/tests/policy-parity.test.ts |
| `ssot_jaggers-agent-tools_migration_2026-02-01` | 2026-02-01 | cli/src/commands/install-pi.ts, cli/src/tests/policy-parity.test.ts |

The hooks memories are stale due to the guard-rules centralization work done today. The installer architecture memories are stale due to the global-first migration and deprecation of `install-project`. These need updating but are out of scope for this audit (they require Serena tools and explicit intent to fix).

---

## Phase 3: Document Structure Analysis

### README.md — Status: OK (borderline)

- **Line count:** 192 / 200 threshold
- **Sections:** 24
- **Extraction candidates flagged by script:** None

The script reports `OK` because README is 8 lines under the 200-line bloat threshold. However, manual review reveals several sections that are substantive enough to warrant dedicated docs/ files or already have them:

#### Sections with candidate docs/ homes

| README Section | Lines | Status | Recommended Action |
|---|---|---|---|
| **Hooks Reference** (lines 114–141) | ~28 lines | Has `docs/hooks.md` | README section should be a 1-line summary + link to `docs/hooks.md` |
| **MCP Servers** (lines 143–158) | ~16 lines | Has `docs/mcp-servers.md` | README section is a partial duplicate of `docs/mcp-servers.md` |
| **Policy System** (lines 66–87) | ~22 lines | Has `docs/policies.md` | README section should be a 1-line summary + link to `docs/policies.md` |
| **CLI Commands** (lines 89–111) | ~23 lines | No `docs/cli-reference.md` | At 6 commands + 3 flags this is borderline; when CLI grows, extract |
| **Version History** (lines 179–187) | ~9 lines | Has CHANGELOG.md | Already linked; table is a useful quick summary, keep |
| **Issue Tracking (Beads)** (lines 161–168) | ~8 lines | No dedicated docs/ file | Short enough to keep in README |

**Key finding:** README has three sections (Hooks Reference, MCP Servers, Policy System) that directly duplicate content already in dedicated docs/ files. These sections should be replaced with single-line summaries + links. This would bring README down to approximately 130–140 lines and eliminate the drift risk.

### CHANGELOG.md — Status: STALE (critical)

- **package.json version:** 2.4.0
- **Latest CHANGELOG entry:** 2.0.0 (2026-03-12)
- **Gap:** v2.1.x, v2.2.0, v2.3.0, and v2.4.0 are all undocumented in CHANGELOG
- **Note:** README header also still says "Version 2.3.0" — should be 2.4.0

The CHANGELOG has not been updated across multiple release cycles. This is the most critical finding.

### docs/ Files — Status: All OK

All 10 existing docs/ files pass schema validation (have YAML frontmatter, no structural issues):

- docs/hooks.md (133 lines) — OK
- docs/mcp-servers.md (25 lines) — OK
- docs/mcp.md (110 lines) — OK
- docs/pi-extensions.md (25 lines) — OK
- docs/policies.md (25 lines) — OK
- docs/pre-install-cleanup.md (128 lines) — OK
- docs/project-skills.md (105 lines) — OK
- docs/skills.md (114 lines) — OK
- docs/testing.md (148 lines) — OK
- docs/todo.md (14 lines) — OK

**No missing docs/ gaps** were flagged by the script for existing subsystems.

---

## Summary of Findings

### README Duplication (answer to the user's question)

The README does contain sections that belong in docs/ — but not because they're missing docs/ files. The docs/ files already exist. The problem is that README still carries full content in those sections instead of pointing to the dedicated files.

**Three sections to replace with summary + link:**

1. **"Hooks Reference"** (lines 114–141, ~28 lines) → summarize in 2–3 lines + link to `docs/hooks.md`
2. **"Policy System"** (lines 66–87, ~22 lines) → summarize in 2–3 lines + link to `docs/policies.md`
3. **"MCP Servers"** (lines 143–158, ~16 lines) → summarize in 1–2 lines + link to `docs/mcp-servers.md`

Doing this would remove ~60 lines from README (192 → ~132), well within the healthy range, and eliminate drift between README and its docs/ counterparts.

### CHANGELOG is critically stale

Four release versions (2.1.x through 2.4.0) have no CHANGELOG entries. The README version badge is also one version behind (shows 2.3.0, package.json is 2.4.0).

### Stale Serena memories (5 total)

All relate to hooks and installer architecture — both subsystems were modified today as part of the global-first migration. These need updating via the `/documenting` skill or Phase 4 of this skill.

---

## What NOT to Do

- Do not extract Beads, CLI Commands, Version History, or Quick Start from README — these are appropriate for a README-level entry point.
- Do not create new docs/ files — all expected subsystem files already exist.
- Do not touch the docs/ files themselves — they all pass schema validation.

---

## Recommended Next Steps (for explicit execution, not done here)

1. **Fix CHANGELOG** — add entries for v2.1.x, v2.2.0, v2.3.0, v2.4.0 using `add_entry.py`
2. **Fix README version badge** — update "Version 2.3.0" to "Version 2.4.0"
3. **Trim README duplicate sections** — replace Hooks Reference, Policy System, MCP Servers with summary + link (use Serena tools, not direct Edit)
4. **Update stale Serena memories** — especially `ssot_cli_hooks_*` and `ssot_jaggers-agent-tools_installer_architecture_*` given today's guard-rules and global-first changes
