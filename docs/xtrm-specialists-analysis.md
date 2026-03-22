# xtrm-tools ↔ specialists: Complete Architecture Analysis
*2026-03-22 — merged from 5 deep-read agents + manual code review*

---

## FINAL DECISIONS

### 1. Repo structure → SEPARATE, xtrm required for hooks
- Keep as separate npm packages: `xtrm-tools` and `@jaggerxtrm/specialists`
- **xtrm-tools is required** for the hook system (beads gates, claim-sync, compact, memory-gate)
- specialists handles ONLY agent running — Supervisor, Runner, MCP server, CLI
- No monorepo — independent release cycles, independent CLIs, different audiences
- specialists/hooks/ contains ONLY: specialists-complete.mjs + specialists-session-start.mjs
- All beads hooks are xtrm's responsibility — specialists does not bundle or ship them

### 2. Orchestrator pattern → CORRECT, keep it
- Claude (orchestrator) claims issue via `bd update <id> --claim`
- Claude spawns Pi specialist subprocess to do the work
- Claude closes the issue on completion and manages the full lifecycle
- Bead tracks the WORK UNIT, not the executor — Claude is responsible end-to-end
- Specialists don't need their own claim — they're tools in Claude's plan

### 3. Pi subprocess isolation → `--no-extensions` + selective `-e` re-inclusion
**The architectural resolution. Zero changes to xtrm required.**

Pi has `--no-extensions` / `-ne` flag (confirmed from `pi --help`) that disables auto-discovery, plus `-e <path>` to explicitly load specific extensions.

**The conflict being solved**: xtrm's beads Pi extension auto-loads in specialist Pi subprocesses and blocks file edits if no `claimed:<sessionId>` KV entry exists. The specialist's Pi session has no claim — Claude's session does. This causes silent edit blocking.

**The fix** — modify `specialists/src/pi/session.ts` spawn args:
```typescript
const args = [
  '--mode', 'rpc',
  '--no-session',
  '--no-extensions',   // ← disable ALL auto-discovered xtrm extensions
  ...providerArgs,
];

// Selectively re-enable useful extensions if installed
const piExtDir = join(homedir(), '.pi', 'agent', 'extensions');
const permLevel = (this.options.permissionLevel ?? '').toUpperCase();
if (permLevel !== 'READ_ONLY') {
  const qgPath = join(piExtDir, 'quality-gates');
  if (existsSync(qgPath)) args.push('-e', qgPath);
}
const ssPath = join(piExtDir, 'service-skills');
if (existsSync(ssPath)) args.push('-e', ssPath);

const toolsFlag = mapPermissionToTools(this.options.permissionLevel);
if (toolsFlag) args.push('--tools', toolsFlag);
```

**Extension re-inclusion policy:**
| Extension | Load in specialist Pi? | Reason |
|-----------|----------------------|--------|
| `beads` | ❌ NO | Blocks edits — no claim for subprocess sessionId |
| `session-flow` | ❌ NO | Stop gate + xt end reminder irrelevant in subprocess |
| `quality-gates` | ✅ YES (if installed, non-READ_ONLY) | Lint/typecheck on specialist edits — universally useful |
| `service-skills` | ✅ YES (if installed) | Territory routing useful |
| `plan-mode` | ❌ NO | Creates epic/issues — not for subprocess |
| `auto-update`, `compact-header`, `custom-footer`, `xtrm-loader`, `auto-session-name`, `git-checkpoint` | ❌ NO | UI/UX only |

---

## SPRINT ORDER

### Phase 0: Cleanup (no new features) — Epic unitAI-faf
**Key decision**: xtrm is REQUIRED for hooks. specialists does NOT bundle beads hooks.
specialists/hooks/ → only specialists-complete.mjs + specialists-session-start.mjs.

1. ✓ faf.2: `--no-extensions` + conditional `-e` in session.ts (commit d143a09)
2. ✓ faf.1: Closed 11 stale issues, updated PARITY-ANALYSIS.md
3. ✓ faf.3: Deleted all 6 beads hooks; specialists/hooks/ has 2 files only
4. unitAI-5nm: Install rework — prereq check (xtrm required), install 2 specialists hooks, MCP registration

### Phase 1: Core bugs — ✓ COMPLETE (commit ca51fb6)
- **`unitAI-fgy`** ✓ Already done: `onBeadCreated` at supervisor.ts:208 fires right after `createBead` (runner.ts:166), before Pi starts
- **`unitAI-0ef`** ✓ Fixed: `process.once('SIGTERM', () => killFn?.())` in `Supervisor.run()`; killFn captured from `onKillRegistered`; routes SIGTERM → `session.kill()` → `SessionKilledError` → catch writes `status:'error'`

### Phase 2: Output pinning (unblocks 4 downstream features)
- **`unitAI-iuj`** — `bd update <bead_id> --notes '<output>'` after writing result.txt
  - File: `src/specialist/supervisor.ts` lines 213-227
  - Requires unitAI-fgy (bead_id must exist at creation, not just completion)

### Phase 3: Workflow
- **`unitAI-7fm`** — Register MCP at project scope (part of `specialists init`)
- **`unitAI-55d`** — `specialists run --bead <id>`: bead IS the prompt; read via `bd show <id> --json`; input_bead_id ≠ tracking_bead_id

---

## COMPLETE ISSUE CLASSIFICATION (all 30, final)

Changes from original PARITY-ANALYSIS marked ⬆.

| ID | Pri | Description | Final | Action |
|----|-----|-------------|-------|--------|
| `unitAI-0ef` | P1 | SIGTERM doesn't update job status | **KEEP** | Fix Supervisor watcher — Phase 1 |
| `unitAI-4az` | P1 | beads-compact-save/restore hooks | **KEEP** ⬆ | Bundle in specialists for standalone; was STALE (wrong: xtrm has them but standalone needs them too) |
| `unitAI-55d` | P1 | `specialists run --bead <id>` | **KEEP** | Phase 3 |
| `unitAI-750` | P1 | Dependency-aware context injection | **KEEP** | Future — needs iuj first |
| `unitAI-7fm` | P1 | specialists init: register MCP at project scope | **KEEP** | Phase 3 |
| `unitAI-9re` | P1 | specialists feed -f global live feed | **KEEP** | CLI feature |
| `unitAI-aq0` | P1 | specialists init: detect-and-defer beads hooks | **STALE** | Addressed by Phase 0 peer dep detection |
| `unitAI-bi6` | P1 | specialists init: install project-local hooks | **STALE** | Addressed by Phase 0 peer dep detection |
| `unitAI-csu` | P1 | specialists init: run bd init prerequisite | **STALE** | xtrm init handles it; peer dep model delegates |
| `unitAI-fgy` | P1 | Write bead_id at job creation | **KEEP** | Phase 1 — unblocks everything below |
| `unitAI-iuj` | P1 | Pin specialist output to bead | **KEEP** | Phase 2 |
| `unitAI-lmi` | P1 | Worktree Dolt bootstrap | **STALE** ✓ | `bd worktree create` handles port redirect; `--no-extensions` eliminates Pi conflict |
| `unitAI-msh` | P1 | Comprehensive docs | **MODIFY** | Update to document peer dep model + integration |
| `unitAI-pjx` | P1 | Force memory judgment on bd close | **STALE** ✓ | `beads-memory-gate.mjs` confirmed in xtrm as full blocking Stop gate |
| `unitAI-xr1` | P1 | Hook audit | **STALE** | Phase 0 replaces all old hooks — moot |
| `unitAI-0x9` | P2 | specialists installer: defer beads hooks | **STALE** | Phase 0 peer dep detection covers this |
| `unitAI-200` | P2 | beads-claim-sync hook | **KEEP** ⬆ | Bundle in specialists for standalone; was STALE (wrong: standalone needs it) |
| `unitAI-3n1` | P2 | Reduce hook verbosity | **STALE** | Phase 0 replaces with xtrm canonical (already clean) |
| `unitAI-5dj` | P2 | hooks-deployer review | **STALE** | overstory is separate, not relevant to specialists |
| `unitAI-5nm` | P2 | Retire specialists install / bin/install.js | **MODIFY** | Keep but rework: peer dep detection + MCP registration only |
| `unitAI-9xa` | P2 | specialists clean | **KEEP** ⬆ | `xt clean` removes orphaned hooks, not job dirs — different scope; was STALE |
| `unitAI-c64` | P2 | Memory curator specialist | **KEEP** | New specialist YAML — needs iuj first |
| `unitAI-hgo` | P2 | specialists install is silent | **STALE** | Phase 0 reworks install with output |
| `unitAI-hos` | P2 | Commit/PR provenance hook | **KEEP** ⬆ | Can't move to xtrm — needs active specialist bead_id; was MODIFY→xtrm |
| `unitAI-kwb` | P2 | Active Jobs absent when queue empty | **KEEP** | UI bug in `specialists status` |
| `unitAI-mst` | P2 | Install pi-structured-return | **KEEP** | Evaluate before iuj — may simplify output pinning |
| `unitAI-o6j` | P2 | Sync hooks with xtrm-tools | **STALE** | Phase 0 replaces entirely |
| `unitAI-6op` | P3 | Dolt-backed run summaries | **KEEP** | Future — needs iuj first |
| `unitAI-tv3` | P3 | specialists status --job | **KEEP** | CLI enhancement |
| `unitAI-mk5` | P4 | ready/ markers accumulate | **KEEP** | Minor bug |

**Final counts: 11 STALE / 17 KEEP / 2 MODIFY** (was 14/13/3)

Changes from original: unitAI-4az, unitAI-200, unitAI-9xa moved STALE→KEEP; unitAI-hos moved MODIFY→KEEP

---

## HOOK CLEANUP DETAIL

### specialists/hooks — what to do with each file
| Hook | Action | Reason |
|------|--------|--------|
| `beads-edit-gate.mjs` (54 LOC) | **Replace** with xtrm canonical | Pre-refactor: symbol counting `/^◐/gm` vs xtrm's `parseBdCounts()`; claim-per-session model vs any-in-progress |
| `beads-commit-gate.mjs` (59 LOC) | **Replace** with xtrm canonical | Pre-refactor |
| `beads-stop-gate.mjs` (53 LOC) | **Replace** with xtrm canonical | Pre-refactor |
| `beads-close-memory-prompt.mjs` (48 LOC) | **Delete** | Nudge-only PostToolUse; replaced by `beads-memory-gate.mjs` (blocking Stop gate) |
| `beads-gate-utils.mjs` (122 LOC) | **Delete** | Pulled in transitively by xtrm canonical hooks |
| `main-guard.mjs` (91 LOC) | **Delete** | xtrm removed from active runtime |
| `specialists-complete.mjs` (61 LOC) | **KEEP** | Specialists-specific: job completion banners at UserPromptSubmit |
| `specialists-session-start.mjs` (106 LOC) | **KEEP** | Specialists-specific: active jobs + available specialists at SessionStart |

### Add from xtrm
| Hook | Purpose |
|------|---------|
| `beads-claim-sync.mjs` | Auto-commit on `bd close`; writes `closed-this-session:<sessionId>` KV for memory gate |
| `beads-compact-save.mjs` | PreCompact: saves in_progress issue IDs to `.beads/.last_active` |
| `beads-compact-restore.mjs` | SessionStart: restores in_progress issues after compaction |
| `beads-memory-gate.mjs` | Stop: full blocking gate requiring memory evaluation after closing issues |
| `beads-gate-core.mjs` | Shared decision logic (pure functions) — dependency of above |
| `beads-gate-utils.mjs` | Shared session/bd utilities — dependency of above |
| `beads-gate-messages.mjs` | Shared message templates — dependency of above |

---

## TECHNICAL REFERENCE

### xtrm KV namespace and state files
| Key / File | Set by | Read by | Value |
|------------|--------|---------|-------|
| `claimed:<sessionId>` | beads-claim-sync (on `bd update --claim`) | beads-gate-core, beads Pi ext, statusline | Issue ID |
| `closed-this-session:<sessionId>` | beads-claim-sync (on `bd close`) | beads-memory-gate | Issue ID |
| `.beads/.memory-gate-done` | agent (`touch`) | beads-memory-gate | Presence = acknowledged |
| `.beads/.last_active` | beads-compact-save | beads-compact-restore | `{ids, savedAt}` JSON |
| `.xtrm/statusline-claim` | beads-claim-sync | statusline.mjs | Claimed issue ID (plain text) |
| `.xtrm/debug.db` | xtrm-logger | `xtrm debug` | SQLite WAL event log |

### xtrm gate decision matrix
| Gate | Blocks when | Allows when |
|------|-------------|------------|
| Edit gate | No claim AND work exists | Claim active OR no work |
| Commit gate | Claim in_progress | No active claim |
| Stop gate | Claim in_progress OR (no session AND global in_progress) | Clean state |
| Memory gate | `closed-this-session` set AND no `.memory-gate-done` marker | No closed issue this session |

### specialists/src module map (37 files)
| Module | Key responsibility |
|--------|-------------------|
| `server.ts` | MCP server setup, 8 tools (4 deprecated v2) |
| `specialist/runner.ts` (283 LOC) | 17-step lifecycle: load→render→scripts→beads→execute→close→audit |
| `specialist/supervisor.ts` (242 LOC) | File-based job state: status.json, events.jsonl, result.txt, ready/ markers |
| `specialist/loader.ts` | 3-scope YAML discovery: project / user (`~/.agents/specialists/`) / system |
| `specialist/beads.ts` | BeadsClient: createBead, closeBead, auditBead via `bd` CLI |
| `specialist/jobRegistry.ts` | In-memory registry (deprecated v2; v3 uses file-based Supervisor) |
| `pi/session.ts` | PiAgentSession: spawn pi --mode rpc, RPC over stdin/stdout NDJSON |
| `pi/backendMap.ts` | Provider alias map (gemini→google-gemini-cli, claude→anthropic, etc.) |
| `cli/run.ts` | `specialists run` — foreground + `--background` (writes Supervisor job) |
| `cli/status.ts` | Health check + active background jobs from `.specialists/jobs/` |
| `cli/stop.ts` | SIGTERM to pi PID (broken — unitAI-0ef) |
| `cli/feed.ts` | Tail `events.jsonl` with optional `--follow` |

### Pi --no-extensions flag (confirmed)
```
pi --no-extensions, -ne    Disable extension discovery (explicit -e paths still work)
pi --extension, -e <path>  Load specific extension (repeatable)
```

### xtrm worktree + Dolt flow
```
bd worktree create <path> --branch <branch>
  → git worktree add
  → writes .beads/dolt-server.port = <main_port> in worktree BEFORE any agent launch
  → bd commands in worktree connect to main's Dolt server (same DB, no isolation)
```
This is why `unitAI-lmi` is STALE — bd handles port redirect natively.

### xtrm install flow (simplified)
```
xtrm install
  → preflight diff (missing/outdated/drifted per target)
  → MCP sync (claude mcp add / pi install npm:...)
  → execute sync: skills copy, hooks via plugin, config deep-merge
  → claude plugin marketplace add <pkg> → claude plugin install xtrm-tools@xtrm-tools --scope user
  → xtrm pi install → sync config/pi/extensions/* → ~/.pi/agent/extensions/
```

---

## MATURITY SNAPSHOT
| Project | Verdict | Key gaps |
|---------|---------|---------|
| specialists v3.2.0 | ⚠️ **Beta** | 3 P1 bugs (0ef, fgy, iuj), 0% test coverage on core |
| xtrm-tools v0.5.26 | ✅ **Stable** | 0% test coverage on 4007 LOC CLI |
| xtrm velocity | 2.6× faster | 428 vs 162 commits (Feb-Mar 2026) |

---

## xtrm-tools FUTURE WORK

These items live in `/home/dawid/projects/xtrm-tools`, NOT in specialists.

### 1. `xt sp` command namespace — NOT YET IMPLEMENTED
Planned CLI surface for specialists inside xtrm:
- `xt sp run <name> --prompt "..."` — delegates to `specialists run`
- `xt sp status` — delegates to `specialists status`
- `xt sp stop <job>` — delegates to `specialists stop`
- `xt sp feed <job>` — delegates to `specialists feed`
Purpose: make specialists a first-class citizen of the `xt` CLI so users never have to remember two CLIs.
Files to create: `xtrm-tools/cli/sp.ts` or similar. Check existing CLI structure first.

### 2. specialists-aware `xtrm install`
When xtrm detects `@jaggerxtrm/specialists` is installed (global or local), it should optionally:
- Wire `specialists-complete.mjs` and `specialists-session-start.mjs` into the project's hooks
- These hook files live in the specialists package at `hooks/`
- Currently `specialists install` does this — xtrm could absorb it for integrated mode
Status: LOW priority — `specialists install` handles it today.

### 3. Document specialists as hard dependency consumer
In xtrm-tools docs/README: note that specialists requires xtrm-tools for:
- All beads hooks (edit/commit/stop gates, claim-sync, compact-save/restore, memory-gate)
- Pi extensions system (quality-gates, service-skills)
xtrm should reflect this in its own docs so users know to install it.

### 4. `pi-structured-return` Pi extension (evaluate)
`unitAI-mst` in specialists: evaluate whether `pi-structured-return` belongs in xtrm's Pi extensions.
If it's a general-purpose structured output extension for Pi, it belongs in xtrm.
If it's specialists-specific output parsing, it stays in specialists.
Evaluate BEFORE implementing `unitAI-iuj` (pin output to bead) — may simplify that work significantly.

---

## OPEN QUESTIONS
1. Should quality-gates load for READ_ONLY specialist sessions? (Probably not — nothing to lint)
2. `xt sp` namespace: planned but not implemented in xtrm. When?
3. `unitAI-mst` (pi-structured-return Pi extension): evaluate before implementing unitAI-iuj — may simplify output pinning
4. Test coverage sprint item: add to roadmap or defer?
