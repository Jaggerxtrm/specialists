---
title: Specialists Roadmap
version: 1.3.0
updated: 2026-03-09
scope: product
category: roadmap
domain: [planning, features]
changelog:
  - 1.3.0 (2026-03-09): Mark M4 fully complete; rename omni→specialists throughout; reflect 8-tool surface.
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
-->

# Specialists Roadmap

> Status as of 2026-03-09. Items within each milestone are roughly ordered by priority.

---

## Completed

| Item | Done |
|------|------|
| v2 Specialist System — 7-tool MCP orchestration layer | 2026-03-07 |
| Repo rename `unitAI` → `omnispecialist` → **`specialists`** (GitHub + package.json) | 2026-03-07 |
| Dead v1 code removal — analytics, logging, permissions, orphaned utils (18k lines) | 2026-03-08 |
| CLAUDE.md accuracy fix — tool count 4→7, add start/poll/stop_specialist | 2026-03-08 |
| **M1 Installer** — `npx --package=@jaggerxtrm/specialists install` installs pi, beads, dolt, registers MCP | 2026-03-08 |
| **npm publish** — `@jaggerxtrm/specialists@2.0.1` public on npm registry | 2026-03-08 |
| MCP connection fix — shebang deduplication, `specialists` command works end-to-end | 2026-03-08 |
| **M4.1 Beads policy** — `beads_integration: auto\|always\|never` YAML field; `shouldCreateBead()` logic | 2026-03-09 |
| **M4.2 `specialist_init` tool** — 8th MCP tool; runs `bd init` if needed, returns specialist list + beads status | 2026-03-09 |
| **M4.3 SpecialistRunner beads lifecycle** — auto create/close beads with duration, model, audit log | 2026-03-09 |
| **M4.4 `poll_specialist` beadId** — `JobRegistry` exposes `beadId` in snapshot | 2026-03-09 |
| **M4.5 main-guard hook** — Claude Code PreToolUse hook blocks edits/commits on main/master | 2026-03-09 |
| Purge all `omni`/`unitAI` names — `SpecialistsServer`, `specialist_init`, logger, paths | 2026-03-09 |

---

## Milestone 2 — Core Agent UX

### 2.1 ~~`specialist_init` MCP tool~~ ✓ Done
Session bootstrap tool — calls `bd init` if needed, returns specialist list + beads status.
Shipped as part of M4.

### 2.2 `/specialists` skill
User-facing session onboarding skill.

- Loads at session start on user invocation (not auto-loaded — skill, not tool)
- Instructs the agent on how to use Specialists effectively
- Chains naturally with `/prompt-improving`: user prompt → improved → routed to specialist
- Surfaces available specialists with short descriptions

### 2.3 `list_specialists` — full description arg
Add an optional argument to return the complete specialist definition.

```typescript
detail: z.enum(['summary', 'full']).optional().default('summary')
// 'full' returns the entire parsed specialist YAML content per specialist
```

### 2.4 Scope distinction in `list_specialists` output
- Clearly label each specialist with its scope: `[project]`, `[user]`, `[system]`
- List order: project → user → system (most specific first)

---

## Milestone 3 — Specialist Authoring

### 3.1 `/creating-specialist` skill
Guided specialist creation workflow. Implemented as a **skill** (not auto-loaded, explicit invocation only).

**Core requirements:**
- Inherit the original Mercury specialist design spec and enforce schema validation
- Guide creation interactively via `AskUserQuestion`:
  1. **Scope**: project-level (`./specialists/`) or user-level (`~/.agents/specialists/`)?
  2. **Model assignment**: agent suggests a model based on task type
  3. **Permission tier**: READ_ONLY / LOW / MEDIUM / HIGH
  4. **Skill-as-base?**: offer to create from an installed SKILL.md

**Skill-as-base workflow:**
- List installed skills from `~/.claude/skills/` as options
- Map skill content → specialist schema fields automatically

---

## Milestone 5 — New Specialists

### 5.1 `clean-code` specialist
- Uses a smaller/faster model (Haiku or equivalent)
- Phases: analyze diffs → identify issues → GitNexus impact check → apply → verify
- READ_ONLY first pass → second pass with write permission

### 5.2 `codebase-mapping` specialist
- Uses GitNexus MCP tools to build a symbol/dependency map
- Outputs structured markdown: entry points, dependency layers, key symbols
- Pre-step for `clean-code`, `parallel-review`, `bug-hunt`

---

## Milestone 6 — pi Skills & Extensions

### 6.1 Base pi skills configuration
- Define a base set of specialists-aware skills for pi agents at startup
- Expose via `--skill` flag in pi spawn args from `session.ts`

---

## Backlog / Future

### UI — `specialists` dashboard
- TUI or lightweight web UI (command: `specialists ui` or `spec`)
- Show: running specialists, event stream, pi lifecycle events, beads issue linked to job
- Quick model switcher per specialist
- Integrate into a dashboard alongside git view

### Hooks system
- Pre-commit hook → `clean-code` specialist
- On new branch → `init-session` specialist
- Configurable per-project via `.specialists/hooks.yaml`
