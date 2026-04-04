---
name: using-specialists
description: >
  Use this skill whenever you're about to start a substantial task — pause first and
  route the work through specialists instead of doing discovery or implementation
  yourself. Consult before any: code review, security audit, deep bug investigation,
  test generation, multi-file refactor, architecture analysis, or multi-wave
  specialist orchestration. Also use for the mechanics of delegation: --bead
  workflow, --context-depth, background jobs, MCP tool (`use_specialist`),
  or specialists doctor. Don't wait for the user to say
  "use a specialist" — proactively evaluate whether delegation makes sense.
version: 3.10
---

# Specialists Usage

When this skill is loaded, you are an **orchestrator** — think CEO or CTO. You set direction, route work, unblock specialists, and synthesize outcomes. You do not implement.

Specialists handle **99% of tasks**. The only things you do yourself are things that are genuinely trivial (one-liner, quick config) or require a global overview only you can provide. Everything else goes to a specialist. When in doubt, delegate.

Your job is routing, sequencing, monitoring, and synthesis — not exploration or implementation. Do **ZERO implementation** yourself for substantial work: no file reads, no code writing, no docs, no self-investigation. If you catch yourself doing discovery, stop and dispatch explorer instead.

> **Sleep timers**: When you dispatch a specialist for a longer task, set a sleep timer and step back. Don't poll manually — set a timer appropriate to the expected run time, sleep, then check results. This lets you work independently and iterate without babysitting jobs.

Specialists are autonomous AI agents that run independently — fresh context, different model, no prior bias. The reason isn't just speed — it's quality. A specialist has no competing context, leaves a tracked record via beads, and can run in the background while you stay unblocked.

> **Session start**: Run `sp --help` once to see the full command surface. `sp` is the short alias for `specialists` — `sp run`, `sp feed`, `sp resume` etc. all work. Also useful: `sp run --help`, `sp resume --help`, `sp feed --help` for flag details.

## Hard Rules

1. **Zero implementation by orchestrator.** When this skill is active for substantial work, you do not implement the solution yourself.
2. **Never explore yourself.** All discovery, codebase mapping, and read-only investigation go through **explorer** (or another explicitly investigative specialist such as **debugger** when root-cause analysis is needed).
3. **Run explorer before executor when context is lacking.** If the bead already has clear scope — files, symbols, approach — send executor directly. Only run explorer first when the issue lacks a clear track and an executor would need to guess where to implement, wasting time and tokens.
4. **For tracked work, the bead is the prompt.** The bead description, notes, and parent context are the instruction surface.
5. **`--bead` and `--prompt` are mutually exclusive.** If you need to refine instructions, update the bead notes; do not add `--prompt`.
6. **Wave sequencing is strict.** Never start wave N+1 before wave N is complete. Within-wave parallelism is fine only for independent jobs.
7. **No destructive operations by specialists.** Specialists must not perform destructive or irreversible actions: no `rm -rf`, no force pushes, no database drops, no credential rotation, no mass deletes, no history rewrites. If a task requires destructive action, stop and surface it to the user.

## When to Use This Skill

**Default: always delegate.** Specialists handle 99% of tasks. The orchestrator only acts directly for things that are genuinely trivial (one-liner, quick config tweak) or require a global overview that only you can provide. If you're unsure, delegate.

**Do it yourself only when:**
- It's a one-liner or formatting fix
- It's a quick config change that needs no investigation
- It genuinely requires a high-level synthesis only you can do (e.g. reading results across multiple jobs and forming a next-step decision)

Everything else — investigation, implementation, review, testing, docs, planning, design — goes to a specialist. You are the CEO: you set direction and unblock, you don't write the code.

---

## Canonical Workflow

For tracked work, always use `--bead`. This gives the specialist your issue as context,
links results back to the tracker, and creates an audit trail.

### CLI commands

```bash
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

### Chained Bead Pipeline (standard workflow)

Every specialist run gets its own child bead, chained via dependencies. Each step's
output accumulates on its bead. Downstream steps see upstream output via `--context-depth`.
The bead chain IS the context chain — no manual wiring needed.

```
task-abc: "Fix auth token refresh"
  └── abc-exp: explorer        (auto-appends output to bead notes, READ_ONLY)
  └── abc-impl: executor       (self-appends output to bead notes, closes bead)
  └── abc-rev: reviewer        (auto-appends findings, READ_ONLY)
  └── abc-fix: executor        (if reviewer found gaps — fix bead, same worktree)
```

Each specialist sees its own bead + the previous step's output + one more level up
via `--context-depth 2`.

```bash
# 1. Create the task bead
bd create --title "Fix auth token refresh bug" --type bug --priority 2
# -> unitAI-abc

# 2. Create chained child beads
bd create --title "Explore: map token refresh code paths" --type task --priority 2
# -> unitAI-abc-exp
bd dep add abc-exp abc

bd create --title "Implement: fix token refresh retry on 401" --type task --priority 2
# -> unitAI-abc-impl
bd dep add abc-impl abc-exp

# 3. Wave 1 — Explorer
specialists run explorer --bead abc-exp --context-depth 2 --background
# -> Job started: e1f2g3
# (explorer output auto-appends to abc-exp notes)

# 4. Wave 2 — Executor (after explorer completes)
specialists result e1f2g3
specialists run executor --bead abc-impl --context-depth 2 --background
# -> Job started: a1b2c3
# (executor sees abc-impl + abc-exp findings + abc via context-depth)
# (executor self-appends output to abc-impl, closes abc-impl)

# 5. Wave 3 — Reviewer (reviews executor's work)
specialists result a1b2c3
specialists run reviewer --job a1b2c3 --keep-alive --background
# -> Job started: r4v5w6
# (reviewer reads task bead from job's status.json automatically)
# (reviewer auto-appends findings to bead notes)

# 6. Read verdict
specialists result r4v5w6
# -> PASS? Close the task bead. PARTIAL/FAIL? Create a fix bead.

# 7. If PARTIAL — fix loop (same worktree, new bead)
bd create --title "Fix: reviewer gaps on abc" --type bug --priority 1
# -> unitAI-abc-fix
bd dep add abc-fix abc-impl

specialists run executor --bead abc-fix --job a1b2c3 --context-depth 2 --background
# (fixer sees abc-fix + abc-impl (executor output + reviewer findings) + abc-exp)
# Repeat reviewer → fix until PASS.

# 8. Close when reviewer says PASS
bd close abc --reason "Fixed: token refresh retries on 401. Reviewer PASS 92/100."
```

**Why chaining matters:**
- Every step's output is preserved on its bead — full audit trail
- `--context-depth 2` gives each specialist the previous step's findings automatically
- No copy-pasting results between steps
- The orchestrator only creates beads and dispatches — zero context injection

### Bead-first workflow (`--bead` is the prompt)

For tracked work, the bead is not just bookkeeping — it is the specialist's prompt.
The specialist reads:
- the bead title + description
- bead notes (including output from previous specialists in the chain)
- parent/ancestor bead context (controlled by `--context-depth`)

`--prompt` and `--bead` cannot be combined. When you need to give a specialist
specific instructions beyond what's in the bead description, update the bead notes first:

```bash
bd update unitAI-abc --notes "INSTRUCTION: Rewrite docs/cli-reference.md from current
source. Read every command in src/cli/ and src/index.ts. Document all flags and examples."

specialists run executor --bead unitAI-abc --context-depth 2 &
```

**`--context-depth N`** — how many levels of parent-bead context to inject (default: 1).
Prefer **`--context-depth 2`** for chained bead workflows so each step inherits the
previous step's output plus one more level of context.

**`--no-beads`** — skip creating an auto-tracking sub-bead, but still reads the `--bead` input.

**`--job <job-id>`** — (planned, unitAI-hgpu) reuse another job's worktree as cwd. For
READ_ONLY specialists like reviewer, also auto-resolves the job's bead for task context.
Mutually exclusive with `--worktree`. See "Review and Fix Loop" below.

---

## Choosing the Right Specialist

Run `specialists list` to see what's available. Match by task type:

| Task type | Best specialist | Why |
|-----------|----------------|-----|
| Architecture exploration / initial discovery | **explorer** (claude-haiku-4-5) | Fast codebase mapping, READ_ONLY. Use first before any executor run. |
| Live docs / library lookup / code discovery | **researcher** (claude-haiku-4-5) | Two modes: *targeted* (ctx7 for library docs, deepwiki for repo internals) and *discovery* (ghgrep → find interesting repos → deepwiki deep dive). Always use `--keep-alive` — enters `waiting` after each turn. |
| Bug fix / implementation | **executor** (gpt-5.3-codex) | HIGH perms, writes code + tests autonomously after exploration is complete |
| Bug investigation / "why is X broken" | **debugger** (claude-sonnet-4-6) | GitNexus-first triage, 5-phase investigation, hypothesis ranking, evidence-backed remediation. Use for ANY root cause analysis. |
| Complex problems / design decisions / tradeoffs | **overthinker** (gpt-5.4) | Use before executor on any non-trivial task. 4-phase reasoning: analysis, devil's advocate, synthesis, conclusion. Iterate with `resume` to refine before handing off to executor. **Always use `--keep-alive`** — enters `waiting` after Phase 4 expecting your follow-up. |
| Code review / compliance | **reviewer** (claude-sonnet-4-6) | Post-run compliance checks, verdict contract (PASS/PARTIAL/FAIL). **Always use `--keep-alive`** — enters `waiting` after verdict expecting your response or approval. |
| Multi-backend review | **parallel-review** (claude-sonnet-4-6) | Concurrent review across multiple AI backends |
| Reference docs / dense schemas | **explorer** (claude-haiku-4-5) | Better than sync-docs for reference-heavy output |
| Planning / scoping | **planner** (claude-sonnet-4-6) | Structured issue breakdown with deps |
| Doc audit / drift detection | **sync-docs** (claude-sonnet-4-6) | **Always use `--keep-alive`** — audits first, then enters `waiting` for your approve/deny via `resume` |
| Doc writing / updates | **executor** (gpt-5.3-codex) | sync-docs defaults to audit mode; executor writes files |
| Test generation / suite execution | **test-runner** (claude-haiku-4-5) | Runs suites, interprets failures |
| Specialist authoring | **specialists-creator** (claude-sonnet-4-6) | Guides YAML creation against schema |

### Specialist selection lessons (from real sessions)

- **researcher** is the docs and discovery specialist. Two modes: *targeted* (look up ctx7/deepwiki docs for a specific library relevant to the current job) and *discovery* (ghgrep for code patterns → spot interesting repos → deepwiki deep dive). Keep-alive by design — resume with follow-up questions or new research angles. Do not look up docs yourself — delegate to researcher.
- **explorer** before **executor** when the bead lacks a clear track. If the bead already specifies files/symbols/approach, send executor directly. Use explorer when an executor would have to guess — it wastes time and tokens.
- **debugger** is the most powerful investigation specialist. Uses GitNexus call-chain tracing (when available) for 5-phase root cause analysis with ranked hypotheses. Use for ANY "why is X broken" question — don't do the investigation yourself.
- **sync-docs** is an interactive specialist — it audits first, then waits for approval before executing. Run with `--keep-alive` and use `resume` to approve or deny. Not a bug, it's the design.
- **overthinker** and **reviewer** are also interactive — run with `--keep-alive` for multi-turn design/review conversations.
- **explorer** is fast and cheap (Haiku) but READ_ONLY — output auto-appends to the input bead's notes. Use for investigation, not implementation.
- **executor** is the workhorse — HIGH permissions, writes code and docs, runs tests, closes beads. Best for any task that needs files written after the exploration wave is done.
- **use_specialist MCP** is best for quick foreground runs where you need the result immediately in your context.

### Example dispatches (showing specialist variety)

```bash
specialists run explorer --bead unitAI-exp --context-depth 2 --background
specialists run researcher --bead unitAI-research --context-depth 2 --keep-alive --background
specialists run debugger --bead unitAI-bug --context-depth 2 --background
specialists run planner --bead unitAI-scope --context-depth 2 --background
specialists run overthinker --bead unitAI-design --context-depth 2 --keep-alive --background
specialists run executor --bead unitAI-impl --context-depth 2 --background
specialists run reviewer --bead unitAI-review --context-depth 2 --keep-alive --background
specialists run sync-docs --bead unitAI-docs --context-depth 2 --keep-alive --background
specialists run test-runner --bead unitAI-tests --context-depth 2 --background
specialists run specialists-creator --bead unitAI-skill --context-depth 2 --background
```

### Overthinker-first pattern for complex tasks

For any task with non-obvious solutions — architecture decisions, tricky bugs, performance problems, API design — run **overthinker before executor**. The overthinker surfaces edge cases, challenges assumptions, and produces a refined solution direction. The executor then implements against that plan rather than guessing.

```bash
# 1. Chain: task → explore → design → implement
bd create --title "Redesign auth middleware" --type feature --priority 2
# -> unitAI-task

bd create --title "Explore: map auth middleware" --type task --priority 2
# -> unitAI-exp
bd dep add exp task

bd create --title "Design: auth middleware approach" --type task --priority 2
# -> unitAI-design
bd dep add design exp

bd create --title "Implement: auth middleware redesign" --type task --priority 2
# -> unitAI-impl
bd dep add impl design

# 2. Explorer (output auto-appends to exp notes)
specialists run explorer --bead unitAI-exp --context-depth 2 --background

# 3. Overthinker (sees exp findings via context-depth)
specialists run overthinker --bead unitAI-design --context-depth 2 --keep-alive --background
# -> enters waiting after Phase 4

# 4. Iterate: challenge assumptions, ask follow-ups, refine
specialists resume <job-id> "What about the edge case where X?"
specialists resume <job-id> "Is option B safer than option A here?"

# 5. Only when satisfied with the design — stop overthinker
specialists stop <job-id>
# (overthinker output is on unitAI-design notes)

# 6. Executor sees design + exp + task via context-depth — no manual wiring
specialists run executor --bead unitAI-impl --context-depth 2 --background
```

The overthinker is cheap relative to the cost of an executor implementing the wrong thing.
Use it liberally on anything non-trivial. The chained bead pattern means the executor
automatically inherits the overthinker's conclusion — no need to copy-paste solutions
into bead notes.

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

**Specialists that always use `--keep-alive`** (they enter `waiting` after every turn by design):

| Specialist | What triggers `waiting` | What to send via `resume` |
|-----------|------------------------|--------------------------|
| **researcher** | After delivering research findings | Follow-up question, new research angle, or "done, thanks" |
| **reviewer** | After delivering verdict (PASS/PARTIAL/FAIL) | Your response, clarification, or "accepted, close out" |
| **overthinker** | After Phase 4 conclusion | Follow-up question, counter-argument, or "done, thanks" |
| **sync-docs** | After audit report | "approve", "deny", or specific instructions |

> **Warning — known gap (unitAI-4qam):** When a job enters `waiting`, the current feed and
> result output do not clearly signal this. A job that has produced output and is silently
> waiting looks identical to a stalled job. **Always check `status.json` before killing a
> keep-alive job.** Only `stop` when you have confirmed you are done iterating — not because
> the output stopped.

```bash
# CORRECT: check status before deciding to stop
python3 -c "import json; d=json.load(open('.specialists/jobs/d4e5f6/status.json')); print(d['status'])"
# -> waiting   ← job is healthy, expecting your input

# CORRECT: resume iteration
specialists resume d4e5f6 "What about backward compatibility with existing YAML files?"

# CORRECT: end the session only when you are done
specialists stop d4e5f6

# WRONG: killing a waiting job thinking it is stuck
specialists stop d4e5f6   # ← don't do this without checking status first
```

Full example:

```bash
# Start an overthinker with keep-alive for multi-turn design work
specialists run overthinker --bead unitAI-xyz --keep-alive --background
# -> Job started: d4e5f6 (completes Phase 4, enters waiting state)

# Read the output, then continue iterating
specialists result d4e5f6
specialists resume d4e5f6 "What about backward compatibility with existing YAML files?"
specialists resume d4e5f6 "How would you handle migration from the old schema?"

# Only stop when all iteration is done
specialists stop d4e5f6
```

---

## Wave Orchestration

For multi-step work, dispatch specialists in **waves**.

A **wave** is a set of specialist jobs that may run in parallel **only if they are independent**.
Waves themselves are strictly sequential: **never start wave N+1 before wave N completes**.

### Wave rules

1. **Sequence between waves.** Exploration happens before implementation; implementation before review; review before doc sync.
2. **Parallelize only within a wave.** If two jobs do not depend on each other, they may run together in the same wave.
3. **Do not overlap waves.** Wait for every job in the current wave to finish, read results, and update beads before launching the next wave.
4. **Use bead dependencies to encode the pipeline.** The dependency graph should match the wave order.
5. **Use `--context-depth 2`** for downstream waves so each specialist sees the parent task plus immediate upstream context.
6. **Merge into master between waves (MANDATORY).** Each wave's worktree branches must be merged into master before the next wave starts. Without this, downstream executors won't have upstream code — they'll run in worktrees branched from stale master.

### Merge protocol (FIFO — first in, first out)

Merge worktree branches in **dependency order**, not completion order. The dep graph
dictates merge sequence. After each merge, rebase remaining branches onto the updated
master before continuing.

```bash
# After Wave N completes and beads are closed:

# 1. Merge in dependency order (FIFO)
cd /path/to/main/repo
git merge worktree-branch-a    # first dep
npm run lint && npx tsc --noEmit   # verify after each merge
git merge worktree-branch-b    # second dep (if parallel wave)
npm run lint && npx tsc --noEmit

# 2. If merge conflicts arise:
#    - Resolve manually in main checkout
#    - Conflicts are expected when parallel beads duplicate helpers
#      (e.g. job-root.ts created by both hgpu.1 and hgpu.5)
#    - Keep the version from the earlier dep in the chain
#    - Run lint + tsc after resolution

# 3. Rebuild dist after merge (if project uses bundled dist)
npm run build

# 4. Only then start Wave N+1
```

**Why FIFO matters:** If bead A blocks bead B, A's code must land first. Merging B
before A can produce broken imports, missing symbols, or silent type mismatches.
Parallel beads within a wave can merge in any order since they own disjoint files.

**Common conflict pattern:** Parallel executors in the same wave may both create the
same utility file (e.g. `job-root.ts`). This is expected — the implementations should
be identical. Keep one, delete the duplicate during conflict resolution.

### Polling a wave with `status.json`

Use `status.json` to determine whether a wave is done:

```bash
for job in abc123 def456 ghi789; do
  python3 -c "import json; d=json.load(open('.specialists/jobs/$job/status.json')); \
    print(f'$job {d[\"specialist\"]:12} {d[\"status\"]:10} {d.get(\"elapsed_s\",\"?\")}s')"
done
```

A wave is complete only when every job in that wave is in a terminal state (`completed` or `error`) and you have:
1. **Read results**: `specialists result <job-id>` for each
2. **Updated/closed beads** as needed
3. **Validated combined output** before advancing

### Canonical 4-wave pipeline example

Use this when a task needs investigation, implementation, review, and doc follow-through.
Each wave gets its own chained bead — the bead graph mirrors the wave dependency graph.

```bash
# 0. Create the parent bead (the task itself)
bd create --title "Improve wave orchestration" --type task --priority 2
# -> unitAI-root

# 1. Create chained child beads — each wave step is a child of the previous
bd create --title "Explore: map codebase for wave orchestration" --type task --priority 2
# -> unitAI-exp
bd dep add unitAI-exp unitAI-root

bd create --title "Implement: wave orchestration improvements" --type task --priority 2
# -> unitAI-impl
bd dep add unitAI-impl unitAI-exp

# reviewer and sync-docs don't need their own beads — they run via --job
```

#### Wave 1 — Explorer

```bash
specialists run explorer --bead unitAI-exp --context-depth 2 --background
# -> Job started: job1
# (explorer output auto-appends to unitAI-exp notes)
specialists result job1
```

#### Wave 2 — Executor

Only after Wave 1 is complete:

```bash
specialists run executor --bead unitAI-impl --context-depth 2 --background
# -> Job started: job2
# (executor sees unitAI-impl + unitAI-exp findings + unitAI-root via context-depth)
# (executor self-appends output, closes unitAI-impl)
```

#### Wave 3 — Reviewer

Only after Wave 2 is complete. Reviewer uses `--job` to review the executor's work —
no separate bead needed. It reads the task bead from the job's status.json automatically.

```bash
specialists run reviewer --job job2 --keep-alive --background
# -> Job started: job3
# (reviewer reads bead context from job2, auto-appends findings)
specialists result job3
# -> PASS? Proceed to Wave 4. PARTIAL? Create fix bead and loop.
```

**If PARTIAL — fix loop:**
```bash
bd create --title "Fix: reviewer gaps on impl" --type bug --priority 1
# -> unitAI-fix1
bd dep add unitAI-fix1 unitAI-impl

specialists run executor --bead unitAI-fix1 --job job2 --context-depth 2 --background
# (fixer runs in same worktree, sees fix1 + impl output + reviewer findings)
# Repeat reviewer → fix until PASS.
```

#### Wave 4 — sync-docs

Only after Wave 3 PASS:

```bash
specialists run sync-docs --bead unitAI-root --keep-alive --background
# -> Job started: job4
# (sync-docs audits root bead context; use `resume` to approve or deny)
```

### Within-wave parallelism example

Parallelism is fine when jobs in the same wave are independent:

```bash
# Two independent exploration beads can run together in Wave 1
specialists run explorer --bead unitAI-exp-a --context-depth 2 --background
specialists run explorer --bead unitAI-exp-b --context-depth 2 --background
# Do NOT start the executor wave until BOTH exploration jobs are complete.
```

### Future direction

A future `workflows.yaml` spec may formalize wave sequencing, dependencies, and completion
rules declaratively. This skill only documents the discipline for now — it does not
define or implement that spec yet.

---

## Coordinator Responsibilities

As the orchestrator, you own things specialists cannot do:

### 1. Route work to the right specialist — don't explore or implement yourself
For substantial work, your role is to select the right specialist, launch the right wave,
and pass context through beads. Discovery goes to **explorer** first; implementation goes
to **executor** (or another writing specialist) only after discovery is done.

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
- **Steer** it back on track: `specialists steer <id> "Focus on X instead"`
- **Switch specialist** (e.g., sync-docs stalls → try explorer or executor)
- **Stop and report** to the user before doing it yourself

### 4. Merge between waves (CRITICAL)
After closing beads for a wave, merge all worktree branches into master in dependency
order before starting the next wave. Without this, the next wave's executors branch
from stale master and won't have the previous wave's code. See "Merge protocol" above.

```bash
# After Wave N:
# 1. Close beads
# 2. Merge worktree branches into master (FIFO order)
# 3. Resolve conflicts, lint, tsc
# 4. npm run build (if bundled dist)
# 5. Start Wave N+1
```

### 5. Run drift detection after doc-heavy sessions
```bash
python3 .agents/skills/sync-docs/scripts/drift_detector.py scan --json
# Then dispatch executor for any stale docs, stamp synced_at on fresh ones:
python3 .agents/skills/sync-docs/scripts/drift_detector.py update-sync <file>
```

---

## MCP Tools (Claude Code)

| Tool | Purpose |
|------|---------|
| `use_specialist` | Foreground run; pass `bead_id` for tracked work and get final output directly in conversation context |

MCP is intentionally minimal. Use CLI commands for orchestration, monitoring, steering,
resume, and cancellation.

---

## Known Issues

- **sync-docs defaults to audit mode** on `--bead` runs. Its prompt says "only run fixes
  when explicitly asked." Use executor for doc writing, or steer it: `specialists steer
  <id> "Execute all phases. Write the files."` Tracked as `unitAI-rnea`.
- **READ_ONLY output auto-appends** to the input bead after completion. No manual piping
  needed (fixed in the Supervisor). But the output also lives in `specialists result`.
- **`--bead` and `--prompt` conflict** by design. For tracked work, treat the bead as the
  prompt and update notes instead of trying to combine flags.

---

## Troubleshooting

```bash
specialists doctor      # health check: hooks, MCP, zombie jobs
specialists edit <name> # edit a specialist's YAML config
```

- **RPC timeout on job start** (10s, `command id=1`) → pi-core extension is missing or broken.
  User must run `! xt pi reload` to repair. This re-symlinks `@xtrm/pi-core` and heals
  `.pi/settings.json`. Cannot be fixed from inside Claude Code — requires user action.
- **"specialist not found"** → `specialists list` (project-scope only)
- **Job hangs** → `specialists steer <id> "finish up"` or `specialists stop <id>`
- **YAML skipped** → stderr shows `[specialists] skipping <file>: <reason>`
- **Stall timeout** → specialist hit 120s inactivity. Check `specialists feed <id>`, then retry or switch specialist.
- **`--prompt` and `--bead` conflict** → use bead notes: `bd update <id> --notes "INSTRUCTION: ..."` then `--bead` only.
