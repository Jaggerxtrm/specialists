---
report_type: drift_inventory
generated_at: 2026-04-29
generated_by: unitAI-jhhu4.1
scope: CLAUDE.md / AGENTS.md across xtrm ecosystem repos
related_epic: unitAI-jhhu4
---

# CLAUDE.md drift inventory — xtrm ecosystem

Baseline produced for epic `unitAI-jhhu4` (Agent guidance reconciliation + pitfall capture). This is the pre-sentinel inventory — `unitAI-jhhu4.2` will formalize the managed fragments + `xt claude-sync` script using the findings below.

## Files inspected

| Path | Lines (pre-edit) | Role |
|------|-----------------|------|
| `~/dev/CLAUDE.md` | 248 | Parent / shared workflow |
| `~/dev/specialists/CLAUDE.md` | 523 | Project (specialists runtime) |
| `~/dev/xtrm-tools/CLAUDE.md` | 450 | Project (xtrm-tools CLI / hooks / skills) |
| `~/dev/specialists/AGENTS.md` | 330 | Mirror — drifted from CLAUDE.md |
| `~/dev/xtrm-tools/AGENTS.md` | 436 | Mirror — drifted from CLAUDE.md |
| `~/.claude/CLAUDE.md` | — | Not present |

## Top-level structure (post-edit)

All three CLAUDE.md files are wrapped with two pre-existing sentinel pairs:

| Sentinel | Region | State |
|----------|--------|-------|
| `<!-- xtrm:start --> … <!-- xtrm:end -->` | XTRM Agent Workflow | **Byte-identical across all three** (verified by `diff`). |
| `<!-- gitnexus:start --> … <!-- gitnexus:end -->` | GitNexus — Code Intelligence | Structurally identical; differs only in repo-name template values + indexed stats. |

Outside the sentinels, each file carries project-specific content that is not a candidate for cross-repo sync.

## Divergence map (cross-repo, shared concerns)

### 1. xtrm block — IDENTICAL ✓

`~/dev/CLAUDE.md:1-159` ≡ `~/dev/specialists/CLAUDE.md:1-159` ≡ `~/dev/xtrm-tools/CLAUDE.md:8-166` (xtrm-tools has an OpenWolf preamble at lines 1-7 before the block).

This is the prime sentinel candidate for `.2` — the existing markers already wrap it.

### 2. gitnexus block — TEMPLATE-IDENTICAL with repo-name divergence

| File:line | Repo name token | Stats |
|-----------|----------------|-------|
| `~/dev/CLAUDE.md:262 (was 151)` | `**projects**` | `80165 symbols, 150558 relationships, 300 execution flows` |
| `~/dev/specialists/CLAUDE.md:537 (was 426)` | `**specialists**` | `4415 symbols, 9626 relationships, 300 execution flows` |
| `~/dev/xtrm-tools/CLAUDE.md` | `**xtrm-tools**` | varies |

Resource-path tokens diverge:
- `gitnexus://repo/{projects|specialists|xtrm-tools}/context`
- `gitnexus://repo/{projects|specialists|xtrm-tools}/clusters`
- `gitnexus://repo/{projects|specialists|xtrm-tools}/processes`
- `gitnexus://repo/{projects|specialists|xtrm-tools}/process/{name}`

Sentinel candidate for `.2` with **template substitution** (`{{repo_name}}`, `{{repo_stats}}`).

### 3. Project-only middle (NOT a sentinel candidate)

| File | Section | Range (post-edit) |
|------|---------|-------------------|
| `~/dev/specialists/CLAUDE.md` | "Specialists Project Guide" → "Recovery Cheatsheet" | lines 263-535 |
| `~/dev/xtrm-tools/CLAUDE.md` | OpenWolf preamble + project guide | lines 1-7 + middle |

Keep project-local. Not byte-identical, intentionally.

### 4. AGENTS.md mirrors — STALE

`diff specialists/CLAUDE.md specialists/AGENTS.md` (top of file):

```
4,5c4,5
< > Full reference: [XTRM-GUIDE.md](XTRM-GUIDE.md) | Session manual: `/using-xtrm` skill
< > Run `bd prime` at session start (or after `/compact`) for live beads workflow context.
---
> > Full reference: [XTRM-GUIDE.md](XTRM-GUIDE.md)
> > Run `bd prime` at session start (or after context reset) for live beads workflow context.
22c22
< ## Active Gates (hooks enforce these — not optional)
---
> ## Active Gates (extensions enforce these — not optional)
```

- `~/dev/specialists/AGENTS.md:4-5` — missing `/using-xtrm` skill ref; says "context reset" instead of "/compact"
- `~/dev/specialists/AGENTS.md:22` — says "**extensions** enforce these" instead of "**hooks** enforce these"
- `~/dev/xtrm-tools/AGENTS.md:1-7` — has an OpenWolf preamble that `xtrm-tools/CLAUDE.md` lacks
- `~/dev/xtrm-tools/AGENTS.md:11-12` — same XTRM-GUIDE / context-reset divergence

**Recommendation for `.2`**: AGENTS.md should be re-derived from CLAUDE.md (same sentinel content) by the `xt claude-sync` script. AGENTS is consumed by Codex/Aider; CLAUDE is consumed by Claude Code. Keeping both in sync via a single source removes the recurring drift.

## Gaps closed by this bead

| Gap | Closed by |
|-----|----------|
| `bd create --parent <epic-id>` not in any CLAUDE.md bd reference (was original trigger) | Added under `# Creating` in all three xtrm blocks. |
| No "Common pitfalls" section anywhere in CLAUDE.md ecosystem | New section appended to xtrm block in all three CLAUDE.md, byte-identical, 12 entries. |
| `sp merge` post-`sp stop` failure not documented as known limitation | Captured as pitfall #4 with link to `unitAI-ofjvj` and the manual `git merge --no-ff` workaround. |

## Pitfalls captured (12 entries, sourced from session reports)

| # | Pitfall | Source evidence |
|---|---------|-----------------|
| 1 | `bd create --parent <epic-id>` for epic children | `2026-04-29-c190df90.md:279` ("user had to surface it before the KPI epic was filed correctly") |
| 2 | Memory gate must ack BEFORE `bd close` | `2026-04-29-c190df90.md:280` ("caught me mid-session when probe bead closed without ack") |
| 3 | Bare `bv` opens TUI | xtrm CLAUDE.md:95 (existing warning) — promoted to pitfall after observed friction |
| 4 | `sp stop` cleans `status.json`; `sp merge` then fails | `2026-04-29-c190df90.md:115`, `:281`, `:320` (new P0 `unitAI-ofjvj`) |
| 5 | `--worktree` / `--job` mutually exclusive | `~/dev/specialists/CLAUDE.md:294` (invariants list) — promoted to pitfall |
| 6 | `--keep-alive` required for resumable specialists | repeated friction point in chain pattern (specialists CLAUDE.md:299) |
| 7 | `--context-depth` default is 3, not 1 | `2026-04-29-c190df90.md` audit ledger of stale doc points (`workflow.md` had this wrong) |
| 8 | `bd query` for SQL-like filters | xtrm CLAUDE.md:38 — present but not loud enough |
| 9 | `bd dep <blocker> --blocks <blocked>` shorthand + `bd dep relate` | `2026-04-29-c190df90.md` followups; xtrm CLAUDE.md:62-63 |
| 10 | Per-turn output auto-appends to bead notes (all specialists, not just READ_ONLY) | `~/dev/specialists/CLAUDE.md:298, :350` — recently expanded behavior, easy to miss |
| 11 | GitNexus index stale-on-commit; preserve embeddings explicitly | xtrm CLAUDE.md gitnexus block lines 227-231 — promoted to top-of-mind pitfall |
| 12 | `sp poll` deprecated → `sp ps` + `sp feed` + `sp result` | `~/dev/specialists/CLAUDE.md:273` ("sp poll is deprecated") + repeated session report mentions |

## Candidate fragments for `.2`

Recommended sentinel structure for the `xt claude-sync` script:

```
<!-- xtrm:start -->                  ← already exists, byte-identical content
…
<!-- xtrm:end -->

<!-- gitnexus:start -->              ← already exists, needs templating
…
<!-- gitnexus:end -->
```

New sentinels `.2` may want to add:

| Proposed marker | Wraps | Notes |
|----------------|-------|-------|
| `<!-- pitfalls:start --> … <!-- pitfalls:end -->` | The Common Pitfalls section now nested inside the xtrm block | Optional — could keep as part of the xtrm block. Splitting allows independent versioning. |
| `<!-- gitnexus:repo-name -->` | template var inside gitnexus block | Per-repo substitution token |
| `<!-- gitnexus:repo-stats -->` | indexed stats line | Optional, since stats can be regenerated by analyze |

## Observed AGENTS.md drift (out-of-scope but flagged for `.2`)

`xt claude-sync` should regenerate `AGENTS.md` from `CLAUDE.md` (or vice versa) so the four divergences listed in §4 stop recurring across sessions.

## Validation performed

- `diff` of xtrm:start..xtrm:end blocks across all three CLAUDE.md → identical (no output).
- `bd create --parent` present in `# Creating` block of all three CLAUDE.md.
- Pitfalls section present at end of xtrm block in all three CLAUDE.md, byte-identical.
- xtrm-tools commit lives in `~/dev/xtrm-tools/` (separate repo) — handled in parallel commit.

## Out-of-scope follow-ups

- AGENTS.md regeneration (covered by `.2`).
- Hot-tip injection on session start (`unitAI-jhhu4.4`).
- Doctor wiring (`unitAI-jhhu4.3`).
- Other repos with stale `~/dev/<repo>/CLAUDE.md` (vaultctl, transcriptoz, barchart-scraper, claw-code, second-mind, …) carry an older "Auto-fires at Stop" memory-gate phrasing — those mirror the parent and will be picked up automatically when `xt claude-sync` lands in `.2`.
