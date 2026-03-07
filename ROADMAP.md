---
title: OmniSpecialist Roadmap
version: 1.1.0
updated: 2026-03-08
scope: product
category: roadmap
domain: [planning, features]
changelog:
  - 1.1.0 (2026-03-08): Mark M1.1 complete; add dead code cleanup; update status.
  - 1.0.0 (2026-03-07): Initial roadmap — post v2 specialist system launch.
---

<!-- INDEX
## Completed
## Milestone 1 — Rename & Distribution
## Milestone 2 — Core Agent UX
## Milestone 3 — Specialist Authoring
## Milestone 4 — Beads Integration
## Milestone 5 — New Specialists
## Milestone 6 — pi Skills & Extensions
## Backlog / Future
## Open Design Questions
-->

# OmniSpecialist Roadmap

> Status as of 2026-03-08. Items within each milestone are roughly ordered by priority.

---

## Completed

| Item | Done |
|------|------|
| v2 Specialist System — 7-tool MCP orchestration layer | 2026-03-07 |
| Repo rename `unitAI` → `omnispecialist` (GitHub + package.json) | 2026-03-07 |
| Dead v1 code removal — analytics, logging, permissions, orphaned utils (18k lines) | 2026-03-08 |
| CLAUDE.md accuracy fix — tool count 4→7, add start/poll/stop_specialist | 2026-03-08 |

---

## Milestone 1 — Rename & Distribution

### ~~1.1 Repo rename → `omnispecialist`~~ ✓ Done
- ~~Rename GitHub repo from `unitAI` to `omnispecialist`~~
- ~~Update `package.json` name, README, all internal references~~
- ~~Update MCP server `name` field in `server.ts`~~

### 1.2 Installer
A first-class install experience that sets up the full stack end-to-end.

**Must do:**
- Install `omnispecialist` MCP at user level (not project-level) — existing automatic MCP installation system can be reused
- Install `pi` global binary as part of the install flow
- After pi is installed, print clear instructions: _"Run `pi` once and use the config TUI (`pi config`) to enable and map your model providers"_
  - Note: pi has no CLI flag for provider setup — TUI is the only path (`pi config`)
- Scaffold `~/.omnispecialist/specialists/` (user-scope specialist directory)

**Nice to have:**
- Detect if `pi` is already installed and skip reinstall
- Post-install health check: `pi --list-models` to confirm at least one provider is active

---

## Milestone 2 — Core Agent UX

### 2.1 `omni-init` MCP tool
A lightweight session bootstrap tool the agent calls at session start.

- Calls `list_specialists` and surfaces the result as structured context
- When Beads is integrated (M4): also runs `bd init` if not already initialized
- Distinct from `/omni` skill — this is a programmatic MCP tool, not a user-facing slash command

### 2.2 `/omni` skill
User-facing session onboarding skill.

- Loads at session start on user invocation (not auto-loaded — skill, not tool)
- Instructs the agent on how to use OmniSpecialist effectively
- Chains naturally with `/prompt-improving`: user prompt → improved → routed to specialist
- Surfaces available specialists with short descriptions

> **Note**: `/omni` (skill) and `omni-init` (MCP tool) are complementary, not duplicates.
> `omni-init` is for the agent to call programmatically; `/omni` is for the user to invoke at conversation start.

### 2.3 `list_specialists` — full description arg
Add an optional argument to return the complete specialist definition.

```typescript
// Proposed addition to list_specialists schema
detail: z.enum(['summary', 'full']).optional().default('summary')
// 'full' returns the entire parsed specialist YAML content per specialist
```

### 2.4 Scope distinction in `list_specialists` output
Currently project/user/system scopes may blend in output.

- Clearly label each specialist with its scope: `[project]`, `[user]`, `[system]`
- List order: project → user → system (most specific first)

---

## Milestone 3 — Specialist Authoring

### 3.1 `/omni-creating-specialist` skill (or MCP tool)
Guided specialist creation workflow. Implemented as a **skill** (not auto-loaded, explicit invocation only).

**Core requirements:**
- Inherit the original Mercury specialist design spec and enforce schema validation — this is non-negotiable
- Guide creation interactively via `AskUserQuestion`:
  1. **Scope**: project-level (scaffold `./specialists/`) or user-level (`~/.omnispecialist/specialists/`)?
  2. **Model assignment**: agent suggests a model based on task type; user can override from a presented list of main models
  3. **Permission tier**: READ_ONLY / LOW / MEDIUM / HIGH
  4. **Skill-as-base?**: offer to create from an installed SKILL.md (see below)

**Skill-as-base workflow:**
- List installed skills from `~/.claude/skills/` (or equivalent) as options
- If user selects a skill, read its `SKILL.md`:
  - Map `description` → specialist `metadata.description`
  - Map usage instructions → specialist `prompt.system`
  - Map any `scripts/` or `references/` entries → specialist `capabilities.diagnostic_scripts`
- Service-skills (e.g. Mercury service management skills) should be fully mappable to specialist schema

---

## Milestone 4 — Beads Integration

### 4.1 Smart beads usage policy
> **Open design question** — see [Open Design Questions](#open-design-questions)

Proposed policy:
- Specialists with write permissions (LOW/MEDIUM/HIGH) → **always use beads** to track changes
- READ_ONLY specialists → **optional**: use beads if the specialist surfaces discoveries worth persisting (e.g. `codebase-explorer`, `init-session`)
- `beads_integration: auto | always | never` field in specialist YAML to override default

### 4.2 `bd init` in `omni-init`
When Beads is detected as available, `omni-init` runs `bd init` in the working directory if not already initialized.

### 4.3 Installer additions (Beads)
If Beads integration is enabled:
- Install `beads` via npm as part of the omnispecialist install flow
- Install `dolt` (required by beads for sync)

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

- Define a base set of omnispecialist-aware skills for pi agents to use automatically
- Inspired by existing `agent-tools` patterns
- Consider: should omnispecialist install its own skills into `~/.agents/` as part of M1 installer?
- Alternatively: expose via `--skill` flag in pi spawn args from `session.ts`

---

## Backlog / Future

### UI — `omnis` dashboard
A management UI for running specialists and system health.

**Scope:**
- TUI or lightweight web UI (command: `omnis`)
- Show: running specialists, event stream (type only — not full messages), pi lifecycle events (`agent_start`, `agent_end`, tool calls), beads issue linked to job
- Quick model switcher per specialist (dropdown selector)
- Specialist list ordered: project → user → system
- Integrate into omniforge dashboard as a new tab alongside `omnigit` view

**Implementation notes:**
- Inspired by `bd` configuration UX
- No need to track individual messages — event type + success/fail is sufficient
- Specialist edit shortcut: open YAML in editor directly from UI

### Hooks system
Context-aware hooks that trigger specialist use automatically.

- Example: pre-commit hook → `clean-code` specialist
- Example: on new branch → `init-session` specialist
- Configurable per-project via `.omnispecialist/hooks.yaml`

---

## Open Design Questions

| # | Question | Options | Notes |
|---|----------|---------|-------|
| 1 | Should READ_ONLY specialists (exploration, discovery) use beads to persist what they find? | A) Always for write-permission specialists only; B) Opt-in via YAML field; C) Always for all specialists | Option B (`beads_integration: auto/always/never`) gives maximum flexibility |
| 2 | `/omni-creating-specialist` as skill vs MCP tool? | Skill (explicit, not auto-loaded); MCP tool (always available, agent-callable) | Skill preferred — prevents accidental invocation, keeps MCP surface small |
| 3 | Should `omni-init` be called automatically by the agent or only on explicit request? | Auto (agent calls on session start); Explicit (user/skill invokes) | Lean toward explicit — avoids unwanted bootstrap overhead on every session |
