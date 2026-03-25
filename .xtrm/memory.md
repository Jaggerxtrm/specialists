# Project Memory — specialists (@jaggerxtrm/specialists v3.2.1)
_Updated: 2026-03-25 | 30 memories synthesized, 4 pruned_

## Architecture & Decisions

**Specialists** is a universal MCP server (`@jaggerxtrm/specialists`) that discovers and executes `.specialist.yaml` definition files via the **pi coding agent** as its subprocess execution layer. The core philosophy is bead-first orchestration: when a run originates from a beads issue, its output is written back to that bead so the task spec, dependency context, and result stay in one loop. The CLI binary is `specialists`; the MCP surface exposes `use_specialist`, `start_specialist`, `poll_specialist`, `stop_specialist`, `specialist_init`, `list_specialists`, and `run_parallel`.

The execution stack flows: CLI/MCP tool → `SpecialistRunner` (src/specialist/runner.ts) → `PiAgentSession` (src/pi/session.ts, spawns `pi --mode rpc`) → NDJSON event stream → `Supervisor` (timeline persistence). Runtime data lives in `.specialists/` (gitignored). Specialist YAML files live in `specialists/` (project scope) or `~/.agents/specialists/` (user scope). The loader (`src/specialist/loader.ts`) scans three project-local paths (`./specialists/`, `./.claude/specialists/`, `./.agent-forge/specialists/`) plus the user path; there is no system scope. `bin/install.js` and `src/cli/install.ts` are deprecated shims that redirect to `specialists init`.

The feed subsystem uses a canonical timeline event model defined in `src/specialist/timeline-events.ts`. The key semantic: `run_complete` is the single completion event — the legacy `done` + `agent_end` double-completion pattern is dead. Events are persisted to `.specialists/jobs/<id>/events.jsonl`; `status.json` holds live state; `result.txt` holds final output. Pi RPC events have two layers: top-level tool execution events vs. `message_update.assistantMessageEvent`-nested events (text tokens, thinking tokens, toolcall construction). See `docs/pi-rpc.md` for the full hierarchy.

`specialists init` is the sole bootstrap command. It: (1) creates `specialists/` and `.specialists/` dirs, (2) adds `.specialists/` to `.gitignore`, (3) injects a workflow block into `AGENTS.md`/`CLAUDE.md` using the `## Specialists` marker (inline in `src/cli/init.ts`), (4) writes `.mcp.json` directly with `mcpServers.specialists = {command:'specialists', args:[]}` — it does **not** use `claude mcp add`. Reruns are idempotent. `--force-workflow` flag forces rewrite of existing workflow blocks.

The bun build (`bun build src/index.ts --target=node --outfile=dist/index.js`) bundles into `dist/index.js`. Inside the bundle `dirname(import.meta.url)` resolves to `dist/`, so paths to the package root require only ONE `..` (e.g., `../package.json`, `../specialists/`). Using `../../` navigates above the package root.

## Non-obvious Gotchas

- **No `src/specialist/workflow.ts`**: Workflow content is defined inline in `src/cli/init.ts` (`AGENTS_BLOCK`) and `src/cli/setup.ts`. There is no standalone workflow module with `renderWorkflowBlock()`. The `## Specialists` string is the injection marker.
- **MCP registration writes `.mcp.json` directly** — never via `claude mcp add`. The idempotency check compares `command` + `args` fields.
- **User scope still active**: Loader still scans `~/.agents/specialists/` as user scope despite past messaging about deprecation. Confirmed in `loader.ts` line 64.
- **SessionFactory mock requires**: `close`, `getState`, `start`, `prompt`, `waitForDone`, `getLastOutput`, `kill`, `meta`. Missing `close` or `getState` causes runtime errors in `runner.ts` Phase 2+. See `runner.test.ts`, `runner-scripts.test.ts`.
- **`BeadsClient` must be injected** from `server.ts` constructor into `SpecialistRunner` via `RunnerDeps`. If it isn't, the beads lifecycle is a silent no-op.
- **CLI help tests**: Use `execFileSync('node', ['dist/index.js', '--help'])` rather than re-importing `src/index.ts` under Bun/Vitest to avoid module-cache and argv mocking fragility.
- **`specialists feed --follow`** is captured as a background Claude Code task. Use `specialists result <job-id>` to read output. The real job ID is printed inside the `.output` file, not the Claude Code task ID.
- **Feed initial replay** must be oldest-to-newest so fresh history lands at the bottom; newest-first startup looks wrong even if live updates append correctly.
- **`--bead` happy path**: smoke test should confirm footer references input bead and `bd show` on that bead has no new specialist-dependent tracking bead (single-bead orchestration, no runner-created tracking beads for input beads).
- **`pi --list-models`** to discover available models; pick highest version in family. Verify with `pi --model <provider>/<id> --print ping`. Format: `provider/model-id` (e.g., `anthropic/claude-sonnet-4-6`, `zai/glm-5`).
- **`@artale/pi-procs`** is incompatible with the current Pi extension API (uses wrong addTool/addCommand). Use `@aliou/pi-processes` instead (registerTool/registerCommand).
- **Bun bundle path**: `dist/index.js` is the entry. One `..` from there reaches package root. Two `../..` exits the package entirely.
- **Before docs rewrites**: check reflog for lost SSOT commits — substantial rewrites sometimes survive only in reflog after branch churn. Recover to dedicated branch, replay selectively.
- **After workflow/docs migration**: sweep active CLI guidance surfaces (status, doctor output) not just markdown files, when changing bootstrap command names.
- **Diverged history**: when local master has unrelated diverged commits, rebuild cleanup branch from `origin/master` and cherry-pick only intended commits — don't rebase the whole branch.

## Process & Workflow Rules

- **Always `bd create` before touching files.** Investigation that leads to a fix is tracked work. No exceptions.
- **`bd update <id> --claim`** is required before writing files. `--status=in_progress` alone does NOT satisfy the beads edit gate.
- **Git workflow**: `git checkout -b feature/<name>` → `bd create` + `bd update --claim` → edit → `bd close` → `git add && git commit` → `git push -u origin <branch>` → `gh pr create --fill` → `gh pr merge --squash` → `git checkout master && git reset --hard origin/master`. No push-blocking hook (removed in v3.0.0).
- **xtrm worktrees**: ignore with a single `.xtrm/worktrees/` rule. If individual worktree paths were accidentally committed as gitlinks, remove them from the index.
- **Build before testing help**: `bun run build` first; help tests run against `dist/index.js`.
- **Phase 3 integration tests**: spawn `bun run src/index.ts` in temp project dirs to verify `.mcp.json` merge and `--bead` validation at the real CLI boundary.
- **Coverage split**: init tests → `.mcp.json` registration idempotence; run tests → `--bead` argument behavior; tool/business tests → bead context formatting + `use_specialist` bead_id forwarding.
- **specialists-usage skill evals**: must test behavioral delegation (grep transcript for `specialists run` or `use_specialist`), not Q&A knowledge. Give agent a delegatable task; presence of the skill should change behavior, not just answers.
- **Write tool prerequisite**: Read tool must be called on a file before Write tool can modify it. `cat file > /dev/null` in Bash does NOT satisfy the guard.
- **`setup` and `install` commands** are deprecated shims. Both print redirect messages to `init`. Do not add logic there.
- **Commit `.beads/issues.jsonl`** with every code change.
