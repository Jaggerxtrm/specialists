---
title: Specialists Roadmap
version: 1.3.0
updated: 2026-03-09
scope: product
category: roadmap
domain: [planning, features]
changelog:
  - 1.3.0 (2026-03-09): Mark M2.1, M4 complete; move script execution to Completed; clean up rename artifacts; add 2.1.5 fixes.
  - 1.2.0 (2026-03-08): Mark M1 fully complete — installer, npm publish, MCP working.
  - 1.1.0 (2026-03-08): Mark M1.1 complete; add dead code cleanup; update status.
  - 1.0.0 (2026-03-07): Initial roadmap — post v2 specialist system launch.
---

<!-- INDEX
## Completed
## Milestone 2 — Core Agent UX
## Milestone 3 — Specialist Authoring
## Milestone 5 — New Specialists
## Milestone 6 — pi Skills & Extensions
## Backlog / Future
## Open Design Questions
-->

# Specialists Roadmap

> Status as of 2026-03-09. Items within each milestone are roughly ordered by priority.

---

## Completed

| Item | Done |
|------|------|
| v2 Specialist System — 8-tool MCP orchestration layer | 2026-03-07 |
| Repo rename `unitAI` → `specialists` (GitHub + package.json) | 2026-03-07 |
| Dead v1 code removal — analytics, logging, permissions, orphaned utils (18k lines) | 2026-03-08 |
| CLAUDE.md accuracy fix — tool count, BeadsClient wiring warning | 2026-03-08 |
| **M1 Installer** — `specialists install` installs pi, beads, dolt, registers MCP, installs `main-guard` hook | 2026-03-08 |
| **npm publish** — `@jaggerxtrm/specialists` public on npm registry | 2026-03-08 |
| MCP connection fix — shebang deduplication, `specialists` command works end-to-end | 2026-03-08 |
| `main-guard` hook — blocks edits/commits on main/master; installed at user scope via `specialists install` | 2026-03-09 |
| **M2.1 `specialist_init` MCP tool** — session bootstrap: `bd init` + list specialists | 2026-03-09 |
| **M4 Beads Integration** — `beads_integration: auto\|always\|never`; full bead lifecycle in runner | 2026-03-09 |
| **`agent_end` / done event** — `proc.stdin.end()` fix; pi RPC protocol investigation | 2026-03-09 |
| **Pre/post script execution** — `execSync` local runner; XML `<pre_flight_context>` injection | 2026-03-09 |

---

## Milestone 2 — Core Agent UX

### ~~2.1 `specialist_init` MCP tool~~ ✓ Done

### 2.2 `/specialists` skill
User-facing session onboarding skill.

- Loads at session start on user invocation (not auto-loaded — skill, not tool)
- Instructs the agent on how to use Specialists effectively
- Chains naturally with `/prompt-improving`: user prompt → improved → routed to specialist
- Surfaces available specialists with short descriptions

> **Note**: `/specialists` (skill) and `specialist_init` (MCP tool) are complementary, not duplicates.
> `specialist_init` is for the agent to call programmatically; `/specialists` is for the user to invoke at conversation start.

### 2.3 `list_specialists` — full description arg
Add an optional argument to return the complete specialist definition.

```typescript
detail: z.enum(['summary', 'full']).optional().default('summary')
// 'full' returns the entire parsed specialist YAML content per specialist
```

### 2.4 Scope distinction in `list_specialists` output
Currently project/user/system scopes may blend in output.

- Clearly label each specialist with its scope: `[project]`, `[user]`, `[system]`
- List order: project → user → system (most specific first)

---

## Milestone 3 — Specialist Authoring

### 3.1 `/creating-specialist` skill
Guided specialist creation workflow. Implemented as a **skill** (not auto-loaded, explicit invocation only).

**Core requirements:**
- Inherit the original Mercury specialist design spec and enforce schema validation — non-negotiable
- Guide creation interactively via `AskUserQuestion`:
  1. **Scope**: project-level (`./specialists/`) or user-level (`~/.agents/specialists/`)?
  2. **Model assignment**: agent suggests a model based on task type; user can override
  3. **Permission tier**: READ_ONLY / LOW / MEDIUM / HIGH
  4. **Skill-as-base?**: offer to create from an installed SKILL.md

**Skill-as-base workflow:**
- List installed skills from `~/.claude/skills/` as options
- If user selects a skill, read its `SKILL.md`:
  - Map `description` → specialist `metadata.description`
  - Map usage instructions → specialist `prompt.system`
  - Map any `scripts/` or `references/` entries → specialist `capabilities.diagnostic_scripts`

---

## Milestone 5 — New Specialists

### 5.1 `clean-code` specialist
Inspired by the existing `clean-code` skill.

- Uses a smaller/faster model (Haiku or equivalent)
- Structured phases:
  1. Analyze diffs of changed files
  2. Identify style/quality issues (naming, dead code, complexity)
  3. Use **GitNexus** to map dependencies before any rename/refactor
  4. Apply changes — never break imports or downstream symbols
  5. Verify diffs post-change
- READ_ONLY first pass → second pass with write permission

### 5.2 `codebase-mapping` specialist
Codebase understanding via GitNexus knowledge graph.

- Uses GitNexus MCP tools (`mcp__gitnexus__*`) to build a symbol/dependency map
- Outputs structured markdown: entry points, dependency layers, key symbols
- Suitable as a pre-step for `clean-code`, `parallel-review`, and `bug-hunt`

---

## Milestone 6 — pi Skills & Extensions

### 6.1 Base pi skills configuration
pi loads skills from `~/.agents/` at startup.

- Define a base set of specialists-aware skills for pi agents to use automatically
- Consider: expose via `--skill` flag in pi spawn args from `session.ts`
- Alternatively: install into `~/.agents/` as part of `specialists install`

---

## Backlog / Future

### UI — `specialists` dashboard
A management UI for running specialists and system health.

**Scope:**
- TUI or lightweight web UI (command: `specialists`)
- Show: running specialists, event stream (type only — not full messages), pi lifecycle events (`agent_start`, `agent_end`, tool calls), beads issue linked to job
- Quick model switcher per specialist
- Specialist list ordered: project → user → system
- Integrate into forge dashboard as a new tab alongside `gitboard` view

**Implementation notes:**
- Inspired by `bd` configuration UX
- No need to track individual messages — event type + success/fail is sufficient
- Specialist edit shortcut: open YAML in editor directly from UI

### Hooks system
Context-aware hooks that trigger specialist use automatically.

- Example: pre-commit hook → `clean-code` specialist
- Example: on new branch → `init-session` specialist
- Configurable per-project via `.specialists/hooks.yaml`

### System prompt append
- Appending specific workflow instructions (e.g. beads usage) to the specialist system prompt
- System prompt appends have greater authority than CLAUDE.md or AGENTS.md

### More beads hooks
- `bd init`, `bd ready` must be enforced in specialist workflows

### Specialists project init
- `specialists init` in a project installs the set of hooks/skills necessary for correct usage, similar to how `bd` hooks work

---

## Open Design Questions

| # | Question | Options | Notes |
|---|----------|---------|-------|
| 1 | `/creating-specialist` as skill vs MCP tool? | Skill (explicit, not auto-loaded); MCP tool (always available, agent-callable) | Skill preferred — prevents accidental invocation, keeps MCP surface small |
| 2 | Should `specialist_init` be called automatically by the agent or only on explicit request? | Auto (agent calls on session start); Explicit (user/skill invokes) | Lean toward explicit — avoids unwanted bootstrap overhead on every session |
