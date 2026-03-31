---
name: using-specialists
description: >
  Use this skill whenever you're about to start a substantial task — pause first and
  ask whether to delegate. Consult before any: code review, security audit, deep bug
  investigation, test generation, multi-file refactor, or architecture analysis. Also
  use for the mechanics of delegation: --bead workflow, --context-depth, background
  jobs, MCP tool (`use_specialist`), specialists init,
  or specialists doctor. Don't wait for the user to say "use a specialist" — proactively
  evaluate whether delegation makes sense.
version: 3.3
---

# Specialists Usage

When this skill is loaded, you are a **coordinator first**: delegate substantial work to specialists, monitor progress, and synthesize outcomes for the user.

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

### CLI commands surfaced from runtime exploration

- `specialists init`
- `specialists list`
- `specialists run <name> --bead <id>`
- `specialists run <name> --prompt "..."`
- `specialists feed -f` / `specialists feed <job-id>`
- `specialists result <job-id>`
- `specialists resume <job-id> "next task"`
- `specialists stop <job-id>`

```bash
# 1. Create a bead describing what you need
bd create --title "Audit authentication module for security issues" --type task --priority 2
# → unitAI-abc

# 2. Find and run the right specialist
specialists list
process start "specialists run debugger --bead unitAI-abc" name="sp-debugger"

# 3. Keep working; check in when ready
process output id="sp-debugger"

# 4. Read results and close
specialists result <job-id>
bd close unitAI-abc --reason "2 issues found, filed as follow-ups"
```

**`--context-depth N`** — how many levels of parent-bead context to inject (default: 1).
**`--no-beads`** — skip creating an auto-tracking sub-bead, but still reads the `--bead` input.

### Background runs in pi: use process extension

Prefer process-managed background runs over ad-hoc polling:

```bash
process start "specialists run explorer --bead unitAI-abc" name="sp-explorer"
process list
process output id="sp-explorer"
process logs id="sp-explorer"
process kill id="sp-explorer"
process clear
```

Process extension features to rely on: unified log dock, follow mode, focus mode,
file-based logs (temp files, not memory), friendly process names, and auto-cleanup.

---

## Choosing the Right Specialist

Run `specialists list` to see what's available. Match by task type:

| Task type | Look for |
|-----------|----------|
| Bug / regression investigation | `debugger`, `overthinker` |
| Implementation / heavy coding | `executor` |
| Code review | `parallel-review`, `explorer` |
| Test generation | `test-runner` |
| Architecture / exploration | `explorer`, `planner` |
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

If you need to retry: rerun with tighter prompt scope or try a different specialist. If all else fails, tell the user what you attempted and why it failed before doing the work yourself.

---

## Ad-Hoc (No Tracking)

```bash
specialists run explorer --prompt "Map the feed command architecture"
```

Use `--prompt` only for throwaway exploration. For anything worth remembering, use `--bead`.

---

## Example: Delegation in Practice

You're asked to review `src/auth/` for security issues. Without delegation, you'd read
every file and write findings yourself — 15+ minutes, your full attention.

With a specialist:
```bash
bd create --title "Security review: src/auth/" --type task --priority 1  # → unitAI-xyz
specialists list
process start "specialists run debugger --bead unitAI-xyz" name="sp-debugger"   # async via process extension
# go do other work
specialists result <job-id>
bd close unitAI-xyz --reason "Found 2 issues, filed unitAI-abc, unitAI-def"
```

The specialist runs with full bead context, on a model tuned for the task, while you stay unblocked.

---

## MCP Tools (Claude Code)

Available after `specialists init` and session restart.

| Tool | Purpose |
|------|---------|
| `use_specialist` | Foreground run; pass `bead_id` for tracked work and get final output directly in conversation context |

MCP is intentionally minimal. Use CLI commands for orchestration, monitoring, steering,
resume, and cancellation.

---

## Setup and Troubleshooting

```bash
specialists init        # first-time setup: creates .specialists/, wires AGENTS.md/CLAUDE.md
specialists doctor      # health check: hooks, MCP, zombie jobs
```

- **"specialist not found"** → `specialists list` (project-scope only)
- **Job hangs** → `specialists feed <id>`; `specialists stop` to cancel
- **MCP tools missing** → `specialists init` then restart Claude Code
- **YAML skipped** → stderr shows `[specialists] skipping <file>: <reason>`
