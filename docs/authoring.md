---
title: Specialist Authoring
scope: authoring
category: guide
version: 1.4.0
updated: 2026-03-30
synced_at: 0972c0b0
description: How to write, place, and maintain project specialists.
source_of_truth_for:
  - "src/specialist/schema.ts"
  - "src/specialist/runner.ts"
  - "src/pi/session.ts"
  - "config/specialists/*.specialist.yaml"
domain:
  - authoring
---

# Specialist Authoring

Project specialists are discovered from:

```text
.specialists/default/specialists/   # canonical (from init)
.specialists/user/specialists/      # custom overrides/additions
```

## Minimal skeleton

```yaml
specialist:
  metadata:
    name: my-specialist
    version: 1.0.0
    description: "What it does"
    category: analysis

  execution:
    model: anthropic/claude-sonnet-4-6
    permission_required: READ_ONLY

  prompt:
    task_template: |
      $prompt

      Working directory: $cwd
```

## Execution schema (current)

| Field | Type | Default | Notes |
|---|---|---|---|
| `model` | string | — | required |
| `fallback_model` | string | — | optional, different provider recommended |
| `mode` | `tool|skill|auto` | `auto` | |
| `timeout_ms` | number | `120000` | per-turn wait timeout |
| `stall_timeout_ms` | number | unset | session inactivity watchdog |
| `max_retries` | int >= 0 | `0` | retry count for transient backend failures |
| `response_format` | `text|json|markdown` | `text` | output contract format hint |
| `permission_required` | `READ_ONLY|LOW|MEDIUM|HIGH` | `READ_ONLY` | pi tool access tier |
| `thinking_level` | enum | unset | forwarded to `pi --thinking` |

## Prompt schema (current)

| Field | Type | Required | Notes |
|---|---|---|---|
| `task_template` | string | yes | rendered with `$variables` |
| `system` | string | no | appended as system prompt |
| `output_schema` | object | no | schema for structured output contract |
| `examples` | array | no | few-shot examples |
| `skill_inherit` | string | no | injected via `--skill` |

## Output contract

`response_format` + `output_schema` define the expected output contract and are wired into the runner path for structured specialist responses.

Use `response_format: json` with `output_schema` when downstream automation parses output.

## Retry behavior (`max_retries`)

Runner executes up to `max_retries + 1` attempts.

Retries happen only for transient backend failures. Retries are skipped for:
- auth failures (401/403/invalid API key class)
- explicit session kills
- non-transient errors

Backoff is exponential with jitter.

## Permission tiers

| Level | Tools |
|---|---|
| `READ_ONLY` | `read, grep, find, ls` |
| `LOW` | `+ bash` |
| `MEDIUM` | `+ edit` |
| `HIGH` | `+ write` |

## Bead-aware run behavior

When invoked with an input bead (`--bead` / `bead_id`), runner appends a system override instructing the specialist to claim/close that bead directly and not create sub-beads.

## Example (structured, retry-enabled)

```yaml
specialist:
  metadata:
    name: api-auditor
    version: 1.0.0
    description: "API contract checker"
    category: quality

  execution:
    model: openai-codex/gpt-5.4
    fallback_model: anthropic/claude-sonnet-4-6
    timeout_ms: 0
    stall_timeout_ms: 120000
    max_retries: 2
    response_format: json
    permission_required: READ_ONLY

  prompt:
    task_template: |
      Validate API behavior for:
      $prompt
    output_schema:
      type: object
      properties:
        summary: { type: string }
        issues:
          type: array
          items: { type: string }
      required: [summary, issues]
```

## See also

- [specialists-catalog.md](specialists-catalog.md)
- [workflow.md](workflow.md)
- [mcp-tools.md](mcp-tools.md)
