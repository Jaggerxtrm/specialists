---
title: Bead-First Workflow
scope: workflow
category: guide
version: 1.0.0
updated: 2026-03-23
description: Canonical tracked and ad-hoc workflow for Specialists.
source_of_truth_for:
  - "src/specialist/workflow.ts"
  - "src/cli/help.ts"
  - "src/cli/quickstart.ts"
domain:
  - workflow
  - beads
---

# Bead-First Workflow

> **Alias:** `sp` is a shorter alias for `specialists` — `sp run`, `sp list`, `sp feed` etc. work identically.

The canonical workflow is **bead-first**.

## Tracked work (primary)

Use tracked mode when the work belongs to a bead.

```bash
bd create "Investigate X" -t task -p 1 --json
bd dep add <this-id> <blocker-id>   # if dependencies exist
specialists run <name> --bead <id> [--context-depth N] [--background]
specialists feed -f
bd close <id> --reason "Done"
```

Key points:

- `--bead` makes the bead the prompt source
- the orchestrator owns the bead lifecycle
- the runner does **not** create a second bead
- the runner does **not** close the bead on completion

## Ad-hoc work

Use ad-hoc mode only for quick, untracked tasks.

```bash
specialists run <name> --prompt "..."
```

## `--context-depth`

`--context-depth` controls how many levels of completed blockers are injected when using `--bead`.

| Value | Meaning |
|---|---|
| `0` | No dependency context injection |
| `1` | Immediate completed blockers only (default) |
| `2` | Completed blockers and their completed blockers |
| `N` | Walk `N` levels up the blocker chain |

Example:

```bash
specialists run bug-hunt --bead unitAI-abc --context-depth 2
```

## `--no-beads`

`--no-beads` suppresses creating/tracking a new bead for the run.

Important:

- `--no-beads` does **not** disable bead reading
- if `--bead <id>` is provided, the bead is still read and used as the prompt source
- `--no-beads` only affects whether a new tracking bead is created

## Observe a run

```bash
specialists feed <job-id>
specialists feed -f
specialists result <job-id>
specialists stop <job-id>
```

## Directory structure

Specialists live in `.specialists/` in the project root:

```
.specialists/
├── default/     # canonical specialists (from init)
│   └── specialists/
├── user/        # custom specialists
│   └── specialists/
├── jobs/        # runtime (gitignored)
└── ready/       # runtime (gitignored)
```

Add custom specialists to `.specialists/user/specialists/`. Run `specialists list` to see all available.

## See also

- [bootstrap.md](bootstrap.md)
- [background-jobs.md](background-jobs.md)
- [cli-reference.md](cli-reference.md)
