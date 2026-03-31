---
title: CLI Reference
scope: cli
category: reference
version: 1.4.2
updated: 2026-03-30
synced_at: 0972c0b0
description: Complete command reference for the Specialists CLI, generated from current source.
source_of_truth_for:
  - src/index.ts
  - src/cli/run.ts
  - src/cli/feed.ts
  - src/cli/poll.ts
  - src/cli/result.ts
  - src/cli/status.ts
  - src/cli/resume.ts
  - src/cli/steer.ts
  - src/cli/stop.ts
  - src/cli/list.ts
  - src/cli/models.ts
  - src/cli/edit.ts
  - src/cli/init.ts
  - src/cli/doctor.ts
  - src/cli/validate.ts
---

# CLI Reference

`specialists` has a short alias: `sp`.

---

## `specialists run`

### Synopsis

```bash
specialists run <name> [--prompt "..."] [--bead <id>] [--context-depth <n>] \
  [--model <provider/model>] [--no-beads] [--keep-alive|--no-keep-alive] [--json | --raw]
```

### Flags

- `--prompt <text>`: Ad-hoc prompt.
- `--bead <id>`: Read prompt/context from bead.
- `--context-depth <n>`: Completed blocker depth for bead context (default `1`).
- `--model <provider/model>`: Per-run model override.
- `--no-beads`: Disable tracking bead creation (does **not** disable bead reading when `--bead` is used).
- `--keep-alive`: Keep session for follow-up `resume` turns (explicit enable).
- `--no-keep-alive`: Force one-shot run even if specialist YAML has `execution.interactive: true`.
- `--json`: NDJSON event stream to stdout.
- `--raw`: Legacy raw token delta stream.

### Examples

```bash
specialists run debugger --bead unitAI-55d
specialists run debugger --bead unitAI-55d --context-depth 2
specialists run reviewer --prompt "Audit src/cli/run.ts"
cat brief.md | specialists run planner
specialists run reviewer --prompt "check logs" --json
specialists run reviewer --prompt "check logs" --raw
```

### Exit codes

- `0`: Run completed.
- `1`: Invalid args, specialist/bead load failure, runtime failure.

Notes:
- `--prompt` and `--bead` are mutually exclusive.
- Keep-alive default follows specialist YAML `execution.interactive` (default `false`).
- Precedence: `--no-keep-alive` > `--keep-alive` > `execution.interactive`.
- `--background` is removed and exits with error.

---

## `specialists feed`

### Synopsis

```bash
specialists feed <job-id> [options]
specialists feed -f [--forever] [options]
```

### Flags

- `--job <id>`: Filter by job ID.
- `--specialist <name>`: Filter by specialist.
- `--since <iso|relative>`: Start time filter (`2026-03-30T10:00:00Z`, `5m`, `1h`, `30s`, `1d`).
- `--limit <n>`: Max events in snapshot mode (default `100`).
- `-f`, `--follow`: Live follow mode.
- `--forever`: In global follow mode, keep following after all jobs complete.
- `--json`: NDJSON output.

### Examples

```bash
specialists feed a1b2c3
specialists feed a1b2c3 --follow
specialists feed -f
specialists feed -f --forever
specialists feed --specialist debugger --since 1h --limit 200
specialists feed --job a1b2c3 --json
```

### Exit codes

- `0`: Success (including no events found).
- `1`: Unhandled runtime error.

---

## `specialists poll`

### Synopsis

```bash
specialists poll <job-id> [--cursor N] [--output-cursor N] [--json]
```

### Flags

- `--cursor <n>`: Event cursor offset (default `0`).
- `--output-cursor <n>`: Output text cursor offset (default `0`).
- `--json`: Accepted and ignored (JSON is always returned).

### Examples

```bash
specialists poll a1b2c3
specialists poll a1b2c3 --cursor 10
specialists poll a1b2c3 --cursor 10 --output-cursor 2048
specialists poll a1b2c3 --json
```

### Exit codes

- `0`: Job found and polled.
- `1`: Missing/invalid args, job not found, or use of removed `--follow`.

Notes:
- `--follow`/`-f` is removed from `poll`; use `specialists feed --follow`.

---

## `specialists result`

### Synopsis

```bash
specialists result <job-id> [--wait] [--timeout <seconds>]
```

### Flags

- `--wait`: Poll until terminal state.
- `--timeout <seconds>`: Wait timeout (positive integer).

### Examples

```bash
specialists result a1b2c3
specialists result a1b2c3 --wait
specialists result a1b2c3 --wait --timeout 120
specialists result a1b2c3 > output.md
```

### Exit codes

- `0`: Result printed.
- `1`: Job missing, still running with no result file, failed job, timeout, or invalid args.

---

## `specialists status`

### Synopsis

```bash
specialists status [--json] [--job <id> | --job=<id>]
```

### Flags

- `--json`: Machine-readable status.
- `--job <id>` / `--job=<id>`: Show one job only.

### Examples

```bash
specialists status
specialists status --json
specialists status --job a1b2c3
specialists status --job=a1b2c3 --json
```

### Exit codes

- `0`: Success.
- `1`: Invalid `--job` usage or unknown job.

---

## `specialists resume`

### Synopsis

```bash
specialists resume <job-id> "<task>"
```

### Flags

No flags.

### Examples

```bash
specialists resume a1b2c3 "Now write the patch"
specialists resume a1b2c3 "Focus only on auth"
```

### Exit codes

- `0`: Resume message sent.
- `1`: Missing args, missing job, non-waiting status, missing FIFO, or write failure.

---

## `specialists steer`

### Synopsis

```bash
specialists steer <job-id> "<message>"
```

### Flags

No flags.

### Examples

```bash
specialists steer a1b2c3 "focus only on supervisor.ts"
specialists steer a1b2c3 "skip tests and isolate root cause"
```

### Exit codes

- `0`: Steer message sent.
- `1`: Missing args, missing job, terminal job state, missing FIFO, or write failure.

---

## `specialists stop`

### Synopsis

```bash
specialists stop <job-id>
```

### Flags

No flags.

### Examples

```bash
specialists stop a1b2c3
```

### Exit codes

- `0`: Signal sent, already terminal, or process already gone (`ESRCH`).
- `1`: Missing args, missing job, missing PID, or unexpected kill error.

---

## `specialists list`

### Synopsis

```bash
specialists list [--category <name>] [--scope default|user] [--json]
```

### Flags

- `--category <name>`: Filter by category tag.
- `--scope <default|user>`: Filter by specialist scope.
- `--json`: JSON output.

### Examples

```bash
specialists list
specialists list --category analysis
specialists list --scope user
specialists list --json
```

### Exit codes

- `0`: Success.
- `1`: Invalid `--category`/`--scope` usage.

---

## `specialists models`

### Synopsis

```bash
specialists models [--provider <name>] [--used]
```

### Flags

- `--provider <name>`: Provider substring filter.
- `--used`: Show only models currently referenced by specialists.

### Examples

```bash
specialists models
specialists models --provider anthropic
specialists models --used
specialists models --provider openai --used
```

### Exit codes

- `0`: Success.
- `1`: `pi --list-models` unavailable/failed.

---

## `specialists edit`

### Synopsis

```bash
specialists edit <name> --model <value> [--scope default|user] [--dry-run]
specialists edit <name> --fallback-model <value> [--scope default|user] [--dry-run]
specialists edit <name> --description "<text>" [--scope default|user] [--dry-run]
specialists edit <name> --permission READ_ONLY|LOW|MEDIUM|HIGH [--scope default|user] [--dry-run]
specialists edit <name> --timeout <ms> [--scope default|user] [--dry-run]
specialists edit <name> --tags a,b,c [--scope default|user] [--dry-run]
```

### Flags

Editable fields (exactly one per command invocation):
- `--model <value>`
- `--fallback-model <value>`
- `--description <value>`
- `--permission <READ_ONLY|LOW|MEDIUM|HIGH>`
- `--timeout <ms>` (digits only)
- `--tags <a,b,c>`

Options:
- `--scope <default|user>`
- `--dry-run`

### Examples

```bash
specialists edit code-review --model anthropic/claude-opus-4-6
specialists edit code-review --permission HIGH --dry-run
specialists edit code-review --tags analysis,security --scope user
specialists edit code-review --timeout 120000
```

### Exit codes

- `0`: Success.
- `1`: Invalid args/values, specialist not found, write failure.

---

## `specialists init`

### Synopsis

```bash
specialists init
```

### Flags

None parsed by current implementation.

### Examples

```bash
specialists init
```

### Exit codes

- `0`: Success.
- `1`: Unhandled runtime error.

What it sets up:
- `.specialists/default/` (canonical specialist files)
- `.specialists/user/` (custom specialists)
- `.specialists/jobs/`, `.specialists/ready/` runtime dirs
- `.gitignore` runtime entries
- `AGENTS.md` Specialists section
- `.mcp.json` `mcpServers.specialists`
- `.claude/hooks`, `.claude/settings.json`, `.claude/skills`, `.pi/skills`

---

## `specialists doctor`

### Synopsis

```bash
specialists doctor
```

### Flags

No flags.

### Examples

```bash
specialists doctor
```

### Exit codes

- `0`: Always (current implementation reports failures in output, not process exit code).

Checks include:
- `pi`, `sp`, `bd`, `xt` availability
- hooks presence/wiring
- MCP registration
- runtime directory health
- zombie running-job detection

---

## `specialists validate`

### Synopsis

```bash
specialists validate <name> [--json]
```

### Flags

- `--json`: JSON validation output.

### Examples

```bash
specialists validate code-review
specialists validate code-review --json
```

### Exit codes

- `0`: Validation passed.
- `1`: Not found, read error, YAML/schema validation failure, or invalid args.
