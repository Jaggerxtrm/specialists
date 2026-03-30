# sync-docs Skill Evaluation: Sprint Closeout
**Task:** "I just closed a bunch of bd issues this sprint and merged 3 PRs. The README.md is getting long — can you sync the docs and make sure everything's in order? Use sync-docs."
**Date:** 2026-03-18
**Worktree:** /home/dawid/projects/xtrm-tools/.claude/worktrees/agent-ae8223b7
**Scripts run from:** skills/sync-docs/scripts/ (repo-local, not globally installed)

---

## Phases Executed

All 5 phases ran. No commits were made.

---

## Phase 1: Gather Context

**Script:** `skills/sync-docs/scripts/context_gatherer.py --since=30`

**Key findings:**

- **bd closed issues:** 0 returned by the script (see issue note below). Manually confirmed via `bd list --state=closed --limit=10` from the main repo directory: 10 recently closed issues including:
  - `jaggers-agent-tools-1lc` — Remove dead code cli/index.js (P0 bug)
  - `jaggers-agent-tools-7dwo` — Fix commit gate blocking when session claim is already closed (P0 bug)
  - `jaggers-agent-tools-8dhs` — Wire quality gates PostToolUse hooks into project .claude/settings.json (P0 bug)
  - `jaggers-agent-tools-9bl` — Fix hash-based drift detection misclassification (P0 bug)
  - `jaggers-agent-tools-ihgz` — Clean up legacy hooks and config on current machine before fresh install (P0 task)
  - `jaggers-agent-tools-l1g` — Fix MCP sync guard placement (P0 bug)
  - `jaggers-agent-tools-p9wc` — Install official Claude plugins during xtrm install and prune duplicate .mcp servers (P1 task)
  - (plus 3 subtasks of jaggers-agent-tools-4xr6)

- **Merged PRs (last 30 days, from git log):** 10 found, including:
  - PR #15: release/2.0.1
  - PR #14: chore/update-status-doc
  - PR #13: fix/agents-target
  - PR #12: feat/project-install-all
  - PR #8: phase2-cli-refactor

- **bd memories:** 0 (Dolt server not accessible from worktree)
- **Serena drift:** `available: false` — drift_detector.py was run separately (see Phase 2)

**Issue with script:** `context_gatherer.py` returned `bd_closed_issues: []` and `bd_memories: []` because the Dolt server is unavailable from the worktree path (`database "jaggers_agent_tools" not found on Dolt server at 127.0.0.1:13794`). The script silently returns empty arrays instead of warning about this. The `bd list` command only works from the main repo directory, not the worktree. This is a skill reliability gap for worktree-based execution.

---

## Phase 2: Detect SSOT Drift

**Script:** `skills/documenting/scripts/drift_detector.py scan` (from skill's cross-reference)

**Result:** Exit code 1 (stale detected). **5 memories stale:**

| Memory | Last Updated | Stale Files |
|--------|-------------|-------------|
| `ssot_cli_hooks_2026-02-03` | 2026-02-25 | hooks/beads-gate-core.mjs, hooks/hooks.json, hooks/beads-memory-gate.mjs |
| `ssot_cli_universal_hub_2026-02-19` | 2026-02-25 | cli/src/commands/install.ts, cli/src/core/diff.ts |
| `ssot_cli_ux_improvements_2026-02-22` | 2026-02-25 | cli/src/commands/install.ts, cli/src/core/diff.ts |
| `ssot_jaggers-agent-tools_installer_architecture_2026-02-03` | 2026-02-25 | cli/dist/index.cjs, cli/src/commands/install.ts |
| `ssot_jaggers-agent-tools_migration_2026-02-01` | 2026-02-01 | cli/dist/index.cjs, cli/src/commands/install.ts |

These Serena memories need updating via Serena tools. Not done in this run (Serena MCP not available in eval context), but flagged for manual follow-up.

---

## Phase 3: Analyze Document Structure

**Script:** `skills/sync-docs/scripts/doc_structure_analyzer.py`

**Result:** Exit code 1 (issues found). 14 total issues.

### README.md
- **Status:** EXTRACTABLE (192 lines, threshold 200)
- Not BLOATED yet, but close. Contains 5 sections that belong in docs/:
  - `### Skills` → docs/skills.md
  - `## Policy System` → docs/policies.md
  - `### Policy Files` → docs/policies.md
  - `## Hooks Reference` → docs/hooks.md
  - `## MCP Servers` → docs/mcp-servers.md

### CHANGELOG.md
- **Status:** STALE
- Last entry date: 2026-03-12
- Last commit date: 2026-03-18
- package.json version: **2.4.0**
- Latest CHANGELOG entry: **v2.0.0**
- Gap: v2.1.0 through v2.4.0 are undocumented

### Missing docs/ files (5)
| Path | Signal |
|------|--------|
| docs/hooks.md | hooks/ directory exists |
| docs/pi-extensions.md | config/pi/extensions/ exists |
| docs/mcp-servers.md | .mcp.json present |
| docs/policies.md | policies/ directory exists |
| docs/skills.md | skills/ directory exists |

### Existing docs/ with invalid schema (7)
All 7 existing docs/ files were missing YAML frontmatter:
- docs/cleanup.md (438 lines)
- docs/delegation-architecture.md (185 lines)
- docs/hook-system-summary.md (176 lines)
- docs/mcp-servers-config.md (364 lines)
- docs/pi-extensions-migration.md (56 lines)
- docs/pre-install-cleanup.md (107 lines)
- docs/todo.md (4 lines)

---

## Phase 4: Execute Fixes

**Script:** `skills/sync-docs/scripts/doc_structure_analyzer.py --fix`

**Actions taken:**

- CREATED 5 missing docs/ scaffolds with valid YAML frontmatter:
  - docs/hooks.md
  - docs/pi-extensions.md
  - docs/mcp-servers.md
  - docs/policies.md
  - docs/skills.md

- FIXED 7 existing docs/ files by injecting YAML frontmatter:
  - docs/cleanup.md
  - docs/delegation-architecture.md
  - docs/hook-system-summary.md
  - docs/mcp-servers-config.md
  - docs/pi-extensions-migration.md
  - docs/pre-install-cleanup.md
  - docs/todo.md

**NOT done (require Serena or manual action):**
- README.md extraction: sections identified as EXTRACTABLE cannot be auto-moved by `--fix`; requires Serena tools (`mcp__serena__get_symbols_overview`, `mcp__serena__replace_symbol_body`) to safely extract and replace with summary + link.
- CHANGELOG gap: v2.0.0 to v2.4.0 undocumented. Requires `skills/documenting/scripts/changelog/add_entry.py` to add entries for v2.1.0–v2.4.0.
- Serena memory updates: 5 stale memories need updating via Serena tools.

**Issue with --fix output:** After running `--fix`, the JSON report still shows all items as MISSING/INVALID_SCHEMA. The analysis section reflects the state before fixes were applied (pre-fix snapshot), not the post-fix state. This is confusing — the fix confirmation lines at the top confirm success, but the JSON section contradicts it. The script should re-analyze after applying fixes, or clearly label the JSON as "pre-fix state".

---

## Phase 5: Validate

**Script:** `skills/sync-docs/scripts/validate_doc.py /home/dawid/projects/xtrm-tools/.claude/worktrees/agent-ae8223b7/docs/`

**Result:** 12/12 files PASSED

All docs/ files passed schema validation after Phase 4 fixes. Each file received an auto-generated INDEX table. Warnings noted: "INDEX regenerated" on 11 of 12 files — expected behavior for newly-created or newly-fixed files.

---

## Summary of Actions Taken

| Action | Status |
|--------|--------|
| Phase 1: Context gathered | Done (10 merged PRs, 10 closed issues via manual check) |
| Phase 2: SSOT drift detected | Done (5 memories stale) |
| Phase 3: Structure analyzed | Done (14 issues found) |
| Phase 4: Missing docs scaffolded | Done (5 created, 7 fixed) |
| Phase 4: README extraction | NOT done — requires Serena MCP |
| Phase 4: CHANGELOG gap filled | NOT done — requires manual add_entry.py calls |
| Phase 4: Serena memory updates | NOT done — requires Serena MCP |
| Phase 5: Validation | Done (12/12 PASS) |

---

## Outstanding Actions (for human or next agent)

1. **CHANGELOG:** Add entries for v2.1.0 through v2.4.0 using `skills/documenting/scripts/changelog/add_entry.py`. Key changes to document: plugin-based install, quality gates, policy system, Pi memory gate, MCP cleanup.

2. **README extraction:** Use Serena to extract `## Hooks Reference`, `## MCP Servers`, `## Policy System`, and `### Skills` sections into their new docs/ files, then replace each section with a short summary + link.

3. **Serena memory updates:** Update 5 stale memories, especially `ssot_cli_hooks_2026-02-03` (hooks heavily modified) and installer architecture memories (CLI refactored).

4. **New docs/ files need content:** The 5 scaffolded files (`docs/hooks.md`, `docs/skills.md`, etc.) have valid frontmatter and structure but contain only placeholder content. Fill them using Serena or by extracting from README.

---

## Skill Issues Found

| Issue | Severity | Description |
|-------|----------|-------------|
| bd closed issues empty in worktree | Medium | `context_gatherer.py` silently returns empty arrays when Dolt server is unreachable from worktree. No warning emitted. Should log a clear error and fall back to git-based inference of closed issues (e.g. parse commit messages for issue IDs). |
| `--fix` JSON output shows pre-fix state | Low | After `--fix`, the JSON analysis section still shows MISSING/INVALID_SCHEMA statuses. Re-analyze post-fix or clearly label as pre-fix snapshot. |
| Phase 2 uses a different skill's script | Low | Phase 2 calls `skills/documenting/scripts/drift_detector.py`, not a sync-docs script. This cross-skill dependency isn't clearly flagged in the skill. The SKILL.md instructions correctly note it, but the path uses `$HOME/.claude/skills/documenting/` (global install path), not a repo-local path. Evaluators running repo-local must resolve this manually. |
| Serena required for README extraction | Note | Phase 4 cannot fully execute without Serena MCP. The skill correctly documents this but offers no fallback. In a non-Serena eval context, README extraction simply cannot proceed. |
