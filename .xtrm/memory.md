# Project Memory — specialists (@jaggerxtrm/specialists v3.6.0)
_Updated: 2026-04-11 | 165 memories synthesized, 0 pruned | last session: 2026-04-11_

## Do Not Repeat
- ❌ Running `specialists init` inside pi sessions → ✅ `specialists init` is USER-ONLY bootstrap; agents must ask user to run it, never call directly
- ❌ Parallel executors on same file (ps.ts, init.ts) → ✅ Sequential --job chain or consolidate into one bead; parallel = merge conflict cascade
- ❌ Executor running vitest/bun test → ✅ Executor runs lint+tsc only; tests hang on supervisor.test.ts FIFO cleanup (EBADF), use reviewer/test-runner in chained pipeline
- ❌ Editing .xtrm/skills/default/ or .xtrm/skills/active/ → ✅ Edit config/skills/<name>/SKILL.md only; .xtrm paths are overwritten on init
- ❌ `bd update --status=in_progress` without `--claim` → ✅ Edit gate requires explicit `bd update <id> --claim`; status alone does NOT satisfy gate
- ❌ Worktree specialists escaping via absolute paths → ✅ Orchestrator must validate diff location before commit; worktree isolation is cwd-level only, not tool-boundary (unitAI-a2u7 landed)
- ❌ Executor worktree jobs not committing → ✅ Orchestrator must `git status` + `git commit` in worktree before merging; executors close bead but leave changes unstaged
- ❌ Assuming `--job` auto-resolves bead → ✅ `specialists run <name> --job <id>` still requires `--bead` or `--prompt`; auto-bead-resolution not implemented
- ❌ Reading .beads/issues.jsonl directly → ✅ Use `bd show`/`bd show --json`; beads migrated to Dolt DB, flat file access is stale
- ❌ `context_pct += input_tokens` cumulative sum → ✅ `input_tokens` is already cumulative per turn; use `=` not `+=` (unitAI-g4bn fixed 800%+ context bug)
- ❌ Node coordinator on Anthropic models → ✅ Use gpt-5.4/codex; Anthropic produces 0-token empty responses in node-member keep-alive sessions (migrated off sonnet-4-6 in 0666b8d1)
- ❌ `sp merge` on chains in unresolved epics → ✅ Use `sp epic merge <epic>` for wave-bound chains; `sp merge <chain>` refuses if chain ∈ unresolved epic (unitAI-nl8n)
- ❌ Reviewer validating executor claims without diffing branch vs master → ✅ Always verify branch has actual diff before dispatching reviewer; reviewer checks claims against pre-existing code, not branch delta (unitAI-wisz)
- ❌ Dispatching reviewer on ghost executor (convincing result.txt, zero edits) → ✅ Verify diff exists before sending to reviewer; codex sometimes returns empty output with convincing result.txt
- ❌ sp stop leaving jobs in 'waiting' after SIGTERM → ✅ sp stop now writes terminal status (done/cancelled) to status.json BEFORE SIGTERM (unitAI-y4ia)
- ❌ sp merge blocking doc-only merges → ✅ Merge-preview worthiness guard inspects actual staged delta, not hardcoded src/ prefix (unitAI-wisz)
- ❌ Feed --follow exiting early on completed jobs → ✅ Status-aware completion detection for keep-alive multi-emission (unitAI-5us0)
- ❌ SQLite "Cannot use a closed database" teardown races → ✅ Pending-ops tracker + async dispose() in Supervisor (unitAI-v21i)
- ❌ Executor dying during vitest runs → ✅ Test-aware stall detection extends window to 300s for test commands (unitAI-2vz2)
- ❌ Coordinator emitting JSON instead of CLI commands → ✅ Coordinator is LOW-permission CLI-native; uses bash to call `sp node` commands (unitAI-t4ss)
- ❌ Coordinator completing without reading member output → ✅ Coordinator MUST read member results via `sp node result --member <key> --full` before synthesis (unitAI-8zui)
- ❌ Epic chain membership not syncing on job completion → ✅ syncEpicOnJobComplete() called in both success+error completion paths (unitAI-vozx)
- ❌ Zombie waiting jobs persisting after process death → ✅ crashRecovery() checks run_complete evidence + 6h waiting_timeout_ms (unitAI-ug51)
- ❌ sp ps --follow rendering duplicate rows + visual noise → ✅ dedupeStatusesById() + renderedJobIds Set + status colors + epic banner (unitAI-fh7o)
- ❌ gpt-5.3-codex returning 0 tokens on turn 1 → ✅ Kill and redispatch; parallel dispatch may increase failure rate

## How This Project Works
- **MCP is minimal (use_specialist only)** → All orchestration via CLI (`sp run/feed/result/steer/resume/stop/list/ps/merge/node`); do not re-add MCP tools without strong justification
- **specialists init is sole bootstrap** → setup/install are deprecated shims; init copies config/specialists/ + config/nodes/ to .specialists/default/, wires .claude/hooks/, installs skills to .claude/skills/ + .pi/skills/, writes .mcp.json
- **Canonical specialists in config/specialists/** → NOT specialists/ at root; loader scans .specialists/user/ first (wins on collision), then .specialists/default/, then legacy paths
- **Bead-first orchestration** → Every specialist run gets child bead via `--bead <id>`; `--context-depth 2` passes upstream output; reviewer uses `--job` to auto-resolve bead context from executor
- **Worktree per edit-capable specialist** → HIGH permission specialists MUST run with `--worktree`; subsequent agents (reviewer, test-runner) must cd into same worktree; orchestrator merges in dependency order
- **Node coordination (unitAI-3f7b + unitAI-t4ss + unitAI-8zui)** → Coordinator is LOW-permission CLI-native orchestrator (bash-only); NodeSupervisor is effect executor; SSoT is src/specialist/node-contract.ts; flattened node operations route through top-level CLI (`sp ps --node`, `sp feed --node`, `sp steer <coordinator-job-id>`, `sp attach <coordinator-job-id>`, `sp result <node-ref>:<member-key>`); coordinator MUST read member results before synthesis
- **Wave/chain/job/epic taxonomy LOCKED (unitAI-lzys)** → Job (atomic) | Chain (worktree lineage) | Wave (ephemeral stage speech) | Epic (merge-gated container); `sp epic merge <epic>` is canonical publication path; `sp merge <chain>` refuses if chain ∈ unresolved epic
- **Feed v2 timeline events canonical** → `run_complete` is single completion event per turn (keep-alive) or session end; legacy `done` + `agent_end` double-completion is dead; events persist to .specialists/jobs/<id>/events.jsonl
- **Bun bundle path resolution** → dist/index.js bundle: dirname(import.meta.url) resolves to dist/; paths to package root need ONE `..` (../package.json, ../config/specialists/); two `../..` exits package scope
- **Build before tests** → `bun run build` before help tests; tests run against dist/index.js; `test:node` script for subprocess-safe vitest runs (avoids bun vitest SQLite teardown races)
- **Skill paths are project-local** → skills.paths in specialist YAMLs must use .agents/skills/<name>/ (project-relative), NOT ~/.agents/skills/ (does not exist)
- **Response format JSON fence stripping** → Specialists with response_format:json still wrap in ```json fences; requires BOTH prompt anti-fence instruction AND runner.ts post-process strip
- **Keep-alive lifecycle (unitAI-wagb)** → Per-turn run_complete emission; READ_ONLY specialists auto-close on terminal verdict; reviewed_job_id plumbed via --job; no self-termination for READ_ONLY after verdict
- **Job status lifecycle** → running → waiting (keep-alive idle) → done/cancelled/error; `cancelled` status for operator-stopped jobs; sp stop writes terminal status BEFORE SIGTERM (unitAI-y4ia)
- **Crash recovery (unitAI-ug51)** → dead PID + run_complete evidence → done; dead + no evidence + non-node → error; 6h waiting_timeout_ms; node members preserved for NodeSupervisor recovery
- **PID liveness in sp ps/list/status** → Renderer checks process.kill(pid, 0) + tmux session liveness (2000ms timeout); stale status.json from killed processes filtered
- **Token usage parsing** → pi RPC emits input/output/cacheRead/cacheWrite with nested cost.total; findTokenUsage() must parse pi format, not OpenAI-style prompt_tokens/completion_tokens
- **sp ps is canonical process dashboard** → Tree-grouped view with urgency sorting (waiting > running > starting), PID liveness filter, chain grouping via reused_from_job_id/worktree_owner_job_id, JSON output, follow mode with dedupe; replaces sp list --live
- **Node member registry pattern** → NodeSupervisor owns member_id→job_id translation; coordinator uses logical member_id (e.g. 'explorer-1'), never raw job IDs; registry update emitted on spawn and output attribution
- **Worktree write-boundary enforced (unitAI-a2u7)** → Generated pi extension validates edit/write paths against worktree_path; absolute paths outside worktree rejected at tool boundary
- **sp merge narrow (unitAI-nl8n + unitAI-wisz)** → Topological chain/epic merge with tsc gate + stop-on-conflict + --rebuild; merge-preview worthiness guard (not hardcoded src/); noise classification (.xtrm/reports/, .wolf/, .specialists/jobs/)
- **Epic chain auto-sync (unitAI-vozx)** → syncEpicOnJobComplete() calls upsertEpicChainMembership + loadEpicReadinessSummary + syncEpicStateFromReadiness on both success+error completion paths
- **SQLite worktree concurrency** → All worktrees share ONE DB via git rev-parse --git-common-dir; WAL + busy_timeout=5000; async dispose() with pending-ops tracker (unitAI-v21i)
- **Test-aware stall detection (unitAI-2vz2)** → Regex-based test command detection extends stall window to 300s; prevents executor death during vitest/tinypool startup
- **--job concurrency guard (unitAI-k7lg)** → BLOCKED_JOB_REUSE_STATUSES = ['starting', 'running']; --force-job override; 20 test scenarios; prevents concurrent worktree corruption
- **sp node CLI surface** → spawn-member, create-bead, complete, wait-phase, status, result; all return { ok: true/false, ... } JSON; --strategy validation (pr|manual); env var injection (SPECIALISTS_NODE_ID, SPECIALISTS_JOB_ID)
- **Reviewer dispatch pattern** → Verify branch has actual diff before dispatching; reviewer validates claims against codebase, not branch delta; ghost executors (convincing result.txt, zero edits) occur with codex

## Active Context
- **Coordinator fully operational (2026-04-11)** — unitAI-8zui complete: coordinator reads member output via `sp node result --member <key> --full --json`, steers via `sp steer <job_id>`, synthesizes before completing. Node CLI flattened: `sp node status/wait-phase/complete` (not `sp node action/*`). Coordinator has NO self-complete command — operator owns node closure via `sp stop` or `sp node stop`. Env var discipline: `SPECIALISTS_NODE_ID` injected by runner, used in all renderers. Empty members array = coordinator MUST spawn dynamically (no static pre-seeding). Vacuous-truth discipline: empty members + no spawn = immediate completion (no-op node).
- **Node lifecycle hardening (2026-04-11)** — `sp node stop` SIGTERMs all non-terminal members before killing coordinator. `wait-phase` suppresses watchdog (no false stalls during member waiting). Completion strategy `manual` respected — no auto-close on members terminal. Feed output tags node member events with `[⬢node-id]`. Colon syntax for node results: `sp node result <node-id>:<member-key>`.
- **Bug-fix sprint complete (2026-04-10/11)** — 5 critical bugs fixed: (1) epic chain auto-sync on job completion (unitAI-vozx) — `syncEpicOnJobComplete()` in both success+error paths, (2) zombie waiting job reconciliation (unitAI-ug51) — `crashRecovery()` checks run_complete evidence + 6h `waiting_timeout_ms`, (3) sp ps --follow rendering overhaul (unitAI-fh7o) — dedupe via `dedupeStatusesById()` + `renderedJobIds` Set + status colors + epic banner, (4) sp stop terminal status before SIGTERM (unitAI-y4ia) — introduces `cancelled` status, writes status.json before SIGTERM, (5) sp merge worthiness guard (unitAI-wisz) — `previewBranchMergeDelta()` + `evaluateMergeWorthiness()` with noise classification (`.xtrm/reports/`, `.wolf/`, `.specialists/jobs/`).
- **Infrastructure hardening (2026-04-10)** — SQLite async dispose() eliminates teardown races (unitAI-v21i, bun vitest 2.3× faster 244s→109s); test-aware stall detection extends window to 300s for test commands (unitAI-2vz2); --job concurrency guard `BLOCKED_JOB_REUSE_STATUSES=['starting','running']` prevents worktree corruption (unitAI-k7lg); feed --follow status-aware completion (unitAI-5us0); tmux-aware liveness checks in sp ps/list/status (unitAI-boeu).
- **Worktree boundary enforced (unitAI-a2u7)** — Generated pi extension validates edit/write paths against `worktree_path`; absolute paths outside worktree rejected at tool boundary. Validated in production (sync-docs stayed inside worktree after fix). Use `bd worktree create` NOT `git worktree add` — beads integration required.
- **Wave/chain/epic formal model LOCKED (unitAI-lzys, 2026-04-10)** — Multi-axis taxonomy: epic (merge container) > chain (worktree lineage) > job (atomic); wave = ephemeral stage speech (NOT persisted, NOT code identity). `sp epic merge <epic>` is canonical publication path; `sp merge <chain>` refuses if chain ∈ unresolved epic. Epic lifecycle: open → resolving → merge_ready → merged/failed/abandoned. Phase 2 implementation epic pending.
- **CLI-native coordinator complete (unitAI-t4ss)** — Coordinator converted from READ_ONLY JSON emitter to LOW-permission CLI-native agent (bash-only orchestrator); 5 sp node subcommands added; 875 lines removed from NodeSupervisor; E2E validated with gpt-5.4. SSoT: `src/specialist/node-contract.ts` — all renderers generate from one file.
- **Models migrated off Anthropic** — All specialists use gpt-5.4/gpt-5.3-codex/qwen/glm-5; Anthropic produces 0-token empty responses in keep-alive sessions (migrated off sonnet-4-6 in 0666b8d1).
- **Open P1s** — unitAI-aq1k (eliminate --no-worktree flag), unitAI-96qy (E2E node coordination runtime test), unitAI-lzys Phase 2 (epic lifecycle implementation — design locked, needs planner decomposition).
- **Known test failures** — supervisor.test.ts FIFO readline hang in Bun vitest (skip with -t filter or use test:node); ~50 pre-existing failures (charCount assertion mismatches, timeout flakiness, use_specialist.tool.test drift); explorer-first triage recommended.
- **Codex empty-output pattern** — gpt-5.3-codex intermittently returns 0 tokens on turn 1; kill and redispatch; parallel dispatch may increase failure rate. Ghost executors (convincing result.txt, zero edits) occur — verify diff before dispatching reviewer.
- **Reviewer blind spot** — Reviewer validates executor claims against codebase, NOT branch delta; always `git diff master -- <files>` before dispatching reviewer.
- **Worktree branch divergence** — Sequential wave worktrees need `git rebase master` before merge — earlier wave's changes appear as reversions if worktree branched before merge.
- **Last session (2026-04-11)** — Coordinator no-complete fix (operator owns closure), empty members + vacuous-truth discipline, coordinator harden no-implementation mandate (bash-only, pure orchestrator), node CLI flattening, feed member tagging.
