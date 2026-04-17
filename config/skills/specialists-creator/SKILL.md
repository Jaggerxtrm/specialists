---
name: specialists-creator
description: >
  Use this skill when creating or fixing a specialist definition. It guides the
  agent through writing a valid `.specialist.json`, choosing supported models,
  validating against the schema, and avoiding common specialist authoring
  mistakes.
version: 1.1
synced_at: 236ca5e6
---

# Specialist Author Guide

> Source of truth: `src/specialist/schema.ts` | Runtime: `src/specialist/runner.ts`

---

## ACTION REQUIRED BEFORE ANYTHING ELSE

Run these commands **right now**, before reading further, before writing any JSON, before doing anything else:

```bash
pi --list-models
```

Read the output. Pick one primary model and one fallback from **different providers**. Then ping both:

```bash
pi --model <chosen-primary>  --print "ping"    # must print: pong
pi --model <chosen-fallback> --print "ping"    # must print: pong
```

If a ping fails, pick the next best model in that tier and ping again. **Do not proceed until both return "pong".**

Model tiers:
- **Heavy** (deep reasoning, multi-phase): Opus / Pro / GLM-5
- **Standard** (authoring, review, codegen): Sonnet / Flash-Pro
- **Light** (fast context, reports, tests): Haiku / Flash

Rules:
- Always pick the **highest version** in a family (`claude-sonnet-4-6` not `4-5`, `gemini-3.1-pro-preview` not `gemini-2.5-pro`)
- `model` and `fallback_model` must be **different providers**
- Never write a model string you have not pinged in this session

---

---

## Model Setup (for a new specialist OR "setup my specialists models")

### Quick Reference: Specialists CLI

```bash
specialists list                              # all specialists + current model
specialists models                            # all pi models, flagged with thinking/images, shows current assignments
specialists edit <name> --model <value>       # change primary model
specialists edit <name> --fallback-model <v> # change fallback model
specialists edit <name> --model <v> --dry-run # preview without writing
specialists edit <name> --permission HIGH     # change permission level
specialists status                            # system health
specialists doctor                            # prereq + hook diagnostics
```

---

### Scenario: "Setup my specialists models"

When a user asks to set up or re-balance specialist models, run this workflow:

#### Step 1 — Inventory

```bash
specialists list       # shows each specialist + its current model
specialists models     # shows all available models on pi, with current assignments marked ←
```

Read both outputs carefully:
- `specialists list` → what specialists exist and what they currently use
- `specialists models` → what models are available, and which specialists already use each one (the `←` markers show assignments)

#### Step 2 — Classify each specialist by tier

| Tier | Specialists (typical) | Recommended model class |
|------|-----------------------|------------------------|
| **Heavy** — deep reasoning, multi-phase, architecture | `overthinker`, `feature-design`, `bug-hunt`, `planner`, `parallel-review` | Opus / Pro / GLM-5 |
| **Standard** — code generation, review, authoring, docs | `codebase-explorer`, `specialist-author`, `sync-docs`, `xt-merge` | Sonnet / Flash-Pro |
| **Light** — fast context, reporting, test runs | `init-session`, `report-generator`, `test-runner` | Haiku / Flash |

Adjust tiers based on what the user actually has installed. Custom specialists: read their `description` and `permission_required` to infer tier.

#### Step 3 — Select models with provider diversity

Rules:
1. **Pick the highest version in each family** — `glm-5` not `glm-4.7`, `claude-sonnet-4-6` not `4-5`, `gemini-3.1-pro-preview` not `gemini-2.5-pro`
2. **`model` and `fallback_model` must be different providers** — never stack two anthropic models
3. **Spread providers across tiers** — don't assign all specialists to anthropic; distribute across anthropic / google-gemini-cli / zai / openai-codex where available
4. **Match thinking capability to tier** — heavy specialists benefit from `thinking: yes` models

Example distribution (based on current `specialists models` output):

| Tier | model | fallback_model |
|------|-------|----------------|
| Heavy | `anthropic/claude-opus-4-6` | `google-gemini-cli/gemini-3.1-pro-preview` |
| Standard | `anthropic/claude-sonnet-4-6` | `google-gemini-cli/gemini-3-flash-preview` |
| Light | `anthropic/claude-haiku-4-5` | `zai/glm-5-turbo` |

If anthropic is not available, use `zai/glm-5` (heavy), `google-gemini-cli/gemini-3.1-pro-preview` (standard), `google-gemini-cli/gemini-3-flash-preview` (light).

#### Step 4 — ⛔ Ping each chosen model before assigning

```bash
# REQUIRED — do not skip, do not assume a model works without pinging
pi --model <provider>/<primary-model-id>  --print "ping"   # must return "pong"
pi --model <provider>/<fallback-model-id> --print "ping"   # must return "pong"
```

Ping **both** primary and fallback. If ping fails → pick next best in that tier and ping again. Do not assign a model that did not respond.

#### Step 5 — Apply with `specialists edit`

```bash
# Example: upgrade heavy-tier specialists
specialists edit overthinker     --model anthropic/claude-opus-4-6     --fallback-model google-gemini-cli/gemini-3.1-pro-preview
specialists edit feature-design  --model anthropic/claude-opus-4-6     --fallback-model google-gemini-cli/gemini-3.1-pro-preview
specialists edit bug-hunt        --model anthropic/claude-opus-4-6     --fallback-model google-gemini-cli/gemini-3.1-pro-preview

# Standard tier
specialists edit codebase-explorer --model anthropic/claude-sonnet-4-6 --fallback-model google-gemini-cli/gemini-3-flash-preview
specialists edit sync-docs         --model anthropic/claude-sonnet-4-6 --fallback-model google-gemini-cli/gemini-3-flash-preview

# Light tier
specialists edit init-session    --model anthropic/claude-haiku-4-5    --fallback-model zai/glm-5-turbo
specialists edit report-generator --model anthropic/claude-haiku-4-5   --fallback-model zai/glm-5-turbo
```

Use `--dry-run` first to preview any change before writing.

#### Step 6 — Verify

```bash
specialists list    # confirm all models updated correctly
specialists models  # confirm assignments look balanced
```

---

### For a new specialist (single model selection)

> **See [⛔ MANDATORY FIRST STEP](#-mandatory-first-step--verify-models-before-writing-any-json) at the top of this skill.**
> Use `pi --list-models` (not `specialists models`) to discover models, ping both before mutating config.

```bash
# 1. pi --list-models            — see exactly what's available on pi right now
# 2. Pick tier + pick highest version in family
# 3. pi --model <primary>  --print "ping"   — must return "pong"
# 4. pi --model <fallback> --print "ping"   — must return "pong"
# 5. Run scaffold-specialist.ts first (pre-script already wired in specialists-creator)
# 6. Use sp edit for field-by-field mutations
```

**Rule:** Never hardcode a model without pinging it. If ping fails, try the next best in that tier.

---

## Quick Start: Scaffold + `sp edit`

```bash
# 1. Create/normalize the specialist JSON with all schema sections present
node config/skills/specialists-creator/scripts/scaffold-specialist.ts config/specialists/my-specialist.specialist.json

# 2. Apply a preset for common model/thinking defaults (optional but preferred)
sp edit my-specialist --preset standard

# 3. Set individual fields via dot.path (primary mutation workflow)
sp edit my-specialist specialist.metadata.name my-specialist
sp edit my-specialist specialist.metadata.version 1.0.0
sp edit my-specialist specialist.execution.model anthropic/claude-sonnet-4-6
sp edit my-specialist specialist.execution.fallback_model google-gemini-cli/gemini-3.1-pro-preview
sp edit my-specialist specialist.execution.permission_required READ_ONLY
sp edit my-specialist specialist.execution.extensions.serena false
sp edit my-specialist specialist.execution.extensions.gitnexus false

# 4. Use --file only for multiline prompt fields
sp edit my-specialist specialist.prompt.system --file .tmp/system.prompt.txt
sp edit my-specialist specialist.prompt.task_template --file .tmp/task-template.prompt.txt

# 5. Verify materialized JSON
sp view my-specialist

# 6. Validate schema
bun skills/specialist-author/scripts/validate-specialist.ts config/specialists/my-specialist.specialist.json
```

---

## Schema Reference

### `specialist.metadata` (required)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | kebab-case: `[a-z][a-z0-9-]*` |
| `version` | string | yes | semver: `1.0.0` |
| `description` | string | yes | One sentence |
| `category` | string | yes | Free text (e.g. `workflow`, `analysis`, `codegen`) |
| `author` | string | no | Optional |
| `created` | string | no | Optional date |
| `updated` | string | no | Optional date, quote it: `"2026-03-22"` |
| `tags` | string[] | no | Optional list |

### `specialist.execution` (required)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `model` | string | — | required — ping before using |
| `fallback_model` | string | — | must be a different provider |
| `mode` | enum | `auto` | `tool` \| `skill` \| `auto` |
| `timeout_ms` | number | `120000` | ms |
| `stall_timeout_ms` | number | — | kill if no event for N ms |
| `interactive` | boolean | `false` | enable multi-turn keep-alive by default |
| `response_format` | enum | `text` | `text` \| `json` \| `markdown` |
| `output_type` | enum | `custom` | `codegen` \| `analysis` \| `review` \| `synthesis` \| `orchestration` \| `workflow` \| `research` \| `custom` |
| `permission_required` | enum | `READ_ONLY` | see tier table below |
| `thinking_level` | enum | — | `off` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` |
| `extensions.serena` | boolean | `true` | set `false` to opt out of Serena extension injection for this specialist |
| `extensions.gitnexus` | boolean | `true` | set `false` to opt out of GitNexus extension injection for this specialist |

**When to use `execution.interactive`**

- Set `interactive: true` for specialists intended for multi-turn workflows (`resume`, iterative planning, long investigations).
- Leave it unset/`false` for one-shot specialists where each run should end immediately.
- Run-level overrides still apply:
  - CLI: `--keep-alive` enables, `--no-keep-alive` disables.
  - MCP `start_specialist`: `keep_alive` enables, `no_keep_alive` disables.
- Effective precedence: explicit disable (`--no-keep-alive` / `no_keep_alive`) → explicit enable (`--keep-alive` / `keep_alive`) → `execution.interactive` → one-shot default.

**Permission tiers** — controls which pi tools are available:

| Level | pi --tools | Use when |
|-------|-----------|----------|
| `READ_ONLY` | `read,grep,find,ls` | Read-only analysis, no bash |
| `LOW` | `+bash` | Inspect/run commands, no file edits |
| `MEDIUM` | `+edit` | Can edit existing files |
| `HIGH` | `+write` | Full access — can create new files |

**Common pitfall:** `READ_WRITE` is **not** a valid value — use `LOW` or higher.

**Per-specialist extension opt-out**

Use `execution.extensions` only when this specialist must suppress default extension injection.
Both flags default to `true`, so omit this block unless opt-out is required.

```json
{
  "specialist": {
    "execution": {
      "extensions": {
        "serena": false,
        "gitnexus": false
      }
    }
  }
}
```

Typical use cases:
- `serena: false` for specialists that must avoid Serena tool/LSP injection
- `gitnexus: false` for specialists that should not receive GitNexus graph tooling
- set both `false` for constrained runs that need clean extension surface

### `specialist.prompt` (required)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `task_template` | string | yes | Template string with `$variable` substitution |
| `system` | string | no | System prompt / agents.md content |
| `skill_inherit` | string | no | Single skill folder/file injected via `pi --skill` (Agent Forge compat) |
| `output_schema` | object | no | JSON schema for structured output — injected into system prompt by runner; post-run validation is warn-only |
| `examples` | array | no | Few-shot examples |

**Output contract precedence (runner-injected):** `response_format` → `output_type` → `output_schema`.

**`response_format` behavior**
- `text`: no report template is injected (raw behavior)
- `json`: specialist must return one parseable JSON object
- `markdown`: specialist must use canonical report sections when applicable:
  - `## Summary`
  - `## Status`
  - `## Changes`
  - `## Verification`
  - `## Risks`
  - `## Follow-ups`
  - `## Beads`
  - Optional: `## Architecture`, `## Acceptance Criteria`, `## Machine-readable block`

**`output_type` (semantic archetype)**
- `codegen`: implementation/change manifests
- `analysis`: architecture/exploration reports
- `review`: compliance/review verdicts
- `synthesis`: decision summaries across multiple findings
- `orchestration`: coordinator actions/state handoffs
- `workflow`: procedural/operational run outputs
- `research`: source-backed findings with confidence
- `custom`: no built-in extension (schema still includes base contract fields in structured modes)

**`output_schema` guidance**: Add when output must be machine-readable by downstream consumers (beads notes, feed, orchestrators). The schema is injected into the system prompt and validated post-run with warn-only behavior (never hard-fail in v1).

**Mandatory markdown+schema rule:** if `response_format: markdown` and `output_schema` is present, the output must include `## Machine-readable block` containing exactly one JSON object in a single ` ```json ` fenced block. That JSON object is canonical and must match the schema.

Standard schemas by specialist type (shown as the `output_schema` object value):

executor — change manifest:
```json
{
  "type": "object",
  "properties": {
    "status": { "enum": ["success", "partial", "failed"] },
    "files_changed": { "type": "array", "items": { "type": "string" } },
    "symbols_modified": { "type": "array", "items": { "type": "string" } },
    "lint_pass": { "type": "boolean" },
    "tests_pass": { "type": "boolean" },
    "issues_closed": { "type": "array", "items": { "type": "string" } },
    "follow_ups": { "type": "array", "items": { "type": "string" } }
  }
}
```

explorer — analysis report:
```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string" },
    "key_files": { "type": "array", "items": { "type": "string" } },
    "architecture_notes": { "type": "string" },
    "recommendations": { "type": "array", "items": { "type": "string" } }
  }
}
```

planner — epic result:
```json
{
  "type": "object",
  "properties": {
    "epic_id": { "type": "string" },
    "children": { "type": "array", "items": { "type": "string" } },
    "test_issues": { "type": "array", "items": { "type": "string" } },
    "first_task": { "type": "string" }
  }
}
```

### `specialist.skills` (optional)

```json
{
  "skills": {
    "paths": [
      "skills/my-skill/",
      "~/.agents/skills/domain/",
      "skills/notes.md"
    ],
    "scripts": [
      {
        "run": "./scripts/pre-check.sh",
        "phase": "pre",
        "inject_output": true
      },
      {
        "run": "bd ready",
        "phase": "pre",
        "inject_output": true
      },
      {
        "run": "./scripts/cleanup.sh",
        "phase": "post"
      }
    ]
  }
}
```

`run` accepts either a **file path** (`./scripts/foo.sh`, `~/scripts/foo.sh`) or a **shell command** (`bd ready`, `git status`). Pre-run validation checks that file paths exist and shell commands are on `PATH`. Shebang typos (e.g. `pytho` instead of `python`) are caught and reported as errors before the session starts.

`path` is accepted as a deprecated alias for `run`.

### `specialist.capabilities` (optional)

Informational declarations used by pre-run validation and future tooling (e.g. `specialists doctor`).

```json
{
  "capabilities": {
    "required_tools": ["bash", "read", "grep", "glob"],
    "external_commands": ["bd", "git", "gh"]
  }
}
```

`external_commands` causes a hard failure if any binary is not found on `PATH` — the session will not start.

### `specialist.output_file` (optional, top-level)

```json
{
  "output_file": ".specialists/my-specialist-result.md"
}
```

Writes the final session output to this file path after the session completes. Relative to the working directory.

### `specialist.communication` (optional)

```json
{
  "communication": {
    "next_specialists": "planner"
  }
}
```

Or as an array:
```json
{
  "communication": {
    "next_specialists": ["planner", "test-runner"]
  }
}
```

`next_specialists` declares which specialist(s) should receive this specialist's output as `$previous_result`. Chaining is executed by the caller (e.g. `run_parallel` pipeline) — this field is declarative metadata.

### `specialist.validation` (optional)

Drives the staleness detection shown in `specialists status` and `specialists list`.

| Field | Type | Notes |
|-------|------|-------|
| `files_to_watch` | string[] | Paths to monitor. If any file's mtime is newer than `metadata.updated`, the specialist is marked **STALE** |
| `stale_threshold_days` | number | If the specialist has been STALE for more than N days, escalates to **AGED** |
| `references` | array | Accepted, currently unused |

**Staleness states:**

| State | Condition |
|-------|-----------|
| `OK` | No watched files changed, or no `files_to_watch` / `updated` set |
| `STALE` | A watched file's mtime > `metadata.updated` |
| `AGED` | STALE + days since `updated` > `stale_threshold_days` |

```json
{
  "specialist": {
    "metadata": {
      "updated": "2026-03-01"
    },
    "validation": {
      "files_to_watch": [
        "src/specialist/schema.ts",
        "src/specialist/runner.ts"
      ],
      "stale_threshold_days": 30
    }
  }
}
```

This specialist goes STALE the moment `schema.ts` or `runner.ts` is modified after March 1st, and AGED if that condition persists for more than 30 days.

### `specialist.beads_integration` (optional)

| Value | Behavior |
|-------|----------|
| `auto` (default) | Create tracking bead when permission_required is LOW+ |
| `always` | Always create a tracking bead |
| `never` | Never create a tracking bead |

---

## Built-in Template Variables

These are **always available** in `task_template` — no configuration needed:

| Variable | Value |
|----------|-------|
| `$prompt` | The user's prompt passed to `use_specialist` |
| `$cwd` | `process.cwd()` at invocation time |
| `$pre_script_output` | Stdout of `pre` scripts with `inject_output: true` (empty string if none) |

**When invoked via `--bead`** (inputBeadId present):

| Variable | Value |
|----------|-------|
| `$bead_context` | Full bead content (replaces `$prompt`) |
| `$bead_id` | The bead ID |

**Custom variables** can be passed at invocation time via `--variables key=value` and accessed as `$key`.

---

## Skills Injection (`skills.paths`)

Files listed under `skills.paths` are read and appended to the system prompt at runtime:

```json
{
  "skills": {
    "paths": [
      "skills/specialist-author/SKILL.md",
      ".claude/agents.md"
    ]
  }
}
```

Each file is appended as:
```
---
# Skill: <path>

<file content>
```

Missing files are silently skipped (no error).

`skill_inherit` (in `prompt:`) works the same way but for a single file — it is an Agent Forge compatibility field, appended under `# Service Knowledge`.

---

## Pre/Post Scripts

Scripts run **locally** (not inside the agent session):

```json
{
  "skills": {
    "scripts": [
      {
        "run": "scripts/gather-context.sh",
        "phase": "pre",
        "inject_output": true
      },
      {
        "run": "scripts/notify.sh",
        "phase": "post",
        "inject_output": false
      }
    ]
  }
}
```

- `pre` scripts run before the agent session starts; use `inject_output: true` to surface their stdout.
- `post` scripts run after the session completes (cleanup, notifications).
- Timeout: 30 seconds per script.
- Exit code is captured but does not abort the run.

---

## Annotated Full Example

```json
{
  "specialist": {
    "metadata": {
      "name": "code-reviewer",
      "version": "1.0.0",
      "description": "Reviews a PR diff for correctness, style, and security issues.",
      "category": "code-quality",
      "author": "team@example.com",
      "updated": "2026-03-22",
      "tags": ["review", "code-quality", "security"]
    },
    "execution": {
      "mode": "tool",
      "model": "anthropic/claude-sonnet-4-6",
      "fallback_model": "google-gemini-cli/gemini-3.1-pro-preview",
      "timeout_ms": 300000,
      "stall_timeout_ms": 60000,
      "interactive": true,
      "response_format": "markdown",
      "permission_required": "READ_ONLY"
    },
    "prompt": {
      "system": "You are an expert code reviewer. Focus on correctness, maintainability, and security.\nDo NOT modify any files -- output a markdown review only.\n",
      "task_template": "Review the following changes:\n\n$prompt\n\n$pre_script_output\n\nWorking directory: $cwd\n\nOutput a structured markdown review with sections: Summary, Issues, Suggestions.\n",
      "skill_inherit": "skills/code-review/guidelines.md"
    },
    "skills": {
      "paths": [
        "skills/code-review/"
      ],
      "scripts": [
        {
          "run": "scripts/get-diff.sh",
          "phase": "pre",
          "inject_output": true
        }
      ]
    },
    "capabilities": {
      "required_tools": ["bash", "read"],
      "external_commands": ["git"]
    },
    "communication": {
      "next_specialists": ["sync-docs"]
    },
    "output_file": ".specialists/review.md",
    "beads_integration": "auto"
  }
}
```

---

## Context Window & Lifecycle Design

Specialists run as long-lived Pi sessions. Context management is not optional — ignoring it causes silent quality degradation before any hard limit is hit.

### Context rot starts before the window fills

Quality degrades as the context grows — compressed early context causes inconsistency, missed facts, and instruction drift. Design for bounded, coherent runs rather than arbitrarily long ones.

**Rules when authoring a specialist:**
- Set `stall_timeout_ms` explicitly for any specialist that may idle between turns (keep-alive/interactive). Without it, a stuck session holds resources indefinitely.
- Use `thinking_level: low` for orchestration/coordinator specialists that emit structured JSON output — thinking tokens cost context budget without improving structured output quality.
- For research/explorer specialists: bounded scope per session + `handoff_summary` in `output_schema` > one unbounded session.
- `interactive: true` specialists must define what "done" looks like in their system prompt — otherwise they drift.

### Context metrics are always available

`status.json` exposes `metrics.token_usage` (cumulative input+output tokens) and `metrics.turns` on every turn. These are written by 08zd Phase 1 and available to any caller (NodeSupervisor, orchestrator, human).

**context_pct formula**: `(cumulative_input_tokens / model_context_window) * 100`

Approximate context windows:
| Model family | Window |
|-------------|--------|
| `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5` | 200k tokens |
| `gemini-3.1-pro-preview` | 1M tokens |
| `qwen3.5-plus`, `dashscope/qwen3.5-plus` | 128k tokens |
| `zai/glm-5`, `zai/glm-5-turbo` | 128k tokens |

### For Node members specifically

NodeSupervisor injects `member_health` into the coordinator resume prompt on **every turn** — not just at warning thresholds. This is by design: the coordinator needs continuous data to make proactive rotation decisions before quality degrades.

When authoring a specialist intended to run as a Node member:
- Include a `handoff_summary` field in `output_schema` so context can be transferred on rotation
- Keep system prompts concise — the NodeSupervisor will inject additional context on each resume
- `thinking_level: low` or `off` for coordinator-class specialists; higher levels for deep analysis members

### Design checklist for long-running specialists

Before finalising a specialist that uses `interactive: true` or is expected to run many turns:

```
[ ] stall_timeout_ms set (not relying on timeout_ms alone)
[ ] thinking_level set appropriately for the output type
[ ] output_schema includes handoff_summary or equivalent for rotation
[ ] system prompt has explicit termination condition ("you are done when...")
[ ] task_template doesn't inject large static blobs that could be fetched on demand
```

---

## Common Errors and Fixes

| Zod Error | Cause | Fix |
|-----------|-------|-----|
| `Must be kebab-case` | `name` has uppercase or spaces | Use `my-specialist` not `MySpecialist` |
| `Must be semver` | `version: "v1.0"` | Use `"version": "1.0.0"` (no `v` prefix) |
| `Invalid enum value ... 'READ_WRITE'` | Wrong permission value | Use `READ_ONLY`, `LOW`, `MEDIUM`, or `HIGH` |
| `Invalid enum value ... 'auto'` on permission_required | Using `auto` for permission_required | `auto` is only valid for `beads_integration` |
| `Required` on `task_template` | `task_template` missing from `prompt` | Add `task_template` (even if just `"$prompt"`) |
| `Required` on `model` | `model` missing from `execution` | Add a model string |
| `Required` on `description` | Missing `description` in `metadata` | Add description string |
| `Required` on `category` | Missing `category` in `metadata` | Add category string |
| Silently ignored / no output | JSON valid but `task_template` doesn't use `$prompt` | Add `$prompt` to `task_template` |
| `defaults` key unrecognized | Using `defaults` top-level key | Remove it; use `--variables` at invocation or built-ins |

---

## File Placement

Specialists are discovered from three scopes (highest priority first):

1. **Project**: `<project-root>/specialists/*.specialist.json`
2. **User**: `~/.agents/specialists/*.specialist.json`
3. **System**: package-bundled specialists

Name your file `<metadata.name>.specialist.json`.

---

## Validation Workflow

A bundled validator is included with this skill so the agent does not need to reconstruct the `bun -e` one-liner from memory. It prints `OK <file>` on success and a field-by-field error list on failure.

```bash
# 1. MANDATORY: discover + ping models (see top of this skill)
pi --list-models
pi --model <provider>/<primary-model-id>  --print "ping"   # must return "pong"
pi --model <provider>/<fallback-model-id> --print "ping"   # must return "pong"

# 2. Scaffold first (fills missing schema sections/fields)
node config/skills/specialists-creator/scripts/scaffold-specialist.ts config/specialists/my-specialist.specialist.json

# 3. Mutate with sp edit (dot.path + presets)
sp edit my-specialist --preset standard
sp edit my-specialist specialist.execution.model <provider>/<primary-model-id>
sp edit my-specialist specialist.execution.fallback_model <provider>/<fallback-model-id>

# 4. Use --file only for multiline prompt fields
sp edit my-specialist specialist.prompt.system --file .tmp/system.prompt.txt
sp edit my-specialist specialist.prompt.task_template --file .tmp/task-template.prompt.txt

# 5. Verify rendered config
sp view my-specialist

# 6. Validate schema with the bundled helper
bun skills/specialist-author/scripts/validate-specialist.ts config/specialists/my-specialist.specialist.json

# 7. List to confirm discovery
specialists list

# 8. Smoke test
specialists run my-specialist --prompt "ping" --no-beads
```

If you need the underlying implementation, read `skills/specialist-author/scripts/validate-specialist.ts`. It is a thin Bun/TypeScript wrapper over `parseSpecialist()` from `src/specialist/schema.ts`, which keeps the helper cross-platform for Windows, macOS, and Linux.
