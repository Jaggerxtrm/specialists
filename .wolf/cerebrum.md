# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-03-31

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

- [2026-05-06] For darth-feedor/service-specialist hardening, prioritize current Pi subprocess/RPC architecture redeployment fixes first; SDK migration remains a later measured phase. In full-auto mode, set wake-up timers and run paranoid validation/review passes.

## Key Learnings

- [2026-05-06] script-class specialists must keep pi prompt context isolated: use --system-prompt plus --no-context-files --no-skills --no-prompt-templates --no-themes; package-class runner may still use project context.
- **Project:** @jaggerxtrm/specialists
- **Description:** OmniSpecialist — 7-tool MCP orchestration layer powered by the Specialist System. Discover and execute .specialist.yaml files across project/user/system scopes via pi.

## Do-Not-Repeat

- [2026-05-21] When passing markdown/code-style text to shell commands (bd create/update, gh pr comment), never inline it in double-quoted bash strings; use Python subprocess args or --body-file to avoid command substitution executing backticked snippets.
- [2026-04-22] When changing CLI behavior, rebuild and publish updated dist/index.js before claiming fix shipped. Source-only fix is insufficient because npm package executes bundled dist.
- [2026-04-24] In this project, executor specialists do not use Bun/Vitest for verification. Do not ask executors to run vitest or bun test commands; keep executor verification to lint/tsc and handle tests via reviewer/test-runner or manual follow-up outside the executor path.
- [2026-05-06] Do not preserve stale specialist/sync-docs worktrees with compatibility path symlinks. If a worktree points at an obsolete xtrm-tools path, remove/prune the stale worktree and relaunch from current repo state instead of keeping path shims.

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- [2026-05-18] Workflow catalog epic `unitAI-ylphl` should ship as an executable `sp workflows` CLI/router backed by a data registry, with docs/skills consuming that registry instead of becoming the source of truth.

## User Corrections — 2026-05-18
- For `using-specialists-v3` relationship vocabulary updates, do not only add a standalone mapping table; read the full skill first and weave the right relationship commands into the existing worked examples and flows.

## User Corrections — 2026-05-15
- README should preserve the beginning Vision framing and direct `specialists.scheme.md` link; include an inline scheme/diagram so first-time readers immediately see the system shape.

## User Corrections — 2026-05-12
- `sp ps` default must stay compact: show aggregate System health only. Detailed per-process specialist/Dolt/Serena/orphan rows belong behind explicit `sp ps --health`.
- Correction: `sp ps` default should be active-job dashboard only. Terminal historical DB rows belong behind `--include-terminal` or `--all`; otherwise cleanup appears ineffective.
- Correction: `sp ps` should show unresolved terminal problem jobs by default until `sp clean --ps` explicitly acknowledges/hides them; default must not be active-only forever.
- Correction: after behavioral CLI changes, update `sp help`/subcommand help and `config/skills/using-specialists-v3/SKILL.md` so orchestrators learn the current semantics.

## Learned — 2026-05-21T17:10:10+00:00
- pi-tui integration: do not assign `tui.root` or pass children to `new Container(...)`; `TUI` extends `Container`, so mount via `tui.addChild(...)`. If starting async specialist work immediately after `tui.start()`, force/request a render and yield once so the visible frame appears before launch output or long startup work.

## Learned — 2026-05-22T13:43:53Z
- Bare `sp attach` picker must use raw-mode `readline.emitKeypressEvents` with Up/Down/Enter handling; a blocking `readFileSync(0)` numeric reader makes the list non-interactive and breaks arrow selection UX.
## User Corrections — 2026-06-24
- [2026-06-24] pi-coding-agent ownership/package: do not attribute pi to xtrm/Jaggerxtrm or mariozechner. Use earendil-works (`https://github.com/earendil-works/pi-coding-agent`, `@earendil-works/pi-coding-agent`).

## User Corrections — 2026-06-03
- Substrate design (`substrate_design_it.md`) is the broad xtrm product/runtime/collante: future system spanning core/substrate/channels/specialists/console. `devops-system.md` is specialists-owned vertical design that covers substrate touchpoints, future DevOps, AgentOps telemetry, MCP, IaC, and console; do not treat it as the substrate SSOT or let it override substrate boundaries.
## Decision Log — 2026-06-03
- DevOps module design is parked behind foundational work: first close specialists telemetry bridge/event-catalog follow-through, specialists roadmap/runtime cleanup, then substrate/channels; only then return to `unitAI-eoqxp.2`–`.6`. `devops-system.md` should retain evidence links so future work does not redo research.
- 2026-06-03 correction: For xtrm/specialists telemetry, do not treat USD/API cost as reliable today. The project uses subscription plans rather than direct provider API billing. Track token usage first (input/output/cache/reasoning/tool/total where available); keep USD cost metrics future-only until explicit API billing/pricing provenance exists.
