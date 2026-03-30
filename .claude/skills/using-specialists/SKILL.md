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
version: 3.6
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
specialists run <name> --prompt "..."         # ad-hoc (no bead tracking)
specialists feed -f                           # tail merged feed (all jobs)
specialists feed <job-id>                     # events for a specific job
specialists result <job-id>                   # final output text
specialists steer <job-id> "new direction"    # redirect ANY running job mid-run
specialists resume <job-id> "next task"       # resume a waiting keep-alive job
specialists stop <job-id>                     # cancel a job
specialists edit <name>                       # edit a specialist's YAML config
specialists status --job <job-id>             # single-job detail view
specialists clean                             # purge old job directories
specialists doctor                            # health check
```

### Typical flow

```bash
# 1. Create a bead describing what you need
bd create --title "Fix auth token refresh bug" --type bug --priority 2
# -> unitAI-abc

# 2. Run the right specialist against the bead
specialists run executor --bead unitAI-abc &
# -> Job started: a1b2c3

# 3. Monitor (pick one)
specialists feed a1b2c3              # check events so far
specialists feed -f                  # tail all active jobs

# 4. Read results and close
specialists result a1b2c3
bd close unitAI-abc --reason "Fixed: token refresh now retries on 401"
```

### Giving specialists extra context via bead notes

`--prompt` and `--bead` cannot be combined. When you need to give a specialist
specific instructions beyond what's in the bead description, update the bead notes first:

```bash
bd update unitAI-abc --notes "INSTRUCTION: Rewrite docs/cli-reference.md from current
source. Read every command in src/cli/ and src/index.ts. Document all flags and examples."

specialists run executor --bead unitAI-abc &
```

This pattern was used extensively in Wave 5 of a real session — 4 executors all received
writing instructions via bead notes and successfully produced doc files.

**`--context-depth N`** — how many levels of parent-bead context to inject (default: 1).
**`--no-beads`** — skip creating an auto-tracking sub-bead, but still reads the `--bead` input.

---

## Choosing the Right Specialist

Run `specialists list` to see what's available. Match by task type:

| Task type | Best specialist | Why |
|-----------|----------------|-----|
| Bug fix / implementation | **executor** (gpt-5.3-codex) | HIGH perms, writes code + tests autonomously |
| Bug investigation / "why is X broken" | **debugger** (claude-sonnet-4-6) | GitNexus-first triage, 5-phase investigation, hypothesis ranking, evidence-backed remediation. Use for ANY root cause analysis. |
| Design decisions / tradeoffs | **overthinker** (gpt-5.4) | 4-phase reasoning: analysis, devil's advocate, synthesis, conclusion. Use with `--keep-alive` for follow-up questions. |
| Code review / compliance | **reviewer** (claude-sonnet-4-6) | Post-run compliance checks, verdict contract (PASS/PARTIAL/FAIL). Use with `--keep-alive` for discussion. |
| Multi-backend review | **parallel-review** (claude-sonnet-4-6) | Concurrent review across multiple AI backends |
| Architecture exploration | **explorer** (claude-haiku-4-5) | Fast codebase mapping, READ_ONLY |
| Reference docs / dense schemas | **explorer** (claude-haiku-4-5) | Better than sync-docs for reference-heavy output |
| Planning / scoping | **planner** (claude-sonnet-4-6) | Structured issue breakdown with deps |
| Doc audit / drift detection | **sync-docs** (claude-sonnet-4-6) | Use with `--keep-alive`: audits first, then approve/deny execution via `resume` |
| Doc drift / audit | **sync-docs** (claude-sonnet-4-6) | Detects stale docs, restructures content |
| Doc writing / updates | **executor** (gpt-5.3-codex) | sync-docs defaults to audit mode; executor writes files |
| Test generation | **test-runner** (claude-haiku-4-5) | Runs suites, interprets failures |
| Specialist authoring | **specialists-creator** (claude-sonnet-4-6) | Guides YAML creation against schema |

### Specialist selection lessons (from real sessions)

- **debugger** is the most powerful investigation specialist. Uses GitNexus call-chain tracing (when available) for 5-phase root cause analysis with ranked hypotheses. Use for ANY "why is X broken" question — don't do the investigation yourself.
- **sync-docs** is an interactive specialist — it audits first, then waits for approval before executing. Run with `--keep-alive` and use `resume` to approve or deny. Not a bug, it's the design.
- **overthinker** and **reviewer** are also interactive — run with `--keep-alive` for multi-turn design/review conversations.
- **explorer** is fast and cheap (Haiku) but READ_ONLY — output auto-appends to the input bead's notes. Use for investigation, not implementation.
- **executor** is the workhorse — HIGH permissions, writes code and docs, runs tests, closes beads. Best for any task that needs files written.
- **use_specialist MCP** is best for quick foreground runs where you need the result immediately in your context.

### Pi extensions availability (known gap)

GitNexus and Serena are **pi extensions** (not MCP servers) at `~/.pi/agent/extensions/`.
Specialists run with `--no-extensions` and only selectively re-enable `quality-gates` and
`service-skills`. GitNexus (call-chain tracing for debugger/planner) and Serena LSP
(token-efficient reads for explorer/executor) are NOT currently wired. Tracked as `unitAI-4abv`.

---

## Steering and Resume

### Steer — redirect any running job

`steer` sends a message to a running specialist. Delivered after the current tool call
finishes, before the next LLM call. Works for **all running jobs**.

```bash
# Specialist is going off track — redirect it
specialists steer a1b2c3 "STOP what you are doing. Focus only on supervisor.ts"

# Specialist is auditing when it should be writing
specialists steer a1b2c3 "Do NOT audit. Write the actual file to disk now."
```

Real example from today: an explorer was reading every file in src/cli/ when we only needed
confirmation that steering worked. Sent `specialists steer 763ff4 "STOP. Just output:
STEERING WORKS"` — message delivered, output confirmed in 2 seconds.

### Resume — continue a keep-alive session

`resume` sends a new prompt to a specialist that has finished its turn and is `waiting`.
Only works with `--keep-alive` jobs. The session retains full conversation history.

```bash
# Start an overthinker with keep-alive for multi-turn design work
specialists run overthinker --bead unitAI-xyz --keep-alive &
# -> Job started: d4e5f6 (completes Phase 4, enters waiting state)

# Read the design output
specialists result d4e5f6

# Ask follow-up questions
specialists resume d4e5f6 "What about backward compatibility with existing YAML files?"
specialists resume d4e5f6 "How would you handle migration from the old schema?"
```

Use `--keep-alive` when you plan to iterate: design reviews, multi-phase analysis,
investigation that may need follow-up questions based on findings.

---

## Wave Orchestration

For multiple independent tasks, dispatch specialists in parallel waves.

### Planning a wave

Group tasks by dependency:
1. **Wave 1**: Bug fixes and blockers (unblock downstream work)
2. **Wave 2**: Features and design (now that the surface is stable)
3. **Wave 3**: Documentation (after code changes land — use executors, not sync-docs)

### Dispatching a wave

```bash
# Fire multiple specialists in parallel (--background for reliable detach)
specialists run executor --bead unitAI-abc --background
specialists run executor --bead unitAI-def --background
specialists run overthinker --bead unitAI-ghi --keep-alive --background
```

### Monitoring a wave

```bash
# Quick status check on all jobs
for job in abc123 def456 ghi789; do
  python3 -c "import json; d=json.load(open('.specialists/jobs/$job/status.json')); \
    print(f'$job {d[\"specialist\"]:12} {d[\"status\"]:10} {d.get(\"elapsed_s\",\"?\")}s')"
done

# Or use feed for event-level detail
specialists feed <job-id>
```

### Between waves

After each wave completes:
1. **Read results**: `specialists result <job-id>` for each
2. **Validate**: run lint + tests on the combined output
3. **Commit**: stage, commit, push — clean git before next wave
4. **Close beads**: `bd close <id> --reason "..."`

### Real wave example (from a 6-wave session)

```
Wave 1: 2x executor → fixed --background flag + migrated start_specialist to Supervisor
Wave 2: overthinker + 2x executor → output contract design + retry logic + footer fix
Wave 3: 4x sync-docs + 3x explorer → docs audit (produced reports, not files)
Wave 4: 5x executor + 2x explorer → output contract impl + READ_ONLY auto-append + 4 fixes
Wave 5: 4x executor → rewrote 4 doc files (executors write files, sync-docs only audits)
Wave 6: 4x executor + overthinker (keep-alive) → cleanup + manifest design with follow-ups
```

Key insight: **executors write files, sync-docs audits**. When you need docs written
to disk, use executor with bead notes containing "INSTRUCTION: Write <file>...".

---

## Coordinator Responsibilities

As the orchestrator, you own things specialists cannot do:

### 1. Validate combined output across specialists
Multiple specialists writing to the same worktree can conflict. After each wave:
```bash
npm run lint          # or project-specific quality gate
bun test              # run affected tests
git diff --stat       # review what changed
```

### 2. Handle failures — don't silently fall back
If a specialist stalls or errors, surface it. Don't quietly do the work yourself.
```bash
specialists feed <job-id>          # see what happened
specialists doctor                 # check for systemic issues
```

Options when a specialist fails:
- **Steer** it back on track: `specialists steer <id> "Focus on X instead"`
- **Switch specialist** (e.g., sync-docs stalls → try explorer or executor)
- **Stop and report** to the user before doing it yourself

### 3. Close beads and commit between waves
Keep git clean between waves. Specialists write to the same worktree, so stacking
uncommitted changes from multiple waves creates merge pain.

### 4. Run drift detection after doc-heavy sessions
```bash
python3 .agents/skills/sync-docs/scripts/drift_detector.py scan --json
# Then dispatch executor for any stale docs, stamp synced_at on fresh ones:
python3 .agents/skills/sync-docs/scripts/drift_detector.py update-sync <file>
```

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
**Use MCP** (`use_specialist`) when you need the result directly in your conversation context.

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

- **sync-docs defaults to audit mode** on `--bead` runs. Its prompt says "only run fixes
  when explicitly asked." Use executor for doc writing, or steer it: `specialists steer
  <id> "Execute all phases. Write the files."` Tracked as `unitAI-rnea`.
- **READ_ONLY output auto-appends** to the input bead after completion. No manual piping
  needed (fixed in the Supervisor). But the output also lives in `specialists result`.

---

## Setup and Troubleshooting

```bash
specialists init        # first-time setup: creates .specialists/, wires AGENTS.md/CLAUDE.md
specialists doctor      # health check: hooks, MCP, zombie jobs
specialists edit <name> # edit a specialist's YAML config
```

- **"specialist not found"** → `specialists list` (project-scope only)
- **Job hangs** → `specialists steer <id> "finish up"` or `specialists stop <id>`
- **MCP tools missing** → `specialists init` then restart Claude Code
- **YAML skipped** → stderr shows `[specialists] skipping <file>: <reason>`
- **Stall timeout** → specialist hit 120s inactivity. Check `specialists feed <id>`, then retry or switch specialist.
- **`--prompt` and `--bead` conflict** → use bead notes: `bd update <id> --notes "INSTRUCTION: ..."` then `--bead` only.
