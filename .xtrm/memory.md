# Project Memory — specialists (@jaggerxtrm/specialists v3.3.4)
_Updated: 2026-03-27 | 27 memories synthesized, 5 pruned_

## Architecture & Decisions

**Specialists** is a universal MCP server (`@jaggerxtrm/specialists`) that discovers and executes `.specialist.yaml` definition files via the **pi coding agent** as its subprocess execution layer. The core philosophy is bead-first orchestration: when a run originates from a beads issue, its output is written back to that bead so the task spec, dependency context, and result stay in one loop. The CLI binary is `specialists`; `sp` is a shorter alias. MCP tools: `use_specialist`, `start_specialist`, `poll_specialist`, `stop_specialist`, `specialist_init`, `list_specialists`, `run_parallel`.

The execution stack: CLI/MCP → `SpecialistRunner` (src/specialist/runner.ts) → `PiAgentSession` (src/pi/session.ts, spawns `pi --mode rpc`) → NDJSON stream → `Supervisor` (timeline persistence). Runtime data lives in `.specialists/jobs/` (gitignored). **Canonical specialist YAMLs** are in `config/specialists/` within the package; `init` copies them to `.specialists/default/specialists/`. User customizations go in `.specialists/user/specialists/` (wins on name collision). The loader (`src/specialist/loader.ts`) scans ONLY these two paths — no legacy paths, no user-scope discovery (`~/.agents/specialists/` deprecated).

Feed v2 timeline events (`src/specialist/timeline-events.ts`) are canonical: `run_complete` is the single completion event. Legacy `done` + `agent_end` double-completion is dead. Events persist to `.specialists/jobs/<id>/events.jsonl`; `status.json` holds live state; `result.txt` holds final output. RPC events have two layers: top-level tool execution (`tool_execution_start/update/end`) vs. `message_update.assistantMessageEvent`-nested (text/thinking/toolcall construction). See `docs/pi-rpc.md` for hierarchy.

`specialists init` is the sole bootstrap command (setup/install deprecated). It: (1) copies canonical specialists from `config/specialists/` to `.specialists/default/specialists/`, (2) creates `.specialists/user/specialists/`, (3) creates runtime dirs (`jobs/`, `ready/`), (4) adds those to `.gitignore`, (5) installs hooks to `.claude/hooks/` (not `.specialists/default/hooks/`), (6) wires hooks in `.claude/settings.json`, (7) installs skills to `.claude/skills/` AND `.pi/skills/`, (8) injects workflow block into `AGENTS.md`/`CLAUDE.md` via inline `AGENTS_BLOCK`, (9) writes `.mcp.json` with `mcpServers.specialists`. Idempotent on rerun; `--force-workflow` forces rewrite.

Bun build (`bun build src/index.ts --target=node --outfile=dist/index.js`) bundles to single file. Inside bundle, `dirname(import.meta.url)` resolves to `dist/`; paths to package root need ONE `..` (`../package.json`, `../config/specialists/`). Two `../..` exits package scope entirely — this caused the 2.1.14 path bug. The `resolvePackagePath()` helper in init.ts checks both bundled and source locations for robustness.

## Non-obvious Gotchas

- **Canonical specialists in `config/specialists/`** — NOT `specialists/` at package root. Init copies from `config/` to `.specialists/default/specialists/`. No `specialists/` project directory exists.
- **Loader scan paths**: ONLY `.specialists/user/specialists/` (wins) and `.specialists/default/specialists/`. No legacy paths (`./specialists/`, `./.claude/specialists/`). User scope (`~/.agents/specialists/`) deprecated.
- **Hooks install to `.claude/hooks/`** — not `.specialists/default/hooks/`. Settings.json wiring uses `node .claude/hooks/<name>.mjs`. Doctor.ts still checks wrong path (`.specialists/default/hooks/`) — known mismatch.
- **No `workflow.ts` module** — workflow content is inline `AGENTS_BLOCK` constant in `src/cli/init.ts`. `## Specialists` is the injection marker.
- **MCP registration writes `.mcp.json` directly** — never `claude mcp add`. Idempotency checks `command` + `args` equality.
- **SessionFactory mock** in tests (`tests/unit/specialist/runner.test.ts`) must include: `start`, `prompt`, `waitForDone`, `getLastOutput`, `close`, `getState`, `kill`, `meta`. Missing `close` or `getState` causes runtime errors. The `makeMockSession()` helper shows the full pattern.
- **`specialists feed --follow`** captured as background Claude Code task. Use `specialists result <job-id>` for output. Real job ID in `.output` file, not Claude task ID.
- **Feed initial replay**: oldest-to-newest so freshest history lands at bottom; newest-first looks wrong even if live updates append correctly.
- **`--bead` happy path smoke test**: footer references input bead; `bd show` on that bead has no new specialist-dependent tracking bead.
- **`pi --list-models`** discovers models; pick highest version in family (`glm-5` not `glm-4.7`). Verify: `pi --model <provider>/<id> --print ping`. Format: `provider/model-id`.
- **`@artale/pi-procs`** incompatible with Pi extension API (uses `addTool/addCommand`). Use `@aliou/pi-processes` (`registerTool/registerCommand`).
- **After workflow/docs migrations**: sweep CLI guidance surfaces (status, doctor output) not just markdown. Both currently have stale `specialists install` references.
- **`bug-hunt` renamed to `debugger`** (PR #61). Canonical in `config/specialists/debugger.specialist.yaml`. Stale `bug-hunt.specialist.yaml` may exist in `.specialists/default/` if init ran before rename.

## Process & Workflow Rules

- **ALWAYS `bd create` before touching files.** Investigation → fix is tracked work. No exceptions.
- **`bd update <id> --claim`** required before writing. `--status=in_progress` alone does NOT satisfy edit gate.
- **Git workflow**: `git checkout -b feature/<name>` → `bd create` + `bd update --claim` → edit → `bd close` → `git add && git commit` → `git push -u origin <branch>` → `gh pr create --fill` → `gh pr merge --squash` → cleanup. No push-blocking hook.
- **xtrm worktrees**: ignore with single `.xtrm/worktrees/` rule. Remove accidentally committed gitlink paths from index.
- **Build before help tests**: `bun run build`; tests run against `dist/index.js`.
- **Phase 3 integration tests**: spawn `bun run src/index.ts` in temp dirs to verify `.mcp.json` merge and `--bead` at real CLI boundary.
- **Test coverage split**: init → `.mcp.json` registration; run → `--bead` argument; tool/business → bead context + `use_specialist` forwarding.
- **specialists-usage skill evals**: test behavioral delegation (grep transcript for `specialists run` or `use_specialist`), not Q&A knowledge.
- **`setup` and `install`** are deprecated shims redirecting to `init`. Do not add logic.
- **Commit `.beads/issues.jsonl`** with every code change.
