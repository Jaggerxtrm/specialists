# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **`agent_end` split-chunk hang** — `agent_end` is a single NDJSON line containing the
  full conversation history; for long-running specialists (20+ tool calls) this line can
  exceed 64 KB (Node.js stdout chunk size). The old handler split each raw chunk on `\n`,
  so `JSON.parse` failed silently on both halves, `_agentEndReceived` never flipped, and
  `waitForDone()` hung indefinitely. Fix: accumulate chunks in `_lineBuffer`, emit only on
  confirmed `\n`, flush remaining content on stdout `end` (`79ac2cb`)
- **`agent_end` never received on short prompts** — `pi --mode rpc` does not close its
  own stdin; the subprocess kept waiting for more input so the agent loop never started.
  Fix: call `proc.stdin?.end()` immediately after writing the prompt (`c305396`)

---

## [2.1.4] - 2026-03-09

### Changed
- **`main-guard` hook rewritten in JS** — replaces `main-guard.sh` with `main-guard.mjs`
  for consistent cross-platform behaviour; installed at `~/.claude/hooks/main-guard.mjs`
  by `specialists install`

---

## [2.1.3] - 2026-03-09

### Added
- **`specialists install` subcommand** — idempotent one-shot setup: installs `pi`,
  `bd`, `dolt`, registers the `specialists` MCP at user scope, scaffolds
  `~/.agents/specialists/`, and installs the `main-guard` PreToolUse hook into
  `~/.claude/hooks/`; re-runnable at any time to update or repair

---

## [2.1.2] - 2026-03-09

### Fixed
- **`specialists install` hanging** — `specialists` bin points to `dist/index.js`
  (the MCP server), which blocks on stdio waiting for JSON-RPC input; the `install`
  arg was silently ignored. Fix: added early-exit guard in `src/index.ts` —
  `process.argv[2] === 'install'` delegates to `bin/install.js` via `execFileSync`
  so `specialists install` and `npx --package=@jaggerxtrm/specialists install` are
  now equivalent

### Changed
- **README**: `npm install -g @jaggerxtrm/specialists` + `specialists install` is now
  the recommended installation path; `npx` demoted to "one-time / no global install"

---

## [2.1.1] - 2026-03-09

### Fixed
- **`BeadsClient` not wired in production** — `server.ts` was never instantiating or passing `BeadsClient` to `SpecialistRunner`; beads lifecycle silently no-op'd in production while unit tests (which inject the client) passed green
- **`specialist_init` zod import** — `import { z }` → `import * as z` for Bun+Vitest compatibility
- **`startAsync` missing `onBeadCreated`** — async specialist jobs now forward `beadId` to `JobRegistry.setBeadId()` immediately on creation so `poll_specialist` snapshots include it

---

## [2.1.0] - 2026-03-09

### Added
- **M4 Beads Integration** — `beads_integration: auto|always|never` field in `.specialist.yaml`; `shouldCreateBead()` policy function
- **`SpecialistRunner` beads lifecycle** — auto-creates bead after `pre_execute`, closes with `COMPLETE`/`ERROR` status, duration, model, and audit entry
- **`JobRegistry.setBeadId()`** — `beadId` propagated to `poll_specialist` snapshots so orchestrator can link bead to job
- **`specialist_init` MCP tool** (8th tool) — session bootstrap: runs `bd init` if `.beads/` missing, returns specialist list + beads availability
- **`main-guard.sh`** Claude Code PreToolUse hook — blocks Edit/Write/MultiEdit/NotebookEdit and `git commit`/`git push` on main/master branch

### Changed
- All `omni_init`/`OmniInitDeps`/`createOmniInitTool` → `specialist_init`/`SpecialistInitDeps`/`createSpecialistInitTool`
- `UnitAIServer` → `SpecialistsServer`; MCP logger string `unitai` → `specialists`
- Trace path `.unitai/trace.jsonl` → `.specialists/trace.jsonl`
- 67 unit tests (was 40 after v2; now 67 after M4 additions)

---

## [2.0.1] - 2026-03-08

### Added
- **GitHub installer** (`bin/install.js`) — one-line setup via
  `npx --package=github:Jaggerxtrm/specialists install`;
  installs `@mariozechner/pi-coding-agent`, `@beads/bd`, prints dolt sudo instructions,
  installs `@jaggerxtrm/specialists` globally and registers MCP as `specialists` at user scope,
  scaffolds `~/.agents/specialists/`
- `ROADMAP.md` — post-v2 product roadmap

### Changed
- Repo renamed `unitAI` → `omnispecialist` → **`specialists`** (GitHub + package.json)
- `package.json`: name `@jaggerxtrm/specialists`, bin `specialists`
- MCP server name: `omnispecialist` → `specialists`
- Installer: pi package corrected to `@mariozechner/pi-coding-agent`
- Installer: dolt Linux command updated to `sudo bash -c 'curl -L ... | bash'`
- Installer: MCP registration via `npm install -g` (global) instead of npx on-demand
- `dist/`: removed 259 v1 tsc-compiled files; only bun-bundled `dist/index.js` retained
- `report-generator` specialist: model reassigned from `google-gemini-cli/gemini-3-flash-preview`
  to `anthropic/claude-haiku-4-5`
- `report-generator` system prompt: added `STRICT PRIORITY` block

---

## [2.0.0] - 2026-03-07

Complete rewrite. The v1 workflow/agent system is replaced by the **Specialist System**.

### Added
- **7-tool MCP surface**: `list_specialists`, `use_specialist`, `start_specialist`,
  `poll_specialist`, `stop_specialist`, `run_parallel`, `specialist_status`
- **Specialist System**: `.specialist.yaml` discovery across project/user/system scopes
  via `SpecialistLoader` with 3-scope resolution and caching
- **`SpecialistRunner`**: full lifecycle — agents.md injection, pre/post scripts,
  circuit breaker integration, `onMeta`/`onKillRegistered` callbacks
- **`PiAgentSession`**: spawns `pi --mode rpc` subprocess, NDJSON event stream,
  `waitForDone()` (no timeout), `kill()` method
- **`JobRegistry`**: job state management with `cancelled` status, cursor-based
  delta output via `snapshot(id, cursor)`, `setMeta()`, `setKillFn()` with
  race condition guard
- **`stop_specialist` tool**: cancel running specialist jobs cleanly
- **Cursor-based polling**: `poll_specialist(job_id, cursor?)` returns only new
  content since last cursor — avoids sending full output on every poll
- **Permission enforcement**: `READ_ONLY` maps to `pi --tools read,bash,grep,find,ls`
  at spawn time — edit/write physically unavailable, not just prompt-instructed
- **9 built-in specialists**: `init-session`, `codebase-explorer`, `overthinker`,
  `parallel-review`, `bug-hunt`, `feature-design`, `auto-remediation`,
  `report-generator`, `test-runner`
- **Tiered model assignment**: Sonnet for deep reasoning, Haiku for fast/simple,
  Gemini Flash for context-heavy exploration
- **Full provider/model ID support**: `anthropic/claude-sonnet-4-6`,
  `google-gemini-cli/gemini-3-flash-preview` passed as `pi --model provider/id`
- **STRICT CONSTRAINTS** in READ_ONLY specialist system prompts: belt-and-suspenders
  alongside `--tools` enforcement
- **`HookEmitter`**: 4-point lifecycle hooks, JSONL trace sink at `.unitai/trace.jsonl`
- **`pipeline.ts`**: sequential `$previous_result` chaining for `run_parallel`
- **40 unit tests**: specialist loader, runner, job registry, pi session, circuit breaker

### Removed
- All v1 workflow files (`src/workflows/`)
- All v1 agent role files (`src/agents/`)
- All v1 MCP tools except analytics (replaced by 7-tool specialist surface)
- `waitForIdle()` timeout — replaced by `waitForDone()` with no timeout

### Changed
- `backendMap.ts`: Gemini provider corrected to `google-gemini-cli` (was `google`)
- Gemini OAuth: removed erroneous `--api-key` passthrough; pi inherits env vars natively
- Build system: migrated to `bun build` (`bun:sqlite`, `bun --bun vitest`)

---

## [0.4.0] - 2026-01-22

### Added
- **Overthinker Workflow** — 4-phase reasoning: Prompt Refiner → Initial Reasoning
  → Iterative Review → Final Consolidation. Outputs to `.unitai/overthinking.md`
- **Init-Session Workflow** — git history analysis, Serena memory search,
  structured session report
- SSOT for init-session workflow (`.serena/memories/`)

### Changed
- Infrastructure aligned with MCP 2.0 best practices
- Model upgrades: `gemini-3-pro-preview` (PRIMARY), `gemini-3-flash-preview` (FLASH)
- Cursor Agent replaces Qwen as testing/review backend
- Droid (GLM-4.6) established as Implementer backend

---

## [0.3.0] - 2025-12-01

### Added
- Circuit Breaker pattern with automatic backend fallback
- 4-tier permission system (READ_ONLY / LOW / MEDIUM / HIGH)
- Activity analytics with SQLite persistence

---

## [0.2.0] - 2025-11-01

### Added
- Multi-backend support: Gemini, Cursor, Droid
- Agent role specialization (Architect / Implementer / Tester)
- Zod schema validation for all tool invocations

---

## [0.1.0] - 2025-10-01

### Added
- Initial MCP server with basic tool registry
- Gemini backend integration