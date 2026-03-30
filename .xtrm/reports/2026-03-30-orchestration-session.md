---
session_date: 2026-03-30/31
branch: master (direct commits)
commits: 17
issues_closed: 31
issues_filed: 12
specialist_dispatches: 35+
models_used: [gpt-5.3-codex, gpt-5.4, claude-sonnet-4-6, claude-haiku-4-5, glm-5]
skill_versions: using-specialists v3.3 → v3.6
---

# Session Report — 2026-03-30/31

## Summary

Full-session specialist orchestration across 7 waves. Cleared post-refactoring backlog from the z0mq/ylst/08la epic session. Fixed critical infrastructure bugs (sub-bead creation, stale MCP server, lost background jobs). Shipped output contract, retry logic, steering for all jobs, READ_ONLY auto-append, docs overhaul (zero drift), and restored --background with proper detach. Evolved the using-specialists skill from v3.3 to v3.6 with real orchestration examples. Overthinker produced two major designs: centralized manifest (gzrx) and interactive specialist mode (pjn2).

## Issues Closed (31)

### From session report backlog

| ID | Title | Specialist | Wave |
|----|-------|-----------|------|
| unitAI-dyll | Remove --background flag | executor | 1 |
| unitAI-jbhg | Migrate start_specialist to Supervisor | executor | 1 |
| unitAI-xtn | Retry logic in SpecialistRunner | executor | 2 |
| unitAI-j8gj | Footer doubles backend prefix | executor | 2 |
| unitAI-icb9.4 | MCP tool reference | explorer | 3 |
| unitAI-93rt | Output contract (response_format + output_schema) | executor | 4 |
| unitAI-ts02 | READ_ONLY output auto-append to bead | executor | 4 |
| unitAI-tv3 | specialists status --job | executor | 4 |
| unitAI-9o9z | Planner reuses parent epic | executor | 4 |
| unitAI-icb9.5 | CHANGELOG | sync-docs | 4 |
| unitAI-icb9.1 | CLI command reference | executor | 5 |
| unitAI-icb9.2 | Architecture guide | executor | 5 |
| unitAI-icb9.3 | Feature guides | executor | 5 |
| unitAI-icb9.6 | pi/rpc protocol boundary | executor | 5 |
| unitAI-icb9 | Docs epic (auto-closed, all children done) | — | 5 |

### Bugs discovered and fixed this session

| ID | Title | Root cause | Fix |
|----|-------|-----------|-----|
| unitAI-j6nc | Executor creates sub-beads | CLAUDE.md edit-gate loaded by pi in project cwd | Bead-aware system prompt override in runner.ts |
| unitAI-442b | Steer only worked for keep-alive | FIFO gated on keepAlive flag | Always create FIFO for all jobs |
| unitAI-5752 | Background jobs lose status files | Shell & is fragile (SIGHUP) | Restored --background with spawn({detached}) |
| unitAI-rnea | sync-docs defaults to audit mode | Not a bug — interactive specialist needs keep-alive | Reframed; filed unitAI-pjn2 for interactive mode |

### Cleanup / closures

| ID | Reason |
|----|--------|
| unitAI-liiv | Moot — --background removed then restored |
| unitAI-0dga | Orphaned executor sub-bead |
| unitAI-5cz1 | run_parallel deprecated |
| unitAI-zur | Empty placeholder |
| unitAI-9zeq | Empty placeholder |
| unitAI-3nwl | Overlaps 93rt (output contract) |
| unitAI-lw4y | Already fixed in xtrm-tools |

### Features and docs

| ID | Title | Specialist | Wave |
|----|-------|-----------|------|
| unitAI-e8kt | Skill improvements tracker | manual | — |
| unitAI-4oza | CHANGELOG + CLAUDE.md update | manual | — |
| unitAI-emae | Update 9 stale docs | executor | — |
| unitAI-hs5c | Skill v3.6 + CHANGELOG for --background | manual | — |
| unitAI-83m4 | Skill v3.5 real examples | manual | — |
| unitAI-2hk5 | Remove legacy done/agent_end | executor | 6 |
| unitAI-9xa | specialists clean command | executor | 6 |
| unitAI-ndd0 | specialists config get/set | executor | 6 |
| unitAI-sdnt | --no-bead-notes flag | executor | 7 |
| unitAI-1eml | Reviewer specialist | executor | 7 |
| unitAI-hzm6 | workflow.yaml design doc | explorer | 7 |

## Issues Filed (12)

| ID | P | Type | Title | Why |
|----|---|------|-------|-----|
| unitAI-j6nc | P2 | bug | Sub-bead creation | Discovered during Wave 1 — executors creating child beads instead of claiming input |
| unitAI-e8kt | P3 | task | Skill improvements tracker | Session-long notepad for workflow findings |
| unitAI-442b | P2 | feature | Steer for all jobs | FIFO was artificially gated on --keep-alive |
| unitAI-ts02 | P2 | feature | READ_ONLY auto-append | Explorer/overthinker output lost without manual piping |
| unitAI-ndd0 | P3 | feature | specialists config batch | Needed to update stall_timeout across 11 files |
| unitAI-gzrx | P2 | decision | Centralized manifest | User idea for permission policies + global defaults |
| unitAI-5752 | P1 | bug | Background jobs lost | Shell & processes killed on parent exit |
| unitAI-rnea | P2 | bug | sync-docs audit mode | Reframed as not-a-bug (interactive specialist pattern) |
| unitAI-0g8g | P2 | feature | tmux for --background | User idea — tmux as process container, overstory pattern |
| unitAI-w0u0 | P3 | chore | Flatten .specialists dirs | Triple nesting (.specialists/default/specialists/) is unnecessary |
| unitAI-3ep3 | P2 | feature | Session close report | Structured handoff for next agent, under .xtrm/ |
| unitAI-pjn2 | P2 | feature | Interactive specialist mode | execution.interactive: true for review/analysis specialists |

## Specialist Dispatches

### Wave summary

| Wave | Specialists | Models | Outcomes |
|------|------------|--------|----------|
| 1 | 2x executor | gpt-5.3-codex | Both delivered. Sub-bead creation bug discovered. |
| 2 | overthinker + 2x executor | gpt-5.4, gpt-5.3-codex | All delivered. Overthinker produced output contract design. |
| 3 | 4x sync-docs + 3x explorer | claude-sonnet-4-6, claude-haiku-4-5 | 5/6 produced audit reports not files. 1 stalled (retried with explorer). sync-docs audit-mode gap discovered. |
| 4 | 5x executor + 2x explorer | gpt-5.3-codex, claude-haiku-4-5 | 7/8 delivered. 1 explorer stalled (30s timeout, fixed by increasing to 120s). |
| 5 | 4x executor | gpt-5.3-codex | All delivered. 3 doc files written, 1 CLI ref rewritten. |
| 6 | 4x executor + overthinker (keep-alive) | gpt-5.3-codex, gpt-5.4 | 4 executors delivered. Overthinker lost to shell & fragility (no tmux). 3/5 foreground job dirs lost. |
| 7 | 2x executor + explorer | gpt-5.3-codex, claude-haiku-4-5 | All delivered. Reviewer specialist created, --no-bead-notes wired. |
| Ad-hoc | 3x explorer (use_specialist MCP) + 2x overthinker | claude-haiku-4-5, gpt-5.4 | Investigation: session.ts spawn, pi RPC flags, steer impl. Design: manifest + interactive mode. |

### Problems encountered

| Problem | Root cause | Resolution |
|---------|-----------|------------|
| Executors creating sub-beads | CLAUDE.md edit-gate loaded by pi | Bead-aware system prompt override (j6nc) |
| sync-docs produces audits not files | Designed for interactive keep-alive use, not one-shot | Reframed as interactive specialist pattern (pjn2) |
| sync-docs stalls on reference docs | 60s stall timeout too low for dense tasks | Increased all stall_timeout_ms to 120s |
| Explorer stalled twice | 30s stall timeout | Increased to 120s |
| 3 foreground jobs lost dirs | Shell & gets SIGHUP on parent exit | Restored --background with detached spawn (5752) |
| MCP start_specialist no job dir | MCP server had stale code (pre-Wave 1) | Not a code bug — server needs restart after changes |
| .specialists/default/specialists/ deleted | Executor running cleanup in shared worktree | Restored; filed w0u0 for flatten |

## Code Changes

### New files
- `src/cli/clean.ts` — specialists clean command
- `src/cli/config.ts` — specialists config get/set
- `config/specialists/reviewer.specialist.yaml` — reviewer specialist
- `docs/ARCHITECTURE.md`, `docs/features.md`, `docs/pi-rpc-boundary.md`, `docs/mcp-tools.md`
- `docs/plans/workflow-yaml-design.md`
- `tests/unit/cli/clean.test.ts`, `tests/unit/cli/config.test.ts`
- `tests/unit/tools/specialist/stop_specialist.tool.test.ts`

### Modified (key files)
- `src/cli/run.ts` — --background restore, --no-bead-notes, bead notes pattern
- `src/specialist/runner.ts` — retry logic, output contract injection, bead-aware prompt, beadsWriteNotes
- `src/specialist/supervisor.ts` — FIFO for all jobs, READ_ONLY auto-append, steer decoupling
- `src/specialist/schema.ts` — max_retries, response_format wiring, beads_write_notes
- `src/specialist/beads.ts` — parent epic context
- `src/tools/specialist/start_specialist.tool.ts` — Supervisor-backed, beadsClient
- `src/tools/specialist/stop_specialist.tool.ts` — Supervisor/PID lifecycle
- `CHANGELOG.md` — full [Unreleased] section
- `CLAUDE.md` — updated specialist section
- `.claude/skills/using-specialists/SKILL.md` — v3.3 → v3.6

### Documentation
- 13 docs brought to zero drift via drift_detector.py
- CHANGELOG [Unreleased]: 11 Added, 7 Changed
- Skill evolved through 4 versions with real session examples

## Open Issues with Context

### Ready for next session

| ID | P | Title | Context / Suggestions |
|----|---|-------|----------------------|
| unitAI-0g8g | P2 | tmux for --background | Fully spec'd: files to touch, session naming, design constraints, overstory reference. Implement tmux spawn with fallback to detached, add specialists attach, list --live. User's stated next task. |
| unitAI-pjn2 | P2 | Interactive specialist mode | Overthinker design complete. Add execution.interactive: true to schema, wire as default keepAlive in runner, update sync-docs/overthinker/reviewer YAMLs. Add --no-keep-alive override. Key insight: sync-docs asking for confirmation is correct — it's designed for audit → approve → execute with resume. |
| unitAI-gzrx | P2 | Centralized manifest | Overthinker design complete with full JSON schema and 5-level precedence. Implement .specialists/config.json loader in manifest.ts, merge logic in runner.ts, specialists config show --resolved. Per-YAML wins as highest precedence. |
| unitAI-3ep3 | P2 | Session close report | This report is the prototype. Needs a skill under .xtrm/, xt report show CLI, fixed output at .xtrm/reports/. Specialist-agnostic (xtrm ecosystem). |

### Backlog

| ID | P | Title | Context |
|----|---|-------|---------|
| unitAI-w0u0 | P3 | Flatten .specialists dirs | .specialists/default/specialists/ → .specialists/default/. Update loader.ts scan paths. Migration with backward compat. |
| unitAI-mesk | P2 | Structured handoff package | Depends on manifest maturity (gzrx). Distilled context for downstream agents. |
| unitAI-iugz | P2 | RPC observability metrics | Explore richer token/latency/finish-reason data from pi sessions. |
| unitAI-08zd | P3 | RPC observability epic | Parent of iugz. |
| unitAI-rxvq | P1 | Release to npm | Pre-existing claim, not this session's work. Blocked on stabilization. |

## Memories Saved

| Key | Content |
|-----|---------|
| specialists-wave-orchestration | sync-docs stalls on dense refs, explorer is better fallback |
| specialists-readonly-output-gap | READ_ONLY output auto-append gap (now fixed) |
| specialist-sub-bead-root-cause | CLAUDE.md edit-gate causes sub-beads, not hooks (now fixed) |
| docs-drift-detection-workflow | Run drift_detector.py scan after doc-heavy sessions |
| background-flag-restored | --background restored with detached spawn, shell & is fragile |

## Suggested Next Session Priority

1. **unitAI-0g8g** — tmux for --background (user's stated next task)
2. **unitAI-pjn2** — interactive specialist mode (high value, design done)
3. **unitAI-gzrx** — manifest implementation (design done, unifies config surface)
4. **unitAI-3ep3** — session close report skill (this report is the prototype)
