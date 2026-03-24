---
name: specialists-usage
description: >
  Use this skill whenever you're about to start a substantial task — pause first and
  ask whether to delegate. Consult before any: code review, security audit, deep bug
  investigation, test generation, multi-file refactor, or architecture analysis. Also
  use for the mechanics of delegation: --bead workflow, --context-depth, background
  jobs, MCP tools (use_specialist, start_specialist, poll_specialist), specialists init,
  or specialists doctor. Don't wait for the user to say "use a specialist" — proactively
  evaluate whether delegation makes sense.
version: 3.1
---

# Specialists Usage

Specialists are autonomous AI agents that run independently — fresh context, different
model, no prior bias. Delegate when a task would take you significant effort, spans
multiple files, or benefits from a dedicated focused run.

The reason isn't just speed — it's quality. A specialist has no competing context,
leaves a tracked record via beads, and can run in the background while you stay unblocked.

## The Delegation Decision

Before starting any substantial task, ask: is this worth delegating?

**Delegate when:**
- It would take >5 minutes of focused work
- It spans multiple files or modules
- A fresh perspective adds value (code review, security audit)
- It can run in the background while you do other things

**Do it yourself when:**
- It's a single-file edit or quick config change
- It needs interactive back-and-forth
- It's obviously trivial (one-liner, formatting fix)

When in doubt, delegate. Specialists run in parallel — you don't have to wait.

---

## Canonical Workflow

For tracked work, always use `--bead`. This gives the specialist your issue as context,
links results back to the tracker, and creates an audit trail.

```bash
# 1. Create a bead describing what you need
bd create --title "Audit authentication module for security issues" --type task --priority 2
# → unitAI-abc

# 2. Find and run the right specialist
specialists list
specialists run security-audit --bead unitAI-abc --background

# 3. Keep working; check in when ready
specialists feed -f

# 4. Read results and close
specialists result <job-id>
bd close unitAI-abc --reason "2 issues found, filed as follow-ups"
```

**`--background`** — returns immediately; use for anything that will take more than ~30 seconds.
**`--context-depth N`** — how many levels of parent-bead context to inject (default: 1).
**`--no-beads`** — skip creating an auto-tracking sub-bead, but still reads the `--bead` input.

---

## Choosing the Right Specialist

Run `specialists list` to see what's available. Match by task type:

| Task type | Look for |
|-----------|----------|
| Bug / regression investigation | `bug-hunt`, `overthinker` |
| Code review | `parallel-review`, `codebase-explorer` |
| Test generation | `test-runner` |
| Architecture / exploration | `codebase-explorer`, `feature-design` |
| Planning / scoping | `planner` |
| Documentation sync | `sync-docs` |

When unsure, read descriptions: `specialists list --json | jq '.[].description'`

---

## When a Specialist Fails

If a specialist times out or errors, **don't silently fall back to doing the work yourself**.
Surface the failure — the user may want to fix the specialist config or switch to a different one.

```bash
specialists feed <job-id>          # see what happened
specialists doctor                 # check for systemic issues
```

If you need to retry: try foreground mode (no `--background`) for shorter timeout exposure,
or try a different specialist. If all else fails, tell the user what you attempted and why
it failed before doing the work yourself.

---

## Ad-Hoc (No Tracking)

```bash
specialists run codebase-explorer --prompt "Map the feed command architecture"
```

Use `--prompt` only for throwaway exploration. For anything worth remembering, use `--bead`.

---

## Example: Delegation in Practice

You're asked to review `src/auth/` for security issues. Without delegation, you'd read
every file and write findings yourself — 15+ minutes, your full attention.

With a specialist:
```bash
bd create --title "Security review: src/auth/" --type task --priority 1  # → unitAI-xyz
specialists list --category security
specialists run security-audit --bead unitAI-xyz --background             # → job_4a2b1c
# go do other work
specialists result job_4a2b1c
bd close unitAI-xyz --reason "Found 2 issues, filed unitAI-abc, unitAI-def"
```

The specialist runs with full bead context, on a model tuned for the task, while you stay unblocked.

---

## MCP Tools (Claude Code)

Available after `specialists init` and session restart.

| Tool | Purpose |
|------|---------|
| `specialist_init` | Bootstrap once per session |
| `use_specialist` | Foreground run; pass `bead_id` for tracked work |
| `start_specialist` | Async: returns job ID immediately |
| `poll_specialist` | Check status + delta output |
| `stop_specialist` | Cancel |
| `run_parallel` | Concurrent or pipeline execution |
| `specialist_status` | Circuit breaker health + staleness |

---

## Setup and Troubleshooting

```bash
specialists init        # first-time setup: creates specialists/, wires AGENTS.md
specialists doctor      # health check: hooks, MCP, zombie jobs
```

- **"specialist not found"** → `specialists list` (project-scope only)
- **Job hangs** → `specialists feed <id>`; `specialists stop` to cancel
- **MCP tools missing** → `specialists init` then restart Claude Code
- **YAML skipped** → stderr shows `[specialists] skipping <file>: <reason>`
