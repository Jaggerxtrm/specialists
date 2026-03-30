# Doc Audit Report — xtrm-tools

**Date:** 2026-03-18
**Working directory:** `/home/dawid/projects/xtrm-tools`
**Task:** Identify README sections that belong in `docs/` and note any other structural issues.

---

## Diagnostic Outputs

### Phase 1: Context Gatherer

- **bd issues closed recently:** 20 issues (mostly P0/P1 bugs and tasks from the `4xr6` feature cycle)
- **Merged PRs (last 30 days):** 10 PRs, most recent at 2026-03-13
- **Recent commits:** 15 commits today (2026-03-18), touching quality-gates, service-skills, xtrm init, global architecture
- **Serena drift:** Not available (Serena not active in this session)

Key closed issues relevant to docs:
- `jaggers-agent-tools-2xv`: "Update documentation with latest PRs and CLI changes" — closed but CHANGELOG last entry is 2026-03-12, far behind today's activity
- `jaggers-agent-tools-0ys`: "E2E audit: Pi extensions — verify all 2.2.0 Pi changes" — closed; no `docs/pi-extensions.md` existed at the time

### Phase 2: SSOT Drift

- `drift_detector.py` could not run (missing `yaml` module in this environment)
- Manual observation: CHANGELOG.md last entry date is **2026-03-12**; latest commit is **2026-03-18** — a **6-day gap** with ~15 commits unrecorded

### Phase 3: doc_structure_analyzer.py Output

```
README status:   EXTRACTABLE (192 lines — 8 lines below BLOATED threshold of 200)
Extraction candidates identified:
  - ## Policy System        → docs/policies.md
  - ### Policy Files        → docs/policies.md
  - ## MCP Servers          → docs/mcp-servers.md

Missing docs/ files:
  - docs/pi-extensions.md  (config/pi/extensions/ directory exists)
  - docs/mcp-servers.md    (.mcp.json present)
  - docs/policies.md       (policies/ directory exists)

Existing docs/ files with schema issues:
  - docs/hooks.md           INVALID_SCHEMA (no YAML frontmatter)
  - docs/mcp.md             INVALID_SCHEMA (no YAML frontmatter)
  - docs/pre-install-cleanup.md  INVALID_SCHEMA (no YAML frontmatter)
  - docs/project-skills.md  INVALID_SCHEMA (no YAML frontmatter)
  - docs/skills.md          INVALID_SCHEMA (no YAML frontmatter)
  - docs/testing.md         INVALID_SCHEMA (no YAML frontmatter)
  - docs/todo.md            INVALID_SCHEMA (no YAML frontmatter)
```

### Phase 5: validate_doc.py on docs/

```
docs/hooks.md            FAIL — Missing YAML frontmatter
docs/mcp-servers.md      PASS (INDEX regenerated — created during this audit run by --fix)
docs/mcp.md              FAIL — Missing YAML frontmatter
docs/pi-extensions.md    PASS (INDEX regenerated — created during this audit run by --fix)
docs/policies.md         PASS (INDEX regenerated — created during this audit run by --fix)
docs/pre-install-cleanup.md  FAIL — Missing YAML frontmatter
docs/project-skills.md   FAIL — Missing YAML frontmatter
docs/skills.md           FAIL — Missing YAML frontmatter
docs/testing.md          FAIL — Missing YAML frontmatter
docs/todo.md             FAIL — Missing YAML frontmatter

Result: 3/10 passed
```

---

## README Structure Analysis

The README is **192 lines** — just below the 200-line BLOATED threshold but classified `EXTRACTABLE`. Section inventory:

| README Section | Lines (approx) | Verdict | Target |
|---|---|---|---|
| Quick Start | ~12 | KEEP — entry-point content | README |
| What's Included — Core Enforcement | ~8 | KEEP — high-level overview table | README |
| What's Included — Skills | ~10 | KEEP — but expand link to docs/skills.md | README |
| Plugin Structure | ~10 | KEEP — orientation map | README |
| **Policy System + Policy Files** | ~22 | **EXTRACT** | `docs/policies.md` |
| **CLI Commands + Flags** | ~24 | **BORDERLINE** — see note | README or `docs/cli-reference.md` |
| **Hooks Reference** | ~20 | **EXTRACT** | `docs/hooks.md` |
| **MCP Servers** | ~18 | **EXTRACT** | `docs/mcp-servers.md` |
| Issue Tracking (Beads) | ~8 | KEEP — 3-liner overview is appropriate | README |
| Documentation | ~7 | KEEP | README |
| Version History | ~8 | BORDERLINE — belongs in CHANGELOG | README or CHANGELOG |
| License | ~3 | KEEP | README |

---

## Specific Recommendations

### 1. Extract `## Policy System` + `### Policy Files` → `docs/policies.md`

**Why:** `policies/` directory has 7 policy JSON files. The README currently carries a full table of policy files with compiler commands. This is reference content, not an entry-point summary.

**What to move:**
- The `## Policy System` section intro (lines 68–70)
- The `### Policy Files` table (lines 72–81)
- The `### Compiler` code block (lines 83–87)

**What to replace with in README:**
> Enforcement rules are defined in `policies/`. See [docs/policies.md](docs/policies.md) for the full policy catalog and compiler reference.

**Note:** `docs/policies.md` was scaffolded by the analyzer (PASS in validate_doc) but has no content yet — it needs to be filled.

---

### 2. Extract `## Hooks Reference` → `docs/hooks.md`

**Why:** `docs/hooks.md` already exists and covers hooks in depth (106 lines). The README duplicates a subset of that content — the event-type table and the Main Guard + Beads Gates summaries.

**What to move:**
- `## Hooks Reference` section (lines 114–141): event types table, Main Guard bullets, Beads Gates table

**What to replace with in README:**
> Hook events and gate behavior are documented in [docs/hooks.md](docs/hooks.md).

**Blocker:** `docs/hooks.md` is missing YAML frontmatter — it will fail schema validation. Add frontmatter before extracting.

---

### 3. Extract `## MCP Servers` → `docs/mcp-servers.md`

**Why:** `.mcp.json` exists, `config/mcp_servers.json` and `config/mcp_servers_optional.json` exist, and `docs/mcp.md` already covers MCP in depth (84 lines). The README MCP section (18 lines) duplicates a subset.

**What to move:**
- `## MCP Servers` section (lines 143–158): the configured servers table and official plugins list

**What to replace with in README:**
> MCP server configuration is managed in `.mcp.json`. See [docs/mcp-servers.md](docs/mcp-servers.md) for the full server catalog.

**Note:** There are now two overlapping MCP docs: `docs/mcp.md` (no frontmatter, covers config source) and `docs/mcp-servers.md` (scaffolded by --fix, no content yet). These should be consolidated — `docs/mcp.md` content should be merged into `docs/mcp-servers.md` and `docs/mcp.md` removed.

---

### 4. `## CLI Commands` — Borderline, Keep for Now

The CLI commands table (lines 89–111) is 24 lines covering 6 commands and 3 flags. This is useful at-a-glance content for README. It crosses into reference territory but the README would feel hollow without it. Recommendation: keep, but if CLI grows past 10 commands, extract to `docs/cli-reference.md`.

---

### 5. `## Version History` — Belongs in CHANGELOG, not README

The 4-row version history table in the README (lines 179–186) duplicates what CHANGELOG.md covers and will become stale as versions accumulate. It should be removed from README and replaced with a single link: `See [CHANGELOG.md](CHANGELOG.md) for full version history.`

---

## Missing docs/ Files That Need Content

Three files were scaffolded (empty frontmatter stubs) by the analyzer's `--fix` run. They PASS schema validation but have no content:

| File | Signal | Content needed |
|---|---|---|
| `docs/policies.md` | `policies/` has 7 JSON files | Policy catalog, compiler usage, `node scripts/compile-policies.mjs` |
| `docs/mcp-servers.md` | `.mcp.json` present | Merge content from `docs/mcp.md` + README MCP section |
| `docs/pi-extensions.md` | `config/pi/extensions/` has 10+ `.ts` files | Pi extension catalog, events, configuration |

---

## Schema Violations in Existing docs/ Files

All 7 legacy docs/ files are missing YAML frontmatter. They will fail `validate_doc.py`. These need frontmatter blocks added before the next sync cycle:

| File | Lines | Action |
|---|---|---|
| `docs/hooks.md` | 106 | Add frontmatter: `scope: hooks, category: reference` |
| `docs/mcp.md` | 84 | Add frontmatter OR merge into `docs/mcp-servers.md` and delete |
| `docs/pre-install-cleanup.md` | 107 | Add frontmatter: `scope: install, category: guide` |
| `docs/project-skills.md` | 78 | Add frontmatter: `scope: project-skills, category: reference` |
| `docs/skills.md` | 89 | Add frontmatter: `scope: skills, category: reference` |
| `docs/testing.md` | 125 | Add frontmatter: `scope: testing, category: reference` |
| `docs/todo.md` | 4 | Add frontmatter OR delete (4-line stub, likely stale) |

---

## CHANGELOG Gap

CHANGELOG last entry: `2026-03-12`
Latest commit: `2026-03-18` (today)
Gap: **6 days**, ~15 commits including:
- v2.4.0 release (`chore: release v2.4.0`)
- quality-gates wired into project settings.json
- service-skills made CWD-aware global extension
- xtrm init project detection + service-registry scaffolding
- global-first architecture regression tests
- guard-rules centralized

The CHANGELOG has a stale `[Unreleased]` block that was written for v2.0.0 features; all post-v2.0.0 work is undocumented.

---

## Priority Order for Execution

| Priority | Action | Effort |
|---|---|---|
| P0 | Add YAML frontmatter to all 7 existing docs/ files | Low — mechanical |
| P0 | Update CHANGELOG with v2.3.0–v2.4.0 entries | Medium |
| P1 | Extract `## Hooks Reference` from README → `docs/hooks.md` | Low |
| P1 | Extract `## Policy System` from README → `docs/policies.md` (fill content) | Medium |
| P1 | Extract `## MCP Servers` from README → merge into `docs/mcp-servers.md` (consolidate with `docs/mcp.md`) | Medium |
| P2 | Fill `docs/pi-extensions.md` with Pi extension catalog | Medium |
| P2 | Remove version history table from README, replace with CHANGELOG link | Low |
| P3 | Create `docs/cli-reference.md` when CLI exceeds 10 commands | Deferred |

---

## Summary

The README is 8 lines below the BLOATED threshold but already `EXTRACTABLE`. Three sections — Policy System, Hooks Reference, and MCP Servers — have dedicated docs/ homes and should be extracted. The bigger issues are: 7 of 10 docs/ files have no YAML frontmatter (failing schema validation), the CHANGELOG has a 6-day gap covering a full version release, and two MCP docs (`docs/mcp.md` and `docs/mcp-servers.md`) overlap and need consolidation. No files were moved or edited during this audit.
