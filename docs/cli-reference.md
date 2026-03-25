---
title: CLI Reference
scope: cli
category: reference
version: 1.3.0
updated: 2026-03-25
description: Command and flag reference for the Specialists CLI.
source_of_truth_for:
  - "src/index.ts"
  - "src/cli/**/*.ts"
domain:
  - cli
---

# CLI Reference

## Core commands

| Command | Purpose |
|---|---|
| `specialists init` | Bootstrap a project |
| `specialists list` | List project specialists |
| `specialists models` | List all pi models with capability flags |
| `specialists edit` | Edit a specialist's fields in-place |
| `specialists run` | Run a specialist |
| `specialists feed` | Tail job events |
| `specialists result` | Print final job output |
| `specialists steer` | Send a mid-run message to a running job |
| `specialists follow-up` | Send a next-turn prompt to a keep-alive session |
| `specialists stop` | Stop a running job |
| `specialists status` | Show health and active jobs |
| `specialists doctor` | Diagnose installation/runtime issues |
| `specialists quickstart` | Full getting-started guide |
| `specialists help` | Top-level help |

## `specialists run`

Tracked work:

```bash
specialists run <name> --bead <id>
specialists run <name> --bead <id> --context-depth 2 --background
```

Ad-hoc work:

```bash
specialists run <name> --prompt "..."
```

Flags:

| Flag | Meaning |
|---|---|
| `--bead <id>` | Use an existing bead as the prompt source |
| `--prompt "..."` | Ad-hoc prompt for untracked work |
| `--context-depth <n>` | Dependency context depth for tracked work |
| `--no-beads` | Do not create a new tracking bead |
| `--background` | Start async and return a job id |
| `--model <model>` | Override the configured model for a run |
| `--keep-alive` | Keep the Pi session alive after completion for follow-up turns |

## `specialists feed`

```bash
specialists feed <job-id>
specialists feed <job-id> --follow
specialists feed -f
specialists feed -f --forever
```

## `specialists steer`

Send a mid-run steering message to a running background job. The agent receives it after its current tool calls finish, before the next LLM call.

```bash
specialists steer <job-id> "<message>"
```

Examples:

```bash
specialists steer a1b2c3 "focus only on supervisor.ts"
specialists steer a1b2c3 "skip tests, just fix the bug"
```

Notes:
- Only works for jobs started with `--background`.
- Uses a named FIFO at `.specialists/jobs/<id>/steer.pipe` for cross-process delivery.
- The MCP tool `steer_specialist` covers the same action for in-process `start_specialist` jobs.

## `specialists follow-up`

Send a next-turn prompt to a keep-alive session. The Pi session retains full conversation history between turns — no re-reading, no context loss.

```bash
specialists follow-up <job-id> "<message>"
```

Requires the job to have been started with `--keep-alive --background`. The job status will be `waiting` between turns.

Examples:

```bash
# Start a keep-alive session
specialists run bug-hunt --bead unitAI-abc --keep-alive --background
# → Job started: 49adda  (transitions to status: waiting after first turn)

specialists result 49adda                           # read first turn output
specialists follow-up 49adda "now write the fix"    # start second turn
specialists feed 49adda --follow                    # watch the response
specialists follow-up 49adda "add a test for it"    # third turn, still same context
```

Notes:
- Status cycles: `running` → `waiting` → `running` → `waiting` → …
- Uses the same FIFO (`steer.pipe`) as `steer`. Writes `{"type":"prompt","message":"..."}`.
- Contrast with `steer`: steer redirects mid-turn, follow-up starts a new turn.
- The MCP tool `follow_up_specialist` covers the same action for in-process `start_specialist` jobs.

## `specialists models`

```bash
specialists models
```

Lists all models available on pi, flagged with thinking and image support. Shows which specialists currently use each model. Use when selecting or rebalancing models across specialists.

## `specialists edit`

Edit a specialist's fields directly in the YAML file.

```bash
specialists edit <name> --model <value>
specialists edit <name> --fallback-model <value>
specialists edit <name> --permission <level>
specialists edit <name> --timeout <ms>
specialists edit <name> --description "..."
specialists edit <name> --tags analysis,security
```

Flags:

| Flag | Meaning |
|---|---|
| `--model <value>` | Set primary model |
| `--fallback-model <value>` | Set fallback model |
| `--permission <level>` | Set permission level (`READ_ONLY`, `LOW`, `MEDIUM`, `HIGH`) |
| `--timeout <ms>` | Set timeout in milliseconds |
| `--description "..."` | Update metadata description |
| `--tags tag1,tag2` | Set metadata tags |
| `--dry-run` | Preview change without writing |
| `--scope project\|user` | Disambiguate if name exists in multiple scopes |

## `specialists init`

```bash
specialists init
specialists init --force-workflow
```

## Deprecated commands

These exist only for migration guidance:

- `specialists setup`
- `specialists install`

## See also

- [workflow.md](workflow.md)
- [background-jobs.md](background-jobs.md)
- [bootstrap.md](bootstrap.md)
