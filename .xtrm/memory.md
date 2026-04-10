# Project Memory — specialists (@jaggerxtrm/specialists v3.5.1)
_Updated: 2026-04-10 | 151 memories synthesized, 4 pruned | last session: 2026-04-09_

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
- ❌ Parallel executors on same file → ✅ Sequential --job chain or consolidate; 3 waves of ps.ts edits caused merge conflict cascade in 2026-04-08 session

## How This Project Works
- **MCP is minimal (use_specialist only)** → All orchestration via CLI (`sp run/feed/result/steer/resume/stop/list/ps/merge`); do not re-add MCP tools without strong justification
- **specialists init is sole bootstrap** → setup/install are deprecated shims; init copies config/specialists/ + config/nodes/ to .specialists/default/, wires .claude/hooks/, installs skills to .claude/skills/ + .pi/skills/, writes .mcp.json
- **Canonical specialists in config/specialists/** → NOT specialists/ at root; loader scans .specialists/user/ first (wins on collision), then .specialists/default/, then legacy paths
- **Bead-first orchestration** → Every specialist run gets child bead via `--bead <id>`; `--context-depth 2` passes upstream output; reviewer uses `--job` to auto-resolve bead context from executor
- **Worktree per edit-capable specialist** → HIGH permission specialists MUST run with `--worktree`; subsequent agents (reviewer, test-runner) must cd into same worktree; orchestrator merges in dependency order
- **Node coordination architecture (unitAI-3f7b)** → Coordinator READ_ONLY emitting typed actions; NodeSupervisor is effect executor; orchestrator owns FIFO merge; SSoT is src/specialist/node-contract.ts (Zod schema + phase_kind + action vocabulary + state machine)
- **Wave/chain/job taxonomy LOCKED** → Job (atomic) | Chain (worktree lineage, seeded by edit-capable specialist) | Wave (speech only, zero code meaning) | Epic (merge-gated identity); `sp epic merge <epic>` is only legal publication path for wave-bound chains; `sp merge <chain>` refuses if chain ∈ unresolved epic
- **Feed v2 timeline events canonical** → `run_complete` is single completion event; legacy `done` + `agent_end` double-completion is dead; events persist to .specialists/jobs/<id>/events.jsonl
- **Bun bundle path resolution** → dist/index.js bundle: dirname(import.meta.url) resolves to dist/; paths to package root need ONE `..` (../package.json, ../config/specialists/); two `../..` exits package scope
- **Build before tests** → `bun run build` before help tests; tests run against dist/index.js; `test:node` script for subprocess-safe vitest runs
- **Skill paths are project-local** → skills.paths in specialist YAMLs must use .agents/skills/<name>/ (project-relative), NOT ~/.agents/skills/ (does not exist)
- **Response format JSON fence stripping** → Specialists with response_format:json still wrap in ```json fences; requires BOTH prompt anti-fence instruction AND runner.ts post-process strip
- **Keep-alive status persistence** → On keep-alive agent_end, Supervisor must write waiting state immediately to status.json; avoid status reverting to running after resume turns
- **PID liveness in sp ps** → Renderer checks process.kill(pid, 0) to filter dead jobs; stale status.json from killed processes shows as active without this
- **Token usage parsing** → pi RPC emits input/output/cacheRead/cacheWrite with nested cost.total; findTokenUsage() must parse pi format, not OpenAI-style prompt_tokens/completion_tokens
- **sp ps is canonical process dashboard** → Tree-grouped view with urgency sorting (waiting > running > starting), PID liveness filter, chain grouping via reused_from_job_id/worktree_owner_job_id, JSON output, follow mode; replaces sp list --live
- **Node member registry pattern** → NodeSupervisor owns member_id→job_id translation; coordinator uses logical member_id (e.g. 'explorer-1'), never raw job IDs; registry update emitted on spawn and output attribution
- **Worktree write-boundary enforced (unitAI-a2u7)** → Pi session validates edit/write paths against worktree_path; absolute paths outside worktree rejected at tool boundary
- **sp merge narrow (unitAI-nl8n)** → Topological chain merge under bead epic; handles tsc gate + conflict detection; refuses if chain ∈ unresolved epic

## Active Context
- **Node coordination Wave 2B landed (unitAI-3f7b.4)** — Autonomy handlers for create_bead/spawn_member/complete_node implemented; Wave 2A SSoT node contract centralized (ACTION_TYPES/PHASE_KINDS exported from node-contract.ts); Wave 1 bootstrap parity complete (bead context injection, member idle-wait, context-depth propagation)
- **NodeSupervisor audit complete (unitAI-om8x)** — 18 findings across structural integrity, observability, resilience; all fixed in 4 commits (25d7f15/70f2722/50d27f2/db68f10); recovery distinguishes queued vs in-flight, stable output hashing, 120s no-progress watchdog, per-member dep chains, stderr logging, 4 new decision events
- **sp ps feature shipped (unitAI-2uro)** — Full process dashboard: tree grouping, PID liveness filter, urgency sorting, JSON output, follow mode; prerequisite lineage fields (reused_from_job_id/worktree_owner_job_id) added to SupervisorStatus; context_pct denormalized into status.json
- **Observability pipeline validated (unitAI-7icx)** — Token usage parsing fixed (pi RPC format: input/output/cacheRead/cacheWrite/cost.total); initSchema race fixed (gated DROP/RENAME); timeline events enriched (extension_error, model_change, compaction/retry payloads); token display added to sp ps + sp result
- **context_pct cumulative sum bug fixed (unitAI-g4bn)** — input_tokens is already cumulative per turn; replaced `+=` with `=` (was reporting 800%+ context usage)
- **Worktree write-boundary enforced (unitAI-a2u7)** — Pi session validates edit/write paths against worktree_path; absolute paths outside worktree rejected at tool boundary
- **sp merge narrow landed (unitAI-nl8n)** — Topological chain merge under bead epic; handles tsc gate + conflict detection; refuses if chain ∈ unresolved epic
- **Models migrated off Anthropic (0666b8d1)** — All specialist primary models moved from claude-sonnet-4-6 to gpt-5.4/codex/qwen; Anthropic produces 0-token empty responses in node-member keep-alive sessions
- **Open blockers** — unitAI-3f7b.1 (explorer mapping pass) must land before Wave 2A schema work; hold on create_bead/spawn_member/complete_node actions until Wave 1 validated
- **Known test failures** — supervisor.test.ts FIFO readline hang in Bun vitest (skip with -t filter or use test:node); pre-existing, not regression
- **Reviewer stalling (unitAI-wagb)** — Keep-alive design conflates turn completion with session closure; 3 issues: run_complete blocked behind keepAliveExitPromise, no self-termination for READ_ONLY after verdict, reviewed_job_id not plumbed via --job
