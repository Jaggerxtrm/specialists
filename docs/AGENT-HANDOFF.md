# Specialists — Agent Handoff Document

> One-MCP-Server, Many Specialists. Self-contained context for continuing work.

---

## Current State (2026-03-22)

### Phases Complete

**Phase 0 — Hook system alignment** (commit d143a09 + unitAI-5nm):
- `specialists/hooks/` has exactly 2 files: `specialists-complete.mjs`, `specialists-session-start.mjs`
- xtrm-tools is REQUIRED for the hook system; specialists does not bundle beads hooks
- `src/pi/session.ts`: `--no-extensions` + selective re-enable of `quality-gates`/`service-skills`
- `bin/install.js`: prereq checks (pi/bd/xt), installs 2 hooks, registers MCP in `.mcp.json`

**Phase 1 — Core bugs** (commit ca51fb6):
- `unitAI-fgy` ✓: `onBeadCreated` fires at bead creation before Pi starts
- `unitAI-0ef` ✓: SIGTERM → `killFn` → `SessionKilledError` → `status:'error'`

**Phase 2 — Output pinning** (PR #42, commit c67c0e7):
- `unitAI-iuj` ✓: specialist output pinned to bead notes with `prompt_hash`, `git_sha`, `elapsed_ms`, `model`, `backend`

**Phase 3 — Workflow** (PR #45, commit a90a58a):
- `unitAI-7fm` ✓: `specialists init` registers MCP in `.mcp.json`
- `unitAI-55d` ✓: `specialists run --bead <id>` — bead IS the prompt; `bd show <id> --json`
- `unitAI-slu` ✓: single-bead lifecycle enforced — `--bead` runs skip `createBead`; `ownsBead` gates `closeBead`

**Phase 4 — Context injection** (PR #47, commits 2e3365b + 35cb506):
- `unitAI-750` ✓: `--context-depth <n>` flag (default 1 with --bead); `getCompletedBlockers(id, depth)` walks dep tree via `bd dep list --json`, reads closed blocker notes; `buildBeadContext(bead, blockers[])` injects as `## Context from completed dependencies:` section
- Fix: `--no-beads` no longer blocks `--bead` reads — split `beadReader` (always available) from `beadsClient` (tracking only)

**Post-sprint housekeeping** (commits c40c9fb, 04d2e36):
- `$cwd` injected as built-in template variable in `runner.ts` — 6 specialists use it; was never substituted
- `planner.specialist.yaml` fixed: removed `defaults` key (not in schema) + `READ_WRITE` → `HIGH` permission; was silently dropped by loader
- `unitAI-vbl` (P2 bug): loader should warn on invalid YAML instead of silent skip — filed
- `unitAI-hdd` (P2 task): `specialist-author` skill to guide writing valid YAML — filed
- Global install: `npm install -g .` → `specialists` available system-wide (v3.2.0, 11 specialists)

### Key architecture decisions (binding)
1. **xtrm-tools is REQUIRED** for hooks — specialists handles only agent running
2. **Orchestrator pattern is correct** — Claude claims issue, spawns specialist, closes on completion
3. **Pi subprocess isolation** — `--no-extensions` prevents beads extension from blocking edits in subprocess
4. **Single-bead lifecycle** — `--bead <id>` uses the orchestrator's bead directly; runner never creates a second one

### Next priorities (open board)
Run `bd ready` to see current queue. Top candidates:
- `unitAI-9re` (P1) — `specialists feed -f`: global live feed across all running jobs
- `unitAI-4az` (P1) — compact save/restore hooks (needed for long specialist sessions)
- `unitAI-vbl` (P2) — loader warn on invalid YAML (quick fix, high value)
- `unitAI-hdd` (P2) — specialist-author skill
- `unitAI-c64` (P2) — Memory curator specialist (now unblocked by iuj)
- `unitAI-hos` (P2) — Commit/PR provenance hook

### Full issue board context
See `docs/xtrm-specialists-analysis.md` for full classification, sprint history, and architecture decisions.

---

## What This Project Is

**Specialists** is an MCP (Model Context Protocol) server that lets Claude Code discover and delegate to autonomous coding agents. Each "specialist" is a full AI agent scoped to a specific domain (bug hunting, architecture analysis, code review) — powered by [pi](https://github.com/mariozechner/pi).

**Key insight:** Designed for agents, not users. Claude autonomously routes heavy tasks to the right specialist.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│                 Claude Code                  │
│                                              │
│  MCP (control plane)   CLI (execution plane) │
│  ─────────────────────  ──────────────────── │
│  specialist_init        specialists run \    │
│  use_specialist           <name> --background│
│                          specialists result   │
└──────────────────────────────────────────────┘
              ↓ file-based job state
     .specialists/jobs/<id>/
       status.json   result.txt   events.jsonl
```

**Two execution modes:**
1. **Synchronous** (MCP \`use_specialist\`) — short tasks, returns result directly
2. **Background** (CLI \`--background\`) — long tasks, writes to disk, notification on completion

---

## Key Files

| Path | Purpose |
|------|---------|
| \`src/index.ts\` | CLI entry point, command routing |
| \`src/specialist/runner.ts\` | Specialist execution, bead creation |
| \`src/specialist/supervisor.ts\` | Background job lifecycle, status management |
| \`src/pi/session.ts\` | PiAgentSession: spawn/start/prompt/waitForDone/close |
| \`src/cli/run.ts\` | \`specialists run\` command |
| \`src/cli/status.ts\` | \`specialists status\` command |
| \`bin/install.js\` | Hook/MCP installation (being retired) |
| \`hooks/*.mjs\` | 7 Claude Code hooks |
| \`specialists/*.yaml\` | 9 built-in specialist definitions |

---

## Current State

### System Health ✅
- **pi** v0.60.0 — 7 providers active
- **beads** v0.59.0 — issue tracking integrated
- **MCP** registered and working
- **9 specialists** available (project scope)

### Available Specialists

| Name | Model | Purpose |
|------|-------|---------|
| \`init-session\` | Haiku | Git state analysis, context surfacing |
| \`codebase-explorer\` | Gemini Flash | Architecture analysis |
| \`overthinker\` | Sonnet | 4-phase deep reasoning |
| \`bug-hunt\` | Sonnet | Bug investigation |
| \`feature-design\` | Sonnet | Feature → implementation plans |
| \`parallel-review\` | Sonnet | Multi-focus code review |
| \`auto-remediation\` | Gemini Flash | Apply fixes automatically |
| \`report-generator\` | Haiku | Synthesize markdown reports |
| \`test-runner\` | Haiku | Run tests, surface failures |

### Hooks (7 installed)

| Hook | Event | Purpose | Parity status |
|------|-------|---------|---------------|
| `main-guard.mjs` | PreToolUse | Block edits on master/main | ⚠️ xtrm-tools removed from active runtime — evaluate removal (unitAI-o6j) |
| `beads-edit-gate.mjs` | PreToolUse | Require in_progress bead | ⚠️ pre-refactor; sync with xtrm canonical (unitAI-o6j) |
| `beads-commit-gate.mjs` | PreToolUse | Block commit with open issues | ⚠️ pre-refactor; sync with xtrm canonical (unitAI-o6j) |
| `beads-stop-gate.mjs` | Stop | Block session end with issues | ⚠️ pre-refactor; sync with xtrm canonical (unitAI-o6j) |
| `specialists-complete.mjs` | UserPromptSubmit | Inject completion banners | ✅ specialists-specific |
| `specialists-session-start.mjs` | SessionStart | Prime context at session start | ✅ specialists-specific |
| `beads-close-memory-prompt.mjs` | PostToolUse | Nudge knowledge capture | ❌ deprecated — xtrm replaced with `beads-memory-gate.mjs` Stop hook; see unitAI-pjx |

**Missing vs xtrm-tools canonical:**

| Hook | Event | Purpose | Issue |
|------|-------|---------|-------|
| `beads-memory-gate.mjs` | Stop | Hard-block until memory decision | unitAI-pjx |
| `beads-compact-save.mjs` | Stop | Preserve session context across compaction | unitAI-4az |
| `beads-compact-restore.mjs` | SessionStart | Restore context post-compaction | unitAI-4az |
| `beads-claim-sync.mjs` | PostToolUse | Auto-commit on bd close | unitAI-200 |

------|-------|---------|
| \`main-guard.mjs\` | PreToolUse | Block edits on master/main |
| \`beads-edit-gate.mjs\` | PreToolUse | Require in_progress bead |
| \`beads-commit-gate.mjs\` | PreToolUse | Block commit with open issues |
| \`beads-stop-gate.mjs\` | Stop | Block session end with issues |
| \`specialists-complete.mjs\` | UserPromptSubmit | Inject completion banners |
| \`specialists-session-start.mjs\` | SessionStart | Prime context at session start |
| \`beads-close-memory-prompt.mjs\` | PostToolUse | Nudge knowledge capture |

---

## xtrm-tools Parity Status (as of 2026-03-20)

Specialists hooks and session flow must stay in sync with xtrm-tools canonical. Key gaps:

| Gap | Issue | Notes |
|-----|-------|-------|
| Worktree Dolt bootstrap for spawned Pi sessions | unitAI-lmi (P1) | Background specialists jobs spawn Pi subprocesses; if in worktree context, auto-isolated Dolt breaks all bd commands. Must redirect to canonical Dolt port before subprocess starts. Same trick as xtrm worktrees: `bd dolt stop && echo <main_port> > .beads/dolt-server.port` |
| Hook sync with xtrm canonical (beads-gate-utils refactor) | unitAI-o6j (P2) | Beads hooks are pre-refactor standalone. Port beads-gate-utils.mjs shared module + updated gate logic. **Replace** `beads-close-memory-prompt.mjs` with `beads-memory-gate.mjs` — do NOT port the old file. |
| Compact save/restore hooks | unitAI-4az (P1) | Long-running sessions will be compacted; without these hooks context is lost and gates can deadlock |
| Auto-commit on close | unitAI-200 (P2) | beads-claim-sync.mjs: `<close_reason> (<id>)` commit message on `bd close` |
| pi-structured-return extension | unitAI-mst (P2) | `nextpi install npm:@robhowley/pi-structured-return` — enables typed output from Pi sessions; may unblock unitAI-iuj |

**CLI naming (open decision):** xtrm-tools uses `xtrm` (canonical) / `xt` (alias). The `xt sp` namespace for specialists is planned but not yet implemented in xtrm. Specialists CLI remains `specialists run/status/result/stop` until the wrapper exists.

---

## Open Issues (30 total)

### Priority Summary

| Priority | Count | Category |
|----------|-------|----------|
| P1 🔴 | 16 | 1 bug, 15 features (added: unitAI-lmi, unitAI-4az) |
| P2 🟡 | 10 | 2 bugs, 8 features (added: unitAI-200, unitAI-mst) |
| P3 🟢 | 3 | 1 bug, 2 features |
| P4 ⚪ | 1 | 1 bug |

---

## Critical Dependency Chain (P1)

These issues form a chain — each unblocks the next:

\`\`\`
unitAI-fgy (bead_id at creation)
    └── unitAI-iuj (pin output to bead)
            ├── unitAI-750 (context injection)
            ├── unitAI-6op (Dolt summaries)
            ├── unitAI-c64 (memory curator)
            └── unitAI-hos (provenance hook)
\`\`\`

### unitAI-fgy — Write bead_id at job creation
- **Problem:** \`bead_id\` only written after run completes
- **Fix:** Call \`updateStatus({bead_id})\` in \`onBeadCreated\` callback
- **Verify first:** May already be at \`supervisor.ts:208-209\`
- **Files:** \`src/specialist/supervisor.ts\`, \`src/specialist/runner.ts\`

### unitAI-iuj — Pin output to bead
- **Problem:** Output in \`result.txt\` only, never linked to bead
- **Fix:** \`bd update <bead_id> --notes '<output>'\` after writing result
- **Files:** \`src/specialist/supervisor.ts:213-227\`

### unitAI-55d — \`specialists run --bead <id>\`
- **Problem:** Orchestrator writes work twice (beads + prompt)
- **Fix:** Bead IS the prompt; read via \`bd show <id> --json\`
- **Key:** \`input_bead_id\` (work item) ≠ \`tracking_bead_id\` (audit record)

---

## P1 Bugs

### unitAI-0ef — SIGTERM doesn't update job status
- **Symptom:** \`specialists stop <id>\` kills pi, \`status.json\` stays \`running\` forever
- **Cause:** EPIPE crash, no parent watcher to update status
- **Fix:** Keep supervisor alive as thin watcher, trap \`close\` event
- **Files:** \`src/specialist/supervisor.ts\`, \`src/cli/run.ts\`, \`src/cli/stop.ts\`

---

## P1 Features (non-chain)

### specialists init improvements (4 issues, dependency order)

\`\`\`
unitAI-csu (bd init prerequisite)
    └── unitAI-aq0 (detect-and-defer beads hooks)
            └── unitAI-bi6 (install project-local hooks)
                    └── unitAI-7fm (register MCP at project scope)
\`\`\`

**Goal:** Make \`specialists init\` fully replace \`specialists install\`

### Other P1

| ID | Title | One-liner |
|----|-------|-----------|
| \`unitAI-9re\` | Global live feed | \`specialists feed -f\` tails ALL jobs |
| \`unitAI-msh\` | Comprehensive docs | 8 deep-dive README sections |
| \`unitAI-xr1\` | Hook audit | Verify all hooks schema-compliant |
| \`unitAI-pjx\` | Memory judgment gate | Block \`bd close\` until decision |

---

## P2 Issues (8)

| ID | Type | Title |
|----|------|-------|
| \`unitAI-hgo\` | bug | \`specialists install\` silent |
| \`unitAI-kwb\` | bug | Active Jobs hidden when empty |
| \`unitAI-9xa\` | feat | \`specialists clean\` command |
| \`unitAI-3n1\` | task | Reduce hook verbosity |
| \`unitAI-c64\` | feat | Memory curator specialist |
| \`unitAI-hos\` | feat | Commit/PR provenance hook |
| \`unitAI-5nm\` | task | Retire \`specialists install\` |
| \`unitAI-5dj\` | task | Review overstory hooks-deployer |

---

## P3-P4 Issues (3)

| ID | Priority | Title |
|----|----------|-------|
| \`unitAI-6op\` | P3 | Dolt-backed run summaries |
| \`unitAI-tv3\` | P3 | \`status --job <id>\` not implemented |
| \`unitAI-mk5\` | P4 | \`ready/\` markers accumulate |

---

## Recommended Starting Point

1. `bd ready` — see full unblocked queue
2. Claim with `bd update <id> --claim`, work in a worktree (`xt worktree create`)
3. Top P1: `unitAI-750` (context injection) or `unitAI-9re` (global feed)

---

## Quick Commands

\`\`\`bash
specialists list                          # discover specialists
specialists run <name> --prompt "..."     # foreground
specialists run <name> --prompt "..." --background  # async
specialists status                        # health + active jobs
specialists result <job-id>               # read output
specialists feed --job <id> --follow      # tail events
specialists doctor                        # troubleshoot
\`\`\`

---

## Build & Test

\`\`\`bash
bun install
bun run build    # bun build src/index.ts --target=node --outfile=dist/index.js
bun run test     # bun --bun vitest run (use `bun run test`, NOT `bun test`)
\`\`\`

---

## Related Docs

- \`README.md\` — Full usage guide
- \`ROADMAP.md\` — Detailed feature specs with file references
- \`docs/hooks.md\` — Hook reference
- \`docs/spec-v3.md\` — v3 architecture spec

---

*Generated: 2026-03-19 · Updated: 2026-03-22 (Phases 0-3 complete; PR #45 merged)*
