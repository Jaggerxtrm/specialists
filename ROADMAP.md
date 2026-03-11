# Specialists Roadmap

> Tracked in [beads](https://github.com/steveyegge/beads) — epic `unitAI-8ou`
> QA source: `docs/qa-v3.0.2.md`

---

## Bugs (from QA v3.0.2)

| ID | Priority | Description |
|----|----------|-------------|
| `unitAI-0ef` | P1 🔴 | **SIGTERM doesn't update job status** — `stop` kills pi but `status.json` stays `running` forever (EPIPE crash, no watcher) |
| `unitAI-hgo` | P2 🟡 | **`specialists install` is silent** — zero output; can't verify what was installed |
| `unitAI-kwb` | P2 🟡 | **Active Jobs absent when queue is empty** — section hidden when there are no jobs |
| `unitAI-7s6` | P2 🟡 | **`specialists init` missing dirs** — `.specialists/jobs/` and `ready/` not created upfront |
| `unitAI-tv3` | P3 🟢 | **`specialists status --job <id>` not implemented** — shows full table instead of single-job detail |
| `unitAI-mk5` | P4 ⚪ | **`ready/` markers accumulate between messages** — low impact, cosmetic |

---

## Features

### P1 — Infrastructure, quality & docs

| ID | Feature |
|----|---------|
| `unitAI-f3t` | **SessionStart hook** — `specialists-session-start.mjs` injects active jobs + available specialists into every new session (like `bd prime`) |
| `unitAI-2v1` | **Skills installation** — `specialists install` installs a `specialists-usage` skill so Claude knows how to use the CLI |
| `unitAI-7d0` | **`specialists setup`** — writes workflow block into AGENTS.md/CLAUDE.md (`--project` / `--global`), like `bd setup claude` |
| `unitAI-pjx` | **Force memory judgment on `bd close`** — blocking gate requiring the agent to evaluate whether a memory is worth keeping per bd guidelines; auto-extract bypasses judgment |
| `unitAI-9re` | **`specialists feed -f` global live feed** — all jobs simultaneously, color per job, bead status inline, auto-discovers new jobs; like `ov feed` |
| `unitAI-xr1` | **Hook audit** — verify all 6 hooks are error-free, schema-compliant, correct exit codes, correct output format, graceful degradation; produce compliance matrix |
| `unitAI-msh` | **Comprehensive docs** — every component gets its own README.md section with diagrams: schema, CLI, session lifecycle, supervisor/job state, MCP tools, hook system, beads integration, skills/scripts |

### P2 — CLI & docs polish

| ID | Feature |
|----|---------|
| `unitAI-3n1` | **Reduce hook verbosity** — single-line output in passing case, no repeated protocol text, <100ms per hook |
| `unitAI-1vt` | **Project-local hook installation** — `specialists init` and `specialist_init` MCP write hooks to `.claude/settings.json` in project root; committable to repo |
| `unitAI-ln6` | **Per-command `--help`** — usage, flags, examples for every subcommand |
| `unitAI-qls` | **`specialists quickstart`** — rich getting-started guide with examples for every workflow |
| `unitAI-55j` | **YAML schema docs** — full `.specialist.yaml` field reference with types, defaults, examples |
| `unitAI-npo` | **CLI polish** — `--json` flag, command categories in help, `--verbose`, consistent exit codes |
| `unitAI-z0n` | **`specialists doctor`** — health check + auto-fix hints (pi provider, hooks, MCP, dirs, zombie jobs) |

---

## Architecture notes

### Background job lifecycle (v3)

```
specialists run <name> --background
  → Supervisor.run() (in foreground process)
    → writes .specialists/jobs/<id>/status.json  (atomic: tmp + rename)
    → spawns pi subprocess
    → pi runs, streams events to events.jsonl
    → on done: writes result.txt, touches .specialists/ready/<id>
  → prints "Job started: <id>", exits

UserPromptSubmit hook (specialists-complete.mjs)
  → scans .specialists/ready/
  → injects "[Specialist '<name>' completed (job <id>, Xs). Run: specialists result <id>]"
  → deletes marker (fires once per job)
```

### Known SIGTERM gap (unitAI-0ef)

Background jobs have no watcher process. When `specialists stop` sends SIGTERM:
1. pi receives SIGTERM, tries to flush final event → EPIPE (pipe to parent closed)
2. pi crashes without writing `status.json` update
3. `status.json` stays `"running"` forever

**Fix direction:** Keep the supervisor process alive as a thin watcher until pi exits,
or spawn a detached watcher that traps the pi `close` event and writes the final status.

### Global feed vision (unitAI-9re)

```
specialists feed -f
  [43221b] codebase-explorer  ⚙ bash…
  [43221b] codebase-explorer  tool_execution_end  bash
  [2d7516] test-runner        ⚙ edit…          [bead: forge-3hg]
  [43221b] codebase-explorer  ✓ done            43s
  [2d7516] test-runner        ⚙ bash…
```

Auto-discovers new jobs as they start. Color per job. Bead ID shown if assigned.
Integrates with SIGTERM fix: shows `cancelled` when a job is stopped.

### Memory judgment gate (unitAI-pjx)

`beads-close-memory-prompt` fires as PostToolUse on Bash — agents treat it as advisory.

The core issue: **agents must exercise judgment**, not just be reminded. bd guidelines
are explicit about what constitutes a memory worth keeping (stable patterns, key
decisions, recurring solutions) vs what doesn't (session context, speculative conclusions).

**Correct fix:** A **blocking PreToolUse gate** on `bd close`. Like `beads-commit-gate`,
the agent cannot proceed until it explicitly answers:
- Did I learn something stable and reusable? → `bd remember "<precise insight>"`
- Nothing worth persisting? → acknowledge and continue

Auto-extraction bypasses the judgment step and pollutes the memory store.

### Comprehensive docs scope (unitAI-msh)

Each section of README.md to cover (no exceptions):

| Section | Key content |
|---------|-------------|
| Specialist schema | All fields, types, defaults, Zod validation, annotated YAML, field interaction diagram |
| CLI reference | All subcommands, flags, exit codes, foreground vs background, supervisor spawn |
| Agent session lifecycle | spawn→start→prompt→waitForDone→getLastOutput→getState→close, RPC protocol, event flow, kill vs close |
| Supervisor & job state | .specialists/ layout, status.json state machine, events.jsonl schema, GC, crash recovery |
| MCP tool surface | All 8 tools with input/output schema, deprecated tools, use_specialist vs CLI |
| Hook system | All 6 hooks, event types, matchers, output format, global vs project-local install |
| Beads integration | Bead creation policy, permission→bead mapping, lifecycle, audit records |
| Skills & scripts | skills.paths resolution, pre/post scripts, skill_inherit, diagnostic_scripts |

### Hook inventory (v3.0.2)

| Hook | Event | Purpose |
|------|-------|---------|
| `specialists-main-guard.mjs` | PreToolUse | Block direct edits to master; enforce PR workflow |
| `beads-edit-gate.mjs` | PreToolUse | Require in_progress bead before file edits |
| `beads-commit-gate.mjs` | PreToolUse | Require issues closed before `git commit` |
| `beads-stop-gate.mjs` | Stop | Require issues closed before session end |
| `beads-close-memory-prompt.mjs` | PostToolUse(Bash) | Nudge knowledge capture after `bd close` (needs judgment gate — unitAI-pjx) |
| `specialists-complete.mjs` | UserPromptSubmit | Inject completion banners for background jobs |

**Missing (roadmap):** SessionStart hook (`unitAI-f3t`). Project-local installation (`unitAI-1vt`).
