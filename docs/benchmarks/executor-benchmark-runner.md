# Executor benchmark runner (unitAI-gc2a.3)

## One-command launch

```bash
node scripts/run-executor-benchmark.mjs --run-id unitAI-gc2a-r1
```

Default matrix source: `config/benchmarks/executor-benchmark-matrix.json`.

## Deterministic matrix order

Runner expands queue in fixed order:
1. Task order from `tasks[]`
2. Model order from `models[]`
3. Replicate fixed at `1`

Current matrix size: `3 tasks × 4 models × 1 rep = 12 runs`.

## Isolation strategy (no cross-run contamination)

Per sample runner creates fresh benchmark bead cloned from seed bead content.
That bead gets unique title with run id + model id.
Executor always runs with `--worktree` on that benchmark bead.
Reviewer always runs with `--job <executor-job-id>` on same benchmark bead.

Guardrail before reviewer dispatch:
- runner checks worktree has commit diff vs `origin/main`
- if no diff / stale state, reviewer skipped, sample marked failed (`stale_or_empty_diff`)

## Artifacts

Output root: `.specialists/benchmarks/runs/<run-id>/`

- `manifest.json` — immutable sample plan for run id
- `attempts.jsonl` — append-only rows, one row per attempt
- `summary.json` — machine summary
- `summary.md` — human summary table

Each `attempts.jsonl` row includes:
- `model_id`
- `task_id`
- `run_number`
- `executor_job_id`
- `reviewer_job_id`
- `status`
- lint/tsc/verdict + token/cost/elapsed fields

## Rerun failed samples only

```bash
node scripts/run-executor-benchmark.mjs --run-id unitAI-gc2a-r1 --rerun-failed
```

Runner reads `manifest.json` + `attempts.jsonl`.
Only samples whose latest status != `success` re-queued.
Completed success samples remain untouched. Rows append-only for audit trail.

## Lint + tsc recording policy

Executor workflow rule forbids full test suite in harness runs.
Runner records lint/tsc from reviewer output parsing:
- `lint_pass|lint`
- `tsc_pass|tsc --noEmit`

This aligns with benchmark protocol confounder control (`supervisor.test.ts` hang risk).
