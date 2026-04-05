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
version: 4.0
---

# Specialists Usage

When this skill is loaded, you are an **orchestrator** — think CEO or CTO. You set direction, route work, unblock specialists, and synthesize outcomes. You do not implement.

Specialists handle **99% of tasks**. The only things you do yourself are things that are genuinely trivial (one-liner, quick config) or require a global overview only you can provide. Everything else goes to a specialist. When in doubt, delegate.

Your job is routing, sequencing, monitoring, and synthesis — not exploration or implementation. Do **ZERO implementation** yourself for substantial work: no file reads, no code writing, no docs, no self-investigation. If you catch yourself doing discovery, stop and dispatch explorer instead.

> **Sleep timers**: When you dispatch a specialist for a longer task, set a sleep timer and step back. Don't poll manually — set a timer appropriate to the expected run time, sleep, then check results. This lets you work independently and iterate without babysitting jobs.

Specialists are autonomous AI agents that run independently — fresh context, different model, no prior bias. The reason isn't just speed — it's quality. A specialist has no competing context, leaves a tracked record via beads, and can run in the background while you stay unblocked.

> **Session start**: Run `sp --help` once to see the full command surface. `sp` is the short alias for `specialists` — `sp run`, `sp feed`, `sp resume` etc. all work. Also useful: `sp run --help`, `sp resume --help`, `sp feed --help` for flag details.

---

## Hard Rules

1. **Zero implementation by orchestrator.** When this skill is active for substantial work, you do not implement the solution yourself.
2. **Never explore yourself.** All discovery, codebase mapping, and read-only investigation go through **explorer** (or **debugger** for root-cause analysis).
3. **Run explorer before executor when context is lacking.** If the bead already has clear scope — files, symbols, approach — send executor directly. Only run explorer first when the issue lacks a clear track.
4. **For tracked work, the bead is the prompt.** The bead description, notes, and parent context are the instruction surface.
5. **`--bead` and `--prompt` are mutually exclusive.** If you need to refine instructions, update the bead notes; do not add `--prompt`.
6. **Wave sequencing is strict.** Never start wave N+1 before wave N is complete AND merged. Within-wave parallelism is fine only for independent jobs.
7. **Merge between waves is mandatory.** Executor worktree branches must be merged into master before the next wave starts. See "Merge Protocol" below.
8. **No destructive operations by specialists.** No `rm -rf`, no force pushes, no database drops, no credential rotation, no mass deletes, no history rewrites. Surface destructive requirements to the user.
9. **Executor does not run tests.** Executor runs lint + tsc only. Tests are the reviewer's and test-runner's responsibility in the chained pipeline.

---

## When to Use This Skill

**Default: always delegate.** Specialists handle 99% of tasks. The orchestrator only acts directly for things that are genuinely trivial (one-liner, quick config tweak) or require a global overview that only you can provide.

**Do it yourself only when:**
- It's a one-liner or formatting fix
- It's a quick config change that needs no investigation
- It genuinely requires high-level synthesis only you can do (e.g. reading results across multiple jobs and forming a next-step decision)

Everything else — investigation, implementation, review, testing, docs, planning, design — goes to a specialist.

---

## Canonical Workflow

### CLI commands

```bash
# Discovery
specialists list                              # discover available specialists
specialists doctor                            # health check: hooks, MCP, zombie jobs

# Running
specialists run <name> --bead <id>            # foreground run (streams output)
specialists run <name> --bead <id> --background  # background run
specialists run <name> --bead <id> --worktree    # isolated worktree (edit-capable specialists)
specialists run <name> --bead <id> --job <job-id> # reuse another job's worktree
specialists run <name> --prompt "..."         # ad-hoc (no bead tracking)
specialists run <name> --bead <id> --keep-alive  # keep session alive after first turn
specialists run <name> --bead <id> --context-depth 2  # inject parent bead context

# Monitoring
specialists feed -f                           # tail merged feed (all jobs)
specialists feed <job-id>                     # events for a specific job
specialists result <job-id>                   # final output text
specialists status --job <job-id>             # single-job detail view

# Interaction
specialists steer <job-id> "new direction"    # redirect ANY running job mid-run
specialists resume <job-id> "next task"       # resume a waiting keep-alive job
specialists stop <job-id>                     # cancel a job

# Management
specialists edit <name>                       # edit a specialist's YAML config
specialists clean                             # purge old job dirs + worktree GC
```

---

## Chained Bead Pipeline

This is the **standard for ALL tracked work**. Every specialist run gets its own child bead.
Each step's output accumulates on its bead. Downstream steps see upstream output automatically
via `--context-depth 2`. The bead chain IS the context chain — zero manual wiring needed.

```
task-abc: "Fix auth token refresh"
  └── abc-exp:  explorer   (READ_ONLY — auto-appends output to abc-exp notes)
  └── abc-impl: executor   (self-appends output to abc-impl notes, closes bead)
  └── abc-rev:  reviewer   (READ_ONLY — auto-appends verdict via --job <exec-job>)
  └── abc-fix:  executor   (if reviewer PARTIAL — fix bead, same worktree via --job)
```

**How context flows (`--context-depth 2` = own + parent + grandparent = 3 beads):**

| Step | Specialist sees | Via |
|------|----------------|-----|
| abc-exp | abc-exp (own) + task-abc (parent) | `--bead abc-exp --context-depth 2` |
| abc-impl | abc-impl (own) + abc-exp (explorer findings in notes) + task-abc | `--bead abc-impl --context-depth 2` |
| reviewer | abc-impl bead (with executor output + reviewer verdict in notes) | `--bead abc-impl --job <exec-job>` |
| abc-fix | abc-fix (own) + abc-impl (executor output + reviewer verdict) + abc-exp | `--bead abc-fix --job <exec-job> --context-depth 2` |

- No copy-paste, no manual note injection between steps
- Every step has a full audit trail on its own bead
- The dep graph IS the context graph — self-documenting

### Complete flow example

```bash
# 1. Create the task bead
bd create --title "Fix auth token refresh bug" --type bug --priority 2
# -> unitAI-abc

# 2. Create chained child beads (create all upfront for clarity)
bd create --title "Explore: map token refresh code paths" --type task --priority 2
# -> unitAI-abc-exp
bd dep add abc-exp abc

bd create --title "Implement: fix token refresh retry on 401" --type task --priority 2
# -> unitAI-abc-impl
bd dep add abc-impl abc-exp

# 3. Wave 1 — Explorer
specialists run explorer --bead abc-exp --context-depth 2 --background
# -> Job started: e1f2g3
# Explorer output auto-appends to abc-exp notes (READ_ONLY behavior)
specialists result e1f2g3

# 4. [MERGE] Merge any worktree branches from Wave 1 into master (see Merge Protocol)

# 5. Wave 2 — Executor
specialists run executor --worktree --bead abc-impl --context-depth 2 --background
# -> Job started: a1b2c3
# Executor sees: abc-impl + abc-exp (with explorer notes) + abc via context-depth
# Executor self-appends output to abc-impl notes, closes abc-impl on completion

# 6. [MERGE] Merge abc-impl worktree branch into master

# 7. Wave 3 — Reviewer (no separate bead — uses --job to enter executor's worktree)
specialists run reviewer --job a1b2c3 --keep-alive --background
# -> Job started: r4v5w6
# Reviewer reads task bead from job a1b2c3's status.json automatically
# Reviewer auto-appends verdict to bead notes (READ_ONLY)
specialists result r4v5w6
# -> PASS: close task bead. PARTIAL/FAIL: go to step 8.

# 8. If PARTIAL — fix loop (same worktree, new child bead)
bd create --title "Fix: reviewer gaps on abc-impl" --type bug --priority 1
# -> unitAI-abc-fix
bd dep add abc-fix abc-impl

specialists run executor --bead abc-fix --job a1b2c3 --context-depth 2 --background
# Fixer runs in same worktree (via --job a1b2c3)
# Sees: abc-fix + abc-impl (executor output + reviewer verdict) + abc-exp via context-depth
# Repeat reviewer --job → fix loop until PASS

# 9. Close when reviewer says PASS
bd close abc --reason "Fixed: token refresh retries on 401. Reviewer PASS."
```

**Why chaining matters:**
- Every step's output is preserved — full audit trail on each bead
- `--context-depth 2` gives each specialist the previous step's findings automatically
- No copy-pasting results between steps
- The orchestrator only creates beads and dispatches — zero context injection

---

## --job and --worktree Semantics

These flags control **workspace isolation**. Executors run in isolated git worktrees so
concurrent jobs don't corrupt shared files.

| Flag | Semantics | Creates worktree? |
|------|-----------|:-:|
| `--worktree` | Provision a new isolated workspace; requires `--bead` | Yes |
| `--job <id>` | Reuse the workspace of an existing job | No |

`--worktree` and `--job` are **mutually exclusive**. Specifying both exits with an error.

### `--worktree`

Provisions a new git worktree + branch for the specialist run. Branch name is derived
deterministically from the bead id: `feature/<beadId>-<specialist-slug>`.

```bash
specialists run executor --worktree --bead hgpu.3
# stderr: [worktree created: /repo/.worktrees/hgpu.3/hgpu.3-executor  branch: feature/hgpu.3-executor]
```

If the worktree already exists (interrupted run), it is **reused**, not recreated.

### `--job <id>`

Reads `worktree_path` from the target job's `status.json` and uses that directory as `cwd`.
The caller's own `--bead` remains authoritative — `--job` only selects the workspace.

```bash
# Reviewer enters executor's worktree to review exactly what was written
specialists run reviewer --job 49adda --keep-alive --background

# Fix executor re-enters same worktree (--bead provides new fix bead, --job provides workspace)
specialists run executor --bead hgpu.3-fix --job 49adda --context-depth 2 --background
```

**Concurrency guard:**
- READ_ONLY specialists (explorer, reviewer): allowed while owning job is still running
- MEDIUM/HIGH permission specialists (executor): **blocked** until owning job reaches terminal state

### When to use each flag

| Scenario | Flag to use |
|----------|------------|
| First executor run for a task | `--worktree --bead <impl-bead>` |
| Reviewer on executor's output | `--job <exec-job-id>` (no `--worktree`) |
| Fix executor after reviewer PARTIAL | `--bead <fix-bead> --job <exec-job-id>` |
| Explorer (READ_ONLY) | Neither — explorers don't need worktrees |
| Overthinker, planner, debugger | Neither — read-only and interactive specialists |

---

## Dependency Mapping

Map bead dependencies to match the execution pipeline. The dep graph IS the wave plan.

### Simple bug fix
```
task → explore → impl
                  └── reviewer via --job (no own bead needed)
                  └── fix (if PARTIAL) → child of impl
```
```bash
bd dep add explore task
bd dep add impl explore
# reviewer: specialists run reviewer --job <impl-job>
# fix: bd dep add fix impl
```

### Complex feature (overthinker)
```
task → explore → design → impl → [reviewer via --job] → [fix if PARTIAL]
```
```bash
bd dep add explore task
bd dep add design explore
bd dep add impl design
# reviewer: specialists run reviewer --job <impl-job>
```

### Epic with N children
Each child gets its own explore → impl chain. Reviewer runs via `--job` per impl.
```
epic
  ├── child-1 → explore-1 → impl-1  (reviewer via --job impl-1-job)
  ├── child-2 → explore-2 → impl-2  (reviewer via --job impl-2-job)
  └── child-N → explore-N → impl-N  (reviewer via --job impl-N-job)
```
Children within the same wave can run **in parallel** if they own disjoint files.

### Parallel beads (same wave)
Beads in the same wave share no intra-wave dependencies. They depend on the previous wave's
output (same parent), not on each other.
```
# Wave 2 parallel executors (after shared Wave 1 explorer):
bd dep add impl-a explore   # impl-a depends on explore, NOT on impl-b
bd dep add impl-b explore   # impl-b depends on explore, NOT on impl-a
```
Each runs in its own `--worktree`. Merge both branches before Wave 3.

### Test beads (batched)
Tests are **batched** — one test bead covers all impls in a wave, not per-impl.
The test bead depends on **all** impl beads it covers.
```
bd dep add tests impl-a
bd dep add tests impl-b
bd dep add tests impl-c
# specialists run test-runner --bead tests --context-depth 2
```

---

## Review and Fix Loop

The review → fix loop is the mechanism for iterative quality improvement within a single worktree.

### Standard loop

```
1. Executor claims impl bead, provisions --worktree, implements, closes bead.
   -> Job: exec-job

2. Reviewer enters same worktree via --job exec-job.
   -> Reads task bead from exec-job status.json automatically.
   -> Auto-appends verdict (PASS/PARTIAL/FAIL) to bead notes.

3a. PASS: orchestrator closes parent task bead.

3b. PARTIAL/FAIL:
    -> Create fix bead as child of impl bead.
    -> Run executor --bead fix-bead --job exec-job --context-depth 2.
    -> Fix executor sees: fix-bead + impl (with reviewer verdict) + explore.
    -> Fix executor closes fix-bead on completion.
    -> Return to step 2 (reviewer on same job).

4. Repeat until PASS.
```

### Commands

```bash
# Step 1 — Executor with worktree
specialists run executor --worktree --bead unitAI-impl --context-depth 2 --background
# -> Job started: exec-job (e.g. 49adda)

# Step 2 — Reviewer enters same worktree
specialists run reviewer --job 49adda --keep-alive --background
# -> Job started: rev-job
specialists result rev-job
# PARTIAL → go to step 3b

# Step 3b — Create fix bead + run fix executor in same worktree
bd create --title "Fix: address reviewer findings on impl" --type bug --priority 1
# -> unitAI-fix1
bd dep add fix1 impl
specialists run executor --bead fix1 --job 49adda --context-depth 2 --background

# Re-review
specialists run reviewer --job 49adda --keep-alive --background
# PASS → close parent
bd close unitAI-task --reason "Reviewer PASS. All findings addressed."
```

### Key invariants
- Reviewer never re-opens the impl bead — it was closed by the executor. The reviewer's verdict lives on the bead notes as appended output.
- Each fix iteration creates a **new child bead** — never reopen or re-claim the completed impl bead.
- The fix executor inherits the full context chain: fix-bead + impl (executor output + reviewer findings) + explore, via `--context-depth 2`.
- Multiple reviewer → fix cycles are expected for complex changes. The worktree is stable across all cycles.

---

## Merge Protocol — Orchestrator Responsibility

The orchestrator owns merge timing. This is not optional — failing to merge at the right
time means downstream specialists branch from stale master and miss upstream code.

### When to merge vs when NOT to merge

**Do NOT merge within a chain.** A chain is a sequence of specialists sharing one worktree:
executor → reviewer → fix → re-review. The worktree stays live throughout. No merge until
the reviewer says PASS.

```
executor --worktree --bead impl     ← creates worktree
reviewer --job <exec-job>           ← enters same worktree (no merge)
executor --bead fix --job <exec-job> ← re-enters same worktree (no merge)
reviewer --job <exec-job>           ← re-enters same worktree (no merge)
PASS → NOW merge the worktree branch into master
```

**DO merge between waves.** When the next wave's beads depend on this wave's code existing
on master, you must merge first. The dep graph tells you: beads connected by `--job` are
one chain (same worktree, no merge). Beads connected by `bd dep add` across different
file scopes are separate waves (different worktrees, merge between them).

### Planning context upfront

Before dispatching any wave, identify:
- **Chains** — beads that share a worktree via `--job` (executor → reviewer → fix → re-review)
- **Waves** — groups of independent chains that can run in parallel
- **Merge points** — between waves, after all chains in the wave reach PASS

The dep graph encodes this. If bead B depends on bead A and they touch different files,
they're separate waves with a merge point between them.

### FIFO — dependency order

Merge in **dependency order** (first dep first), not completion order.
Parallel beads (disjoint files) can merge in any order within their wave.

```bash
# After Wave N — all beads closed, all jobs terminal:

# 1. Move to main checkout
cd /path/to/main/repo

# 2. Merge in dependency order
git merge feature/bead-a-executor       # first dep in chain
npm run lint && npx tsc --noEmit        # verify after each merge
git merge feature/bead-b-executor       # second dep (parallel, disjoint files)
npm run lint && npx tsc --noEmit

# 3. Resolve conflicts if any
#    Expected conflict: parallel executors creating the same utility file
#    (e.g. job-root.ts created by two parallel beads)
#    → Keep the version from the earlier dep, discard the duplicate
#    → Re-run lint + tsc after resolution

# 4. Rebuild dist if project uses a bundled output
npm run build

# 5. Start Wave N+1
```

**Why FIFO matters:**
- Bead A blocks bead B → A's code must land in master before B's worktree branches from it
- Merging B before A: broken imports, missing symbols, silent type errors
- Parallel beads (disjoint files): order doesn't matter within the wave, but ALL must merge before the next wave

**Common conflict pattern:** Parallel executors in the same wave may both create the same
utility file (e.g. `job-root.ts`). This is expected — implementations should be identical.
Keep one, delete the duplicate during conflict resolution.

---

## Bead-First Workflow (`--bead` is the prompt)

For tracked work, the bead is not just bookkeeping — it is the specialist's prompt.
The specialist reads:
- the bead title + description
- bead notes (including output appended by previous specialists in the chain)
- parent/ancestor bead context (controlled by `--context-depth`)

`--prompt` and `--bead` cannot be combined. When you need to give a specialist
specific instructions beyond what's in the bead description, update the bead notes first:

```bash
bd update unitAI-abc --notes "INSTRUCTION: Rewrite docs/cli-reference.md from current
source. Read every command in src/cli/ and src/index.ts. Document all flags and examples."

specialists run executor --bead unitAI-abc --context-depth 2 --background
```

**`--context-depth N`** — how many levels of parent-bead context to inject (default: 1).
Use **`--context-depth 2`** for all chained bead workflows. This gives each specialist its
own bead + the immediate predecessor's output + one more level of context.

**`--no-beads`** — skip creating an auto-tracking sub-bead, but still reads the `--bead` input.

---

## Choosing the Right Specialist

Run `specialists list` to see what's available. Match by task type:

| Task type | Best specialist | Why |
|-----------|----------------|-----|
| Architecture exploration / initial discovery | **explorer** (claude-haiku) | Fast codebase mapping, READ_ONLY. Output auto-appends to bead. |
| Live docs / library lookup / code discovery | **researcher** (claude-haiku) | Targeted (ctx7/deepwiki) or discovery (ghgrep → deepwiki) modes. `--keep-alive`. |
| Bug fix / feature implementation | **executor** (gpt-codex) | HIGH perms, writes code, runs lint+tsc, closes beads. |
| Bug investigation / "why is X broken" | **debugger** (claude-sonnet) | 4-phase debug-fix-verify cycle. HIGH perms, keep-alive. GitNexus-first. |
| Complex design / tradeoff analysis | **overthinker** (gpt-4) | 4-phase: analysis → devil's advocate → synthesis → conclusion. `--keep-alive`. |
| Code review / compliance | **reviewer** (claude-sonnet) | PASS/PARTIAL/FAIL verdict. Use via `--job <exec-job>`. `--keep-alive`. |
| Multi-backend review | **parallel-review** (claude-sonnet) | Concurrent review across multiple backends |
| Planning / scoping | **planner** (claude-sonnet) | Structured issue breakdown with deps |
| Doc audit / drift detection / targeted sync | **sync-docs** (qwen3.5-plus) | 3-mode: targeted (named docs), area (time-window), full audit. MEDIUM perms, `--keep-alive`. |
| Doc writing / updates | **executor** (gpt-codex) | For heavy doc rewrites; sync-docs handles targeted updates directly |
| Test generation / suite execution | **test-runner** (claude-haiku) | Runs suites, interprets failures |
| Specialist authoring | **specialists-creator** (claude-sonnet) | Guides YAML creation against schema |

### Specialist selection notes

- **executor does not run tests** — it runs `lint + tsc` only. Tests belong to the reviewer or test-runner phase.
- **explorer** is READ_ONLY — its output auto-appends to the input bead's notes. No implementation.
- **reviewer** is best dispatched via `--job <exec-job>` rather than `--bead` — it enters the same worktree to see exactly what was written.
- **debugger** over **explorer** when you need root cause analysis — GitNexus call-chain tracing, ranked hypotheses, evidence-backed remediation.
- **overthinker** before **executor** for any non-trivial task — surfaces edge cases, challenges assumptions, produces solution direction. Cheap relative to wrong implementation.
- **researcher** is the docs specialist — never look up library docs yourself, delegate to researcher.
- **sync-docs** is interactive — always `--keep-alive`, use `resume` to approve/deny after audit.

### Example dispatches

```bash
specialists run explorer --bead unitAI-exp --context-depth 2 --background
specialists run researcher --bead unitAI-research --context-depth 2 --keep-alive --background
specialists run debugger --bead unitAI-bug --context-depth 2 --background
specialists run planner --bead unitAI-scope --context-depth 2 --background
specialists run overthinker --bead unitAI-design --context-depth 2 --keep-alive --background
specialists run executor --worktree --bead unitAI-impl --context-depth 2 --background
specialists run reviewer --job <exec-job-id> --keep-alive --background
specialists run sync-docs --bead unitAI-docs --context-depth 2 --keep-alive --background
specialists run test-runner --bead unitAI-tests --context-depth 2 --background
specialists run specialists-creator --bead unitAI-skill --context-depth 2 --background
```

### Overthinker-first pattern for complex tasks

```bash
# Full chain: task → explore → design → impl
bd create --title "Redesign auth middleware" --type feature --priority 2  # -> unitAI-task
bd create --title "Explore: map auth middleware" --type task --priority 2  # -> unitAI-exp
bd dep add exp task
bd create --title "Design: auth middleware approach" --type task --priority 2  # -> unitAI-design
bd dep add design exp
bd create --title "Implement: auth middleware redesign" --type task --priority 2  # -> unitAI-impl
bd dep add impl design

# Wave 1: Explorer
specialists run explorer --bead unitAI-exp --context-depth 2 --background
# (output auto-appends to exp notes)

# Wave 2: Overthinker (sees exp findings via context-depth)
specialists run overthinker --bead unitAI-design --context-depth 2 --keep-alive --background
# enters waiting after Phase 4

specialists resume <job-id> "What about the edge case where X?"
specialists resume <job-id> "Is option B safer than option A here?"
specialists stop <job-id>   # when satisfied
# (overthinker output is on unitAI-design notes)

# Wave 3: Executor (sees design + exp + task via context-depth — no manual wiring)
specialists run executor --worktree --bead unitAI-impl --context-depth 2 --background
```

### Pi extensions and packages

Pi extensions are global at `~/.pi/agent/extensions/`. Pi packages are global npm installs.
Specialists run with `--no-extensions` and selectively re-enable:

- `quality-gates` — lint/typecheck enforcement (non-READ_ONLY only)
- `service-skills` — service catalog activation
- `pi-gitnexus` — call-chain tracing, blast radius analysis (resolved from global npm)
- `pi-serena-tools` — token-efficient LSP reads/edits (resolved from global npm)

When gitnexus tools are used during a run, the supervisor accumulates a `gitnexus_summary`
in the `run_complete` event: `files_touched`, `symbols_analyzed`, `highest_risk`,
`tool_invocations`.

---

## Steering and Resume

### Steer — redirect any running job

`steer` sends a message to a running specialist. Delivered after the current tool call
finishes, before the next LLM call.

```bash
specialists steer a1b2c3 "STOP what you are doing. Focus only on supervisor.ts"
specialists steer a1b2c3 "Do NOT audit. Write the actual file to disk now."
```

### Resume — continue a keep-alive session

`resume` sends a new prompt to a specialist in `waiting` state. Retains full conversation history.

**Specialists that always use `--keep-alive`:**

| Specialist | Enters `waiting` after | What to send via `resume` |
|-----------|----------------------|--------------------------|
| **researcher** | Delivering research findings | Follow-up question, new angle, or "done, thanks" |
| **reviewer** | Delivering verdict (PASS/PARTIAL/FAIL) | Your response, clarification, or "accepted, close out" |
| **overthinker** | Phase 4 conclusion | Follow-up question, counter-argument, or "done, thanks" |
| **debugger** | Phase 3 fix attempt or Phase 4 verify result | Follow-up fix, "try different approach", or "done" |
| **sync-docs** | Audit report or targeted update result | "approve", "deny", or specific instructions |

> **Warning:** A job in `waiting` looks identical to a stalled job. **Always check `status.json`
> before killing a keep-alive job.**

```bash
# Check before stopping
python3 -c "import json; d=json.load(open('.specialists/jobs/d4e5f6/status.json')); print(d['status'])"
# -> waiting  ← healthy, expecting input

specialists resume d4e5f6 "What about backward compatibility?"
specialists stop d4e5f6   # only when truly done iterating
```

---

## Wave Orchestration

For multi-step work, dispatch specialists in **waves**.

A **wave** is a set of specialist jobs that may run in parallel **only if they are independent**.
Waves are strictly sequential: **never start wave N+1 before wave N completes AND is merged**.

### Wave rules

1. **Sequence between waves.** Exploration → implementation → review → doc sync.
2. **Parallelize only within a wave.** Jobs that don't depend on each other may run together.
3. **Do not overlap waves.** Wait for every job, read results, update beads, merge.
4. **Bead deps encode the pipeline.** The dependency graph should match wave order.
5. **`--context-depth 2` for all chained runs.** Each specialist sees parent + predecessor.
6. **Merge between waves is mandatory.** See Merge Protocol above.

### Polling a wave

```bash
for job in abc123 def456 ghi789; do
  python3 -c "import json; d=json.load(open('.specialists/jobs/$job/status.json')); \
    print(f'$job {d[\"specialist\"]:12} {d[\"status\"]:10} {d.get(\"elapsed_s\",\"?\")}s')"
done
```

A wave is complete when every job is `completed` or `error` AND you have:
1. Read results: `specialists result <job-id>` for each
2. Updated/closed beads as needed
3. Merged all worktree branches into master

### Canonical multi-wave example

```bash
# 0. Parent bead
bd create --title "Add worktree isolation to executor" --type feature --priority 1
# -> unitAI-root

# 1. Chained child beads
bd create --title "Explore: map job run architecture" --type task --priority 2  # -> unitAI-exp
bd dep add exp root
bd create --title "Implement: worktree isolation" --type task --priority 2  # -> unitAI-impl
bd dep add impl exp
# Note: reviewer runs via --job, test-runner gets its own bead

# Wave 1 — Explorer
specialists run explorer --bead unitAI-exp --context-depth 2 --background
# -> Job started: job1
specialists result job1

# [MERGE] Nothing to merge from READ_ONLY wave

# Wave 2 — Executor
specialists run executor --worktree --bead unitAI-impl --context-depth 2 --background
# -> Job started: job2  (worktree: .worktrees/unitAI-impl/unitAI-impl-executor)
specialists result job2

# [MERGE] Merge worktree branch into master (FIFO)
git merge feature/unitAI-impl-executor
npm run lint && npx tsc --noEmit && npm run build

# Wave 3 — Reviewer (no bead, uses --job)
specialists run reviewer --job job2 --keep-alive --background
# -> Job started: job3
specialists result job3
# PASS → Wave 4. PARTIAL → fix loop.

# Wave 4 — Tests (if needed)
bd create --title "Test: worktree isolation" --type task --priority 2  # -> unitAI-tests
bd dep add tests impl
specialists run test-runner --bead unitAI-tests --context-depth 2 --background

# Close
bd close root --reason "Worktree isolation implemented. Reviewer PASS. Tests green."
```

### Within-wave parallelism

```bash
# Parallel executors — disjoint files, same parent explorer
specialists run executor --worktree --bead unitAI-impl-a --context-depth 2 --background
specialists run executor --worktree --bead unitAI-impl-b --context-depth 2 --background
# Each runs in its own worktree.
# Do NOT start next wave until BOTH complete AND BOTH are merged.
```

---

## Coordinator Responsibilities

### 1. Route work — don't explore or implement yourself
Discovery goes to **explorer** first; implementation goes to **executor** only after discovery is done.

### 2. Validate combined output after each wave
```bash
npm run lint          # project quality gate
npx tsc --noEmit      # type check
git diff --stat       # review what changed
```

### 3. Handle failures — don't silently fall back
```bash
specialists feed <job-id>          # see what happened
specialists doctor                 # check for systemic issues
```

Options when a specialist fails:
- **Steer**: `specialists steer <id> "Focus on X instead"`
- **Switch**: e.g. sync-docs stalls → try executor
- **Stop and report** to the user before doing it yourself

### 4. Merge between waves (CRITICAL)
See Merge Protocol above. No exceptions.

### 5. Run drift detection after doc-heavy sessions
```bash
python3 .xtrm/skills/default/sync-docs/scripts/drift_detector.py scan --json
python3 .xtrm/skills/default/sync-docs/scripts/drift_detector.py update-sync <file>
```

---

## MCP Tools (Claude Code)

| Tool | Purpose |
|------|---------|
| `use_specialist` | Foreground run; pass `bead_id` for tracked work, get final output in conversation context |

MCP is intentionally minimal. Use CLI for orchestration, monitoring, steering, resume, and cancellation.

---

## Known Issues

- **READ_ONLY output auto-appends** to the input bead after completion (via Supervisor). Output also available via `specialists result`.
- **`--bead` and `--prompt` conflict** by design. For tracked work, update bead notes: `bd update <id> --notes "INSTRUCTION: ..."` then `--bead` only.
- **Job in `waiting` now shows magenta status** with resume hint in `status`, WAIT banner in `feed`, and resume footer in `result`. Always check before stopping a keep-alive job.

---

## Troubleshooting

```bash
specialists doctor      # health check: hooks, MCP, zombie jobs
specialists edit <name> # edit a specialist's YAML config
```

- **RPC timeout on worktree job start** (30s, `command id=1`) → pi runs `npm install` in fresh
  worktrees if `.pi/settings.json` lists local packages. Root cause: worktree gets a stale copy
  of `.pi/settings.json` from the branch point. Fix: ensure `.pi/settings.json` has
  `"packages": []` (packages are global now). `provisionWorktree()` also symlinks
  `.pi/npm/node_modules` to the main repo's as a safety net.
- **RPC timeout on non-worktree job** → check for: (1) zombie vitest/tinypool processes
  (`ps aux | grep vitest`, then `kill`), (2) stale dist (`npm run build`),
  (3) model provider issues (try a different model to isolate).
- **"specialist not found"** → `specialists list` (project-scope only)
- **Job hangs** → `specialists steer <id> "finish up"` or `specialists stop <id>`
- **YAML skipped** → stderr shows `[specialists] skipping <file>: <reason>`
- **Stall timeout** → specialist hit 120s inactivity. Check `specialists feed <id>`, then retry or switch.
- **`--prompt` and `--bead` conflict** → use bead notes: `bd update <id> --notes "INSTRUCTION: ..."` then `--bead` only.
- **Worktree already exists** → it will be reused (not recreated). Safe to re-run.
- **`--job` fails: worktree_path missing** → target job was not started with `--worktree`. Use `--worktree` on the next run.
