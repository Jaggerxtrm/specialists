---
title: Worktree Isolation
scope: worktrees
category: reference
version: 1.1.0
updated: 2026-04-07
synced_at: 2cff034c
description: Technical reference for worktree-per-executor isolation — CLI flags, job registry, GC, and chained bead patterns.
source_of_truth_for:
  - "src/specialist/job-root.ts"
  - "src/specialist/worktree.ts"
  - "src/specialist/worktree-gc.ts"
  - "src/cli/run.ts"
  - "src/specialist/supervisor.ts"
domain:
  - worktrees
  - jobs
  - isolation
---

# Worktree Isolation

Each edit-permission specialist runs in an isolated git worktree (branch). This prevents concurrent file corruption when multiple executors modify overlapping paths, and produces a clean per-task branch that the orchestrator merges in dependency order.

> Design decisions: overthinker bead `abb9`. Implementation: `hgpu.1–hgpu.5`.

---

## CLI flags

```
specialists run <name> [--worktree] [--job <id>] [--no-worktree]
```

| Flag | Semantics | Creates worktree? |
|------|-----------|:-:|
| `--worktree` | Provision a new isolated workspace; requires `--bead` | Yes |
| `--job <id>` | Reuse the workspace of an existing job | No |
| `--no-worktree` | Bypass the isolation guard; caller accepts last-writer-wins risk | No |

`--worktree` and `--job` are **mutually exclusive**. Specifying both exits with an error.

---

## Isolation guard for edit-capable specialists

Specialists with `permission_required = MEDIUM` or `HIGH` can modify files. Launching them in the main checkout creates last-writer-wins races when multiple specialists run concurrently. The **worktree guard** (`unitAI-fdvt`) blocks these runs unless an isolation option is supplied.

### Trigger condition

The guard fires when **all** of the following are true:

1. `specialist.execution.permission_required` is `MEDIUM` or `HIGH`.
2. Neither `--worktree`, `--job <id>`, nor `--no-worktree` was passed.

### Error message

```
Error: specialist '<name>' has permission_required=<MEDIUM|HIGH> and can edit files.
Edit-capable specialists must run in isolation. Use one of:
  --worktree      provision an isolated worktree (recommended)
  --job <id>      reuse an existing job's worktree
  --no-worktree   bypass this guard (you accept last-writer-wins risk)
```

The process exits with code `1`.

### Bypass with `--no-worktree`

Pass `--no-worktree` to skip the guard explicitly:

```bash
# Single executor run on a clean checkout — no concurrent writers
specialists run executor --bead hgpu.3 --no-worktree
```

The specialist runs in the current directory (no branch isolation). Use only when:
- There is a single specialist running at a time (no concurrency risk).
- Worktree provisioning is unavailable (e.g., certain CI environments).

`READ_ONLY` specialists are **never** gated — the guard does not apply to them.

### `--worktree`

Requires `--bead <id>` — the bead id drives the deterministic branch name.

```bash
specialists run executor --worktree --bead hgpu.3
# stderr: [worktree created: /repo/.worktrees/hgpu.3/hgpu.3-executor  branch: feature/hgpu.3-executor]
```

If a worktree for that branch already exists (e.g. from a prior interrupted run) it is reused:

```bash
# stderr: [worktree reused: /repo/.worktrees/hgpu.3/hgpu.3-executor  branch: feature/hgpu.3-executor]
```

### `--job <id>`

Reads `worktree_path` from the target job's `status.json` and uses that directory as `cwd`. The **caller's** `--bead` remains authoritative — only the workspace is borrowed.

```bash
specialists run reviewer --job 49adda --bead hgpu.3-review
# stderr: [workspace reused from job 49adda: /repo/.worktrees/hgpu.3/hgpu.3-executor]
```

Hard fail conditions (both exit 1):
- `status.json` missing or unreadable for the given job id.
- `worktree_path` absent — the target job was not started with `--worktree`.

**Concurrency guard (design intent from abb9):** READ_ONLY specialists may run against an active worktree; MEDIUM/HIGH specialists are rejected until the owning job reaches a terminal state.

---

## How it works

### Branch naming

`provisionWorktree()` in `worktree.ts` derives deterministic names:

| Artifact | Convention | Example |
|----------|-----------|---------|
| Git branch | `feature/<beadId>-<slug>` | `feature/hgpu.3-executor` |
| Worktree dir | `<beadId>-<slug>` | `hgpu.3-executor` |
| Parent dir | `<git-common-root>/.worktrees/<beadId>/` | `.worktrees/hgpu.3/` |

`<slug>` is the specialist name lowercased with non-alphanumeric runs collapsed to `-`.

### Worktree creation

`bd worktree create <path> --branch <branch>` is the **only** creation path. There is no silent `git worktree add` fallback — failure throws immediately with the bd stderr included in the message.

Reuse detection runs first via `git worktree list --porcelain`; creation is skipped if the branch is already checked out.

### Central job registry

`resolveJobsDir()` in `job-root.ts` anchors `.specialists/jobs/` to the git **common root** using `git rev-parse --git-common-dir`. From any worktree, `dirname(resolve(cwd, gitCommonDir))` resolves to the main checkout root — all worktrees converge on the same jobs directory.

```
/repo/.git/                     ← common git dir
/repo/.specialists/jobs/        ← shared job registry (all worktrees read/write here)
/repo/.worktrees/hgpu.3/hgpu.3-executor/   ← isolated cwd for that run
```

### Persisted metadata

`Supervisor` writes `worktree_path` and `branch` to `status.json` immediately on job start:

```json
{
  "id": "49adda",
  "specialist": "executor",
  "status": "running",
  "worktree_path": "/repo/.worktrees/hgpu.3/hgpu.3-executor",
  "branch": "feature/hgpu.3-executor"
}
```

`--job` resolution reads this file directly — no git scanning required.

### Status / steer / resume

`status`, `steer`, and `resume` commands all call `resolveJobsDir()` with their local `cwd`, which returns the common-root path regardless of whether they are invoked from a worktree or the main checkout. The job record is always found.

### Pi bootstrap

Pi extensions are global (`~/.pi/`). No per-worktree bootstrap step is required.

---

## Worktree GC

```bash
specialists clean            # prunes job dirs AND terminal worktrees
specialists clean --dry-run  # preview removals without deleting
```

GC runs automatically as part of `specialists clean`. Candidates must satisfy **all** conditions:

1. Job status is `done` or `error` (terminal).
2. `worktree_path` is recorded in `status.json`.
3. The directory still exists on disk.
4. Job status is **not** `starting`, `running`, or `waiting` (active guard runs first, unconditionally).

Removal uses `git worktree remove --force` so both the directory and the git registry entry are cleaned atomically. Failures are skipped silently — missing cleanup is preferred over data loss.

---

## Chained bead review/fix loop

A common orchestration pattern with worktree isolation:

```bash
# 1. Executor claims bead, provisions worktree, does implementation
specialists run executor --worktree --bead hgpu.3
# → executor closes bead as COMPLETE/PARTIAL, job id: 49adda

# 2. Reviewer enters the same worktree (read bead notes from the executor's run)
specialists run reviewer --job 49adda --bead hgpu.3-review

# 3. If reviewer returns PARTIAL, fix-it agent re-enters same workspace
specialists run executor --job 49adda --bead hgpu.3-fix
```

Key invariants:
- Reviewer sees exactly the state the executor left — same branch, same files.
- Caller's `--bead` controls which bead is opened/closed; `--job` only selects the workspace.
- The executor's bead is never re-opened by the reviewer — lifecycle stays with the original claimer.

For orchestration patterns that compose this loop, see `SKILL.md` and `workflow.md`.

---

## Key files

| File | Responsibility |
|------|---------------|
| `src/specialist/job-root.ts` | `resolveJobsDir()` — common-root job registry anchor |
| `src/specialist/worktree.ts` | `provisionWorktree()`, branch/path derivation, `listWorktrees()` |
| `src/specialist/worktree-gc.ts` | `collectWorktreeGcCandidates()`, `pruneWorktrees()` |
| `src/cli/run.ts` | `resolveWorkingDirectory()` — `--worktree`/`--job` dispatch |
| `src/specialist/supervisor.ts` | Persists `worktree_path` + `branch` to `status.json` |

---

## See also

- [background-jobs.md](background-jobs.md) — job lifecycle, status polling, keep-alive
- [workflow.md](workflow.md) — orchestration patterns and specialist chaining
- [worktree.md](worktree.md) — xtrm `xt pi` / `xt end` integration (separate topic)
