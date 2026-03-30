# Doc Audit: README.md vs docs/

Audit date: 2026-03-18
Method: Manual review of README.md sections against existing docs/ files.

---

## Summary

README.md is 193 lines and covers seven distinct topic areas beyond a short intro and quick-start. Several of these areas already have dedicated docs/ files with substantially more depth. The README content in those sections is either redundant with docs/ or represents a thin version of content that belongs in docs/.

---

## Section-by-Section Analysis

### 1. "Hooks Reference" (lines 114-141)

**README content:** Two sub-sections — "Event Types" table (5 events) and hook-specific behavior tables for Main Guard and Beads Gates.

**Existing doc:** `docs/hooks.md` — full reference with event model, hook groups, install profiles, operational workflow, troubleshooting. It covers all the same events and hook behaviors at greater depth.

**Finding:** This section is a thin duplicate of `docs/hooks.md`. The event types table and hook behavior tables add no information not already in the dedicated doc. This section should be removed from README and replaced with a pointer to `docs/hooks.md`.

**Suggested action:** Move to `docs/hooks.md` (already exists — content is already there).

---

### 2. "Policy System" (lines 66-86)

**README content:** Overview of the policy system, a table of policy files (`main-guard.json`, `beads.json`, etc. with their runtimes), and compiler commands.

**Existing doc:** `docs/policies.md` — exists but is a stub (generated template with placeholder "Describe what this document covers"). No real content yet.

**Finding:** The README's Policy System section is the only written explanation of how the policy compiler works. It belongs in `docs/policies.md` as that doc's primary content, not in the README. The README could keep a one-line summary with a link.

**Suggested action:** Move to `docs/policies.md` (stub file needs to be populated with this content).

---

### 3. "MCP Servers" (lines 143-158)

**README content:** A table of xtrm-managed MCP servers (`gitnexus`, `github-grep`, `deepwiki`) and a list of official Claude plugins installed during `xtrm install all`.

**Existing doc:** `docs/mcp.md` — full reference with canonical sources, server inventory (core and optional), operational workflow, troubleshooting. It has more servers listed.
Also: `docs/mcp-servers.md` — exists but is a stub.

**Finding:** The README's MCP table partially overlaps with `docs/mcp.md`. However, the README's list of official Claude plugins (`serena@claude-plugins-official`, `context7`, `github`, `ralph-loop`) is NOT present in `docs/mcp.md` — that is missing content that should be in the docs, not the README.

**Suggested action:** Move official plugin list to `docs/mcp.md`. Reduce README to a link.

---

### 4. "CLI Commands" (lines 89-111)

**README content:** Command table (`install all`, `install basic`, `install project`, `project init`, `status`, `clean`) and flags table (`--yes`, `--dry-run`, `--prune`).

**Existing doc:** No dedicated `docs/cli.md` file exists. The CLI commands are scattered across `docs/skills.md`, `docs/project-skills.md`, and `docs/hooks.md` only in context.

**Finding:** This section is a standalone CLI reference with no corresponding dedicated doc. It is appropriate to have a short CLI command table in the README, but a more complete reference (including flag interactions, edge cases, exit codes) would fit in a new `docs/cli.md`.

**Suggested action:** Consider creating `docs/cli.md` as a dedicated CLI reference. README can keep the summary table.

---

### 5. "Plugin Structure" (lines 52-63)

**README content:** A directory tree showing the plugin layout (`plugins/xtrm-tools/`, symlinks to `hooks/`, `skills/`, `.mcp.json`) and a note about `${CLAUDE_PLUGIN_ROOT}`.

**Existing doc:** No dedicated architecture or plugin-structure doc exists in `docs/`.

**Finding:** This is architecture documentation. It is brief (10 lines) and appropriate in a README for orientation, but would benefit from a dedicated `docs/architecture.md` or `docs/plugin-structure.md` that explains the symlink strategy, plugin manifest format, and how `${CLAUDE_PLUGIN_ROOT}` is resolved.

**Suggested action:** Consider moving to a new `docs/plugin-structure.md` or `docs/architecture.md`.

---

### 6. "Issue Tracking (Beads)" (lines 161-168)

**README content:** Three `bd` commands (`bd ready`, `bd update`, `bd close`).

**Existing doc:** `docs/hooks.md` has an "Operational Workflow (Beads + Hooks)" section with the full `bd kv` workflow. No dedicated `docs/beads.md` exists.

**Finding:** The README's beads section is a minimal cheat-sheet. The deeper workflow is in `docs/hooks.md` but conflated with hook behavior. A dedicated `docs/beads.md` would cleanly own issue tracking documentation. The README's three-command snippet is appropriate to keep as a quick reference.

**Suggested action:** Low priority. A dedicated `docs/beads.md` could extract the operational workflow from `docs/hooks.md` and give beads its own home.

---

### 7. "Version History" (lines 179-187)

**README content:** A 4-row version table (2.3.0 through 1.7.0).

**Existing doc:** `CHANGELOG.md` is referenced at the top of README as the "Full version history."

**Finding:** The README links to CHANGELOG.md for full history but also maintains its own abbreviated table. This is a minor duplication — the table will drift from CHANGELOG.md over time.

**Suggested action:** Remove the version table from README and rely entirely on the CHANGELOG.md link already present. Not a docs/ migration — just README cleanup.

---

## Priority Ranking

| Priority | Section | Action | Target |
|----------|---------|--------|--------|
| High | Hooks Reference | Remove from README; already in docs/ | `docs/hooks.md` (exists) |
| High | Policy System | Move content to stub doc | `docs/policies.md` (stub, needs population) |
| High | MCP official plugins list | Add missing content to docs/ | `docs/mcp.md` (exists) |
| Medium | CLI Commands | Create dedicated reference doc | `docs/cli.md` (new) |
| Medium | Plugin Structure | Create architecture doc | `docs/plugin-structure.md` (new) |
| Low | Issue Tracking (Beads) | Extract from hooks.md | `docs/beads.md` (new) |
| Low | Version History | Remove table; link to CHANGELOG | README-only cleanup |

---

## What README.md Should Retain

After moving the above sections, README.md should contain only:
- Project tagline and version badge
- Quick Start install commands
- "What's Included" summary tables (Core Enforcement + Skills) — orientation, not reference
- One-line pointers to each docs/ page
- License

The README's role is orientation and discoverability. All reference content belongs in `docs/`.

---

## Existing docs/ Coverage Map

| docs/ file | Status | Covers |
|-----------|--------|--------|
| `docs/hooks.md` | Complete | Hook events, groups, profiles, beads workflow |
| `docs/skills.md` | Complete | Global skills catalog and authoring |
| `docs/project-skills.md` | Complete | Project-local skills, install flow |
| `docs/mcp.md` | Complete (missing plugin list) | MCP server inventory and workflow |
| `docs/policies.md` | Stub | Policy system (README has the content) |
| `docs/mcp-servers.md` | Stub | Duplicate of mcp.md? Unclear purpose |
| `docs/mcp.md` | Complete | MCP reference |
| `docs/pi-extensions.md` | Not read | Pi extensions |
| `docs/testing.md` | Not read | Testing |
| `docs/todo.md` | Not read | Backlog |
| `docs/cli.md` | Missing | CLI commands reference |
| `docs/plugin-structure.md` | Missing | Plugin architecture |
| `docs/beads.md` | Missing | Issue tracking workflow |
