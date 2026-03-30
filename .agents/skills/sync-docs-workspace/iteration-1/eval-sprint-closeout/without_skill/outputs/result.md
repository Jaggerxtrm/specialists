# Doc Sync Report — Sprint Closeout (2026-03-18)

## What Was Done

Reviewed all primary documentation files against recent git history to assess accuracy and identify gaps after sprint work on the `feature/jaggers-agent-tools-4xr6` branch.

**Tools and sources consulted:**
- `git log --oneline` (full history + branch-only)
- `git log --name-only main..HEAD` (files changed per branch commit)
- Read: `README.md`, `CHANGELOG.md`, `XTRM-GUIDE.md`, `ROADMAP.md`, `AGENTS.md`
- `package.json` and `cli/package.json` for current version
- `ls skills/` for skills catalog comparison
- No `bd` (beads) CLI was run — no `.beads/` DB was found in this repo root

---

## Branch Summary (main..HEAD, 7 commits)

| Commit | Change |
|--------|--------|
| `54d9978` | Centralize guard tool rules and matcher expansion (guard-rules.mjs, hooks.json, policies) |
| `f8e37f9` | Deprecate `install project` command in favor of `xtrm init` (XTRM-GUIDE + install-project.ts) |
| `c1d5182` | Add global-first architecture regression tests |
| `d83384e` | Add project detection and service registry scaffolding to `xtrm init` |
| `e35fa46` | Promote service and quality skills to global sync set (multiple skills + scripts) |
| `b6c057f` | Make service-skills extension CWD-aware and global |
| `02fe064` | Move quality gates to global Claude hooks |

---

## Documentation Issues Found

### 1. Version Mismatch — README.md and XTRM-GUIDE.md out of date

**Severity: High**

- `package.json` reports version **2.4.1**
- `cli/package.json` reports version **2.4.1**
- `README.md` header says **Version 2.3.0** (line 5) and the version history table tops out at 2.3.0
- `XTRM-GUIDE.md` also says **Version 2.3.0** (line 2) and version history tops at 2.3.0
- `XTRM-GUIDE.md` plugin.json snippet hardcodes `"version": "2.3.0"` (line ~122)

The CHANGELOG shows `[2.4.0]` was released (commit `10d6433: chore: release v2.4.0 (#110)`), but no `[2.4.0]` section exists in `CHANGELOG.md`. The current `package.json` is already at 2.4.1. The CHANGELOG's `[Unreleased]` section contains items that were landed before the 2.4.0 release tag.

### 2. CHANGELOG [Unreleased] Section Is Stale / Missing Branch Changes

**Severity: High**

The `[Unreleased]` section in `CHANGELOG.md` documents:
- `AGENTS.md` bd section
- `xtrm install project all`
- Claude-only target detection fix
- Project-skill install-all regression tests

None of the 7 branch commits are captured in `[Unreleased]`. The following shipped changes are undocumented:
- Quality gates moved to global Claude hooks (`02fe064`)
- Service-skills extension made CWD-aware and global (`b6c057f`)
- Global service and quality skills promotion (`e35fa46`)
- `xtrm init` project detection + service registry scaffolding (`d83384e`)
- Global-first architecture regression tests (`c1d5182`)
- `install project` command deprecation (`f8e37f9`)
- Guard tool rules centralized into `guard-rules.mjs` (`54d9978`)

There is also no `[2.4.0]` or `[2.4.1]` section — the release commit exists in git but was never written to the changelog.

### 3. README.md CLI Commands Table — Stale Entry

**Severity: Medium**

`README.md` line 99 lists:
```
| `install project <name>` | Install project skill |
```
Commit `f8e37f9` explicitly deprecates this command in favor of `xtrm init`. The XTRM-GUIDE was updated (correctly showing it as `**Deprecated**`), but README.md was not updated and still presents this as a live command without any deprecation note. `xtrm init` / `project init` are absent from the README command table entirely.

### 4. README.md Version History Table Capped at 2.3.0

**Severity: Medium**

The Version History table at the bottom of README.md shows:
```
| 2.3.0 | 2026-03-17 | Plugin structure, policy compiler, Pi extension parity |
```
There is no row for 2.4.0 or 2.4.1.

### 5. ROADMAP.md "Completed in v2.1.9" — Outdated Header

**Severity: Low**

The ROADMAP's completed section header says `Completed in v2.1.9 (2026-03-15)`. There is no section for work completed in v2.4.x, even though multiple roadmap items relate to global-first architecture (quality gates global, service skills global) that are now shipped.

### 6. XTRM-GUIDE.md Skills Catalog — Likely Accurate

**Severity: None (verified OK)**

The skills catalog in XTRM-GUIDE.md (lines 227-252) was updated recently in commit `9f1b1c1 (docs(xtrm-guide): fix skills catalog, Pi events, policy table, version history)`. It lists all skills found under `skills/` including new global skills like `creating-service-skills`, `scoping-service-skills`, `updating-service-skills`, `using-quality-gates`, and `using-service-skills`. This is up to date.

### 7. XTRM-GUIDE.md Policy Table — Matches Current State

**Severity: None (verified OK)**

The policy table in XTRM-GUIDE includes `service-skills.json` (pi, order 40) which was added in `b6c057f`. This is accurate.

### 8. XTRM-GUIDE.md Pi Extensions Table — Includes service-skills.ts

**Severity: None (verified OK)**

`service-skills.ts` is listed as a Pi extension. Consistent with the current state.

---

## Summary of Gaps

| File | Gap | Severity |
|------|-----|----------|
| `README.md` | Version badge/header says 2.3.0, should be 2.4.1 | High |
| `README.md` | CLI table missing `xtrm init`, `project init`; `install project` not marked deprecated | Medium |
| `README.md` | Version History table missing 2.4.0 and 2.4.1 rows | Medium |
| `XTRM-GUIDE.md` | Version header says 2.3.0, should be 2.4.1 | High |
| `XTRM-GUIDE.md` | plugin.json snippet shows 2.3.0 | Low |
| `CHANGELOG.md` | No `[2.4.0]` or `[2.4.1]` sections; release exists in git only | High |
| `CHANGELOG.md` | All 7 branch commits undocumented | High |
| `ROADMAP.md` | No completed entry for v2.4.x work | Low |

---

## Recommended Next Steps (not done — no commits made)

1. **Promote `[Unreleased]` to `[2.4.0]`** in CHANGELOG.md, add a `[2.4.1]` section for the branch's changes, then add a new empty `[Unreleased]` section at the top.
2. **Update README.md**: change version badge to 2.4.1, update CLI commands table to add `xtrm init` and mark `install project` as deprecated, add 2.4.0/2.4.1 rows to Version History.
3. **Update XTRM-GUIDE.md**: change version header and plugin.json snippet to 2.4.1.
4. **Update ROADMAP.md**: add a `Completed in v2.4.x (2026-03-18)` block listing the global-first architecture work.

No files were modified. No commits were made.
