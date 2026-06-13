# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed
- **Specialist model selection moves to a per-user global config (KAN-90 / `unitAI-1gtou`).** Every `config/specialists/*.specialist.json` now ships with `execution.model = null` and `execution.fallback_model = null`. The `SpecialistLoader` resolves each specialist via a 4-layer field-merge (`package canonical → ~/.config/specialists/user.json → .specialists/default → .specialists/user`). New CLI surface: `sp init --global`, `sp edit --global`, `sp doctor --specialists`. Missing models after merge raise `SpecialistMissingModelError` at dispatch with a pointer to `sp edit --global`. Blocked fields (`execution.permission_required`, `mandatory_rules`, `capabilities`, `output_schema`, `auto_commit`, `prompt.system`, `skills.scripts`) are stripped from the global layer and surfaced via `sp doctor --specialists`. Upgrade guide: `docs/upgrade-notes/kan-90-global-user-config.md`. (Commits `5f8d725e`, `6604c144`, `6b69a6fe`, plus this commit.)

### Added
- **Console-safe AgentOps operations surfaces.** `sp serve` now exposes read-only per-job normalized forensic streams at `GET /jobs/:job_id/feed-events` and `/api/specialists/jobs/:job_id/feed-events`; Prometheus projection adds bounded `xtrm_chains_total` / `xtrm_chain_duration_seconds`, projects gate verdict and evidence-ref counters, forbids raw diff labels, keeps chain/job/file/diff drill-down in forensic events, and documents the console-facing telemetry contract updates (`unitAI-5ljfu`).
- **AgentOps correlation and MCP telemetry pre-wiring.** Forensic events now carry optional `session_id`, `conversation_id`, `trace_id`, `span_id`, and `parent_span_id` correlation fields through Pi session metadata, supervisor status, SQLite forensic writes, and `sp feed`/`sp log` JSON surfaces. MCP timeline events normalize to canonical `mcp.*` names, preserve MCP/JSON-RPC/trace identifiers as correlation/body data only, and project bounded `xtrm_mcp_operations_total` metrics without implying a live MCP emitter (`unitAI-eoqxp.3.1`, `unitAI-eoqxp.3.2`).
- **Telemetry contract validation and token-first cost semantics.** Forbidden Prometheus labels now include session/conversation/MCP/JSON-RPC/eval/policy/identity correlation IDs, AgentOps catalog fixtures cover job/MCP/identity/policy/eval/service-skills/pulse/token provenance examples, and the telemetry docs explicitly keep USD cost out of runtime metrics until billing/pricing provenance exists (`unitAI-eoqxp.3.5`, `unitAI-v1fzu`).
- **AgentOps forensic telemetry bridge — `xtrm.forensic.v1` runtime envelopes, persistence, and query surface.** Specialist runtime events now dual-write canonical forensic envelopes into `specialist_forensic_events`, with deterministic redaction before persistence/output and additive `forensic_event` payloads on `sp feed --json` / `sp log --json` while preserving legacy fields. New `sp forensic <job-id> --json` emits persisted NDJSON evidence for a job; real-job smoke `ddc421` validated 68 events across `job`, `model`, `turn`, `tool`, and `git` families (`unitAI-60w93.2`, `.3`, `.4`, `.8`, `.9`, `.10`, `.14`, `unitAI-z2s17`).
- **AgentOps Prometheus projection — `sp metrics --prometheus` plus `sp serve` `GET /metrics`.** Specialists now exports low-cardinality Prometheus/OpenMetrics text for job state, job totals, duration/wait histograms, turns, context usage, tool calls, LLM tokens, queue depth, process/worktree gauges, and projection timestamp. The projection is table-derived/replay-safe for current state, validates text syntax in CI, and keeps high-cardinality IDs (`job_id`, `chain_id`, `participant_id`) out of labels (`unitAI-60w93.5`, `.6`, `.7`, `.11`, `.12`, `.13`).
- **`sp list` / `specialists list` — per-specialist version badge, package-version header, and new-release alert.** Each row now renders the spec's own `metadata.version` as a `[vX.Y.Z]` badge after the name (e.g. `seconder [v1.0.0]`); the header line shows the running package version (`Specialists (N)  specialists v<pkg>`); and when the existing version-check finds a newer published tag, `sp list` prints `new version <v> available, run npm i -g @jaggerxtrm/specialists@<v>`. Rows are sorted alphabetically by name (human output and `--json`, ordering-only — `--json` stays a top-level array, backward-compatible). Reuses `getVersionCheckResult()` (TTY-gated, 6h cache, 2s timeout, silent on failure) via a new `formatListVersionAlert()` — no new network/cache path (`unitAI-k5vx7`).

### Changed
- **`service-skills-sync` specialist v1.4.0 — mandatory Phase 2.5 diff content scan for non-symbol drift.** Adds a `git diff <last_sync_ref>..HEAD` scan step between Serena cross-check and classify, grepping for renamed env vars, new/removed exception sites, error log strings, docker container/image renames, and new API endpoints (6 patterns). The `audited-and-unchanged` verdict now requires a clean diff scan in addition to a gitnexus cosmetic signal. Missing `last_sync_ref` emits a new `⚠ Triage-incomplete` verdict rather than silently passing. New `service-skills-diff-scan-mandatory` mandatory rule enforces the contract. Motivated by `py_backend-0ndo` (darth-feedor) where string-literal-only drift was mislabeled as semantic-unchanged (`unitAI-ekt17`).
- **`test-runner` specialist — `task_template` aligns with exact-command-wins scope semantics.** Pinned exact commands from the orchestrator/test-engineer now explicitly win over manifest-detected fallback (fallback is clearly labelled as evidence, never a scope override) (`v2.0.0 → v2.0.1`, PR #102).

## [v3.17.0] — 2026-05-31

### Added
- **`seconder` specialist (NEW, package tier).** The fused post-writer gate from canon `docs/design/chain-templates.md` §2.3 — collapses the old split between scope/compliance (reviewer phase-1) and code-quality smell (`code-sanity`) into one READ_ONLY dispatch (`openai-codex/gpt-5.4-mini`) emitting a structured dual-verdict JSON: `scope_verdict` + `scope_findings` + `quality_verdict` + `quality_findings` + `overall_verdict`. The chain reducer reads `overall_verdict` to advance or route back to the writer; the reviewer reads the dimension-tagged findings. Replaces `code-sanity`, which is **removed** this release (see Removed) (`unitAI-4e194`, `unitAI-wz2ag`, `unitAI-321ir`).
- **`test-engineer` specialist (NEW, package tier).** Post-implementation behavioral-test author from the actual diff (canon §2.5). MEDIUM, `openai-codex/gpt-5.5`, `requires_worktree`. Produces tests + fixtures + smoke/E2E harnesses + telemetry assertions and emits exact `test-runner` commands via a structured schema (`status`, `files_changed`, `coverage_map`, `smoke_e2e_commands`, `telemetry_assertions`, `test_runner_commands`, `known_deferred_paths`, `source_bug_suspicions`). Ambidextrous role (§3.16): the same spec is the **primary writer** in `test-only` chains and the **secondary writer** in `code-with-tests` chains — the system prompt is mode-agnostic and the position arrives via the dispatch-time mandate. Forbidden from patching production source by default (`unitAI-sfwe1`, `unitAI-sfwe1.1`).
- **Two NEW chain-template formulas — `code-with-tests` (§3.14) and `test-only` (§3.15).** `code-with-tests`: dual-writer production chain (`executor` writes the diff, `test-engineer` writes tests against it) at high/critical scrutiny. `test-only`: single-writer chain when scope is test-paths only (`test-engineer` as primary writer). Both carry the ambidextrous `test-engineer` mandate in the step `description` (pre-substrate position-injection mechanism, §3.16) (`unitAI-f9kku`).
- **Seconder dual-verdict eval + QA-routing eval.** `.specialists/evals/seconder/` — a reproducible static eval with three fixtures (wrong-scope → `scope_verdict` FAIL, bad-quality → `quality_verdict` FAIL, clean → `overall_verdict` PASS) each carrying an `expected-verdict.json`, plus an operator-run `run.sh` and a token-cost note (`unitAI-o7j1a`). `config/skills/using-specialists-v3/evals/` gained four QA-routing eval cases (test-engineer primary vs secondary writer, test-runner owner-routing, reviewer-consumes-QA-evidence) + a passing vitest harness (`unitAI-sfwe1.5`).
- **`transcriber` specialist (NEW, package tier).** Promotes the documentation-grade YouTube transcriber prompt to the shipped package catalog at `config/specialists/transcriber.specialist.json`. v1.6.0 uses `openai-codex/gpt-5.3-codex`, title-derived transcript/analysis filenames, narrow subtitle language extraction to avoid YouTube 429 fanout, immediate section-by-section writes, dense technical `DETAILED SECTION ANALYSIS`, `TECHNICAL EXTRACTION TABLES`, and a coverage/quality audit to prevent shallow “2-line per 5 minutes” outputs (`unitAI-jfw26`).
- **`sp log` runtime/provenance stream** — new operator-facing log command for specialist runtime debugging. It reads `observability.db`, shows dispatch/control/status/error/auto-commit provenance separate from `sp feed`, supports `--json` NDJSON for full payloads, `--follow`, `--since`, `--limit`, job/bead/specialist/node filters, and `--all-events` for raw feed-like internals (`unitAI-gqpvw`, `unitAI-vfqgq`).
- **`sp log` parent-directory/global mode** — when run outside a repo root with no local specialists DB, `sp log` discovers immediate child repos containing `.specialists/db/observability.db` and aggregates their runtime rows as one global log; `--repo <name>` narrows output to a single child repo (`unitAI-v5xfu`).
- **`obligations-scanner` specialist** (NEW) — READ_ONLY, cheap (`openai-codex/gpt-5.4-mini`, `bare: true`, ~30s target) pre-review marker scan. Scans executor/debugger diffs for newly-introduced `TODO`/`FIXME`/`HACK`/`XXX`/`TEMP`/`WIP`/`NOTE(release)` markers in production code. Distinguishes production vs test/fixture surfaces. Recognizes structured `// TODO(<bead-id>): reason` format and treats it as TRACKED when the linked bead is open. Verdict: `CLEAN | OBLIGATIONS_FOUND | BLOCKED` with a JSON `output_schema` the reviewer consumes directly. Iron-style obligations tracking (`unitAI-kglvm.3`).
- **`docs/design/iron-review-hardening.html`** — design doc visualizing the new pipeline (SCRUTINY taxonomy, old-vs-new chain flow, per-specialist changes, git-state precondition, manual execution plan). Mirrored to `~/second-mind/1-projects/Mercury/` for sync (`unitAI-fpwbr`, `unitAI-1n56e`, `unitAI-ejdi1`).
- **`service-skills-sync` specialist (NEW, package tier).** Promotes the Service Skills Librarian (previously a market-data user-tier override) to a shipped package specialist at `config/specialists/service-skills-sync.specialist.json`. MEDIUM, `openai-codex/gpt-5.4-mini`; keeps per-service expert-persona `SKILL.md` docs in sync with code drift using gitnexus (`detect_changes`/`impact`/`context`) + Serena, gated by a `drift_detector.py` pre-scan. The per-service knowledge layer the future devops agent reads (DevOps PRD §7.1) (`unitAI-g8zr3`).
- **`researcher` specialist v1.2.0 → v1.3.0 — general-web pipeline (Mode 4).** Adds a fourth research mode closing the web-research gap (previously the researcher reached library docs/repos/code/social but had no general web search or arbitrary-URL read): `ddgs` (DuckDuckGo search CLI, no API key — `uv tool install ddgs`) discovers authoritative URLs, then `agent-browser` (native Rust CLI + Chrome daemon — `npm i -g agent-browser`) reads any URL including JS-rendered pages. Documented in `prompt.system` Mode 4 + `config/mandatory-rules/research-tool-routing.md`. `capabilities.external_commands` deliberately left empty — it is a hard pre-run gate (`runner.ts validateBeforeRun` throws on a missing PATH binary), so declaring these heavy tools would break the shipped researcher in projects without them; documented as available-on-demand with install hints instead (`unitAI-qgvld`).
- **`notes_mode` specialist field + markdown-native 3-state handoff.** New top-level `notes_mode` enum (`full-trail` default | `final-only`) controls how each turn's handoff is persisted to BOTH the input bead notes and `output_file`. The supervisor renders a markdown-native 3-state handoff — `### <specialist> · <model> · [turn N · WAITING]` trail blocks plus a canonical `## <specialist> · <model> · [FINAL · DONE]` block — with the specialist's output verbatim, a single italic metadata footer (empty/zero/unknown fields omitted), and a provider-prefix-stripped model string; no divider rules or emoji. One shared content source feeds bead notes, `output_file`, and `sp result`. `final-only` persists only the canonical FINAL block and overwrites `output_file`, for non-coding/chained pipelines where the next specialist reads the previous one's note or file as input (`unitAI-10y07`, `unitAI-yiazs`).

### Changed
- **`test-runner` specialist — upgraded to the QA failure-routing contract (canon §2.5).** Now prefers exact commands from `test-engineer`/orchestrator and falls back to manifest-detected runners only when none are supplied (clearly labeled as fallback). Classifies every failure by owner — `test_engineer` (test/fixture/harness wrong, or new untested feature), `debugger_or_executor` (missing telemetry / source behavior regression), `infrastructure`, `pre_existing` — and never writes tests or patches source (LOW). Backed by `config/mandatory-rules/test-runner-execution-scope.md` (`unitAI-sfwe1.2`).
- **`reviewer` specialist — refactored to phase-2-only (seconder fusion, canon §2.3).** The phase-1 compliance/scope check now lives in `seconder`'s `scope_verdict`; the reviewer keeps only phase-2 (adversarial deep code-quality audit + machine-readable Release Checklist + ddiff re-review on PARTIAL) and treats a `seconder` PASS as the upstream scope gate. Two-phase framing removed from the prompt (`unitAI-4e194`, `unitAI-sowpa`).
- **13 chain-template formulas rewired for the canonical QA pipeline.** Every production-diff template (`code-standard`, `code-with-advisors`, `debug`, `security-deep`, `restitch`) now wires `writer → seconder → test-engineer → test-runner → [security-auditor if sensitive] → obligations-scanner → reviewer` (canon §2.1) — `code-sanity` renamed to `seconder`, `test-engineer` + `test-runner` inserted. README overlay table + roadmap Opp 14/15 status updated (`unitAI-f9kku`).
- **`using-specialists-v3` skill — canonical seconder-fusion pipeline.** SKILL.md now teaches `writer → seconder → test-engineer → test-runner → [security] → obligations → reviewer`, the QA failure-routing matrix (§2.5), and SCRUTINY reframed as a **chain property that modulates structure, not quality** (§2.2) — including the `none` tier for read-only chains and the required-at-creation rule. `seconder` replaces the `code-sanity` seconder slot; reviewer documented as phase-2-only (`unitAI-096re`, folds `unitAI-sfwe1.3`).
- **`sp log` human output is leaner and calmer.** Default output now hides agent-internal turn/tool/text/thinking/token rows already covered by `sp feed`, keeps runtime-owned rows only, collapses repo/path/branch/worktree metadata into one compact `worktree=<repo>/<worktree>` field, uses a restrained professional color palette (dim metadata, plain job ids, bold specialist names, color-coded `status=<state>`, green/yellow/red/cyan only for semantic state), and collapses adjacent duplicate display rows caused by duplicated runtime events while preserving full payloads in `--json` (`unitAI-vfqgq`, `unitAI-npjlq`, `unitAI-f5k0p`).
- **`reviewer` specialist — Iron-inspired prompt overhaul.** Five new system-prompt sections, additions only (existing source-of-truth priority and AUTHORITATIVE REVIEW CONTEXT preserved verbatim) (`unitAI-kglvm.1`):
  - **SCRUTINY tier behavior** (`low | medium | high | critical`) — reads field from bead contract; defaults to `medium`; tiers reviewer depth from seconder-only spot-check (low) through file-by-file sign-off with mandatory `gitnexus_impact` (high) to required second-opinion (critical).
  - **Scrutiny auto-escalation** — surface-pattern floor table raises level regardless of bead's stated SCRUTINY when diff touches `auth/*`, `**/credentials*`, `**/token*` (→ high), `config/specialists/*.json` (→ high), `src/specialist/{runner,schema}.ts` (→ high), `**/*.lock` (→ medium + security-auditor required), `migrations/**` (→ high), `src/permissions/*` / `hooks/**` (→ critical). Author's level is a floor, not a ceiling.
  - **Re-review after PARTIAL (Ddiff mode)** — when re-reviewing a fixed PARTIAL, scope to delta since prior verdict, carry forward prior approvals, audit only newly-touched files/symbols.
  - **Obligations scan** — consumes `obligations-scanner` JSON output if present, else scans diff inline; production markers → PARTIAL unless accepted via bead `NON_GOALS` or structured `// TODO(<bead-id>):` reference; test/fixture markers noted but not blocking.
  - **Release Checklist** (REQUIRED) — machine-readable block appended to every verdict for future `sp merge` enforcement.
- **`executor` and `debugger` specialists — Obligations discipline.** New system-prompt section instructs both codegen specialists to avoid introducing in-code obligation markers in production paths by default; if work is genuinely deferred, file a follow-up bead via `bd create --deps discovered-from:<current>`; if a marker is truly needed at a code site, use structured form `// TODO(<follow-up-bead-id>): <reason>` where the linked bead is open and listed in current bead's `NON_GOALS`. Prevents PARTIAL fix-loops from the new obligations-scanner gate. Test/fixture paths exempt (`unitAI-kglvm.4`).
- **`using-specialists-v3` skill: v3.4 → v3.5 (Iron-style orchestration).** Substantial restructure aligned with the above specialist changes (`unitAI-kglvm.5`):
  - "Advisory Passes" section reframed as three mandatory gates: **Seconder Gate** (`code-sanity`), **Security Gate** (`security-auditor` on sensitive surfaces), **Obligations Gate** (`obligations-scanner`). Skip rules tightened.
  - NEW **SCRUTINY taxonomy** section: tier behavior + auto-escalation surface table. SCRUTINY field added to task/epic, executor, reviewer bead contract templates.
  - NEW **Git State Precondition** section: four-check pre-flight (working tree clean, HEAD contains prior chain commits, no orphaned worktrees, in-sync integration branch) required before dispatching any chain that depends on prior chain output. Strictness-by-scenario table.
  - **Rule #9 INVERTED**: manual git workflow is now canonical; `sp merge` and `sp epic merge` are PROHIBITED (known broken, awaiting separate rework epic). Cherry-Pick Playbook promoted to canonical multi-chain merge path. `sp finalize` removed from documented orchestrator workflow.
  - **Rule #13 exception clause** added for epics that restructure the specialists themselves (operator-authorized manual-orchestrator-direct work).
  - **Rule #14 NEW**: Git State Precondition reference.
  - `obligations-scanner` row added to Choosing The Specialist table. `parallel-review` marked deprecated.
  - Escalation Matrix and Failure Recovery tables rewritten: sp-merge rows replaced with git-workflow recovery patterns (stale `.git/index.lock`, `info/exclude` vs tracked beads file, FF-via-`git update-ref` when checkout blocked).
- **CLAUDE.md "Common gotchas" section rewritten** to match the new canonical: manual merge, explicit `sp stop` for keep-alive cleanup, Iron-style gates mandatory, Git State Precondition, bd auto-export churn handling, package-tier specialist edits via direct JSON.
- **`bd` auto-export pain fix.** `bd config set export.git-add false` disables per-write auto-staging of `.beads/issues.jsonl` (silent mid-work; no checkout aborts; no `.git/index.lock` races). Paired with a custom block added to `.git/hooks/pre-commit` AFTER bd's managed markers — runs `git add -f .beads/issues.jsonl` so commits naturally include the fresh JSONL snapshot via the existing pre-commit hook chain. Eliminates the runaway `chore(beads): export state` commits that plagued every multi-bd-op session. Verified end-to-end in this repo (commits `63ac83f6`, `4c1f19a5`, `1e014f33`) (`unitAI-mg18o`).
- **`output_file` decoupled from `SPECIALISTS_JOB_FILE_OUTPUT`.** A specialist that sets `output_file` now always writes its full result — foreground and `--background` (tmux) — independent of the env flag, which now only gates the debug file-mirrors (`events.jsonl` / `status.json` / `result.txt`). Previously `--background` (tmux) runs silently dropped `output_file` because the env var did not propagate into the tmux session. The single-writer invariant is preserved (the supervisor owns the file in supervised runs; `suppressRunnerFileOutput` still skips the runner write), and `.specialists/*-result.md` was added to `.gitignore` since specs with `output_file` now always write. `output_file`, `notes_mode`, and the handoff envelope are documented in `docs/authoring.md` and the `specialists-creator` skill (`unitAI-f58ma`, `unitAI-g8rqg`).

### Removed
- **`code-sanity` specialist removed — superseded by `seconder`.** The Iron seconder gate (briefly promoted as `code-sanity` mid-cycle, `unitAI-kglvm.2`) is replaced by the new `seconder` specialist, which fuses its code-quality smell pass with the reviewer's old phase-1 scope check into one dual-verdict gate (canon §2.3). `config/specialists/code-sanity.specialist.json` deleted; all operational references across the v3/auto/v2 skills, `reviewer.specialist.json`, chain-template formula prose, and `docs/specialists-catalog.md` renamed to `seconder`. Two historical lineage notes preserved (`seconder.specialist.json`'s absorbed-mandate section + the v3 SKILL §2.3 fusion explanation) (`unitAI-321ir`, `unitAI-4e194`).
- `sp merge` / `sp epic merge` / `sp finalize` removed from documented orchestrator workflow in `using-specialists-v3`. Commands still exist in the `sp` binary (no source-code removal) but the skill explicitly prohibits their use pending a separate rework epic. Operators reaching for them should use the documented manual git workflow instead.

### Changed (prior)
- All 17 package-shipped specialists in `config/specialists/` now declare the v3.16.0 schema additions explicitly: `execution.bare: false` and `prompt.system_prompt_mode: "append"`. Values match the previous absent-field defaults — pure-mechanical, zero behavior change — but every shipped spec is now self-documenting at the schema level instead of relying on per-runner legacy fallbacks. `bare.specialist.json` retains its explicit `bare: true` + `replace` (`unitAI-51r2w`).

### Fixed
- **`seconder --job` now receives the writer diff.** Reused worktree dispatches populate the existing `$writer_diff` template variable from the same bounded branch/staged/unstaged diff source used by reviewer diff injection, so seconder can make concrete scope/quality verdicts without orchestrator-pasted evidence (`unitAI-bycl3`).
- `sp stop` / `sp resume` control-plane actions now treat observability writes as best-effort: status/control telemetry failures no longer prevent SIGTERM delivery or falsely report a delivered resume as a steer-pipe write failure (`unitAI-dkhi3`).
- OSV scan now resolves `GHSA-q8mj-m7cp-5q26` by overriding all `qs` lockfile entries to `6.15.2`; `bun.lock` no longer contains vulnerable `qs@6.15.1` entries (`unitAI-dkhi3`).
- Supervisor status reads now reconcile dead `starting`/`running` specialist jobs to terminal `error` with a `run_complete(ERROR)` event, so reviewer crashes during heavy bash validation no longer leave `sp ps`/`sp result` stuck on stale `running` rows (`unitAI-6x6p6`, `unitAI-uzyut`).
- **Per-turn handoff notes now append instead of replace.** `appendBeadNote` called `bd update --notes` (whole-field replace), so each per-turn specialist handoff clobbered the previous one — multi-turn jobs left only the last (often empty) note on the bead, recoverable only from `observability.db`. Switched to `bd update --append-notes` and exported `formatBeadNotes`. (The appended handoff format was subsequently finalized to the markdown-native 3-state form — see the `notes_mode` entry under Added.) Tests in `bead-notes.test.ts` + new `supervisor-bead-notes.test.ts` (sibling, since `supervisor.test.ts` is excluded from the default run) (`unitAI-sx5qk`).
- **`[FINAL · DONE]` handoff block now emitted on `sp stop` for keep-alive jobs.** The canonical FINAL block was silently skipped on the dominant keep-alive→`sp stop` path because `src/specialist/control.ts` constructed the `Supervisor` without a `beadsClient`, so `finalizeWaitingJob`'s `bead_id && beadsClient` guard never fired; `stopJob` also never invoked `finalizeWaitingJob` for `waiting` jobs. Both fixed, and keep-alive turn summaries skip the duplicate non-final done write, so a keep-alive run yields one `[turn N · WAITING]` per turn plus one `[FINAL · DONE]` at stop (`unitAI-mis38`).

## [v3.16.0] — 2026-05-23

### Added
- `sp attach` now opens a chat-style TUI for active specialist jobs, including bare-picker launch and explicit `sp attach <job-id>` attach flows.
- `sp chat` V1 ships as an interactive TUI for active jobs with `@earendil-works/pi-tui`, full keyboard input, and feed parity (`unitAI-u4fdd`).
- `execution.bare` adds zero-runtime-injection package-class specialists plus `bare.specialist.json` template support (`unitAI-rz0cp`).
- `docs/bare-specialists.md` documents bare specialists and package-class runtime behavior (`unitAI-w8t6y`).

### Changed
- `prompt.system_prompt_mode` now supports `append` and `replace` across both runner paths (`unitAI-qngis`).
- `specialists-creator` v1.4.0 adds a Bare specialists section, mandatory_rules layering, and script-class vs package-class runtime split guidance (`unitAI-dp0rw`, `unitAI-w8t6y`).

### Fixed
- Bare `sp attach` now has a real keyboard picker: Up/Down moves the highlighted active job and Enter attaches it.
- Attach targets are limited to active jobs (`running`, `waiting`, `starting`); terminal jobs are hidden from the picker and rejected when requested explicitly.
- Waiting-job attach input now uses live status/fifo data and sends resume/follow-up instead of stale `steer`; duplicate submit guards prevent double-resume busy errors.

### Security
- Pin `idna` above OSV advisory (`f7599a22`).

## [v3.15.4] — 2026-05-21

### Added
- `src/pi/session.ts` pre-spawn `serena-pool` hook: dynamically imports `ensureSerenaForRoot` from the globally installed `@jaggerxtrm/pi-extensions/extensions/serena-pool` (Bun loader) and injects `SERENA_MCP_PORT` into the pi child's `baseEnv` before spawn. `pi-serena-tools` reads the port at construction time and reuses the shared per-repo-root daemon instead of spawning its own on a random port (`unitAI-v0wpf`, `unitAI-ij37x`).
- E2E validation under linked global `sp`: single Serena per worktree on deterministic port, distinct ports across worktrees of the same repo, Serena-disabled specialists confirmed no-op, no random-port duplicate spawns (`unitAI-3gjgh`).

### Changed
- Read-only specialists no longer load Serena: `code-sanity`, `explorer`, `overthinker`, `changelog-drafter` set `execution.extensions.serena=false` and remove the `serena-cheatsheet` template_set where present. Saves ~80–150 MB resident per invocation. Phase 1 of the LSP overhead reduction epic (`unitAI-kg4t9`, `unitAI-c4g0m`).
- `docs/design/conversations.md` absorbs validated patterns from Statecraft / Envoy: explicit authority decision procedure (§10.1) with valid/invalid source lists, `system.epoch_bump` message kind for capability change re-read, `provenance_json` column on `conversation_messages`, read/ack separation invariant (cursor-through-N), authority-lane-per-participant invariant, `cannot_emit` spec field, structured error envelope (§10.2), and capture pattern for >8KB payloads (`unitAI-0p8w3`).

## [v3.15.3] — 2026-05-19

### Changed
- Expanded `using-specialists-v3` guidance with the full `bd dep --type` relationship vocabulary, duplicate/supersede commands, and typed relationship examples woven through existing specialist workflow flows (`unitAI-ylphl.8`).
- Reframed the workflow catalog epic around an executable `sp workflows` CLI/router and propagated the updated skill mirror across xtrm-managed repos (`unitAI-ylphl`).
- Refreshed README and high-traffic docs for v3.14-v3.15 release drift: first-time install/update flow, package-canonical defaults, current specialist catalog, xtrm-tools relationship, service examples, and stale doc links (`unitAI-xvvqb`).

## [v3.15.2] — 2026-05-14

### Fixed
- `sp ps -f` follow mode now behaves like a terminal dashboard instead of a print loop: TTY output uses alternate-screen in-place redraw with cursor restoration and unchanged-frame dedupe, while piped output is ANSI-free append snapshots with EPIPE-safe shutdown (`unitAI-fqo38`).
- `sp run --background` now works correctly again: the tmux wrapper used `/bin/bash -lc` (login shell) which rebuilt PATH from `/etc/profile` only, stripping NVM/bun from PATH and causing `pi` spawn ENOENT. Changed to `/bin/bash -c` so the wrapper inherits the parent process PATH (`unitAI-baz0t`).

## [v3.15.1] — 2026-05-14

### Changed
- `sp prune-stale-defaults` now removes all `.specialists/default/` entries — both byte-identical and diverged — by default, since the entire default tier is drift debt relative to the package-canonical source. Use `--keep-diverged` to retain the old conservative behavior of pruning only redundant (byte-identical) entries (`unitAI-4vuvd`).
- `sp init --sync-defaults` is now deprecated and prints a loud drift-debt warning pointing operators to `sp pin <id>` for intentional version pins. Doctor wording updated to match new `DriftStatus` names (`unitAI-3yys6`).

### Fixed
- `sp list-rules` now includes the package-canonical mandatory-rules tier in its matrix, so a fresh npm install no longer reports 0 rules. The resolver calls `resolveCanonicalAssetDir('mandatory-rules')` as the lowest-priority fallback, matching the actual runner resolution order (`unitAI-5s8df`).

## [v3.15.0] — 2026-05-14

### Added
- `LICENSE` file at repo root — MIT, 2026 copyright `Dawid (Jaggerxtrm)`. Now ships in the npm payload (asserted by the package-payload CI gate). README badge ↔ ship parity restored (`unitAI-3m27y`).
- `package.json` top-level `types` field pointing at `dist/types/lib.d.ts` — TS consumers can now import `@jaggerxtrm/specialists/lib` with type resolution from the root (`unitAI-3m27y`).
- `dist/asset-contract.json` — deterministic, byte-identical-on-regen manifest of every asset specialists ships: `schema_version`, `package_version`, sha256-hashed `shipped_skills` / `shipped_specialists` / `shipped_mandatory_rules` / `shipped_catalogs` / `shipped_nodes` / `shipped_hooks`. Generator at `scripts/generate-asset-contract.mjs` (npm script `generate:contract`). Manifest excludes wall-clock timestamps so xtrm-tools can verify its vendor mirror by sha-comparison instead of a hand-maintained vendor list (`unitAI-cww2s`).
- `.github/workflows/release-gate.yml` — fires on push to master + manual `workflow_dispatch`. paths-filter detects cross-repo asset path changes; regenerates `dist/asset-contract.json` and asserts byte-equality against the committed copy (fails on drift with a clear remediation command); fires `repository_dispatch` to `Jaggerxtrm/xtrm-tools` with `event_type=specialists-asset-validation` and `client_payload` containing the specialists git SHA + tag. Requires `XTRM_TOOLS_DISPATCH_PAT` repo secret (`unitAI-dnqas`).
- `sp merge --target-branch <name>` flag — rebase target override for chains forked from non-`origin/HEAD` branches. Threaded through `parseOptions`, `resolveDefaultBranchName`, `isBranchAlreadyPublished`, `previewBranchMergeDelta`, `rebaseBranchOntoMaster`, `assertBranchMergeWorthiness`, `runMergePlan` in both `sp merge` and `sp epic merge`. Validated via `git rev-parse --verify <branch>^{commit}` before use. Backward-compatible — missing flag preserves current `origin/HEAD` behavior. Retires the xtrm-nr05 cherry-pick playbook for non-main-fork chains (`unitAI-a6e60`).
- `sp clean --reap-orphans` adds a third detection reason: `dead-toolchain`. Surfaces specialist jobs whose PID is alive but `ppid != 1` and which haven't emitted any `tool` or `think` event in the last 30 minutes while status is `running` or `waiting`. Closes the market-data zombie-job pattern (jobs 525851 / 89ab98) where supervisor `stall_timeout_ms` missed the case. Powered by new `ObservabilitySqliteClient.getLastActivityTimestampMs(jobId)` reading `MAX(t) FROM specialist_events WHERE type IN ('tool', 'think')` (`unitAI-wq0mw`).
- `sp list-rules` now shows `.specialists/user/mandatory-rules` as the highest-priority overlay tier in the matrix (matches the runner's actual resolution order). `docs/surface-ownership.md` + `config/mandatory-rules/README.md` synced to document the user-overlay tier alongside specialist user overrides (`unitAI-7ezse`).

- `sp clean --reap-orphans` now also detects stale specialist jobs: dead-pid (DB row in `starting`/`running`/`waiting` whose PID is gone) and orphaned-keep-alive (alive PID with `ppid=1` and `specialists run`/`sp run` cmdline). Both gated by a 30-minute min-age threshold to avoid racing in-progress jobs. Dry-run prints `jobId`, `pid`, `beadId`, `specialist`, `cwd`, `ageMs`, `reason`. Apply mode SIGTERMs alive stale processes and marks the DB row `cancelled` with a `stale-reaper:<reason>` note — observability history preserved (`unitAI-8tm35`).
- `sp feed <job-id>` now replays full DB event history from `observability.db` in seq order for snapshot mode, with `--limit` still capping output and `--follow` unchanged.
- CI workflow `.github/workflows/package-payload.yml` — runs on PRs touching `package.json`, `src/`, `config/`, `dist/`, the assert script, or the workflow itself. Two jobs: `payload-contract` runs `npm pack --dry-run --json` through `scripts/assert-package-payload.sh` against a required asset list (dist entrypoints, `config/specialists/{executor,reviewer}.specialist.json`, `config/mandatory-rules/{executor-delivery,index}`, `config/skills/using-specialists-v3/SKILL.md`, `config/catalog/{index,native,gitnexus,serena}.json`); `packed-smoke` builds, packs, installs the tarball to an isolated `/tmp/sp-smoke-prefix`, and exercises `sp --version` / `doctor --check-drift` / `prune-stale-defaults --dry-run` / `clean --dry-run` / `list --compact` (`unitAI-1j9om` / `unitAI-bf7qw`).
- `scripts/assert-package-payload.sh` — bash helper, `set -euo pipefail`, exits non-zero with explicit missing-asset list when a required path is absent from the dry-run pack JSON.
- New skill `config/skills/using-specialists-auto/` (v1.0) — operator-offline paranoid autonomous orchestration mode for multi-item release runs. Codifies per-role sleep cadence, pre-merge ritual, reviewer rebuttal pattern, dist-rebuild-per-P0 discipline, batch memory-gate close loop, and escalation criteria. Activates on "auto mode", "go", "run autonomously", or similar handover phrasing.
- `sp ps` process-health dashboard — reports Linux `/proc` health above the job dashboard: aggregate specialist process count, Dolt sql-server count, Serena LSP workspaces, orphan count, RSS, CPU, age, MemAvailable thresholds, and JSON `process_health` output. Detailed per-process rows are available via `sp ps --health` (`unitAI-uof0t`).
- `sp clean --ps` soft-clean workflow — hides terminal dashboard history from default `sp ps` with `ps_hidden_at` / `ps_hidden_reason` metadata while preserving SQLite audit history; `sp ps --include-cleaned` and `sp ps --all` restore audit visibility (`unitAI-59nry`).
- `sp clean --reap-orphans` flag — kills leaked dolt/gitnexus/pi processes by walking `/proc`. Matches three orphan classes: `dolt sql-server` whose cwd is under `*/.worktrees/*`, `gitnexus mcp` orphaned to PID 1, `pi`/`pi-coding-agent` orphaned to PID 1. SIGTERM + 1.5s grace + SIGKILL escalation. Linux-only (depends on `/proc`). Combine with `--dry-run` for safe preview (`unitAI-85xxp`).
- `template_field_misuse` error_type returned by `runScriptSpecialist` when `input.template` is the literal name of a key on `spec.prompt` (e.g. `task_template`, `normalize_template`, `system`) instead of a template body — catches the production bug where consumers pass a key name and the service treats it as a 13-char prompt (`unitAI-i6khn`).
- Reference Python client at `clients/python/` — stdlib-only, ~170 LOC, with `pyproject.toml` and live-service smoke tests. Mirrors the closed `error_type` taxonomy 1:1 plus a caller-side `transport` value (`unitAI-huwov`).
- `execution.expected_output_keys: string[]` on script-class specs — triggers a required-keys check independent of `response_format`, so text-format specs that ship a JSON contract inline in `task_template` get `error_type: "invalid_json"` on hallucinated key sets instead of saving corrupt output. Documented in `docs/authoring.md` and `docs/examples/smoke-echo-text-expected-keys.specialist.json` (`unitAI-31kwe`).
- Dockerfile-level `HEALTHCHECK` (node-fetch on `/healthz`, port 8000, 30s interval) — operators inheriting the image get container health reporting for free; explicit compose-level `healthcheck:` is now only needed when overriding the listen port (`unitAI-cnlea`).

### Fixed
- `sp feed -f` (global follow mode, no specific job-id) no longer hangs indefinitely when keep-alive `waiting` jobs remain in the dashboard. `followMerged()` now treats keep-alive `waiting` as terminal-equivalent for exit purposes in global mode. Per-job follow (`sp feed <id> -f`) keeps tracking across `sp resume` turns. `--forever` still overrides for daemon-style usage. Closes GH#76 reported by `Rico1109` (`unitAI-032n4`).
- `sp merge` `bunx tsc --noEmit` post-merge gate no longer false-positives on repos without a `tsconfig.json` (markdown / notes / non-TypeScript projects). `runTypecheckGate` in `src/cli/merge.ts` now checks for tsconfig existence and prints `TypeScript gate: skipped (no tsconfig)` when absent, instead of treating tsc's help-text exit as a merge failure. Closes GH#71 (`unitAI-dpf3a`).
- `sp feed <job-id>` snapshot mode now replays full event history for that job from `observability.db` instead of truncating to the last ~8 events. `queryTimeline` / `readAllJobEvents` use a jobId-scoped DB read path when `filter.jobId` is set (instead of `listStatuses` → filter, which silently dropped events). Reviewers running the documented `sp feed <reviewed_job_id>` audit path now actually see executor's `gitnexus_*` tool events; the previous behavior was the structural cause of the reviewer "missing tool-event evidence" false-PARTIAL pattern that plagued multi-session orchestration. Cleaner `job <id> not found in .specialists/db/observability.db` message replaces the generic `No jobs directory found.` (`unitAI-889dv`).
- `sp merge` `MERGE_DIRTY_IGNORE_PREFIXES` extended with `.beads/` and `.xtrm/skills/active/` — `sp merge` no longer refuses on dirty main when only bd auto-export (`.beads/issues.jsonl`) or gitnexus stat refresh (`.xtrm/skills/active/**`) noise dirties the tree. Existing `.xtrm/reports/`, `.wolf/`, `.specialists/jobs/`, `dist/` entries unchanged. Hit 8× per multi-chain session before the fix (`unitAI-pqe96`).
- `sp run --background` detached spawn now pipes child stderr (`stdio: ['ignore', 'ignore', 'pipe']`) and forwards it to the parent's stderr, with non-zero exit when the child fails before writing a jobId. Operators no longer see only the generic `Warning: job started but ID not yet available` when the dispatch was refused by the epic-guard or stale-base check — the actual refusal reason surfaces. tmux dispatch path unchanged (tmux captures its own stderr in pane) (`unitAI-xbofm`).
- `sp doctor` Category A check now validates the flat `.xtrm/skills/active/<skill>` symlink layout that `sp init` writes, instead of the scoped `active/claude/<skill>` + `active/pi/<skill>` layout that no longer exists. Loop over `['claude', 'pi']` removed; `.claude/skills` and `.pi/skills` are now expected to symlink directly to `.xtrm/skills/active`. Fresh `sp init` followed by `sp doctor` no longer reports 4 false-positive Category A failures on first run (`unitAI-5voar`).
- `package.json` `files` allowlist tightened to explicit subdirs (`config/specialists/`, `config/mandatory-rules/`, `config/skills/`, `config/catalog/`, `config/nodes/`, `config/hooks/`, `config/presets.json`, plus `LICENSE`). `.npmignore` additionally excludes `config/benchmarks/` and `config/skills/**/evals/`. Payload shrank 258 → 256 files; dev artifacts (benchmarks, evals) no longer ship. CI `package-payload.yml` now asserts `LICENSE` is present (`unitAI-3m27y`).
- Reviewer injected-diff sources (`buildInjectedReviewerDiffVariables` in `src/cli/run.ts`) now filter each source's `files[]` against `AUTO_COMMIT_NOISE_PREFIXES` (`.xtrm/`, `.wolf/`, `.specialists/jobs/`, `.beads/`) before the empty-source fall-through. Noise-only unstaged files (e.g. `.xtrm/SKILL.md` from gitnexus stat refresh) no longer shadow the real branch-vs-base diff. Combined with `unitAI-889dv` (full DB replay), this fully retires the reviewer false-PARTIAL pattern that doubled review-turn counts (`unitAI-lqsha`).
- Reviewer specialist (`config/specialists/reviewer.specialist.json`) blast-radius gate relaxed to accept multiple evidence forms: `gitnexus_impact` event, pre-injected `$gitnexus_summary` block, `gitnexus_detect_changes` event, or LOW `impact_report.highest_risk` in `sp result`. Reviewer only flags a real gap when NONE present AND the diff touches MEDIUM+ surface (auth/secrets/input/public API/schema/control flow/framework). Safety net post-`889dv`'s structural fix (`unitAI-6fsxp`).
- Researcher specialist (`config/specialists/researcher.specialist.json`) consolidated and v-bumped 1.1.0 → 1.2.0. Model: `nano-gpt/qwen/qwen3.5-397b-a17b-thinking` → `openai-codex/gpt-5.4-mini` (qwen3.5-thinking documented to flail with parallel-rejected tool calls; gpt-5.4-mini matches executor's choice — proven for tool-heavy Bash CLI workloads); fallback `google-gemini-cli/gemini-3.1-pro-preview` (long-context fallback for research synthesis). Description rewritten with aggressive "DISPATCH BEFORE answering any library/API/framework/CLI question from training data" framing. System prompt consolidated to 3-mode structure (Targeted / Discovery / Media); skills list reduced from 4 to 1 (the 3 dropped skills — `find-docs`, `deepwiki`, `github-search` — were 100% duplicates of inlined prompt content; saves ~3-4k tokens per dispatch). `mandatory_rules` adds `per-turn-handoff-schema`. Stale `.specialists/user/researcher.specialist.json` overlay removed.
- All specialists swapped off `anthropic/claude-*` models — operator environments without Anthropic API access can now dispatch every specialist without silent dispatch failures. Three specialists had Claude as PRIMARY and were fully broken: `test-runner` (`claude-haiku-4-5` → `openai-codex/gpt-5.4-mini`), `specialists-creator` (`claude-sonnet-4-6` → `openai-codex/gpt-5.5`), `xt-merge` (`claude-sonnet-4-6` → `openai-codex/gpt-5.4-mini`). Six others had Claude as fallback (silent never-fire on primary failure): `overthinker`, `executor`, `changelog-keeper`, `node-coordinator` now fall back to `google-gemini-cli/gemini-3.1-pro-preview`; `explorer`, `changelog-drafter` fall back to `google-gemini-cli/gemini-3-flash-preview`. Final provider distribution: 12 specialists primary on openai-codex, 2 on nano-gpt/glm-5, 0 on anthropic — fallback diversity via gemini + glm.
- `sp init --help`, `sp clean --help`, `sp merge --help`, `sp finalize --help`, `sp doctor --help` refreshed to reflect post-`vwrnq`/`usj9y`/`8tm35`/`wq0mw`/`amzec`/`a6e60`/`pqe96` drift: sp init notes Bun runtime + ordered xtrm-tools install; sp clean documents `--reap-orphans` `dead-toolchain` reason; sp merge usage includes `--target-branch <name>` + auto-ignore note; sp finalize notes SQLite-first verdict read + cascade; sp doctor notes `--check-drift` Category A scope (`unitAI-3r268`).
- `sp finalize <job-id>` now succeeds when reviewer PASS verdict is persisted in SQLite even if `result.txt` was never written. Root cause: `SPECIALISTS_JOB_FILE_OUTPUT` defaults to `off`, so `<jobsDir>/<reviewer-id>/result.txt` never existed for `--job`-launched reviewers; `supervisor.readResult` only checked the file path; the PASS regex never matched. Fix: `supervisor.readResult` now reads `specialist_results.output` via `withSqliteOperation('readResult', ...)` first, falls back to the file. Eliminates the operator-override pattern that required `sp stop <exec>` + manual cleanup after every reviewer PASS dispatched via `--job` (`unitAI-amzec`).
- Executor specialist prompt no longer instructs broad `git add -A` staging. Workflow Step 5 now reads "Prefer runtime `auto_commit: checkpoint_on_waiting`; when manual staging is needed, use explicit paths only". Testing Awareness adds an explicit ban on staging `.beads/`, `.xtrm/`, `.wolf/`, `.specialists/jobs/`, `.pi/`. Self-Review adds a `git diff --cached --name-only` vs bead SCOPE check. Closes the silent-worktree-index-contamination class that broke `mercury-market-data .beads` via PR #103 on 2026-05-11 (`unitAI-dmu9q`).
- `sp init` now prints actionable, ordered recovery commands when the xtrm prerequisite is missing. Two distinct error paths: missing `xt` CLI → "install xtrm-tools globally → xt install → xt init → verify"; present `xt` CLI but missing `.xtrm/` → "run xt init in this repo → verify". `package.json` adds an underscore-prefixed `_runtime_prerequisites.xtrm-tools` field documenting the requirement without adding an npm dependency. README quickstart, `src/cli/quickstart.ts` step 1, `docs/installation.md`, and `docs/bootstrap.md` now declare the ordered install path Bun → xtrm-tools → xt install → xt init → @jaggerxtrm/specialists → sp init. `sp list`, `sp doctor --check-drift`, and `sp prune-stale-defaults` are documented as Category A commands that do not require `xt` or `.xtrm/` (`unitAI-usj9y`, audit `unitAI-go847`, docs `unitAI-6xm0f`).
- Tool catalog is now package-canonical at `config/catalog/` (was `.specialists/catalog/`). `loadSharedToolCatalogIndex` in `src/pi/session.ts` tries cwd `.specialists/catalog/index.json` first (user override path — created on demand) and falls back to `resolveCanonicalAssetDir('catalog')/index.json` from the installed package. Eliminates the silent-tool-policy-degrade that occurred for npm-installed users without a source checkout — verified by `sp list` working from a non-repo cwd. `docs/installation.md` Category A list now explicitly names `config/catalog/`. File history preserved via `git mv` (`unitAI-jj7hy`).
- AGENTS.md Specialists block is now wrapped in `<!-- specialists:start --> ... <!-- specialists:end -->` HTML sentinels, making `sp init` re-runs fully idempotent. `ensureAgentsMd` has four branches: file missing → write block; sentinels present → byte-identical replace (no-op when unchanged); legacy `## Specialists` marker but no sentinels → migrate by parsing from marker to next H2 / EOF and replacing the full legacy span; neither → append. `README.md` line 82 no longer falsely claims `sp init` injects `CLAUDE.md` (it never did; the line was a 2026-05 audit finding) (`unitAI-sgw9g`, audit `unitAI-3o3gf`).
- `package.json` declares `engines.bun: ">=1.0.0"` (was `node: ">=16.0.0"` which was misleading — the built `dist/index.js` is `bun build --target=bun` with `#!/usr/bin/env bun` shebang and uses bun-only APIs). `src/index.ts` adds an early `globalThis.Bun` runtime guard that prints an actionable error with the `https://bun.sh/install` URL and exits non-zero — defense in depth for code paths where Bun is technically available but the import sequence runs before the shebang takes effect. README quick start, `src/cli/quickstart.ts`, and `docs/installation.md` now declare Bun as a runtime prerequisite (`unitAI-vwrnq`).
- `sp ps` process-health specialist count no longer treats Serena/GitNexus MCP servers, tsserver, shell wrappers, or generic tooling as specialist jobs. The count is now intentionally narrow: direct `sp/specialists run` commands and pi-coding-agent processes only. Unknown `sp ps` flags now fail fast; `sp ps --ps` points operators to `sp clean --ps` (`unitAI-f2vhd`).
- `sp ps` no longer defaults to raw historical terminal rows. The default dashboard shows active jobs plus unresolved terminal problems, detailed process tables require `--health`, and Dolt/orphan regressions raise WARN instead of a false OK (`unitAI-0wbhi`, `unitAI-eeiza`, `unitAI-59nry`).
- `sp clean --reap-orphans` also detects deleted-cwd Dolt/tool leaks, covering stale worktree cleanup cases missed by the initial orphan collector (`unitAI-uxpl2`).
- Reviewer evidence collection now surfaces executor GitNexus tool-call evidence: reviewer prompt instructs `sp feed <reviewed_job_id>` fallback, and runner pre-injects `$gitnexus_summary` from the reviewed executor's `run_complete` observability event when dispatched with `--job` (`unitAI-gufaf`).
- `provisionWorktree`: drop the `.beads` dir→symlink swap entirely. Worktree provisioning now `rm -rf <worktree>/.beads` and marks the tracked `.beads/*` paths as `skip-worktree` via the new `markBeadsSkipWorktree` helper. Modern bd 1.0.3 stores `core.hooksPath` as an absolute parent path at `bd init`, so the worktree inherits parent hooks via shared git config — no on-disk `.beads/` is needed, and bd resolves the DB via git common-dir. Removes a serious merge hazard: any branch carrying the worktree-local `.beads` symlink (mode 120000) wipes the parent's `.beads/` on squash-merge into main (real incident: projects/infra PR #39, 2026-05-12). Removes now-unused `readFileSync`/`writeFileSync` imports. Supersedes `unitAI-u08e8` / `xtrm-nsca`. The xtrm-tools `xt end` pre-push guard (`xtrm-w1ip`) stays in place as defense-in-depth for older clones and non-CLI push paths (`unitAI-yvqmf`).
- `provisionWorktree` previously suppressed phantom `.beads/` deletions inside specialist worktree checkpoint commits via `info/exclude` + `skip-worktree`. Now superseded by `unitAI-yvqmf` above (no symlink → no noise to suppress) (`unitAI-u08e8`).
- `sp run --bead <id>` no longer race-spawns duplicate jobs against the same bead+specialist when a keep-alive job is already in `waiting`. The active-job check now includes `waiting` (was `starting`/`running` only), and `sp run` performs an early SQLite pre-flight before the supervisor fork — failing fast with `existing <status> job '<id>' already targets bead '<id>'` plus a hint to resume via `--job <id>` or cancel via `sp stop <id>` (`unitAI-55cb3`).
- `supervisor.handleResumeTurn` now auto-finalizes a keep-alive session when the resume turn produces a PASS-shaped Compliance Verdict — closes the gap that made `sp finalize <id>` necessary after every resume-driven PASS. Initial-turn auto-finalize was already in place; the resume-turn path now mirrors it (`unitAI-y6crh`).
- `supervisor` now triggers `npx gitnexus analyze` immediately after each successful auto-commit checkpoint for MEDIUM/HIGH-permission specialists (was: only at terminal completion). Reviewers/orchestrators inspecting a keep-alive worktree mid-session no longer see stale graph data. Embeddings are preserved when `.gitnexus/meta.json` shows `stats.embeddings > 0` (passes `--embeddings`). Checkpoint-time and terminal-time fires dedupe via `lastGitnexusAnalyzedSha`. Timeline events (`gitnexus_analyze_started` / `gitnexus_analyze_start_failed`) tag `backend` with the source (`checkpoint` / `terminal`) and use the dual-write `appendTimelineEvent` path so they land in `observability.db` regardless of `SPECIALISTS_JOB_FILE_OUTPUT` gating — visible in `sp feed` / `sp result` (`unitAI-hrsvj`).
- `provisionWorktree` (and xt claude / xt pi `launchWorktreeSession` in xtrm-tools) now replaces bd's stub `.beads/` inside new worktrees with a symlink to `<commonRoot>/.beads`. bd's post-checkout/pre-commit/post-merge git hooks (registered via parent's `core.hooksPath = .beads/hooks/`) re-fire on any git operation inside the worktree (notably supervisor's auto-commit checkpoint) and would otherwise re-scaffold a per-worktree `.beads/` + dolt-sql-server (60–200 MB RSS each, plus a process-leak vector on cleanup, plus the user-reported `database 'jaggers_agent_tools' not found` symptom in xtrm-tools). The symlink is preserved by all bd hooks and routes bd inside the worktree to the parent's data — single shared dolt server, shared writes (`unitAI-0wz2p` / `xtrm-as7d`).
- `supervisor.startDetachedGitnexusAnalyze` now invokes `npx gitnexus analyze --skip-agents-md --no-stats` (still passes `--embeddings` when `.gitnexus/meta.json` shows `stats.embeddings > 0`). The graph is still re-indexed (downstream `gitnexus_impact`/`context` queries see fresh data), but the AGENTS.md/CLAUDE.md edit pass and stat-block refresh are skipped — these would dirty the worktree branch on every checkpoint and cause noisy auto-commit churn.
- `pi/session.ts` no longer leaks `gitnexus mcp` / `serena mcp` child processes when a `--keep-alive` specialist is cancelled or torn down. `pi` is now spawned with `detached: true` so it owns its process group, and the cancellation paths (`close()` and `kill()`) replace the old 2s redundant SIGTERM with an 8s graceful window followed by a `process.kill(-pid, 'SIGKILL')` group-kill backstop. The redundant SIGTERM had been racing pi's in-flight MCP dispose: pi's RPC-mode handler at `rpc-mode.js:533` saw `shuttingDown=true` and called `process.exit(143)` synchronously, aborting `manager.closeAll()` mid-flight and orphaning MCP children to PID 1. The new window is enough for the worst-case ~4s/server `transport.close()` graceful path; the group-SIGKILL backstop reaps anything that survives (`unitAI-1phu7` / `unitAI-ctl0o`).
- `tests/integration/cli/run.integration.test.ts` background cases now bootstrap the observability DB via the CLI pre-run path (`src/cli/run.ts` `ensureObservabilityDb`) and the tmux dispatch path falls back to an active-job SQLite lookup when the 5s `latest` poll-deadline expires. Background dispatches no longer print the generic "Warning: job started but ID not yet available" when the child is alive and registered — operators see the real job id (`unitAI-sxmmy`, `unitAI-dq6vr`).
- `beads-commit-gate` no longer cascades when a reviewer auto-claims a review bead. The gate now requires an explicit owner KV before treating a claim as actionable; cleanup + docs added, regression test in place (`unitAI-352ni`).
- All 4 residual npm audit findings rooted in `@modelcontextprotocol/sdk@1.29.0`'s transitive chain patched via `package.json` `overrides`: `fast-uri` ^3.1.2 (high; path traversal + host confusion), `ip-address` ^10.2.0 (moderate; XSS in Address6 HTML methods), `hono` ^4.12.18 (moderate; 6 advisories incl JWT validation + cache leakage). `npm audit` returns 0 vulnerabilities (down from 20 pre-release). MCP SDK is already at latest; overrides should be removed when an upstream release bumps these (`unitAI-938u5`).

### Changed
- Specialist prompt library cleanup (epic `unitAI-q4669`, 4 rounds): added `~/.xtrm/skills/default` as second pi skills fallback path in `.pi/settings.json` (defense-in-depth; canonical path remains `.xtrm/skills/active` via project symlink chain into the installed xtrm-tools); authored 4 new shared mandatory rules (`code-quality-defaults`, `diagnose-loop`, `research-tool-routing`, `security-review-defaults`); expanded `gitnexus-required` with an execution-flow bullet; pruned 22 redundant `skills.paths` entries across 10 specialists (`code-sanity`, `debugger`, `executor`, `explorer`, `memory-processor`, `overthinker`, `planner`, `researcher`, `reviewer`, `security-auditor`); opted in `per-turn-handoff-schema` + `bead-id-verbatim` for 8 more specialists (node-coordinator deliberately excluded — its prompt explicitly forbids JSON output as final coordinator surface); `sp list-rules` confirms zero orphan rules. Cross-repo follow-up tracked as `xtrm-4h6u` (installer should scaffold both pi skills paths by default).
- Debugger discipline hardened (`unitAI-si4yi`, discovered from `unitAI-tytob`): `config/mandatory-rules/diagnose-loop.md` expanded with Matt Pocock-style contract — fast deterministic feedback loop required before code changes (blocker if unreproducible); 3–5 falsifiable hypotheses tested one variable at a time; `[DEBUG-<id>]` tagged instrumentation must be removed before completion; convert minimized repro into regression test only when a correct seam exists, otherwise route the architecture/testability finding to overthinker or planner instead of forcing a brittle test. `debugger-trace-first` rule deleted (redundant with diagnose-loop's first sentence). `config/skills/using-specialists-v3/SKILL.md` adds a new `## Bug Diagnosis Chain` section under "Choosing The Specialist" that tells the orchestrator: do not dispatch executor while bug cause is unknown — default chain is test-runner/debugger → debugger repro+hypotheses → minimal fix → test-runner rerun → code-sanity/security-auditor when risk surface applies → reviewer gate, with overthinker/planner only for architecture/testability fallout.
- `vitest` + `@vitest/coverage-v8` devDependencies bumped from `^2.1.8` to `^4.1.6` (`unitAI-zxz9f`). Resolves the 6 moderate findings in the Vitest 2 tooling chain (vitest/vite/vite-node/esbuild/@vitest/mocker/@vitest/coverage-v8). Empirical comparison on this repo: Vitest 4 is materially less flaky and faster — 87 failed / 1017 passed / 2 unhandled errors / 44s wall vs Vitest 2.1.8 baseline of 135 failed / 969 passed / 10 unhandled errors / 74s wall. No config edits needed: `server.deps.external`, coverage thresholds, and the existing test exclude list carry forward unchanged; all test files use the stable surface (`describe`/`it`/`expect`/`vi`/`beforeEach`/`afterEach`); `bun --bun vitest run` remains the canonical command path.
- `memory-processor` specialist redesigned for N>500 bd memory audits. Old single-pass workflow exhausted context past ~150-200 memories (Phase 5 per-entry classification text + Phase 7 inline `bd forget` cumulated in chat history regardless of model context size). New design: chunked file-backed audit ledger documented in `config/skills/memory-audit-transaction/SKILL.md`, with a pre-script (`config/skills/memory-audit-transaction/scripts/pre-bulk-export.sh`) that runs `bd memories --json` in a single dolt query (~ms, no per-key `bd recall` round-trips) and stages the artifacts at `.tmp/memory-audit/` before the model spawns. Spec system_prompt + task_template rewritten to defer to the skill and forbid: per-entry chat output, default-Current-without-evidence, destructive git commands. Model also switched from `nano-gpt/qwen/qwen3.5-397b-a17b-thinking` to `openai-codex/gpt-5.3-codex` — qwen3.5 via nano-gpt exhibited persistent per-turn flailing (5 rejected tool calls per turn) plus 95% default-to-Current with empty evidence on a live 508-memory audit; gpt-5.3-codex completed the same audit with 91/508 evidence-backed prunes (18% rate) in 22min for $0.019 (`unitAI-pwojn.1`, parent epic `unitAI-pwojn` Phase A; runtime support Phase B+C still open).
- Canonical specialist model defaults migrated off the unavailable `dashscope` provider. `memory-processor` now uses `nano-gpt/deepseek/deepseek-v4-pro-cheaper:thinking` (synthesis workload, operator preference). `researcher` and the `executor-benchmark-matrix` use `nano-gpt/qwen/qwen3.5-397b-a17b-thinking` (faithful family match, 256K context, thinking-enabled). The `cheap` preset in `config/presets.json` switched to `nano-gpt/moonshotai/kimi-k2.5` (no-thinking, matches the preset's `thinking_level: off`). Stale local `.specialists/user/memory-processor.specialist.json` override removed — canonical now matches operator choice (`unitAI-ght3j`).
- `test-runner` specialist v2.0.0 — now polyglot: pre-script detects manifest (`package.json` / `pyproject.toml` / `pytest.ini` / `setup.cfg` / `Cargo.toml` / `go.mod`) and dispatches the canonical test command (`npm test`, `pytest`, `cargo test`, `go test ./...`); falls back to a `[test-runner] no project test manifest detected` descriptive message with exit 0 instead of a missing-binary crash. system prompt + task_template are project-language-aware. `vitest`/`jest` removed from tags (`unitAI-0er69`).
- `executor` and `debugger` specialist prompts soften hardcoded `tsc --noEmit` / `npm run lint` references to neutral "project-appropriate lint and typecheck" phrasing with multi-language examples (Node / Python / Rust / Go) (`unitAI-dults`).
- `executor` post-script is manifest-aware: `package.json` → `npm run lint`, `pyproject.toml`/`setup.cfg` → `ruff` + `mypy` (when on PATH), `Cargo.toml` → `cargo clippy`/`check`, `go.mod` → `go vet`, none → descriptive no-op (`unitAI-dults`).
- `reviewer` specialist system prompt step 4 (Job linkage and evidence collection) now teaches `git diff $(git merge-base HEAD master)..HEAD` for the canonical changed-range and explicitly forbids rebase / squash / reset / amend / hand-merge / making new commits in the reviewed worktree. Auto-commit checkpoints (live since Apr 13 `11e9b016`) produce N-commit feature branches; reviewer was sometimes panicking and trying git surgery. `sp merge` / `sp epic merge` own publication squashing.

### Changed
- `docs/specialists-service.md` documents the full closed `error_type` taxonomy (now includes `template_field_misuse`, `prompt_too_large`, `output_too_large`) and cross-references the Python reference client (`unitAI-huwov`).
- `docs/examples/specialists_client.py` removed; canonical reference now lives at `clients/python/specialists_client.py` (`unitAI-huwov`).
- New `docs/deploying-alongside.md` — copyable compose recipe for adding `specialists-service` to an existing multi-service stack on a non-host network, with the three required tweaks (`user:`, `HOME=/pi-home`, rw `.specialists/`) explained and a symptom→cause→fix troubleshooting matrix (`unitAI-2fz5b`).

---

## [v3.14.1] — 2026-05-07

### Changed
- `changelog-keeper` specialist scoped to `CHANGELOG.md` only — no longer bumps version, builds, commits, tags, pushes, or publishes; the `/releasing` skill owns those steps and dispatches `changelog-keeper` only to fill `[Unreleased]` gaps from xt reports (`unitAI-g29jv`).

---

## [v3.14.0] — 2026-05-07

### Added
- `sp serve` operational logging with `--log-level off|info|debug` and structured JSON `/v1/generate` request events (`unitAI-8y70l`).
- `sp serve --readiness-canary off|warn|require` for Pi child readiness validation (`unitAI-z2vpq`).
- Script-runner JSON output-contract injection from `response_format: json` schema (`unitAI-z2vpq.4`).
- Local dev container name `sp-service-dev` to distinguish repo-local Compose dev service from consumer-owned `specialists-service` (`unitAI-826pp`).
- Paranoid-mode orchestration discipline, sleep-timer monitoring, mandatory security/sanity chain, project-specific specialist guidance, and worktree cleanup steps in `using-specialists-v3` skill.

### Changed
- Script-runner sends rendered prompts via stdin instead of argv to prevent process-list leakage and avoid Pi CLI parsing on `--`/`@`-prefixed content (`unitAI-z2vpq.1`).
- Script-runner spawns Pi child with `cwd: projectDir` so service consumers resolve files relative to their configured project (`unitAI-z2vpq.2`).
- Rendered prompt-size preflight added before Pi spawn (`prompt_too_large`, `execution.prompt_limit_bytes`, `SPECIALISTS_SCRIPT_PROMPT_LIMIT_BYTES`, 4MiB default) (`unitAI-z2vpq.3`).
- `sp serve --allow-local-scripts` and `skills.scripts` in script/service mode now fail-closed until a sandboxed lifecycle exists (`unitAI-z2vpq.7`).
- `--allow-skills-roots` boundary validation switched to normalized `path.relative` containment for both `skills.paths` and `prompt.skill_inherit` (`unitAI-z2vpq.6`).
- Trusted skills forwarded to Pi child as explicit repeated `--skill` arguments only (`unitAI-z2vpq.5`).
- `--db-path` now treated as an exact SQLite file path (`unitAI-z2vpq.8`).
- script-runner forwards `spec.prompt.system` via Pi `--system-prompt` (full override) when set, so non-coding specialists no longer inherit pi's default coding-agent system prompt (`specialists-37x`).
- AGENTS.md: replaced hardcoded `sp` command catalog with `sp help` instruction and added `sp steer` to orchestration command list.

### Fixed
- `--offline` flag now propagates to script-runner Pi invocation in `sp serve` (`f61032a5`).
- Script-runner isolates Pi prompts from project context (`specialists-6vy`).

---

## [v3.13.0] — 2026-05-05

### Added
- Documented the canonical-live Category A and xtrm-managed Category B distribution model, including installation, skill/hook drift, and operator refresh commands (`unitAI-o4khi`).

### Changed
- Removed deprecated `sp poll`; use `sp ps <id> --json` for status, `sp feed <id>` for events, and `sp result <id>` for final output (unitAI-kbxu7).
- `update-specialists` v2.1 now separates specialists-owned runtime refresh (`sp doctor --check-drift`, `sp prune-stale-defaults`) from xtrm-owned asset refresh (`xt doctor`, `xt update`) so operators do not conflate the two distribution tracks (`unitAI-tsnwh.5`, `unitAI-o4khi`, `specialists-4iq`).

### Fixed
- Bundled `sp doctor`, `sp status`, and related diagnostics no longer crash when resolving package metadata from installed `dist/index.js`; version checks now support both source and packaged layouts (`specialists-4iq`).
- `security-auditor` no longer ships machine-specific `/home/dawid/projects/xtrm-tools` skill paths; optional security skills now resolve through repo-relative `.xtrm/skills/optional/...` paths (`specialists-4iq`).

---

## [v3.12.0] — 2026-05-05

### Added
- `specialists list --full` live registry surface now shows worktree behavior, chain position, median runtime, and role-specific mandatory rules for routing (unitAI-5ad59543)
- `using-specialists-v3` skill adds live-registry orchestration guidance and keeps command discovery centered on `specialists list --full` and `sp help` (unitAI-3ecd8ddf; unitAI-d222b022)
- `specialists list` routing descriptions now stay rich enough to support live role selection from registry output (unitAI-a1605ced; unitAI-0539c3cd)

### Changed
- `changelog-keeper` draft flow now uses script-safe changelog synthesis from curated xt reports (unitAI-0b179f8f)
- `sp script` timeout and scope-bleed handling tightened so long-running script work does not bleed into adjacent worktree state (unitAI-22c0bf39)
- Epic merge dirty-state integration tests stabilized after merge/publication edge cases (unitAI-eb68cf6c)
- `sp release` / release-pipeline handoff and `using-specialists-v3` activation docs updated for v3 orchestration flow (unitAI-fc588ba4; unitAI-5677cce8; unitAI-fb0ed5ee)
- Specialist metadata and mandatory rules refreshed so live registry output reflects current roles and policies (unitAI-5b3c3839; unitAI-77e21085; unitAI-d1ca9f96; unitAI-28781c48)

### Fixed
- Scope-bleed fix paired with raised script timeout to keep release drafting bounded (unitAI-22c0bf39)
- `sp epic merge` dirty-tree publication path now survives unrelated dirty state and preserves merge-ready validation (unitAI-eb68cf6c)
- `sp config show --resolved` and repo-local mandatory rules now resolve from current worktree instead of stale global dist (unitAI-77e21085)

---

## [v3.11.0] — 2026-05-03

### Added
- `changelog-keeper` specialist v1 for release-note synthesis from curated xt reports (unitAI-znkgi.2)
- Releasing skill workflow for prepare/publish release flow after CLI removal (unitAI-fhbf4)
- `sp doctor` / `sp status` version-check nudges with cached tag awareness and per-tag dedupe (unitAI-znkgi.9)
- `using-kpi` skill for KPI analysis and payload/runtime observability recipes (unitAI-drs41.4)
- `sp db extract` / `sp db stats` surfaces for KPI extraction and analysis help (unitAI-drs41.4; unitAI-svnft)
- GitNexus-required new-file escape hatch rule for additive specialist/doc changes (unitAI-znkgi.7)
- `sp release prepare` range flags `--from` / `--to` for explicit backfill windows (unitAI-1evl2)
- `sp release` publish-time validation for top-section gating, annotated tag creation, and push flow (unitAI-znkgi.3)

### Changed
- `sp release prepare` now accepts markdown-only specialist output, normalizes missing section keys, and keeps section replacement bounded (unitAI-8elrc; unitAI-1avsn; unitAI-a3s9a)
- `changelog-keeper` output tightened with fallback chain and stricter section fidelity for release drafts (unitAI-8elrc; unitAI-khlqj)
- `sp clean` migrated to DB-first job selection with PID-primary stale-process cleanup (`--processes`) (unitAI-ltwme)
- `sp clean --keep` now preserves chain-root jobs referenced by epic membership by default; `--aggressive-prune` bypasses that protection for hard purges, and `sp ps --include-terminal` renders orphaned terminal epics without dropping chain rows (unitAI-b0bc62)
- `sp script` stdout cap raised to 128MB with incremental parse for oversized streams (unitAI-9cygd; unitAI-a47ub)
- `sp script` retained cap handling fixed so overflow recovery stays stable under repeated reads (unitAI-1avsn; unitAI-a47ub)
- `sp script` template-check / compat guard fix for spec loading under release-related flows (unitAI-r7zte)
- `sp release` semver section label now derives from `--to HEAD` correctly (unitAI-7qu0t)
- `sp release` draft parser now accepts array-shape sections and markdown fallback (unitAI-a3s9a)
- Release parser now accepts JSON drafts missing section keys and backfills empty buckets (unitAI-1avsn)
- `using-specialists-v2`, `update-specialists`, `CLAUDE.md`, `AGENTS.md`, and related docs synced for release awareness and update checks (unitAI-znkgi.5; unitAI-jhhu4.1; unitAI-c190df90)
- `docs/design/gzrx-tool-catalog.md` aligned with source policy for centralized tool catalog design (unitAI-gzrx)
- `src/cli/doctor.ts` drift check now warns on stale user-overlay specialists before they shadow defaults (unitAI-bb3h6)
- `src/specialist/script-runner.ts` and tests got stdout-cap, parse, and tool-allowlist fixes across release/debugger work (unitAI-9cygd; unitAI-1avsn; unitAI-a47ub; unitAI-c6he0)
- `src/cli/release.ts` / `src/cli/version-check.ts` / `src/cli/clean.ts` got the release, version-check, and DB-first cleanup flow updates (unitAI-znkgi.3; unitAI-znkgi.9; unitAI-ltwme)
- `docs/observability-metrics.md`, `docs/cli-reference.md`, and skill mirrors updated for KPI and release workflow drift (unitAI-drs41.4; unitAI-znkgi.5)

### Fixed
- Release draft rendering now handles markdown-only output and JSON drafts missing section keys without losing bullets (unitAI-8elrc; unitAI-1avsn)
- `sp script` overflow handling now preserves retained caps across parse retries and large stdout bursts (unitAI-a47ub)
- `sp release` publish/prepare validation now rejects section-label and array-shape edge cases before bad tags land (unitAI-7qu0t; unitAI-a3s9a)
- `sp clean` no longer depends on file-era job dirs and survives deleted process state (unitAI-ltwme)

### Removed
- `sp release` CLI path replaced by releasing skill workflow for publishing releases (unitAI-fhbf4)

---

## [3.10.0] - 2026-04-27

Reviewer traceability, hook DB migration, `/lib` export, `list-rules` CLI, and the `serena-cheatsheet` mandatory rule.

### Added
- `sp list-rules` — rule × specialist matrix CLI for inspecting which mandatory rules each specialist loads (unitAI-wv3l9)
- `/lib` subpath export for Node consumers embedding the runner library (unitAI-rw13n)
- `serena-cheatsheet` mandatory rule providing per-specialist Serena-tool guidance, opt-in via `template_sets` (unitAI-acb59b59)
- Auto-close linked bead on terminal job status (cancelled/done/error) — supervisor closes the bead when the job ends (unitAI-9truh)
- PID-liveness inference for zombie job visibility in readers (unitAI-zw9w1)
- `output_type` surfaced in `SupervisorStatus` and `run_complete` events (unitAI-e90j)

### Changed
- Default `--context-depth` raised from 1 to 3 — chained specialists now see own bead + predecessor + parent task by default (unitAI-231x)
- `sp poll` deprecated in favor of `sp ps` (state) + `sp feed` (stream) (unitAI-zjhsj)
- Reviewer prompts now include diff context wired through cleanly (unitAI-18d1d)
- `serena-cheatsheet` removed from `default_template_sets`; specialists must opt in explicitly (unitAI-49188)

### Fixed
- `specialists-complete` hook reads job state via `sp ps` (DB-first) instead of stale file paths (unitAI-q5k2p)
- `specialists-creator` spec now includes `fallback_model` field as required (unitAI-9ilgw)
- Reviewer traceability gaps for GitNexus invocation evidence and injected diff context (unitAI-ctkk9)
- CLI help test stabilized for bun spawn behavior (unitAI-56f98)

---

## [3.9.0] - 2026-04-26

`fln4q-epic` SQLite observability migration, `specialists-service` v1 (HTTP + CLI surfaces for script-class specialists), `sp script` CLI, and a strict 1:1 schema-to-runtime cut.

### Added
- `sp script` CLI — synchronous one-shot specialist invocation (READ_ONLY, template + variables, JSON out) for service/script consumers (unitAI-2cbbae)
- `specialists-service` v1 — HTTP and CLI surfaces for script-class specialists (`sp serve` + `sp script`) (unitAI-fln4q)
- Script target validate mode for pre-run validation of scripts/commands/tools/shebangs (unitAI-4b591)
- Pre-flight `pi-coding-agent` compat regression CI workflow (unitAI-5077f)
- Mercury atomic-summarizer schema-target PoC example (unitAI-f2075)
- Python adapter reference for `darth-feedor` migration (unitAI-f98788)

### Changed
- **Strict 1:1 schema-to-runtime cut**: every JSON field must map to a runtime consumer. Dropped `CommunicationSchema` (`next_specialists`, `publishes`), `capabilities.diagnostic_scripts`, `prompt.normalize_template`, `prompt.examples`, `execution.preferred_profile`, `execution.approval_mode`, `metadata.author`, `metadata.created`, root `heartbeat`, deprecated `ScriptEntry.path` alias. 26 specs + `docs/authoring.md` + `config/skills/specialists-creator/SKILL.md` + `src/cli/view.ts` + `scaffold-specialist.ts` updated in lockstep (unitAI-68edd, unitAI-8n0aa)
- Schema validation now uniform across all 26 specs; `xt-merge` `output_to` → `output_file` (typo'd dead alias was silently dropping merge result writes) (unitAI-02deb, unitAI-yb9qu)
- Schema preserves unknown keys via `.passthrough()` on every nested `SpecialistSchema` object — fixes silent acceptance of typo'd fields (unitAI-f27c8)
- `--user-dir` → `--project-dir` rename in `sp script` and `sp serve` with deprecated alias retained (unitAI-rfjbd)
- Pi 0.70.x compatibility — dropped `args.push('--', prompt)` option terminator in `script-runner.ts`; image base unpinned to `@latest` (unitAI-w0h7z)
- `fln4q-A`: env-gated file fallback for `attach`/`list`/`poll`/`status`/`feed_specialist` with `SPECIALISTS_JOB_FILE_OUTPUT` (unitAI-5521c)
- `fln4q-B`: detached watchdog DB-backed child read path; `cleanupProcesses` file fallback gated by env (unitAI-50283, unitAI-91cfea)
- `fln4q-B2` v2: Bun runtime helper, mode-split watchdog, read-only DB child (unitAI-73c1d)
- DB-first job reads, crash recovery, event reads, job cleanup readers (multiple commits, fln4q-epic)
- Supervisor file writes gated behind `SPECIALISTS_JOB_FILE_OUTPUT` env (unitAI-ppkdg)
- README documentation map points to specialists-service docs
- `sp serve` and `sp script` surfaced in core commands list (unitAI-2f8f4)
- `db` legacy migration tooling clarified; canonical store is SQLite (unitAI-23a1c, unitAI-3425a)

### Fixed
- NDJSON parser handles pi's real `message_end` and `agent_end` shapes (prior parser matched a fictional shape that the test mock perpetuated) (unitAI-68owr)
- Pi `errorMessage` surfacing — when content is empty, `message.errorMessage` flows through error taxonomy so quota/auth errors no longer silently return success-with-empty-output (unitAI-68owr)
- JSON-mode markdown fence stripping — `stripMarkdownFences()` runs before `JSON.parse` for `response_format=json` so kimi-style fenced output parses (unitAI-68owr)
- `specialists-creator` JSON corruption — zsh prompt artifact had been pasted into the file as a JSON key; only caught after `.passthrough()` exposed the silent survival of unknown keys (unitAI-826wl)
- Stale `.xtrm/skills/active/pi/<name>/` skill paths bulk-swept across canonical and mirror specs (`pi/` subdirectory removed in prior layout migration but references lingered) (unitAI-826wl)
- `withSqliteOperation` callbacks now return non-undefined sentinel (unitAI-f30e56)

### Removed
- `parallel-review` specialist files (renamed to `parallel-runner` in 3.4.0; spec files lingered until cleanup)
- 11 declarative-only schema fields (no runtime consumer — see Changed → strict 1:1 schema cut)

---

## [3.8.0] - 2026-04-26

`specialists-service` v1 — HTTP and CLI surfaces for script-class specialists, plus a strict 1:1 schema cut so every JSON field maps to a runtime consumer.

### Added
- **`sp serve`**: Node `http` server exposing `POST /v1/generate` and `GET /healthz` for script-class specialists; real semaphore queue with HTTP 429 on contention, SIGTERM forwarding to in-flight pi children, 4MB stdout cap, trace rows persisted to canonical `observability.db` with `surface: 'script_specialist'` (unitAI-c6uvn).
- **`sp script <name>`**: One-shot CLI peer to `sp serve` for cron and host scripts; cron-friendly exit codes (0/1/2/3/4/5/6/7/75); `--single-instance <lockpath>` uses `flock` with `EX_TEMPFAIL` on contention (unitAI-6qctn).
- **`sp validate <path> --target script`**: Offline pre-deploy validator that runs schema parse plus `compatGuard` and exits non-zero on failure with structured error (unitAI-bahj1).
- **Docker image**: Multi-stage `oven/bun` build, non-root UID 10001 user, `WORKDIR /work`, `ARG PI_VERSION=latest`. Sidecar template at `docker/compose.example.yml` (unitAI-atwom).
- **CI canary `.github/workflows/pi-compat.yml`**: Weekly cron + PR-triggered smoke that fails loud on pi spawn-flag drift; no quota, no secrets, no LLM calls (unitAI-nsru6).
- **Reference Python adapter `docs/examples/specialists_client.py`**: Stdlib-only, mirrors the closed `error_type` union with a `TRANSPORT` value for caller-side HTTP failures; live-smoked end-to-end against real pi (unitAI-s2won).
- **Reference script-class spec `docs/examples/mercury-atomic-summarizer.specialist.json`**: Phase 1 first-spec, copyable, validated against the migration doc's schema target (unitAI-t9t11).
- **Reference smoke spec `docs/examples/smoke-echo.specialist.json`**: For verifying a fresh deployment.
- **`handoff-feedor.md`**: One-page operator handoff at repo root for adopting `specialists-service` v1 in darth-feedor.
- **Documentation**: `docs/specialists-service.md` (canonical contract), `docs/specialists-service-install.md` (build-from-repo install with rootless-podman + Fedora-SELinux notes), `docs/specialists-service-evaluation.md` (production-evaluation memo), `docs/release-image.md` (maintainer build/push reference), `Script-class authoring` section in `docs/authoring.md`, `Schema target` translation table in `docs/darth-feedor-migration.md`.
- **Spec uniformity audit script `config/skills/specialists-creator/scripts/audit-spec-uniformity.mjs`**: Portable, reports parse failures and unknown keys; KNOWN sets stay in lockstep with `src/specialist/schema.ts`.

### Changed
- **Zod schema passthrough**: `SpecialistSchema` now uses `.passthrough()` on every nested object so unknown keys survive `parseSpecialist()` and `sp edit` round-trip stops silently dropping fields (unitAI-xutg2).
- **Strict 1:1 schema-to-runtime cut**: Every JSON field must map to a runtime consumer (unitAI-8n0aa). Dropped `CommunicationSchema` entirely (`next_specialists`, `publishes`), `capabilities.diagnostic_scripts`, `prompt.normalize_template`, `prompt.examples`, `execution.preferred_profile`, `execution.approval_mode`, `metadata.author`, `metadata.created`, root `heartbeat`, and the deprecated `ScriptEntry.path` alias. 26 specs, `docs/authoring.md`, `config/skills/specialists-creator/SKILL.md`, `src/cli/view.ts`, and `scaffold-specialist.ts` updated in lockstep.
- **`--user-dir` → `--project-dir`**: Flag renamed in `sp script` and `sp serve` (the flag has always been the project root, not a user-spec dir); `--user-dir` retained as a deprecated alias (unitAI-rfjbd).
- **Pi 0.70.x compatibility**: Dropped the `args.push('--', prompt)` option terminator in `src/specialist/script-runner.ts`; both 0.64 and 0.70.2 accept positional prompt. Image base unpinned to `@mariozechner/pi-coding-agent@latest` (unitAI-w0h7z).
- **`xt-merge` output_to → output_file**: Migrated to canonical top-level field — a typo'd dead alias had been silently dropping `merge-prs-result.md` writes since the spec was authored (unitAI-yb9qu).
- **README documentation map**: Now points to the new specialists-service docs.

### Fixed
- **NDJSON parser real shape handling**: Now handles pi's real `message_end` and `agent_end` event shapes; prior parser matched a fictional shape that the test mock perpetuated, returning empty assistant text in production (unitAI-68owr).
- **Pi `errorMessage` surfacing**: When content is empty, `message.errorMessage` is surfaced through the error taxonomy so quota and auth errors no longer silently return `success: true` with empty output (unitAI-68owr).
- **JSON-mode markdown fence stripping**: `stripMarkdownFences()` runs before `JSON.parse` for `response_format=json` responses; some models (e.g. kimi) wrap JSON in markdown code fences regardless of the format directive (unitAI-68owr).
- **`specialists-creator.specialist.json` JSON corruption**: A zsh prompt artifact had been pasted into the file as a JSON key (`"permission_requiredspecialists — zsh "`); only caught after `.passthrough()` exposed the silent survival of unknown keys (unitAI-826wl).
- **Stale skill-path sweep**: Bulk-swept 19 stale `.xtrm/skills/active/pi/<name>/` skill paths across canonical and mirror specs; the `pi/` subdirectory was removed in a prior layout migration but the references were never updated (unitAI-826wl).

### Removed
- **`parallel-review` specialist files**: Removed from canonical and mirror (renamed to `parallel-runner` in 3.4.0; spec files lingered until this cleanup).
- **11 declarative-only schema fields**: See Changed → strict 1:1 schema cut. None had a runtime consumer.

[Unreleased]: https://github.com/Jaggerxtrm/specialists/compare/v3.11.0...HEAD
[v3.11.0]: https://github.com/Jaggerxtrm/specialists/releases/tag/v3.11.0
[3.10.0]: https://github.com/Jaggerxtrm/specialists/releases/tag/v3.10.0
[3.9.0]: https://github.com/Jaggerxtrm/specialists/releases/tag/v3.9.0
[3.8.0]: https://github.com/Jaggerxtrm/specialists/releases/tag/v3.8.0
