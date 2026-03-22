# Specialists ↔ xtrm-tools Parity Analysis

**Date**: 2026-03-22 (updated 2026-03-22 post deep analysis)

---

## Architecture Decisions

Three binding decisions from cross-repo analysis:

### 1. Repo structure → SEPARATE, xtrm required for hooks
- Keep as separate npm packages: `xtrm-tools` and `@jaggerxtrm/specialists`
- **xtrm-tools is required** for the hook system (beads gates, claim-sync, compact, memory-gate)
- specialists handles ONLY agent running — Supervisor, Runner, MCP server, job CLI
- No monorepo — independent release cycles, independent CLIs, different audiences
- `specialists/hooks/` contains ONLY: `specialists-complete.mjs` + `specialists-session-start.mjs`
- All beads hooks are xtrm's responsibility — specialists does not bundle or ship them

### 2. Orchestrator pattern → CORRECT, keep it
- Claude (orchestrator) claims issue via `bd update <id> --claim`
- Claude spawns Pi specialist subprocess to do the work
- Claude closes the issue on completion and manages the full lifecycle
- Bead tracks the WORK UNIT, not the executor — Claude is responsible end-to-end
- Specialists don't need their own claim — they're tools in Claude's plan

### 3. Pi subprocess isolation → `--no-extensions` + selective `-e` re-inclusion
**Implemented in unitAI-faf.2.** Zero changes to xtrm required.

The conflict: xtrm's beads Pi extension auto-loads in specialist Pi subprocesses and blocks
file edits if no `claimed:<sessionId>` KV entry exists. The specialist's Pi session has no
claim — Claude's session does. This causes silent edit blocking.

Resolution: spawn Pi with `--no-extensions` (disables ALL auto-discovery), then selectively
re-enable: `quality-gates` (if installed + not READ_ONLY) and `service-skills` (if installed).

---

## Executive Summary

Specialists and xtrm-tools are **complementary systems**, not competing ones:

- **xtrm-tools** = infrastructure (hooks, policies, worktrees, installation)
- **specialists** = agent runner (run AI specialists with job management)

Final classification of the 30 issues: **11 STALE / 17 KEEP / 2 MODIFY**
(was 14/13/3 in the original analysis — see changes section below)

---

## 1. Current Specialists Maturity Assessment

### Strengths

| Component | Maturity | Notes |
|-----------|----------|-------|
| **Specialist Runner** | ✅ Mature | Supervisor, job lifecycle, background execution, feed/result |
| **MCP Server** | ✅ Mature | Full tool registration, bead integration |
| **CLI Surface** | ✅ Good | 15 commands with help system |
| **Beads Integration** | ⚠️ Partial | Creates bead, but bead_id only written at completion |

### Weaknesses

| Component | Issue |
|-----------|-------|
| **Hooks** | ❌ Duplicated, outdated vs xtrm-tools |
| **Quality Gates** | ❌ Missing entirely |
| **Policy System** | ❌ None — hooks are ad-hoc |
| **Worktree Flow** | ❌ No `xt end` equivalent |
| **Session Flow** | ❌ No claim sync, compact save/restore |

### Hook Comparison

| Hook | specialists | xtrm-tools |
|------|-------------|------------|
| beads-edit-gate | ✅ basic | ✅ full (with gate-core/utils) |
| beads-commit-gate | ✅ basic | ✅ full |
| beads-stop-gate | ✅ basic | ✅ full |
| beads-memory-gate | ❌ nudge only | ✅ full gate |
| beads-claim-sync | ❌ | ✅ auto-commit on bd close |
| beads-compact-save | ❌ | ✅ |
| beads-compact-restore | ❌ | ✅ |
| quality-check (TS/JS) | ❌ | ✅ quality-check.cjs |
| quality-check (Python) | ❌ | ✅ quality-check.py |
| worktree-boundary | ❌ | ✅ |
| gitnexus-hook | ❌ | ✅ |
| xtrm-logger | ❌ | ✅ (3 loggers) |
| specialists-complete | ✅ | ❌ (specialists-specific) |
| specialists-session-start | ✅ | ❌ (specialists-specific) |

---

## 2. xtrm-tools Capability Mapping

### What xtrm-tools Has That Specialists Needs

| Capability | Status | How to Consume |
|------------|--------|----------------|
| **Policy System** | ✅ Complete | `policies/*.json` → compile to hooks |
| **Quality Gates** | ✅ Complete | quality-check.cjs + quality-check.py |
| **Beads Gates (full)** | ✅ Complete | beads-gate-core.mjs + utils + messages |
| **Claim Sync** | ✅ Complete | beads-claim-sync.mjs (auto-commit on bd close) |
| **Compact Save/Restore** | ✅ Complete | Preserves claim state across /compact |
| **Worktree Flow** | ✅ Complete | xt pi, xt claude, xt end |
| **Logger System** | ✅ Complete | xtrm-logger, session-logger, tool-logger |

### What xtrm-tools Lacks (Specialists Has)

| Capability | Status | Action |
|------------|--------|--------|
| **Specialist Runner** | ❌ Missing | Keep in specialists |
| **Job Management** | ❌ Missing | Keep in specialists |
| **MCP Server** | ❌ Missing | Keep in specialists |
| **specialists-complete hook** | ❌ Missing | Move to xtrm-tools? |

---

## 3. Issue-by-Issue Classification (Final)

Changes from original marked ⬆.

| ID | Pri | Description | Final | Action |
|----|-----|-------------|-------|--------|
| `unitAI-0ef` | P1 | SIGTERM doesn't update job status | **KEEP** | Phase 1 — fix Supervisor watcher |
| `unitAI-4az` | P1 | beads-compact-save/restore hooks | **KEEP** ⬆ | Bundle in specialists for standalone; Phase 0 faf.3 |
| `unitAI-55d` | P1 | `specialists run --bead <id>` | **KEEP** | Phase 3 |
| `unitAI-750` | P1 | Dependency-aware context injection | **KEEP** | Future — needs iuj first |
| `unitAI-7fm` | P1 | specialists init: register MCP at project scope | **KEEP** | Phase 3 |
| `unitAI-9re` | P1 | specialists feed -f global live feed | **KEEP** | CLI feature |
| `unitAI-aq0` | P1 | specialists init: detect-and-defer beads hooks | **STALE** ✓ | Covered by Phase 0 peer dep detection |
| `unitAI-bi6` | P1 | specialists init: install project-local hooks | **STALE** ✓ | Covered by Phase 0 peer dep detection |
| `unitAI-csu` | P1 | specialists init: run bd init prerequisite | **STALE** ✓ | xtrm init handles it; peer dep model delegates |
| `unitAI-fgy` | P1 | Write bead_id at job creation | **KEEP** | Phase 1 — unblocks everything below |
| `unitAI-iuj` | P1 | Pin specialist output to bead | **KEEP** | Phase 2 |
| `unitAI-lmi` | P1 | Worktree Dolt bootstrap | **STALE** ✓ | `bd worktree create` handles port redirect; `--no-extensions` eliminates Pi conflict |
| `unitAI-msh` | P1 | Comprehensive docs | **MODIFY** | Update to document peer dep model + integration |
| `unitAI-pjx` | P1 | Force memory judgment on bd close | **STALE** ✓ | `beads-memory-gate.mjs` confirmed in xtrm as full blocking Stop gate |
| `unitAI-xr1` | P1 | Hook audit | **STALE** ✓ | Phase 0 replaces all old hooks — moot |
| `unitAI-0x9` | P2 | specialists installer: defer beads hooks | **STALE** ✓ | Phase 0 peer dep detection covers this |
| `unitAI-200` | P2 | beads-claim-sync hook | **KEEP** ⬆ | Bundle in specialists for standalone; Phase 0 faf.3 |
| `unitAI-3n1` | P2 | Reduce hook verbosity | **STALE** ✓ | Phase 0 replaces with xtrm canonical (already clean) |
| `unitAI-5dj` | P2 | hooks-deployer review | **STALE** ✓ | overstory is a separate project, unrelated to specialists |
| `unitAI-5nm` | P2 | Retire specialists install / bin/install.js | **MODIFY** | Keep but rework: peer dep detection + MCP registration only |
| `unitAI-9xa` | P2 | specialists clean | **KEEP** ⬆ | `xt clean` removes orphaned hooks, not job dirs — different scope |
| `unitAI-c64` | P2 | Memory curator specialist | **KEEP** | New specialist YAML — needs iuj first |
| `unitAI-hgo` | P2 | specialists install is silent | **STALE** ✓ | Phase 0 reworks install with output |
| `unitAI-hos` | P2 | Commit/PR provenance hook | **KEEP** ⬆ | Can't move to xtrm — needs active specialist bead_id |
| `unitAI-kwb` | P2 | Active Jobs absent when queue empty | **KEEP** | UI bug in `specialists status` |
| `unitAI-mst` | P2 | Install pi-structured-return | **KEEP** | Evaluate before iuj — may simplify output pinning |
| `unitAI-o6j` | P2 | Sync hooks with xtrm-tools | **STALE** ✓ | Phase 0 replaces entirely |
| `unitAI-6op` | P3 | Dolt-backed run summaries | **KEEP** | Future — needs iuj first |
| `unitAI-tv3` | P3 | specialists status --job | **KEEP** | CLI enhancement |
| `unitAI-mk5` | P4 | ready/ markers accumulate | **KEEP** | Minor bug |

### Summary

| Classification | Count | Action |
|----------------|-------|--------|
| **STALE** | 11 | Closed — confirmed superseded |
| **KEEP** | 17 | Implement in specialists |
| **MODIFY** | 2 | Updated scope |

**Changes from original (14/13/3):** unitAI-4az, unitAI-200, unitAI-9xa moved STALE→KEEP;
unitAI-hos moved MODIFY→KEEP; yielding 11/17/2.

---

## 4. Sprint Order

### Phase 0: Cleanup (no new features) — Epic unitAI-faf
| Task | Description | Status |
|------|-------------|--------|
| faf.1 | Board triage: close 11 stale issues, update docs | ✓ done |
| faf.2 | Pi subprocess isolation: `--no-extensions` in session.ts | ✓ done |
| faf.3 | Hook cleanup: delete all 6 beads hooks from specialists/hooks/ | ✓ done |
| unitAI-4az | Bundle compact-save/restore | ❄ deferred (xtrm required, no bundling) |
| unitAI-200 | Bundle claim-sync | ❄ deferred (xtrm required, no bundling) |
| faf.4 | Bundle memory-gate + wiring | ❄ deferred (xtrm required, no bundling) |
| unitAI-5nm | Install rework: xtrm prereq check + 2 specialist hooks + MCP | open |

### Phase 1: Core bugs (parallel) — ✓ COMPLETE
- **`unitAI-fgy`** ✓ Already implemented: `onBeadCreated` at supervisor.ts:208 fires right after `createBead` (runner.ts:166), before Pi session starts
- **`unitAI-0ef`** ✓ Fixed: SIGTERM handler added to `Supervisor.run()` — captures `killFn`, routes SIGTERM → `session.kill()` → `SessionKilledError` → catch writes `status:'error'`

### Phase 2: Output pinning (unblocks 4 downstream features)
- **`unitAI-iuj`** — `bd update <bead_id> --notes '<output>'` after writing result.txt
  - Requires unitAI-fgy (bead_id must exist at creation)

### Phase 3: Workflow
- **`unitAI-7fm`** — Register MCP at project scope (part of `specialists init`)
- **`unitAI-55d`** — `specialists run --bead <id>`: bead IS the prompt

---

## 5. Coexistence Architecture Proposal

```
┌─────────────────────────────────────────────────────────────────┐
│                        xtrm-tools                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  policies/  │  │   hooks/    │  │   CLI (xt install/init) │  │
│  │  *.json     │→ │  hooks.json │  │   xt pi / xt claude     │  │
│  └─────────────┘  └─────────────┘  │   xt end / xt clean     │  │
│         │                          └─────────────────────────┘  │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ compile-policies.mjs → Claude hooks + Pi extensions         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ consumes hooks/policies
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        specialists                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Supervisor  │  │ Specialist  │  │   CLI (run/status/feed) │  │
│  │ job mgmt    │  │ Runner      │  │   result/stop/quickstart│  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                                       │
│         ▼                ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ MCP Server (specialist_init, specialist_run, etc.)          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **xtrm-tools owns infrastructure**: hooks, policies, quality gates, worktrees
2. **specialists owns agent running**: Supervisor, Runner, job management
3. **No duplicate hooks**: specialists uses xtrm-tools hooks via plugin system
4. **Single init flow**: `xtrm init` → `specialists init` (for specialists/ only)
5. **Beads as knowledge artifacts**: unitAI-fgy + unitAI-iuj enable full provenance

---

## 6. Detailed Issue Breakdown

### STALE Issues (11) — Closed

| ID | Description | Why Stale |
|----|-------------|-----------|
| unitAI-aq0 | detect-and-defer beads hooks | Covered by Phase 0 peer dep detection in install.js |
| unitAI-bi6 | install project-local hooks | Covered by Phase 0 peer dep detection |
| unitAI-csu | run bd init prerequisite | xtrm init handles it; peer dep model delegates |
| unitAI-lmi | Worktree Dolt bootstrap | `bd worktree create` handles port redirect natively; `--no-extensions` eliminates Pi conflict |
| unitAI-pjx | Force memory judgment | `beads-memory-gate.mjs` in xtrm is full blocking Stop gate; bundled in Phase 0 faf.4 |
| unitAI-xr1 | Hook audit | Phase 0 replaces all old hook files — audit is moot |
| unitAI-0x9 | defer beads hooks | Same as aq0 — covered by unitAI-5nm rework |
| unitAI-3n1 | Reduce hook verbosity | Phase 0 replaces with xtrm canonical (already clean output) |
| unitAI-5dj | hooks-deployer review | overstory is a separate project, unrelated to specialists |
| unitAI-hgo | install is silent | Phase 0 reworks install (unitAI-5nm) with explicit output |
| unitAI-o6j | Sync hooks with xtrm-tools | Phase 0 does the sync entirely |

### KEEP Issues (17) — Implement in Specialists

| ID | Pri | Description |
|----|-----|-------------|
| unitAI-0ef | P1 | SIGTERM doesn't update job status |
| unitAI-4az | P1 | beads-compact-save/restore (bundle for standalone) |
| unitAI-55d | P1 | specialists run --bead <id> |
| unitAI-750 | P1 | Dependency-aware context injection |
| unitAI-7fm | P1 | Register MCP at project scope |
| unitAI-9re | P1 | specialists feed -f global live feed |
| unitAI-fgy | P1 | Write bead_id at job creation |
| unitAI-iuj | P1 | Pin specialist output to bead |
| unitAI-200 | P2 | beads-claim-sync (bundle for standalone) |
| unitAI-9xa | P2 | specialists clean: purge old job dirs |
| unitAI-c64 | P2 | Memory curator specialist |
| unitAI-hos | P2 | Commit/PR provenance hook (needs specialist bead_id) |
| unitAI-kwb | P2 | Active Jobs absent when queue empty |
| unitAI-mst | P2 | Install pi-structured-return |
| unitAI-6op | P3 | Dolt-backed run summaries |
| unitAI-tv3 | P3 | specialists status --job <id> |
| unitAI-mk5 | P4 | ready/ markers accumulate |

### MODIFY Issues (2) — Updated Scope

| ID | Description | New Scope |
|----|-------------|-----------|
| unitAI-msh | Comprehensive docs | Document specialists + xtrm-tools peer dep model + integration |
| unitAI-5nm | Retire specialists install | Keep but rework: peer dep detection + MCP registration only |

---

## 7. Next Steps

Phase 0 (Epic unitAI-faf) is in progress. After Phase 0 completes:

1. **Phase 1 (parallel)**: unitAI-fgy (bead_id at creation) + unitAI-0ef (SIGTERM fix)
2. **Phase 2**: unitAI-iuj (pin output to bead) — requires fgy
3. **Phase 3**: unitAI-7fm (MCP scope) + unitAI-55d (run --bead)
4. **Evaluate**: unitAI-mst (pi-structured-return) before implementing iuj

---

*Updated 2026-03-22 — reflects deep cross-repo analysis and architectural decisions*
