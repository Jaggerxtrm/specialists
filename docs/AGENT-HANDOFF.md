# Specialists — Agent Handoff Document

> One-MCP-Server, Many Specialists. Self-contained context for continuing work.

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

| Hook | Event | Purpose |
|------|-------|---------|
| \`main-guard.mjs\` | PreToolUse | Block edits on master/main |
| \`beads-edit-gate.mjs\` | PreToolUse | Require in_progress bead |
| \`beads-commit-gate.mjs\` | PreToolUse | Block commit with open issues |
| \`beads-stop-gate.mjs\` | Stop | Block session end with issues |
| \`specialists-complete.mjs\` | UserPromptSubmit | Inject completion banners |
| \`specialists-session-start.mjs\` | SessionStart | Prime context at session start |
| \`beads-close-memory-prompt.mjs\` | PostToolUse | Nudge knowledge capture |

---

## Open Issues (26 total)

### Priority Summary

| Priority | Count | Category |
|----------|-------|----------|
| P1 🔴 | 14 | 1 bug, 13 features |
| P2 🟡 | 8 | 2 bugs, 6 features |
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

1. **Verify \`unitAI-fgy\`** — grep \`supervisor.ts\` for \`onBeadCreated\`. If callback writes \`bead_id\` during run, close as done.
2. **Fix \`unitAI-0ef\`** (SIGTERM) — critical for reliability
3. **Implement \`unitAI-iuj\`** — unblocks 4 downstream features
4. **Complete init chain** — enables retiring \`install\` command

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
bun test         # bun --bun vitest run --no-coverage
\`\`\`

---

## Related Docs

- \`README.md\` — Full usage guide
- \`ROADMAP.md\` — Detailed feature specs with file references
- \`docs/hooks.md\` — Hook reference
- \`docs/spec-v3.md\` — v3 architecture spec

---

*Generated: 2026-03-19*
