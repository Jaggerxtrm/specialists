# Doc Audit: README.md vs docs/

## Summary

The README.md is 193 lines and covers six substantive topic areas beyond Quick Start and installation. Four of those areas already have dedicated, more detailed counterparts in `docs/`. The README duplicates content that belongs in those files, and in some cases adds detail not present in the docs files. The core recommendation is: the README should shrink to an orientation document (Quick Start, What's Included overview, links), with deeper content living exclusively in `docs/`.

---

## Findings by Section

### 1. "Hooks Reference" (README lines 114–141) — MOVE to docs/hooks.md

**Problem:** The README contains a full hooks reference section covering event types, Main Guard behavior, and Beads Gate behavior in table form. `docs/hooks.md` already exists and covers the same ground with significantly more detail (hook groups, install profiles, operational workflow, troubleshooting).

**What the README adds that docs/hooks.md lacks:** Nothing materially new. The event type table in README (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `PreCompact`) is a subset of what `docs/hooks.md` covers. The Beads Gate table in README is a simplified version of the hook groups table in docs.

**Recommendation:** Remove the "Hooks Reference" section from README entirely. Add a single line: `See [docs/hooks.md](docs/hooks.md) for the full hooks reference.` Ensure `docs/hooks.md` covers `PreCompact` (currently missing from that file).

---

### 2. "Policy System" (README lines 66–87) — MOVE to docs/ (no existing file)

**Problem:** The Policy System section (policy files table, compiler commands) is a substantive reference block — 20 lines of tables and code. There is no dedicated `docs/policies.md` or equivalent. This content currently lives only in the README with no docs/ home.

**Why it's too detailed for README:** Policy file names, runtime targets (`both`/`pi`/`claude`), and compiler CLI flags (`--check`) are operational reference details. A user scanning the README to understand what xtrm-tools does does not need this level of detail to orient themselves.

**Recommendation:** Create `docs/policies.md` to house this content. In the README, replace the section with: `The policy system compiles \`policies/*.json\` into hooks and Pi extensions. See [docs/policies.md](docs/policies.md).`

---

### 3. "MCP Servers" (README lines 143–158) — MOVE to docs/mcp.md

**Problem:** The README includes an MCP Servers section listing both the `.mcp.json` servers and the official Claude plugins installed during `xtrm install all`. `docs/mcp.md` already exists and is more thorough (canonical sources, server inventory with prerequisites, operational workflow, troubleshooting).

**What README adds that docs/mcp.md lacks:** The list of official Claude plugins (`serena@claude-plugins-official`, `context7@claude-plugins-official`, `github@claude-plugins-official`, `ralph-loop@claude-plugins-official`) is NOT in `docs/mcp.md`. This is a gap in the docs file, not a reason to keep it in the README.

**Recommendation:** Remove the MCP Servers section from README. Add the official Claude plugins list to `docs/mcp.md`. Replace README section with a link to `docs/mcp.md`.

---

### 4. "CLI Commands" (README lines 89–111) — PARTIAL MOVE

**Problem:** The CLI Commands section (command table + flags table) is the most borderline case. Quick install commands belong in a README. But the full commands table (6 commands) plus a separate flags table (3 flags) is reference material.

**What exists in docs/:** No dedicated `docs/cli.md` exists. `docs/skills.md` mentions a few commands in passing. The XTRM-GUIDE.md (the stated "Complete Guide") covers CLI commands in full.

**Recommendation:** Keep only the install commands (`xtrm install all`, one-liner) in the README Quick Start. Move the full command/flag tables to `XTRM-GUIDE.md` (which already covers CLI) or to a new `docs/cli.md`. The README currently duplicates what XTRM-GUIDE.md already documents.

---

### 5. "Version History" (README lines 179–188) — REMOVE from README

**Problem:** A four-row version history table in the README is redundant given that CHANGELOG.md is explicitly linked at the top of the README (`[Changelog](CHANGELOG.md)`). It will fall out of date as soon as new versions ship.

**Recommendation:** Remove the Version History table entirely. The link to CHANGELOG.md at the top of the file is sufficient.

---

### 6. "Plugin Structure" (README lines 52–63) — BORDERLINE (keep short, consider moving detail)

**Problem:** The Plugin Structure block (directory tree + explanation of `${CLAUDE_PLUGIN_ROOT}`) is 12 lines. It is useful orientation, but the symlink structure and environment variable explanation are implementation details.

**Recommendation:** Keep a one-line description of the plugin layout in the README. Move the annotated directory tree and `${CLAUDE_PLUGIN_ROOT}` explanation to `docs/` (either a new `docs/plugin-structure.md` or into XTRM-GUIDE.md which already has an Architecture section with an ASCII diagram).

---

## Sections That Belong in the README (No Change Needed)

| Section | Why It Belongs |
|---------|---------------|
| Quick Start | Orientation content — every README needs this |
| What's Included (tables) | High-level capability overview, not deep reference |
| Issue Tracking (Beads) — 3-line snippet | Minimal orientation example, not a full reference |
| Documentation links | Correct: pointing users to deeper docs |
| License | Standard |

---

## docs/ Files With No README Counterpart (No Action Needed)

These files in `docs/` cover topics the README doesn't attempt to address. They are appropriately scoped to docs/:

- `docs/skills.md` — authoring contract, skill catalog details
- `docs/project-skills.md` — project-scoped skill installation
- `docs/testing.md` — testing guidance
- `docs/pre-install-cleanup.md` — pre-install hygiene
- `docs/plans/` — implementation plans and design docs (internal)
- `docs/reference/` — upstream reference material (Anthropic/Gemini docs)

---

## Prioritized Action List

1. **Remove "Version History" table** from README — pure redundancy, immediate win.
2. **Remove "Hooks Reference" section** from README — fully covered by `docs/hooks.md`. Add one link sentence.
3. **Remove "MCP Servers" section** from README — covered by `docs/mcp.md`. First add official Claude plugins list to `docs/mcp.md`, then remove README section.
4. **Move "Policy System" section** to a new `docs/policies.md` — no existing home for this content.
5. **Trim "CLI Commands"** in README to install commands only; consolidate full table into XTRM-GUIDE.md or `docs/cli.md`.
6. **Trim "Plugin Structure"** to one line; move annotated tree to XTRM-GUIDE.md Architecture section.

After these changes, the README should be approximately 60-70 lines: tagline, Quick Start, high-level What's Included tables, and links to deeper references.
