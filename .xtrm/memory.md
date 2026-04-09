# Project Memory — specialists (@jaggerxtrm/specialists v3.5.1)
_Updated: 2026-04-10 | 154 memories synthesized, 0 pruned | last session: 2026-04-09_

## Do Not Repeat
- ❌ Running `specialists init` inside pi sessions → ✅ `specialists init` is USER-ONLY bootstrap; agents must ask user to run it, never call directly
- ❌ Parallel executors on same file (ps.ts, init.ts) → ✅ Sequential --job chain or consolidate into one bead; parallel = merge conflict cascade
- ❌ Executor running vitest/bun test → ✅ Executor runs lint+tsc only; tests hang on supervisor.test.ts FIFO cleanup (EBADF), use reviewer/test-runner in chained pipeline
- ❌ Editing .xtrm/skills/default/ or .xtrm/skills/active/ → ✅ Edit config/skills/<name>/SKILL.md only; .xtrm paths are overwritten on init
- ❌ `bd update --status=in_progress` without `--claim` → ✅ Edit gate requires explicit `bd update <id> --claim`; status alone does NOT satisfy gate
- ❌ Worktree specialists escaping via absolute paths → ✅ Orchestrator must validate diff location before commit; worktree isolation is cwd-level only, not tool-boundary
- ❌ Executor worktree jobs not committing → ✅ Orchestrator must `git status` + `git commit` in worktree before merging; executors close bead but leave changes unstaged
- ❌ Anthropic models (sonnet-4-6, haiku) for node coordinators → ✅ Use gpt-5.4/codex; Anthropic produces 0-token empty responses in node-member keep-alive sessions
- ❌ Assuming `--job` auto-resolves bead → ✅ `specialists run <name> --job <id>` still requires `--bead` or `--prompt`; auto-bead-resolution not implemented
- ❌ Reading .beads/issues.jsonl directly → ✅ Use `bd show`/`bd show --json`; beads migrated to Dolt DB, flat file access is stale

## How This Project Works
- **MCP is minimal (use_specialist only)** → All orchestration via CLI (`sp run/feed/result/steer/resume/stop/list`); do not re-add MCP tools without strong justification
- **specialists init is sole bootstrap** → setup/install are deprecated shims; init copies config/specialists/ to .specialists/default/, wires .claude/hooks/, installs skills to .claude/skills/ + .pi/skills/, writes .mcp.json
- **Canonical specialists in config/specialists/** → NOT specialists/ at root; loader scans .specialists/user/ first (wins on collision), then .specialists/default/, then legacy paths
- **Bead-first orchestration** → Every specialist run gets child bead via `--bead <id>`; `--context-depth 2` passes upstream output; reviewer uses `--job` to auto-resolve bead context from executor
- **Worktree per edit-capable specialist** → HIGH permission specialists MUST run with `--worktree`; subsequent agents (reviewer, test-runner) must cd into same worktree; orchestrator merges in dependency order
- **Node coordination architecture (unitAI-3f7b)** → Coordinator READ_ONLY emitting typed actions; NodeSupervisor is effect executor; orchestrator owns FIFO merge; SSoT is src/specialist/node-contract.ts (Zod schema + phase_kind + action vocabulary + state machine)
- **Wave/chain/job taxonomy LOCKED** → Job (atomic) | Chain (worktree lineage) | Wave (speech only, zero code meaning) | Epic (merge-gated identity); `sp epic merge <epic>` is only legal publication path for wave-bound chains
- **Feed v2 timeline events canonical** → `run_complete` is single completion event; legacy `done` + `agent_end` double-completion is dead; events persist to .specialists/jobs/<id>/events.jsonl
- **Bun bundle path resolution** → dist/index.js bundle: dirname(import.meta.url) resolves to dist/; paths to package root need ONE `..` (../package.json, ../config/specialists/); two `../..` exits package scope
- **Build before tests** → `bun run build` before help tests; tests run against dist/index.js; `test:node` script for subprocess-safe vitest runs
- **Skill paths are project-local** → skills.paths in specialist YAMLs must use .agents/skills/<name>/ (project-relative), NOT ~/.agents/skills/ (does not exist)
- **Response format JSON fence stripping** → Specialists with response_format:json still wrap in ```json fences; requires BOTH prompt anti-fence instruction AND runner.ts post-process strip
- **Keep-alive status persistence** → On keep-alive agent_end, Supervisor must write waiting state immediately to status.json; avoid status reverting to running after resume turns
- **PID liveness in sp ps** → Renderer checks process.kill(pid, 0) to filter dead jobs; stale status.json from killed processes shows as active without this
- **Token usage parsing** → pi RPC emits input/output/cacheRead/cacheWrite with nested cost.total; findTokenUsage() must parse pi format, not OpenAI-style prompt_tokens/completion_tokens

## Active Context
- **Node coordination Wave 1 (unitAI-3f7b.2)** — Bootstrap parity: bead context injection (runner.ts ~715), member idle-wait pattern, --context-depth propagation; P0 fixes making research node usable
- **Reviewer hang fixed (unitAI-wagb)** — Keep-alive design conflated turn completion with session closure; run_complete emission unblocked, self-termination path added for READ_ONLY specialists, reviewed_job_id plumbed via --job
- **Worktree write-boundary enforced (unitAI-a2u7)** — Pi session validates edit/write paths against worktree_path; absolute paths outside worktree rejected at tool boundary
- **sp merge narrow landed (unitAI-nl8n)** — Topological chain merge under bead epic; `sp merge <chain>` refuses if chain ∈ unresolved epic
- **Test-aware stall detection (unitAI-2vz2)** — Bash test commands detect vitest/bun test context and adjust stall timeout; prevents false positives during test runs
- **SQLite dispose race fixed (unitAI-v21i)** — Supervisor teardown closes FIFO synchronously (closeSync before stream.destroy); prevents EBADF hangs in batch test suites
- **Open blockers** — unitAI-3f7b.1 (explorer mapping pass) must land before Wave 2A schema work; hold on create_bead/spawn_member/complete_node actions until Wave 1 validated
- **Known test failures** — supervisor.test.ts FIFO readline hang in Bun vitest (skip with -t filter or use test:node); pre-existing, not regression
