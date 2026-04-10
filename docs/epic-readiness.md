# Epic readiness evaluation

This document defines the canonical readiness evaluator used by:

- `sp epic status`
- `sp epic merge`
- `sp ps` (epic readiness projection)
- supervisor SQLite lifecycle synchronization/recovery paths

## Inputs

Readiness is computed from persisted SQLite state for one epic:

- `specialist_jobs` rows tagged with `epic_id`
- `epic_chain_membership` rows (`chain_id`, optional `chain_root_bead_id`)
- `specialist_results` reviewer outputs (for PASS/PARTIAL/FAIL extraction)
- current persisted epic lifecycle state (`epic_runs.status`)

## Chain semantics

For each chain:

- `pending`: chain has active jobs (`starting|running|waiting`)
- `blocked`:
  - no persisted chain jobs (migration/orphan case), or
  - no terminal reviewer verdict found, or
  - fix-loop jobs completed after a non-PASS reviewer verdict but reviewer has not rerun
- `failed`: latest terminal reviewer verdict is `PARTIAL` or `FAIL` with no follow-up fix-loop progress
- `pass`: latest terminal reviewer verdict is `PASS`

Reviewer verdict detection is extracted from result text via `Verdict: PASS|PARTIAL|FAIL`.

## Prep semantics

Prep jobs are epic-tagged jobs with `chain_kind !== 'chain'`.

- running prep jobs block merge readiness
- errored prep jobs fail the epic readiness state
- done prep jobs satisfy prep completion

## Epic readiness states

Evaluator emits one machine-readable state:

- `unresolved` — open epic with active work still running
- `resolving` — resolving epic with active work or unresolved blockers
- `merge_ready` — prep terminal + every chain PASS (or prep-only epic with terminal prep)
- `blocked` — non-terminal but blocked on missing reviewer/fix-loop closure
- `failed` — prep error or failed chain review outcome
- `merged` / `abandoned` — terminal lifecycle passthrough

## Lifecycle synchronization

Evaluator also computes `next_state` and transition intent:

- `open -> resolving` when unresolved work exists
- `resolving -> merge_ready` when all readiness conditions are met
- `merge_ready -> resolving` if blockers reappear
- `resolving|merge_ready -> failed` on fatal prep/chain failure

These transitions are persisted automatically whenever epic readiness is synchronized.

## Edge cases

- **Prep-only epic**: no chains and all prep terminal => `merge_ready`
- **Standalone chain (non-epic)**: excluded; readiness evaluator runs only for jobs with `epic_id`
- **Missing reviewer verdict**: chain remains `blocked`, epic cannot become `merge_ready`
- **Migration rows with membership but missing chain jobs**: chain is `blocked` with explicit reason
