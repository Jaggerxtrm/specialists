---
name: using-specialists
description: >
  Use this skill whenever you're about to start a substantial task — pause first and
  ask whether to delegate. Consult before any: code review, security audit, deep bug
  investigation, test generation, multi-file refactor, or architecture analysis. Also
  use for the mechanics of delegation: --bead workflow, --context-depth, background
  jobs, MCP tools (use_specialist, start_specialist, feed_specialist), specialists init,
  or specialists doctor. Don't wait for the user to say "use a specialist" — proactively
  evaluate whether delegation makes sense.
version: 3.4
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
- You have multiple independent tasks — dispatch them as a wave

**Do it yourself when:**
- It's a single-file edit or quick config change
- It needs interactive back-and-forth
- It's obviously trivial (one-liner, formatting fix)

When in doubt, delegate. Specialists run in parallel — you don't have to wait.

---

## Canonical Workflow

For tracked work, always use `--bead`. This gives the specialist your issue as context,
links results back to the tracker, and creates an audit trail.

### CLI commands

```bash
specialists init                              # first-time project setup
specialists list                              # discover available specialists
specialists run <name> --bead <id>            # foreground run (streams output)
specialists run <name> --bead <id> --background  # returns job ID immediately
specialists run <name> --prompt "..."         # ad-hoc (no bead tracking)
specialists feed -f                           # tail merged feed (all jobs)
specialists feed <job-id>                     # events for a specific job
specialists result <job-id>                   # final output text
specialists resume <job-id> "next task"       # resume a waiting keep-alive job
specialists steer <job-id> "new direction"    # redirect a running job mid-run
specialists stop <job-id>                     # cancel a job
specialists edit <name>                       # edit a specialist's YAML config
specialists doctor                            # health check
```

### Typical flow

```bash
# 1. Create a bead describing what you need
bd create --title "Fix auth token refresh bug" --type bug --priority 2
# -> unitAI-abc

# 2. Run the right specialist against the bead
specialists run executor --bead unitAI-abc --background
# -> Job started: a1b2c3

# 3. Monitor (pick one)
specialists feed a1b2c3              # check events so far
specialists feed -f                  # tail all active jobs

# 4. Read results and close
specialists result a1b2c3
bd close unitAI-abc --reason "Fixed: token refresh now retries on 401"
```

**`--context-depth N`** — how many levels of parent-bead context to inject (default: 1).
**`--no-beads`** — skip creating an auto-tracking sub-bead, but still reads the `--bead` input.

---

## Choosing the Right Specialist

Run `specialists list` to see what's available. Match by task type:

| Task type | Best specialist | Why |
|-----------|----------------|-----|
| Bug fix / implementation | **executor** (gpt-5.3-codex) | HIGH perms, writes code + tests autonomously |
| Bug investigation | **debugger** (claude-sonnet-4-6) | Systematic root cause analysis |
| Design decisions / tradeoffs | **overthinker** (gpt-5.4) | 4-phase reasoning: analysis, devil's advocate, synthesis, conclusion |
| Code review | **parallel-review** (claude-sonnet-4-6) | Multi-backend concurrent review |
| Architecture exploration | **explorer** (claude-haiku-4-5) | Fast codebase mapping, READ_ONLY |
| Reference docs / dense schemas | **explorer** (claude-haiku-4-5) | Better than sync-docs for reference-heavy output |
| Planning / scoping | **planner** (claude-sonnet-4-6) | Structured issue breakdown with deps |
| Doc drift / audit | **sync-docs** (claude-sonnet-4-6) | Detects stale docs, restructures content |
| Test generation | **test-runner** (claude-haiku-4-5) | Runs suites, interprets failures |
| Specialist authoring | **specialists-creator** (claude-sonnet-4-6) | Guides YAML creation against schema |

When unsure, read descriptions: `specialists list --json | jq '.[].description'`

### Specialist selection lessons

- **sync-docs** excels at drift audits but can stall on dense reference tasks. If it stalls, switch to **explorer**.
- **explorer** is fast and cheap (Haiku) but READ_ONLY — it produces content in its result output but cannot write files or update beads. The coordinator must pipe output back.
- **executor** is the workhorse — HIGH permissions, writes code, runs tests, closes beads. But it may create unnecessary sub-beads (see Known Issues).
- **overthinker** is READ_ONLY — use for design analysis, not implementation. Pipe its output to the bead yourself.

---

## Wave Orchestration

For multiple independent tasks, dispatch specialists in parallel waves.

### Planning a wave

Group tasks by dependency:
1. **Wave 1**: Bug fixes and blockers (unblock downstream work)
2. **Wave 2**: Features and design (now that the surface is stable)
3. **Wave 3**: Documentation (after code changes land)

### Dispatching a wave

```bash
# Fire multiple specialists in parallel
specialists run executor --bead unitAI-abc --background   # -> job1
specialists run executor --bead unitAI-def --background   # -> job2
specialists run debugger --bead unitAI-ghi --background   # -> job3
```

### Monitoring a wave

```bash
# Merged feed — all jobs interleaved
specialists feed -f

# Per-job status check
for job in job1 job2 job3; do
  specialists feed $job | tail -5
done
```

### Between waves

After each wave completes:
1. **Read results**: `specialists result <job-id>` for each
2. **Validate**: run lint + tests on the combined output
3. **Commit**: stage, commit, push — clean git before next wave
4. **Close beads**: `bd close <id> --reason "..."`
5. **Pipe READ_ONLY output**: for explorer/overthinker results, update the bead manually:
   `bd update <id> --notes "$(specialists result <job-id>)"`

---

## Coordinator Responsibilities

As the orchestrator, you own things specialists cannot do:

### 1. Pipe READ_ONLY specialist output back to beads
Explorer and overthinker cannot write to beads. After they complete:
```bash
bd update unitAI-abc --notes "$(specialists result <job-id>)"
```

### 2. Validate combined output across specialists
Multiple specialists writing to the same worktree can conflict. After each wave:
```bash
npm run lint          # or project-specific quality gate
bun test              # run affected tests
git diff --stat       # review what changed
```

### 3. Handle failures — don't silently fall back
If a specialist stalls or errors, surface it. Don't quietly do the work yourself.
```bash
specialists feed <job-id>          # see what happened
specialists doctor                 # check for systemic issues
```

Options when a specialist fails:
- **Retry** with tighter prompt scope
- **Switch specialist** (e.g., sync-docs stalls → try explorer)
- **Stop and report** to the user before doing it yourself

### 4. Close beads and commit between waves
Keep git clean between waves. Specialists write to the same worktree, so stacking
uncommitted changes from multiple waves creates merge pain.

---

## MCP Tools (Claude Code)

Available after `specialists init` and session restart.

| Tool | Purpose |
|------|---------|
| `specialist_init` | Bootstrap once per session |
| `use_specialist` | Foreground run; pass `bead_id` for tracked work |
| `start_specialist` | Async: returns job ID immediately (Supervisor-backed) |
| `feed_specialist` | Cursor-paginated run events (status + deltas) |
| `resume_specialist` | Next-turn prompt for keep-alive jobs in `waiting` |
| `steer_specialist` | Mid-run steering message for active jobs |
| `stop_specialist` | Cancel (sends SIGTERM to job PID) |
| `run_parallel` | **Deprecated** — use CLI background jobs instead |
| `specialist_status` | Circuit breaker health + staleness |

### CLI vs MCP equivalences

| Action | CLI | MCP |
|--------|-----|-----|
| Run foreground | `specialists run <name> --bead <id>` | `use_specialist({name, bead_id})` |
| Run background | `specialists run <name> --bead <id> --background` | `start_specialist({name, bead_id})` |
| Monitor events | `specialists feed <job-id>` | `feed_specialist({job_id, cursor})` |
| Read result | `specialists result <job-id>` | — (CLI only) |
| Steer mid-run | `specialists steer <job-id> "msg"` | `steer_specialist({job_id, message})` |
| Resume waiting | `specialists resume <job-id> "task"` | `resume_specialist({job_id, task})` |
| Cancel | `specialists stop <job-id>` | `stop_specialist({job_id})` |

**Prefer CLI** for most orchestration work — it's simpler and output is easier to inspect.

---

## feed_specialist Observation Pattern

Use cursor-based polling for structured progress when monitoring long specialist runs:

```bash
# first read
feed_specialist({job_id: "abc123"})
# => {events:[...], next_cursor: 12, has_more: true, is_complete: false}

# continue from cursor
feed_specialist({job_id: "abc123", cursor: 12})
# => {events:[...], next_cursor: 25, has_more: false, is_complete: true}
```

When `is_complete: true` and `has_more: false`, fetch final text with:

```bash
specialists result <job-id>
```

---

## Known Issues

- **Executor creates sub-beads**: When given `--bead <id>`, the executor sometimes creates
  a child bead instead of claiming the input bead directly. This is caused by the edit-gate
  hook or CLAUDE.md workflow telling it to `bd create` before editing. Tracked as `unitAI-j6nc`.
- **READ_ONLY output not piped to beads**: Explorer and overthinker output lives only in
  `specialists result`. The coordinator must manually update the bead with notes.
- **sync-docs stalls on reference tasks**: sync-docs can stall (60s timeout) on dense
  schema/reference documentation. Explorer handles these better.

---

## Setup and Troubleshooting

```bash
specialists init        # first-time setup: creates .specialists/, wires AGENTS.md/CLAUDE.md
specialists doctor      # health check: hooks, MCP, zombie jobs
specialists edit <name> # edit a specialist's YAML config
```

- **"specialist not found"** → `specialists list` (project-scope only)
- **Job hangs** → `specialists feed <id>`; `specialists stop` to cancel; try a different specialist
- **MCP tools missing** → `specialists init` then restart Claude Code
- **YAML skipped** → stderr shows `[specialists] skipping <file>: <reason>`
- **Stall timeout** → specialist hit 60s inactivity. Check `specialists feed <id>` for last event, then retry or switch specialist.
