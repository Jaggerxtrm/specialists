---
name: using-script-specialists
description: >
  Use this skill for synchronous one-shot specialist invocations via `sp script`
  (CLI) or `sp serve` (HTTP daemon). These run READ_ONLY, template-driven
  specialists with `$var` substitution and return JSON in-process — no beads,
  no chains, no worktrees, no job lifecycle. Trigger when integrating a
  specialist into a service, script, or library, when the caller needs the
  output immediately, or when the work is a single LLM call with structured
  input/output. Do NOT use for tracked agent work — that belongs to
  `using-specialists-v2`.
version: 1.0
---

# Script-Class Specialists

`sp script` and `sp serve` are a separate runtime from the bead-first
orchestration covered by `using-specialists-v2`. They exist for service and
library integration, not for agent chains.

| Aspect | `sp run` (orchestration) | `sp script` / `sp serve` |
| --- | --- | --- |
| Driver | bead contract | template + variables |
| Execution | supervised job, async | one-shot, synchronous |
| Permissions | READ_ONLY / MEDIUM / HIGH | READ_ONLY only |
| Worktrees | edit-capable provisions one | rejected |
| Output | result.txt + events.jsonl + bead notes | stdout JSON / HTTP body |
| Audit | `.specialists/jobs/<id>/` | one row in `.specialists/db/observability.db` |

Use `sp script` from a shell or build pipeline. Use `sp serve` from a service
that needs an HTTP endpoint backed by `pi`. The same `.specialist.json` runs
under both.

## When To Use This Skill

Trigger when:

- A service or script needs a single LLM-backed transform (summarize, classify,
  extract) returning JSON.
- You are integrating specialists into Python/Node code that cannot block on a
  supervised job lifecycle.
- The call is request/response shaped: variables in, structured output out.
- You need a sidecar HTTP endpoint (`sp serve`) to wrap a specialist for a
  service consumer that already speaks HTTP.

Do NOT trigger for: code review, debugging, implementation, multi-turn work,
keep-alive sessions, anything that should write files. Those belong to
`using-specialists-v2`.

## Specialist Compatibility (compatGuard)

A spec is rejected at request time (`specialist_load_error`) if any of:

- `execution.interactive` is `true`
- `execution.requires_worktree` is `true`
- `execution.permission_required` is anything other than `READ_ONLY`
- `skills.scripts` is non-empty
- `prompt.task_template` is missing
- a referenced `$var` in the chosen template is not supplied (`template_variable_missing`)

Author specs that explicitly target script-class:

```json
{
  "specialist": {
    "metadata": { "name": "summarize-event", "version": "1.0.0", "category": "ingestion" },
    "execution": {
      "mode": "auto",
      "model": "anthropic/claude-haiku-4-5",
      "timeout_ms": 30000,
      "interactive": false,
      "response_format": "json",
      "output_type": "custom",
      "permission_required": "READ_ONLY",
      "requires_worktree": false,
      "max_retries": 0
    },
    "prompt": {
      "task_template": "Summarize event $event_id with body: $body. Return JSON {\"summary\": \"...\"}.",
      "output_schema": { "required": ["summary"] }
    }
  }
}
```

## `sp script` — One-Shot CLI

```bash
sp script <specialist-name> \
  --vars key1=value1 --vars key2=value2 \
  [--template task_template] \
  [--model anthropic/claude-sonnet-4-6] \
  [--thinking medium] \
  [--timeout-ms 60000] \
  [--db-path /path/to/observability.db] \
  [--single-instance <lock-name>] \
  [--no-trace] \
  [--json]
```

Behaviour:

- Loads the spec via `SpecialistLoader` (same loader as `sp run`).
- Renders `prompt.task_template` (or named template) with `--vars`.
- Spawns `pi --mode json --no-session --no-extensions --no-tools` with the
  resolved model.
- Returns the final assistant text on stdout. With `--json`, returns the full
  `ScriptGenerateResult` envelope.
- Writes one row to `.specialists/db/observability.db` (same writer as `sp run`).

Exit codes:

- `0` — success.
- non-zero — failure; with `--json`, body has `success: false` and `error_type`.

Use `--single-instance <lock>` when concurrent invocations of the same logical
job must be serialized (cron, batch script).

## `sp serve` — HTTP Daemon

```bash
sp serve \
  [--port 8000] \
  [--concurrency 4] \
  [--queue-timeout-ms 5000] \
  [--shutdown-grace-ms 30000] \
  [--project-dir /path/to/project] \
  [--fallback-model anthropic/claude-haiku-4-5]
```

POST `/v1/generate`:

```json
{
  "specialist": "summarize-event",
  "variables": { "event_id": "abc", "body": "..." },
  "template": "task_template",
  "model_override": "anthropic/...",
  "timeout_ms": 60000,
  "trace": true
}
```

Response (200, success):

```json
{
  "success": true,
  "output": "<final text>",
  "parsed_json": { "summary": "..." },
  "meta": {
    "specialist": "summarize-event",
    "model": "anthropic/claude-haiku-4-5",
    "duration_ms": 1234,
    "trace_id": "<uuid>"
  }
}
```

Response (200, failure):

```json
{ "success": false, "error": "...", "error_type": "..." }
```

Error types: `specialist_not_found | specialist_load_error |
template_variable_missing | auth | quota | timeout | network | invalid_json |
output_too_large | internal`.

`400` is reserved for malformed HTTP. `429` returns when concurrency cap is
saturated past `queue-timeout-ms`.

## Operational Rules

- One `pi` subprocess per in-flight request, bounded by `--concurrency`.
- Credentials come from `pi`'s own `~/.pi/agent/auth.json`. The service never
  touches API keys.
- Observability DB is shared with `sp run`. Audit trail is unified.
- The service is sidecar-per-consumer: no multi-tenant routing, no session
  state, no orchestration. If you need orchestration, use `sp run` + beads.
- For container deployments, see `docs/specialists-service-install.md`. Image
  runs as non-root UID 10001; bind-mount `~/.pi` and `.specialists/`.

## When To Switch Back To `using-specialists-v2`

If any of these become true mid-design, drop script-class and use the
orchestration runtime:

- The work needs to write files.
- The caller wants a multi-turn / keep-alive session.
- A reviewer pass is needed.
- The work should be tracked as a bead with auditability beyond a single
  observability row.
- The output is iterative (steer / resume).

## What Not To Put Here

- Bead workflow, chains, epics, reviewers, worktrees — those live in
  `using-specialists-v2`.
- Orchestration MCP tooling (`use_specialist`).
- Long-running multi-turn examples.

## Reference

- `docs/specialists-service.md` — HTTP contract and operational notes.
- `docs/specialists-service-install.md` — Docker/Podman install path.
- `docs/script-specialists.md` — historical context for the script-class shape.
- `src/cli/script.ts`, `src/cli/serve.ts`, `src/specialist/script-runner.ts` — runtime.
