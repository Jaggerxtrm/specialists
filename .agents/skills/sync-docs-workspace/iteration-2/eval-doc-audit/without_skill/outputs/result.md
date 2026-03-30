# Doc Audit: README.md vs docs/

**Date:** 2026-03-18
**Scope:** `/home/dawid/projects/xtrm-tools/README.md` and `/home/dawid/projects/xtrm-tools/docs/`

---

## Summary

The README is 193 lines and contains six substantive reference sections beyond the quick-start and version history. Most of them already have dedicated counterparts in `docs/`, but the README duplicates or partially overlaps that content. Below is a section-by-section breakdown with a concrete recommendation for each.

---

## README Sections Reviewed

### 1. "Hooks Reference" (lines 114-141)

**What it contains:**
- Event type table (SessionStart, PreToolUse, PostToolUse, Stop, PreCompact)
- Main Guard behavior summary
- Beads Gates behavior table (Edit Gate, Commit Gate, Stop Gate, Memory Gate)

**Existing doc:** `docs/hooks.md` — a fully developed reference (134 lines) covering the event model, all hook groups, install profiles, operational workflow, and troubleshooting.

**Verdict: Move this content to `docs/hooks.md`.**

The README's hooks section is a shallow subset of what is already in `docs/hooks.md`. The event types table duplicates the Event Model section. The Main Guard and Beads Gates summaries duplicate the Hook Groups section. The README should keep at most one sentence pointing to `docs/hooks.md`.

---

### 2. "Policy System" (lines 66-87)

**What it contains:**
- Policy files table (5 policies, runtime, purpose)
- Compiler commands (`compile-policies.mjs`)

**Existing doc:** `docs/policies.md` — currently a stub with only a placeholder "Overview" section and no real content.

**Verdict: Move this content to `docs/policies.md`.**

The README's Policy System section is the only place this information is documented. The stub at `docs/policies.md` exists but is empty. The policy files table and compiler commands belong there. The README should summarize in one sentence and link to `docs/policies.md`.

---

### 3. "MCP Servers" (lines 143-158)

**What it contains:**
- Table of xtrm-managed MCP servers (gitnexus, github-grep, deepwiki)
- List of official Claude plugins installed during `xtrm install all`

**Existing docs:** `docs/mcp.md` — a developed reference covering canonical sources, server inventory (core + optional), operational workflow, and troubleshooting. `docs/mcp-servers.md` — a stub with only a placeholder "Overview" section.

**Verdict: Move this content to `docs/mcp.md` and fill `docs/mcp-servers.md`.**

The README's server list is an abbreviated duplicate of `docs/mcp.md`'s Server Inventory section. The official Claude plugins list (serena, context7, github, ralph-loop) is not captured anywhere in `docs/` — it should be added to `docs/mcp.md` under a "Plugin Installation" subsection, not kept only in the README. The README should link to `docs/mcp.md`.

---

### 4. "Plugin Structure" (lines 52-63)

**What it contains:**
- Directory tree of `plugins/xtrm-tools/`
- Note about `${CLAUDE_PLUGIN_ROOT}` path resolution

**Existing doc:** None. There is no `docs/plugin.md` or equivalent.

**Verdict: Move this content to a new `docs/plugin.md` (or into XTRM-GUIDE.md).**

XTRM-GUIDE.md already contains an Architecture section and an Installation section — the plugin structure tree logically belongs there. The README can keep a condensed one-liner summary. Either move the tree to XTRM-GUIDE.md's existing "Plugin Structure" section (line 4 of the guide ToC) or create `docs/plugin.md`.

---

### 5. "Skills" table (lines 42-49, inside "What's Included")

**What it contains:**
- Table of 4 global skills with type and purpose

**Existing doc:** `docs/skills.md` — a fully developed reference covering the runtime model, core global skills, specialized global skills, authoring contract, and operational commands.

**Verdict: The README table is a useful at-a-glance summary — keep it, but ensure it stays in sync with `docs/skills.md`.**

The README lists only 4 skills while `docs/skills.md` documents many more. This is an acceptable intentional narrowing for a README intro, but the content overlap means these can diverge. If the team prefers a single source of truth, the README table should be removed and replaced with a link to `docs/skills.md`. If the README table is kept, it should explicitly say it is not exhaustive.

---

### 6. "Version History" table (lines 179-187)

**What it contains:**
- 4-row table of recent versions (2.0.0–2.3.0) with dates and highlights

**Existing doc:** `CHANGELOG.md` (linked from README line 5).

**Verdict: Remove this table from the README and rely on the CHANGELOG.md link.**

A partial version table in the README that duplicates CHANGELOG.md adds maintenance burden. The link on line 5 already points to the full changelog. The README version history adds no value that the link does not already provide.

---

## Recommended Moves (Prioritized)

| Priority | README Section | Action | Target |
|----------|---------------|--------|--------|
| High | Policy System | Move policy files table + compiler commands | `docs/policies.md` (currently a stub) |
| High | MCP Servers — official plugins list | Add to existing docs | `docs/mcp.md` (this data is missing from docs/) |
| Medium | Hooks Reference | Remove from README, link to existing doc | `docs/hooks.md` |
| Medium | Version History table | Remove from README | Already covered by `CHANGELOG.md` link |
| Medium | MCP Servers table | Remove from README, link to existing doc | `docs/mcp.md` |
| Low | Plugin Structure tree | Move to XTRM-GUIDE.md or new `docs/plugin.md` | `XTRM-GUIDE.md` (Plugin Structure section) |
| Low | Skills table | Keep as intentional summary or remove + link | `docs/skills.md` |

---

## What Should Stay in README

The README should remain a fast-path entry point containing only:
- One-paragraph description and version badge
- Quick Start commands (install + verify)
- "What's Included" as a brief feature summary (not a full reference)
- Links to docs/ and XTRM-GUIDE.md for details
- License

All reference-level detail (event types, hook behaviors, policy files, MCP server inventories) belongs in `docs/`.

---

## Stubs That Need Content

Two files in `docs/` exist as nearly-empty stubs and should be filled during any move:

| File | Current state | Should contain |
|------|--------------|----------------|
| `docs/policies.md` | Placeholder only | Policy files table, compiler usage, policy-to-hook compilation model |
| `docs/mcp-servers.md` | Placeholder only | Could absorb or replace `docs/mcp.md`, or be removed to avoid duplication |
| `docs/pi-extensions.md` | Placeholder only | Pi extensions system (config/pi/extensions/), runtime model, migration from project skills |
