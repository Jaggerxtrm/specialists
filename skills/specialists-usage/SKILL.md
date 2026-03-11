---
name: specialists-usage
description: >
  How to use the specialists MCP server and CLI. Use when delegating tasks to
  specialist AI agents, running background jobs, reading results, or deciding
  whether a task warrants a specialist vs direct implementation.
version: 1.0
---

# Specialists Usage

> Specialists are autonomous AI agents optimised for heavy tasks. Use them
> instead of doing the work yourself when the task benefits from a dedicated
> expert, a fresh perspective, or a model tuned for the workload.

## When to Use a Specialist

| Use a specialist | Do it yourself |
|-----------------|---------------|
| Code review / security audit | Single-file edit |
| Deep bug investigation | Quick config change |
| Architecture analysis | Short read-only query |
| Test generation for a module | Single function fix |
| Refactoring across many files | Obvious one-liner |
| Performance profiling + advice | Trivial documentation update |

**Rule of thumb**: if the task would take you >5 minutes or benefit from a
second opinion, delegate it.

## Discovery

```bash
specialists list                        # all specialists (project + user + system)
specialists list --scope project        # this project only
specialists list --category analysis    # filter by category
specialists list --json                 # machine-readable
```

## Running a Specialist

### Foreground (streams output in real time)

```bash
specialists run <name> --prompt "Your task description here"
```

- Output streams to stdout as tokens arrive
- Ctrl+C sends SIGTERM (clean stop)
- Exit code 0 = success

### Background (returns immediately, job runs async)

```bash
specialists run <name> --prompt "..." --background
# → Job started: job_a1b2c3d4
```

Use background mode for tasks that will take >30 seconds, or when you want
to keep working while the specialist runs.

### Other run flags

| Flag | Purpose |
|------|---------|
| `--model <model>` | Override model for this run only |
| `--no-beads` | Skip creating a beads issue for tracking |
| stdin | Pipe a prompt: `cat brief.md \| specialists run code-review` |

## Background Job Lifecycle

```
run --background
      │
      ▼
  job_a1b2c3d4  [starting]
      │
      ▼
  job_a1b2c3d4  [running]   ← specialists feed <id> --follow
      │
      ├─► done   → specialists result <id>
      └─► error  → specialists feed <id>  (see error event)
```

### Poll / follow events

```bash
specialists feed job_a1b2c3d4             # print events so far
specialists feed job_a1b2c3d4 --follow    # stream live, exits when done
```

Event types you'll see in the feed:
- `text` — streamed output token
- `tool_use` — specialist is calling a tool (e.g. Read, Bash)
- `tool_result` — tool response
- `agent_end` — specialist finished
- `error` — failure with message

### Read the result

```bash
specialists result job_a1b2c3d4           # prints output, exits 1 if still running
specialists result job_a1b2c3d4 > out.md  # capture to file
```

### Cancel

```bash
specialists stop job_a1b2c3d4             # sends SIGTERM
```

## Completion Banner

When a background job completes, the next user prompt you submit will show:

```
[Specialist 'code-review' completed (job job_a1b2c3d4, 42s). Run: specialists result job_a1b2c3d4]
```

This is injected by the `specialists-complete` hook. Retrieve the result with
the shown command.

## MCP Tools (Claude Code)

These MCP tools are available in sessions where `specialists install` has been run:

| Tool | When to use |
|------|-------------|
| `specialist_init` | **Start of every session** — bootstraps context, lists specialists |
| `list_specialists` | Discover specialists programmatically |
| `use_specialist` | **Preferred for foreground runs** — full lifecycle management |
| `start_specialist` | Start async job, get job ID |
| `poll_specialist` | Check job status and read delta output |
| `stop_specialist` | Cancel a running job |
| `run_parallel` | Run multiple specialists concurrently or as a pipeline |
| `specialist_status` | Circuit breaker health + staleness info |

**Recommended pattern for complex tasks:**

```
1. specialist_init              ← bootstrap once per session
2. use_specialist(name, prompt) ← foreground for short tasks
   OR
2. start_specialist(name, prompt)  ← async for long tasks
3. poll_specialist(job_id)         ← check progress
4. poll_specialist(job_id)         ← repeat until status=done
```

## Editing Specialists

```bash
specialists edit code-review --model anthropic/claude-sonnet-4-6
specialists edit code-review --timeout 180000
specialists edit code-review --permission HIGH
specialists edit code-review --description "Updated description"
specialists edit code-review --dry-run   # preview without writing
```

## Troubleshooting

```bash
specialists status    # system health (pi, beads, MCP, jobs)
specialists doctor    # detailed checks with fix hints
```

Common issues:
- **"specialist not found"** → run `specialists list` to check name/scope
- **Job hangs** → check `specialists feed <id>` for stall; use `specialists stop`
- **MCP tools missing** → run `specialists install` then restart Claude Code
- **Hook not firing** → run `specialists doctor` to verify hook wiring
