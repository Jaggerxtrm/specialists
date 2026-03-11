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

### P1 — Infrastructure & UX

| ID | Feature |
|----|---------|
| `unitAI-f3t` | **SessionStart hook** — `specialists-session-start.mjs` injects active jobs + available specialists into every new Claude session (like `bd prime`) |
| `unitAI-2v1` | **Skills installation** — `specialists install` installs a `specialists-usage` skill so Claude knows how to use the CLI |
| `unitAI-7d0` | **`specialists setup`** — writes workflow block into AGENTS.md/CLAUDE.md (`--project` / `--global`), like `bd setup claude` |
| `unitAI-pjx` | **Force memory judgment on `bd close`** — blocking gate (not a nudge) that requires the agent to evaluate whether a memory is worth keeping per bd guidelines; auto-extract bypasses judgment and pollutes memories |
| `unitAI-9re` | **`specialists feed -f`: global live feed** — tail ALL jobs simultaneously, auto-discover new ones, color per job, show bead status inline; like `ov feed` but for specialists |

### P2 — CLI & docs polish

| ID | Feature |
|----|---------|
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
    → writes .specialists/jobs/<id>/status.json
    → spawns pi subprocess
    → pi runs, streams events
    → on done: writes result.txt, touches .specialists/ready/<id>
  → prints "Job started: <id>", exits

UserPromptSubmit hook (specialists-complete.mjs)
  → scans .specialists/ready/
  → injects "[Specialist '<name>' completed ...]" banner
  → deletes marker (fires once)
```

### Known SIGTERM gap (unitAI-0ef)

Background jobs have no watcher process. When `specialists stop` sends SIGTERM:
1. pi receives SIGTERM, tries to flush final event → EPIPE (pipe to parent already closed)
2. pi crashes without writing `status.json` update
3. `status.json` stays `"running"` forever

**Fix direction:** Keep the supervisor process alive as a thin watcher until pi exits, or spawn a detached watcher that traps the pi `close` event and writes the final status.

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
Integrates SIGTERM fix: shows `cancelled` when a job is stopped.

### Memory persistence gap (unitAI-pjx)

`beads-close-memory-prompt` fires as PostToolUse on Bash (when `bd close` runs).
The hook emits a nudge that agents treat as advisory — compliance is low.

The core issue is that **agents must exercise judgment**, not just be reminded.
bd guidelines are explicit: memories should be stable patterns, key decisions, or
solutions to recurring problems — NOT session-specific context or low-value noise.
Auto-extraction bypasses this judgment and would pollute the memory store.

**Correct fix:** A **blocking PreToolUse gate** on `bd close` — like `beads-commit-gate`
blocks commits, this gate blocks the close until the agent explicitly answers:
- Did I learn something stable and reusable?
- If yes → `bd remember "<precise insight>"`
- If no → acknowledge "nothing worth persisting" and proceed

The agent cannot skip the evaluation. The judgment step is the feature.

### Hook inventory (v3.0.2)

| Hook | Event | Purpose |
|------|-------|---------|
| `specialists-main-guard.mjs` | PreToolUse | Block direct edits to master; enforce PR workflow |
| `beads-edit-gate.mjs` | PreToolUse | Require in_progress bead before file edits |
| `beads-commit-gate.mjs` | PreToolUse | Require issues closed before `git commit` |
| `beads-stop-gate.mjs` | Stop | Require issues closed before session end |
| `beads-close-memory-prompt.mjs` | PostToolUse(Bash) | Nudge knowledge capture after `bd close` (needs improvement) |
| `specialists-complete.mjs` | UserPromptSubmit | Inject completion banners for background jobs |

**Missing (roadmap):** SessionStart hook to inject context at session open.
