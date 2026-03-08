# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **GitHub installer** (`bin/install.js`) — one-line setup via
  `npx --package=github:Jaggerxtrm/specialists install`;
  installs `@mariozechner/pi-coding-agent`, `@beads/bd`, prints dolt sudo instructions,
  installs OmniSpecialist globally and registers MCP as `specialists` at user scope,
  scaffolds `~/.agents/specialists/`. No npm publish or 2FA required.
- `ROADMAP.md` — post-v2 product roadmap covering installer, Beads integration,
  `omni-init` tool, specialist authoring skill, new specialists, and future UI

### Changed
- Repo renamed `unitAI` → `omnispecialist` → **`specialists`** (GitHub + package.json)
- `package.json`: name `@jaggerxtrm/specialists`, bin `specialists`
- MCP server name: `omnispecialist` → `specialists`
- Installer: pi package corrected to `@mariozechner/pi-coding-agent`
- Installer: dolt Linux command updated to `sudo bash -c 'curl -L ... | bash'`
- Installer: MCP registration via `npm install -g` (global) instead of npx on-demand
- `dist/`: removed 259 v1 tsc-compiled files; only bun-bundled `dist/index.js` retained
- `report-generator` specialist: model reassigned from `google-gemini-cli/gemini-3-flash-preview`
  to `anthropic/claude-haiku-4-5` — Gemini CLI ~50s/tool round-trip unsuitable for
  text synthesis; fallback remains Gemini Flash
- `report-generator` system prompt: added `STRICT PRIORITY` block — write immediately
  if context sufficient, max 3 tool calls before output

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
