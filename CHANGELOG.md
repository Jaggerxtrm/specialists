# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.5] - 2026-03-27

### Fixed

- **`specialists status` always shows Active Jobs** — the section now renders even when there are no jobs, with an explicit `(none)` placeholder
- **Supervisor is resilient to mid-run jobs dir deletion** — status/result/ready persistence now recreates required directories and keeps an in-memory status snapshot during run updates
- **Job id is emitted at run start** — Supervisor writes `.specialists/jobs/latest` immediately and `specialists run` prints an early `[job started: <id>]` line before completion

## [3.3.4] - 2026-03-27

### Fixed

- **`specialists run` uses Supervisor for all runs** — foreground runs now create job files in `.specialists/jobs/`, enabling `specialists poll` and `specialists feed` to work consistently
- **`specialists poll` command works correctly** — reads job status and events from `.specialists/jobs/<id>/` files
- **Fixed hanging on session close** — (1) FIFO creation skipped for foreground runs, (2) proper session close with process exit wait, (3) `process.exit(0)` at end of run
- **Deprecated commands redirect to init** — `specialists install` and `specialists setup` now show deprecation warning pointing to `specialists init`
- **`specialists version` exits with code 0** — was exiting with code 1 due to path resolution issue in bundled mode
- **`specialists quickstart` uses current commands** — removed references to deprecated `--background`/`--follow` flags and `specialists install`
- **Removed stale skill** — deleted `config/skills/specialists-usage-workspace/` (superseded by `using-specialists`)

### Changed

- **Skills installed project-local** — `specialists init` now installs skills to `.claude/skills/` and `.pi/skills/` (project-local), not `~/.pi/skills/` (global)
- **Hooks installed project-local** — hooks installed to `.claude/hooks/` with correct `settings.json` wiring

## [3.3.3] - 2026-03-26

### Changed

- **Removed `--background` and `--follow` flags from `specialists run`** — these flags were broken; use Claude Code's native backgrounding or run in a separate terminal instead
- **Added `specialists poll` command** — machine-readable job status polling for scripts; reads from `.specialists/jobs/<id>/` files

### Fixed

- **Hardened file writing** — atomic writes with tmp+rename for `status.json`, defensive error handling

## [3.3.2] - 2026-03-26

### Fixed

- **npm package includes config/** — added `config/` to `package.json` files array; hooks, skills, and specialists now included in published package

## [3.3.1] - 2026-03-26

### Fixed

- `specialists quickstart` section 4: added `--follow` mode, fixed scope paths (`.specialists/default/` + `.specialists/user/` instead of legacy `./specialists/` + `~/.specialists/`)

## [3.3.0] - 2026-03-26

### Added

**`--follow` flag for `specialists run`**
- `specialists run <name> --follow` — starts the specialist in background and streams output live; equivalent to `--background` + `specialists feed <id> --follow` in one command
- Documented in `docs/cli-reference.md` and `docs/background-jobs.md`

**`using-specialists` skill injected at session start**
- `specialists-session-start.mjs` hook now reads `.specialists/default/skills/using-specialists/SKILL.md` and injects the full content as `additionalSystemPrompt` on every Claude Code session start
- Frontmatter is stripped before injection; gracefully skipped if not yet installed
- Specialist list scan corrected to read from `.specialists/default/` and `.specialists/user/` (actual loader paths)
- Quick reference updated with `--follow` example

**`specialists init` copies skills at install time**
- `copyCanonicalSkills()` already present in `init.ts` — copies all `config/skills/*/` to `.specialists/default/skills/*/` including `using-specialists`

### Changed

**Skill and specialist renames (consistency with Anthropic naming guidelines)**
- `config/skills/specialist-author/` → `config/skills/specialists-creator/`
- `config/skills/specialists-usage/` → `config/skills/using-specialists/`
- `config/specialists/specialist-author.specialist.yaml` → `config/specialists/specialists-creator.specialist.yaml`; `metadata.name` updated to `specialists-creator`; `skills.paths` updated to `config/skills/specialists-creator/`

**`specialists-creator` specialist improvements**
- `permission_required`: `LOW` → `HIGH` (specialist needs to create new files)
- `timeout_ms`: 180 000 → 300 000 (previous default caused timeout in testing)
- `skills.paths`: corrected from `skills/specialist-author/SKILL.md` (wrong path) to `config/skills/specialists-creator/` (correct folder)
- Pre-script `pi --list-models` added with `inject_output: true` — model list injected into `$pre_script_output` so agent cannot skip model discovery
- System prompt: mandatory ping protocol (steps 1–5) + `ABSOLUTE RULES` block (DO NOT delete/move/rename files)
- Removed dead fields: `capabilities.diagnostic_scripts`, `communication.publishes`

**`specialists-creator` SKILL.md**
- Opening section rewritten as imperative `ACTION REQUIRED BEFORE ANYTHING ELSE` block — `pi --list-models` + ping appears before any other content
- Model rebalancing scenario Step 4 hardened with `⛔` marker and explicit fail-fast rule

## [3.2.2] - 2026-03-25

### Changed

**Documentation sync**
- `docs/authoring.md`: updated specialist path from `specialists/` to `.specialists/default/specialists/` + `.specialists/user/specialists/`; scope rules now explain default vs user distinction
- `docs/specialists-catalog.md`: updated prose and `source_of_truth_for` globs to reference both `.specialists/` paths; "Project-only scope" section updated
- `docs/bootstrap.md`: `What it does` steps now accurately list all 9 init actions including hooks, skills, and user directory creation

**Directory structure refactor**
- All canonical assets now in `config/` (specialists/, hooks/, skills/) — dev workspace for working on defaults
- `specialists init` creates `.specialists/default/` (canonical) + `.specialists/user/` (custom) structure
- Loader scans only `.specialists/user/specialists/` and `.specialists/default/specialists/` — legacy paths removed
- Only `.specialists/jobs/` and `.specialists/ready/` are gitignored — defaults and user assets are version-controlled
- `specialists list` shows `[default]` (green) or `[user]` (yellow) scope indicator
- `specialists doctor` checks hooks at `.specialists/default/hooks/` and validates settings.json event format

## [3.2.1] - 2026-03-25

### Added

**Keep-alive multi-turn sessions (unitAI-xpxw)**
- `specialists run --keep-alive --background` — keeps the Pi session alive after `agent_end`; job transitions to `status: waiting` instead of `done`
- `specialists follow-up <job-id> "<message>"` — send a next-turn prompt to a waiting session; Pi retains full conversation history (no re-reading, no context loss)
- `follow_up_specialist` MCP tool — same for in-process `start_specialist` jobs and background Supervisor jobs
- `PiAgentSession.resume(task, timeout?)` — resets `_donePromise`, sends new prompt, waits for `agent_end`; proven working via test b7hdsxm9r
- `RunOptions.keepAlive` + `onResumeReady` callback in `SpecialistRunner.run()` — session ownership handed to caller after first turn; finally-block kill skipped
- `JobRegistry.followUp/closeSession` + `'waiting'` status
- Supervisor: FIFO reader handles `{"type":"prompt","message":"..."}` for cross-process follow-up delivery; `{"type":"close"}` for graceful shutdown

**Mid-run steering (unitAI-qhpc)**
- `specialists steer <job-id> "<message>"` — send a steering instruction to a running background job; delivered by Pi RPC after the current tool calls finish, before the next LLM call
- `steer_specialist` MCP tool — same capability for in-process `start_specialist` jobs and background Supervisor jobs
- Named FIFO at `.specialists/jobs/<id>/steer.pipe` used as cross-process IPC bridge; path written to `status.json` as `fifo_path`; cleaned up on job completion
- `PiAgentSession.steer(message)` — writes `{"type":"steer","message":"..."}` to Pi's stdin
- `JobRegistry.steer(id, message)` — in-process steer for `start_specialist` jobs via registered `steerFn`

**Context injection (Phase 4, unitAI-750)**
- `specialists run --context-depth <n>` — dependency-aware context injection; walks the bd dep tree up to depth `n` (default 1 with `--bead`), reads closed blocker notes, and prepends them as `## Context from completed dependencies:` in the specialist prompt
- `getCompletedBlockers(id, depth)` in runner — recursive dep traversal via `bd dep list --json`; reads bead notes from each closed blocker

**Workflow (Phase 3, PR #45)**
- `specialists run --bead <id>` — use a beads issue as the specialist prompt; `bd show <id> --json` replaces the `--prompt` text; single-bead lifecycle enforced (`ownsBead` gates `closeBead`)
- `specialists init` now registers MCP in project-local `.mcp.json` (unitAI-7fm)

**Specialist author tooling**
- `skills/specialist-author/SKILL.md` — comprehensive authoring guide: full schema reference, built-in template variables (`$prompt`, `$cwd`, `$pre_script_output`, `$bead_context`, `$bead_id`), skills injection, pre/post scripts, common Zod errors → fixes table, validation workflow
- `specialists/specialist-author.specialist.yaml` — specialist that writes valid YAML on first attempt; uses `skills/specialist-author/SKILL.md` via `skills.paths`
- `specialists/sync-docs.specialist.yaml` — doc sync specialist; validated live with bead workflow end-to-end

**Bug fixes**
- `fix(run)`: `--no-beads` no longer blocks `--bead` content reads — `beadReader` (always available) split from `beadsClient` (tracking only)
- `fix(runner)`: `$cwd` injected as built-in template variable for all specialists (was silently un-substituted for 6 specialists)
- `fix(planner)`: removed invalid `defaults` top-level key + `READ_WRITE` → `HIGH` permission from `planner.specialist.yaml`; was silently dropped by loader

**Hook system alignment (Phase 0, unitAI-5nm)**
- `hooks/` now contains exactly 2 files: `specialists-complete.mjs`, `specialists-session-start.mjs`
- Beads workflow hooks removed from this package — ownership transferred to xtrm-tools
- `bin/install.js` installs only the 2 bundled hooks; prerequires pi/bd/xt

**Docs**
- `docs/hooks.md` restructured: documents only the 2 bundled hooks; dedicated section defers beads hooks to xtrm-tools with install instructions
- `docs/skills.md` updated: added `specialist-author` skill entry with full description
- `docs/AGENT-HANDOFF.md`: added YAML frontmatter; updated with Phases 0-4 completion status
- `docs/xtrm-specialists-analysis.md`: added YAML frontmatter; records final architectural decisions

---

## [3.2.0] - 2026-03-11

GitNexus-powered specialist upgrades: `codebase-explorer`, `bug-hunt`, and `feature-design`
now use the knowledge graph as their primary investigation strategy.

### Changed

- **`codebase-explorer` v1.1.0** — GitNexus-first exploration: `gitnexus_query` for
  execution flows, `gitnexus_context` for symbol deep-dives, cluster/process resources
  for architectural maps. Bash/grep retained as fallback.
- **`bug-hunt` v1.1.0** — Added Phase 0 GitNexus triage before file reading: query
  error text against knowledge graph, trace callers/callees with `gitnexus_context`,
  use `gitnexus_cypher` for custom call chains. Root cause pinpointing is now
  call-chain-aware rather than grep-based.
- **`feature-design` v1.1.0** — Added Phase 0 impact analysis: `gitnexus_impact`
  blast radius (d=1/d=2/d=3) on symbols affected by the feature before designing
  anything. Regression tests now explicitly target d=1 (WILL BREAK) symbols.
  Timeout increased 240s → 300s. Publishes `impact_report` in addition to existing events.

---

## [3.1.0] - 2026-03-11

Feature parity with `bd` CLI. Closes the documentation and usability gap
between specialists and beads.

### Added

**CLI Help & Discovery**
- `specialists <cmd> --help` — all 11 subcommands now print usage, flags, and examples
- `specialists quickstart` — 10-section getting-started guide: install, init, list,
  foreground/background run, job lifecycle, edit, full YAML schema (`stall_timeout_ms`,
  `skills.paths`, `beads_integration`), hook system, MCP tools, common workflows
- `specialists help` — command categories (Setup / Discovery / Running / Jobs / Other);
  references quickstart
- `specialists list --json` — machine-readable JSON array output
- `specialists status --json` — structured JSON: specialists, pi, beads, MCP, jobs

**New Commands**
- `specialists doctor` — 5-point health check: pi providers, all 7 hooks present +
  wired in settings.json, MCP registration, runtime dirs, zombie job detection
- `specialists setup` — inject Specialists Workflow block into CLAUDE.md / AGENTS.md /
  ~/.claude/CLAUDE.md with --project/--agents/--global/--dry-run flags

**Session Context**
- `hooks/specialists-session-start.mjs` — SessionStart hook: injects active background
  jobs, available specialists list, and CLI quick reference at every session start
- `skills/specialists-usage/SKILL.md` — usage skill: when-to-use table, lifecycle
  diagram, MCP tools reference, completion banner interpretation, troubleshooting

**Installer**
- `specialists install` now installs the SessionStart hook (step 7 → hooks now 7 total)
- `specialists install` now installs skills to `~/.claude/skills/` (new step 7: Skills)
- YAML schema fully documented in `quickstart` output

---

## [3.0.0] - 2026-03-11

Complete architecture redesign. The **CLI becomes the execution plane**; MCP becomes the control plane. File-based job state replaces in-memory `JobRegistry`. Async MCP tools deprecated.

### Added

**Background jobs (Phase 1)**
- **`specialists run <name> --background`** — starts a specialist as a supervised background process; prints `Job started: <id>` and exits immediately
- **`specialists result <id>`** — print `result.txt` for a completed job; exits 1 if still running or failed
- **`specialists feed --job <id> [--follow]`** — tail `events.jsonl`; `--follow` streams live with `watchFile`
- **`specialists stop <id>`** — send SIGTERM to the PID recorded in `status.json`
- **`src/specialist/supervisor.ts`** — Supervisor class wrapping `SpecialistRunner`:
  - writes `status.json` atomically (tmp + rename) with id, specialist, status, model, backend, pid, elapsed\_s, bead\_id, error
  - writes `events.jsonl` (thinking, toolcall, tool\_execution\_end, agent\_end — high-noise events dropped)
  - writes `result.txt` on completion
  - GC: deletes job dirs older than `SPECIALISTS_JOB_TTL_DAYS` (default 7)
  - crash recovery: marks running jobs with dead PID as error on next startup
  - touches `.specialists/ready/<id>` marker on completion for hook pickup
- **`specialists init`** now creates `.specialists/jobs/` and `.specialists/ready/` and adds `.specialists/` to `.gitignore`

**Completion hook (Phase 3)**
- **`hooks/specialists-complete.mjs`** — `UserPromptSubmit` hook: scans `.specialists/ready/`, injects completion banners via `{"type":"inject","content":"..."}`, deletes markers (fires once per job)
- `specialists install` now installs and registers this hook

**Schema additions (Phase 4)**
- **`skills.paths`** — array of skill/context files injected into the system prompt at run time; paths resolved at load time (`~/` → home, `./` → specialist file dir, absolute unchanged)
- **`execution.stall_timeout_ms`** — schema field for future stall detection

### Changed

**PiAgentSession protocol (Phase 2)**
- **`prompt()`** no longer closes stdin — stdin stays open for subsequent RPC commands
- **`waitForDone(timeout?)`** — optional timeout via `Promise.race`; throws `Error('Specialist timed out')` on expiry
- **`sendCommand(cmd)`** — writes JSON command to stdin, returns promise resolved by `response` events
- **`getLastOutput()`** — tries `get_last_assistant_text` RPC first, falls back to in-memory capture on timeout/error
- **`getState()`** (new) — sends `get_state` RPC, returns session info or null
- **`close()`** (new) — sends EOF to stdin, awaits process exit cleanly
- **`mapPermissionToTools()`** — `LOW`/`MEDIUM`/`HIGH` now explicitly map to `'read,bash,edit,write,grep,find,ls'` (previously returned `undefined`, relying on pi defaults)
- `_handleEvent()` handles `type === 'response'` to dispatch pending RPC commands

**Runner (Phase 2 + Phase 4)**
- `runner.run()` passes `execution.timeout_ms` to `waitForDone()` — previously no timeout was enforced
- `runner.run()` calls `session.close()` for clean shutdown after output retrieval; `kill()` retained as idempotent finally-block safety net
- `SessionFactory` type extended with `close` and `getState`
- `RunOptions` adds optional `sessionPath` field
- Injects resolved `skills.paths` files into system prompt (alongside existing `skill_inherit`)
- `readFile` import de-duplicated (removed redundant inner import)

**CLI + help**
- `specialists status` adds **Active Jobs** section from `.specialists/jobs/*/status.json`
- `specialist_status` MCP tool adds `background_jobs` array to response
- `src/cli/help.ts` documents `result`, `feed`, `stop` subcommands
- `src/index.ts` routes `result`, `feed`, `stop` subcommands

**MCP tools deprecated**
- `start_specialist`, `poll_specialist`, `stop_specialist`, `run_parallel` — descriptions now include `[DEPRECATED v3]` note pointing to CLI equivalents; tools remain functional for backward compatibility

**Server**
- `server.ts` registers `SIGTERM` handler for graceful shutdown

### Fixed
- **Test mock sessions** — `runner.test.ts` and `runner-scripts.test.ts` mocks updated to include `close()` and `getState()`; previously `session.close is not a function` would fail all runner tests

---

## [2.1.21] - 2026-03-10

### Added
- **`specialists models`** — lists all models available on pi, grouped by provider. Shows context window size and thinking/images capability flags. Models currently used by your specialists are marked with `←` and the specialist names. Flags: `--provider <name>` to filter, `--used` to show only in-use models.

---

## [2.1.20] - 2026-03-10

### Added
- **`specialists list` two-line layout** — name/scope/model on line 1, description (truncated at 80 chars) indented on line 2 with blank lines between entries.
- **Unknown subcommand error** — exits with `Unknown command: 'X'` instead of silently starting the MCP server.
- **`--version` / `-v` aliases** for `specialists version`.

---

## [2.1.19] - 2026-03-10

### Fixed
- **`specialists install` SyntaxError on Node 25.1** — remnant `HOOK_SCRIPT` embedded string caused unterminated template literal.

---

## [2.1.18] - 2026-03-10

### Fixed
- **Hook drift detection** — `specialists install` detects when installed hooks differ from bundled versions, shows which hooks are missing/changed, asks `Update hooks? [Y/n]`.

---

## [2.1.17] - 2026-03-10

### Changed
- **Hook messages show full workflow** — every hook block displays the complete 7-step workflow with the blocked step marked `← you are here`.

---

## [2.1.16] - 2026-03-10

### Fixed
- **Hook scripts extracted to `hooks/` directory** — hook scripts were hardcoded strings in `bin/install.js`. Now `hooks/` contains real `.mjs` files as source of truth; installer copies them at install time.

---

## [2.1.15] - 2026-03-10

### Fixed
- **`specialists install` path** — removed extra `..` in `bin/install.js` path resolution.

---

## [2.1.13] - 2026-03-10

### Added
- **`specialists status`** — system health check: Specialists, pi, beads, MCP.

---

## [2.1.12] - 2026-03-10

### Added
- **`specialists run <name>`** — spawns a specialist directly; streams token output to stdout; `--prompt`, `--model`, `--no-beads`; Ctrl+C kills cleanly.

---

## [2.1.11] - 2026-03-10

### Added
- **`specialists init`** — creates `./specialists/`, appends Specialists block to `AGENTS.md`; idempotent.
- **`specialists edit`** — in-place YAML field edits; `--dry-run` support.

---

## [2.1.10] - 2026-03-10

### Added
- **`specialists help`** — formatted subcommand reference.
- **CLI dispatcher refactor** — `src/index.ts` is a pure dispatcher; all subcommand logic in `src/cli/` modules.

---

## [2.1.9] - 2026-03-09

### Added
- **`specialists version`** — prints version and exits.
- **`specialists list`** — discovers `.specialist.yaml` files, prints name/model/description/scope.

---

## [2.1.8] - 2026-03-09

### Added
- **Beads enforcement hooks** — `beads-edit-gate.mjs`, `beads-commit-gate.mjs`, `beads-stop-gate.mjs` make beads issue tracking mandatory.
- **`beads-close-memory-prompt.mjs`** — PostToolUse hook nudges knowledge capture after `bd close`.

---

## [2.1.7] - 2026-03-09

### Changed
- **System scope removed** — two scopes remain: project → user.

---

## [2.1.6] - 2026-03-09

### Changed
- **Built-in specialists copied to `~/.agents/specialists/` on install** — users can now edit models, prompts, permissions directly.

---

## [2.1.5] - 2026-03-09

### Fixed
- **`agent_end` split-chunk hang** — accumulate chunks in `_lineBuffer`; emit only on confirmed `\n`.
- **`agent_end` never fires** — `proc.stdin.end()` after writing the prompt; removed no-op `--print`.
- **Pre/post script execution broken** — scripts now run locally via `execSync`; output injected via `$pre_script_output`.

---

## [2.1.0] - 2026-03-09

### Added
- **Beads Integration** — `beads_integration: auto|always|never`; auto-creates/closes bead per run.
- **`specialist_init`** MCP tool — session bootstrap.
- **`main-guard.mjs`** Claude Code PreToolUse hook.

---

## [2.0.0] - 2026-03-07

Complete rewrite. v1 workflow/agent system replaced by the **Specialist System**.

### Added
- 7-tool MCP surface: `list_specialists`, `use_specialist`, `start_specialist`, `poll_specialist`, `stop_specialist`, `run_parallel`, `specialist_status`
- `SpecialistLoader` — 2-scope YAML discovery with caching
- `SpecialistRunner` — full lifecycle: agents.md injection, pre/post scripts, circuit breaker
- `PiAgentSession` — spawns `pi --mode rpc`, NDJSON event stream, `waitForDone()`, `kill()`
- `JobRegistry` — in-memory async job state with cursor-based delta output
- 9 built-in specialists
- Permission enforcement via `pi --tools` at spawn time
- `HookEmitter` — 4-point lifecycle hooks, JSONL trace sink
- 40 unit tests

### Removed
- All v1 workflow, agent role, and analytics files

---

## [0.4.0] - 2026-01-22

### Added
- Overthinker Workflow — 4-phase reasoning
- Init-Session Workflow — git history analysis, Serena memory search

---

## [0.3.0] - 2025-12-01

### Added
- Circuit Breaker with automatic backend fallback
- 4-tier permission system

---

## [0.1.0] - 2025-10-01

### Added
- Initial MCP server with basic tool registry