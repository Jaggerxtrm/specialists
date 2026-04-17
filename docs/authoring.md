---
title: Specialist Authoring
scope: authoring
category: guide
version: 1.8.0
updated: 2026-04-17
synced_at: 50850982
description: How to write, validate, place, and maintain specialist definition files.
source_of_truth_for:
  - ".xtrm/skills/active/pi/specialists-creator/SKILL.md"
  - "src/specialist/schema.ts"
  - "src/specialist/runner.ts"
  - "src/pi/session.ts"
domain:
  - authoring
---

# Specialist Authoring

This guide is the user-facing reference for authoring `.specialist.json` files. It mirrors the canonical `specialists-creator` skill and keeps examples aligned with runtime behavior.

> **Format:** All specialists use `.specialist.json`. YAML (`.specialist.yaml`) is deprecated — still loaded but prints a deprecation warning. Migrate existing YAML files to JSON.

## JSON Format Notes

- All string enum values must be quoted: `"READ_ONLY"`, `"auto"`, `"markdown"`
- Version must be a quoted string: `"1.0.0"` not `1.0.0`
- Multi-line strings use `\n` for newlines in `task_template`
- Comments are **not** supported in JSON — document intent in a companion `.md` file
- Use a JSON linter/formatter to catch syntax errors before running `specialists validate`

## Minimal skeleton

```json
{
  "specialist": {
    "metadata": {
      "name": "my-specialist",
      "version": "1.0.0",
      "description": "One sentence.",
      "category": "workflow"
    },
    "execution": {
      "model": "anthropic/claude-sonnet-4-6",
      "permission_required": "READ_ONLY"
    },
    "prompt": {
      "task_template": "$prompt\n\nWorking directory: $cwd"
    }
  }
}
```

---

## `specialist.metadata` (required)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | kebab-case: `[a-z][a-z0-9-]*` |
| `version` | string | yes | semver (`"1.0.0"`) — must be a quoted string in JSON |
| `description` | string | yes | one-sentence summary |
| `category` | string | yes | free text (`"workflow"`, `"analysis"`, `"codegen"`, …) |
| `author` | string | no | optional |
| `created` | string | no | optional date |
| `updated` | string | no | optional date |
| `tags` | string[] | no | optional labels |

## `specialist.execution` (required)

| Field | Type | Default | Notes |
|---|---|---|---|
| `model` | string | — | required — ping before using |
| `fallback_model` | string | — | recommended from a different provider |
| `mode` | `"tool" \| "skill" \| "auto"` | `"auto"` | run mode |
| `timeout_ms` | number | `120000` | run timeout (ms) |
| `stall_timeout_ms` | number | unset | kill if no event for N ms |
| `max_retries` | number | `0` | retry count on failure |
| `interactive` | boolean | `false` | keep-alive by default for multi-turn specialists |
| `response_format` | `"text" \| "json" \| "markdown"` | `"text"` | output contract hint |
| `output_type` | enum | `"custom"` | semantic archetype: `"codegen"`, `"analysis"`, `"review"`, `"synthesis"`, `"orchestration"`, `"workflow"`, `"research"`, `"custom"` |
| `permission_required` | `"READ_ONLY" \| "LOW" \| "MEDIUM" \| "HIGH"` | `"READ_ONLY"` | tool-access tier |
| `thinking_level` | `"off" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh"` | unset | forwarded to thinking-capable models |
| `extensions.serena` | boolean | `true` | `false` disables Serena extension injection for this specialist |
| `extensions.gitnexus` | boolean | `true` | `false` disables GitNexus extension injection for this specialist |

### Permission tiers

| Level | Tools |
|---|---|
| `"READ_ONLY"` | `read, grep, find, ls` |
| `"LOW"` | `+ bash` |
| `"MEDIUM"` | `+ edit` |
| `"HIGH"` | `+ write` |

> `READ_WRITE` is **not** a valid permission value.

### Interactive precedence

Effective keep-alive order is:
1. explicit disable (`--no-keep-alive` / `no_keep_alive`)
2. explicit enable (`--keep-alive` / `keep_alive`)
3. JSON `execution.interactive`
4. default one-shot (`false`)

### Extension opt-out

Use `execution.extensions` only when specialist must skip default extension injection.
`false` disables injection for that specialist only.

## `specialist.prompt` (required)

| Field | Type | Required | Notes |
|---|---|---|---|
| `task_template` | string | yes | rendered with `$variables` |
| `system` | string | no | system prompt content |
| `skill_inherit` | string | no | single skill folder/file injected via `--skill` |
| `output_schema` | object | no | JSON schema for structured output — runner-injected, warn-only validation |
| `examples` | array | no | few-shot examples |

### Output contract precedence

**Order:** `response_format` → `output_type` → `output_schema`

**`response_format` behavior:**
- `"text"`: no report template injected (raw behavior)
- `"json"`: specialist must return one parseable JSON object
- `"markdown"`: specialist must use canonical report sections:
  - `## Summary`, `## Status`, `## Changes`, `## Verification`, `## Risks`, `## Follow-ups`, `## Beads`
  - Optional: `## Architecture`, `## Acceptance Criteria`, `## Machine-readable block`

**`output_type` (semantic archetype):**
- `"codegen"`: implementation/change manifests
- `"analysis"`: architecture/exploration reports
- `"review"`: compliance/review verdicts
- `"synthesis"`: decision summaries across multiple findings
- `"orchestration"`: coordinator actions/state handoffs
- `"workflow"`: procedural/operational run outputs
- `"research"`: source-backed findings with confidence
- `"custom"`: no built-in extension

**`output_schema` guidance:** Add when output must be machine-readable. Schema is injected into system prompt; post-run validation is warn-only.

**Mandatory markdown+schema rule:** If `response_format: "markdown"` and `output_schema` present, output must include `## Machine-readable block` with exactly one JSON object in a ` ```json ` fenced block matching the schema.

**Standard schemas by specialist type:**

```json
// executor — change manifest
{
  "prompt": {
    "output_schema": {
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
  }
}

// explorer — analysis report
{
  "prompt": {
    "output_schema": {
      "type": "object",
      "properties": {
        "summary": { "type": "string" },
        "key_files": { "type": "array", "items": { "type": "string" } },
        "architecture_notes": { "type": "string" },
        "recommendations": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}

// planner — epic result
{
  "prompt": {
    "output_schema": {
      "type": "object",
      "properties": {
        "epic_id": { "type": "string" },
        "children": { "type": "array", "items": { "type": "string" } },
        "test_issues": { "type": "array", "items": { "type": "string" } },
        "first_task": { "type": "string" }
      }
    }
  }
}
```

---

## `specialist.skills` (optional)

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

### `skills.paths`
- Each item is passed via `pi --skill`.
- Folders resolve to their `SKILL.md`.
- Direct file paths are accepted.
- Missing files are skipped silently.

### `skills.scripts`
- `run` accepts either:
  - a file path (`./scripts/foo.sh`, `~/scripts/foo.sh`), or
  - a shell command (`bd ready`, `git status`).
- `path` is still accepted as a deprecated alias for `run`.
- `phase` can be `"pre"` or `"post"`.
- `inject_output: true` makes script stdout available as `$pre_script_output`.

### Pre/post script execution details
- Scripts run **locally**, outside the specialist model session.
- `pre` scripts run before session start.
- `post` scripts run after completion.
- Timeout is 30 seconds per script.
- Exit code is captured, but script failure does **not** abort the run.
- Pre-run validation checks:
  - file paths exist,
  - command binaries exist on `PATH`,
  - obvious shebang typos are reported before launch.

---

## `specialist.capabilities` (optional)

Declarative capabilities help validation and tooling (`specialists doctor`, pre-run checks).

```json
{
  "capabilities": {
    "required_tools": ["bash", "read", "grep", "glob"],
    "external_commands": ["bd", "git", "gh"]
  }
}
```

| Field | Type | Behavior |
|---|---|---|
| `required_tools` | string[] | Declares required pi tools |
| `external_commands` | string[] | Commands validated on `PATH` before run |

If any `external_commands` binary is missing, startup hard-fails and the session does not begin.

---

## `specialist.output_file` (optional, top-level)

```json
{
  "output_file": ".specialists/my-specialist-result.md"
}
```

Writes final specialist output to the file after completion. Relative paths are resolved from the working directory.

---

## `specialist.communication` (optional)

```json
{
  "communication": {
    "next_specialists": "planner"
  }
}
```

```json
{
  "communication": {
    "next_specialists": ["planner", "test-runner"]
  }
}
```

`next_specialists` declares downstream chain targets that should receive `$previous_result`. This field is metadata; execution/chaining is performed by the caller/pipeline.

---

## `specialist.validation` (optional)

Used by staleness reporting in `specialists status` and `specialists list`.

| Field | Type | Notes |
|---|---|---|
| `files_to_watch` | string[] | If any watched file mtime is newer than `metadata.updated`, status becomes `STALE` |
| `stale_threshold_days` | number | Days before `STALE` escalates to `AGED` |
| `references` | array | accepted, currently unused |

### Staleness states

| State | Condition |
|---|---|
| `OK` | No watched file changed, or no watch/updated metadata configured |
| `STALE` | Watched file mtime > `metadata.updated` |
| `AGED` | `STALE` and days since `updated` > `stale_threshold_days` |

Example:

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

---

## `specialist.stall_detection` (optional)

Controls stall detection warnings during specialist execution.

| Field | Type | Default | Notes |
|---|---|---|---|
| `running_silence_warn_ms` | number | `60000` | Warn if no events for N ms while running |
| `running_silence_error_ms` | number | `300000` | Mark stale if no events for N ms while running |
| `waiting_stale_ms` | number | `3600000` | Warn if waiting state lasts N ms |
| `tool_duration_warn_ms` | number | `120000` | Warn if single tool runs longer than N ms |

```json
{
  "stall_detection": {
    "running_silence_warn_ms": 60000,
    "running_silence_error_ms": 300000,
    "waiting_stale_ms": 3600000,
    "tool_duration_warn_ms": 120000
  }
}
```

---

## `specialist.beads_integration` (optional)

| Value | Behavior |
|---|---|
| `"auto"` (default) | Create tracking bead when `permission_required` is `LOW` or higher |
| `"always"` | Always create a tracking bead |
| `"never"` | Never create a tracking bead |

`beads_write_notes` (boolean, default `true`) — when `true`, the specialist appends run notes to the associated bead on completion.

---

## Built-in template variables

Always available in `prompt.task_template`:

| Variable | Value |
|---|---|
| `$prompt` | user prompt passed to the specialist |
| `$cwd` | current working directory (`process.cwd()`) |
| `$pre_script_output` | combined stdout from `pre` scripts with `inject_output: true` (empty string if none) |

When invoked with bead context (`--bead` / `bead_id`):

| Variable | Value |
|---|---|
| `$bead_context` | full bead content (used in place of plain prompt context) |
| `$bead_id` | bead identifier |

Custom variables can be passed at invocation with `--variables key=value` and referenced as `$key`.

---

## Skills injection mechanics

Files from `skills.paths` are read and appended to the system prompt at runtime.

Append format:

```text
---
# Skill: <path>

<file content>
```

`prompt.skill_inherit` behaves similarly but is intended as single-file Agent Forge compatibility input and is appended under `# Service Knowledge`.

---

## File placement scopes (3-tier discovery)

Specialists are discovered in priority order:

1. Project: `<project-root>/specialists/*.specialist.json`
2. User: `~/.agents/specialists/*.specialist.json`
3. System: package-bundled specialists

Name files as `<metadata.name>.specialist.json`.

> **Deprecated:** `.specialist.yaml` files are still loaded but print a deprecation warning. Migrate to `.specialist.json`.

---

## Validation workflow

1. Author/update the `.specialist.json` file.
2. Run schema validation:

```bash
# Option A: CLI command (preferred)
specialists validate specialists/my-specialist.specialist.json

# Option B: direct schema validator
bun src/specialist/validate.ts specialists/my-specialist.specialist.json
```

3. Confirm discovery:

```bash
specialists list
```

4. Smoke test run:

```bash
specialists run my-specialist --prompt "ping" --no-beads
```

The validator prints `OK <file>` on success and field-level errors on failure.

---

## Common errors and fixes

| Error (typical) | Cause | Fix |
|---|---|---|
| `Must be kebab-case` | `metadata.name` has spaces/uppercase | use `"my-specialist"` |
| `Must be semver` | version like `"v1.0"` or unquoted `1.0.0` | use `"version": "1.0.0"` |
| `Invalid enum value ... 'READ_WRITE'` | invalid permission tier | use `"READ_ONLY"`, `"LOW"`, `"MEDIUM"`, or `"HIGH"` |
| `Invalid enum value ... 'auto'` on `permission_required` | wrong enum on wrong field | use `"auto"` only for `beads_integration` |
| `Required` on `task_template` | missing prompt template | add `prompt.task_template` |
| `Required` on `model` | missing execution model | add `execution.model` |
| `Required` on `description` | missing metadata description | add `metadata.description` |
| `Required` on `category` | missing metadata category | add `metadata.category` |
| JSON parse error | Missing comma, trailing comma, unquoted key | Run through a JSON linter; all keys and string values must be quoted |
| Valid JSON but poor results | `task_template` never uses `$prompt` | include `$prompt` in template |
| `defaults` key unrecognized | unsupported top-level key | remove `defaults`; pass runtime values via `--variables` |

---

## Context Window & Lifecycle Design

Specialists run as long-lived Pi sessions. Context management is not optional — ignoring it causes silent quality degradation before any hard limit is hit.

### Context rot starts before the window fills

Quality degrades as the context grows — compressed early context causes inconsistency, missed facts, and instruction drift. Design for bounded, coherent runs rather than arbitrarily long ones.

### Model context windows

| Model family | Context window |
|--------------|----------------|
| Gemini 3.1 Pro | 1,000,000 tokens |
| Qwen3.5 / GLM-5 | 128,000 tokens |
| Claude (all) | 200,000 tokens |

### Context health thresholds

| Utilization | Health | Action |
|-------------|--------|--------|
| < 40% | OK | Normal operation |
| 40–65% | MONITOR | Watch for degradation |
| 65–80% | WARN | Consider wrap-up |
| > 80% | CRITICAL | High risk of quality loss |

### Design patterns

1. **Phase-bounded runs**: Split large tasks into discrete phases with explicit completion points
2. **Checkpoint handoffs**: Use `next_specialists` to transfer state to fresh sessions
3. **Summarization gates**: Emit structured summaries at phase boundaries for downstream context injection

---

## See also

- [specialists-catalog.md](specialists-catalog.md)
- [workflow.md](workflow.md)
- [mcp-tools.md](mcp-tools.md)
