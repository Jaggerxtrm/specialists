---
title: Worktree Isolation
scope: worktrees
category: reference
version: 1.4.0
updated: 2026-04-29
synced_at: 4395795d
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
specialists run <name> [--worktree] [--job <id>] [--force-stale-base]
```

| Flag | Semantics | Creates worktree? |
|------|-----------|:-:|
| `--worktree` | Explicitly provision a new isolated workspace; requires `--bead` | Yes |
| `--job <id>` | Reuse the workspace of an existing job | No |
| `--force-stale-base` | Bypass stale-base guard when provisioning worktree | Yes (if `--worktree`) |

`--worktree` and `--job` are **mutually exclusive**. Specifying both exits with an error.

`--force-stale-base` is only meaningful with `--worktree` — it forces provisioning even when sibling epic chains have unmerged substantive commits.

---

## Isolation guard for edit-capable specialists

Specialists with `permission_required = MEDIUM` or `HIGH` can modify files. Launching them in the main checkout creates last-writer-wins races when multiple specialists run concurrently. The **worktree guard** (`unitAI-fdvt`) blocks these runs unless an isolation option is supplied.

### Trigger condition

Automatic worktree provisioning triggers when **all** of the following are true:

1. `specialist.execution.permission_required` is `MEDIUM` or `HIGH`.
2. `specialist.execution.requires_worktree` is not set to `false`.
3. `--job <id>` was not passed.
4. `--bead <id>` is available (required for deterministic branch naming).

### Error message

If automatic provisioning is required but no `--bead` was supplied:

```
Error: specialist '<name>' has permission_required=<MEDIUM|HIGH> and requires worktree isolation.
Provide --bead <id> for automatic worktree provisioning, or use --job <id> to reuse an existing worktree.
```

The process exits with code `1`.

`READ_ONLY` specialists are **never** gated — the requirement only applies to edit-capable specialists with `requires_worktree=true`.

### Stale-base guard

When `--worktree` provisions a new worktree, the stale-base guard checks whether sibling chains in the same epic have unmerged substantive commits. If detected, dispatch is blocked:

```
Error: Epic 'unitAI-3f7b' has sibling chains with unmerged changes.
  - impl-a: 2 substantive commits on 'feature/unitAI-impl-a-executor'
  - impl-b: 3 substantive commits on 'feature/unitAI-impl-b-executor'
Merge sibling chains first via 'sp epic merge unitAI-3f7b', or use --force-stale-base to bypass.
```

**Why this matters**: When parallel chains branch from the same base, Wave B's worktree lacks Wave A's merged changes. If Wave A merges first, Wave B's diff shows reversions. Rebase at merge-time resolves this, but starting from a stale base increases conflict risk.

Use `--force-stale-base` to bypass when you knowingly accept merge complexity later.

### `--worktree`

Optional explicit flag. MEDIUM/HIGH specialists that require isolation now auto-provision without this flag when `--bead` is present.

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

**Concurrency guard:** READ_ONLY and LOW specialists may run against an active worktree; MEDIUM/HIGH specialists are blocked until the owning job reaches a terminal state. Use `--force-job` to bypass.

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

## Session close: `sp end`

`specialists end` closes a worktree session with epic-aware publication.

### Synopsis

```bash
sp end [--bead <id>|--epic <id>] [--pr] [--rebuild]
```

### Epic-aware behavior

If the current chain belongs to an unresolved epic (`open`, `resolving`, `merge_ready`):

1. `sp end` detects epic membership via `checkEpicUnresolvedGuard()`
2. Prints redirect message
3. Delegates to `sp epic merge <epic-id>`

Example:
```
Chain unitAI-impl belongs to unresolved epic unitAI-3f7b (status: resolving).
Redirecting session close publication to epic merge (direct mode).
Epic unitAI-3f7b: resolving -> merge_ready
Epic unitAI-3f7b: merge_ready -> merged
Publication successful.
```

### Direct chain publication

For standalone chains NOT belonging to an epic:

```bash
sp end --bead unitAI-55d
# → merges branch feature/unitAI-55d-executor
```

---

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

## Auto-checkpoint behavior

Specialists with `auto_commit: checkpoint_on_waiting` or `checkpoint_on_terminal` automatically commit substantive worktree changes at designated lifecycle points. This prevents lost work if a job crashes or is stopped mid-task.

| Policy | When commits happen | Typical use |
|--------|---------------------|-------------|
| `never` | Never | Default — no auto-commit |
| `checkpoint_on_waiting` | Each keep-alive turn entering `waiting` | Executors, debuggers — preserve partial work before review |
| `checkpoint_on_terminal` | Terminal completion (`done`/`error`) | One-shot specialists — commit only at end |

Default specialists with auto-checkpoint enabled:
- **executor**: `checkpoint_on_waiting`
- **debugger**: `checkpoint_on_waiting`

Commit messages follow the pattern:
```
checkpoint(executor): unitAI-55d turn 1
```

Status metadata tracks checkpoints:
```json
{
  "auto_commit_count": 3,
  "last_auto_commit_sha": "a1b2c3d",
  "last_auto_commit_at_ms": 1714020000000
}
```

Auto-checkpoint runs silently — no user action required. The guard persists result + bead notes even on initial waiting turn (unitAI-8b812), ensuring no work is lost before the first checkpoint.

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
