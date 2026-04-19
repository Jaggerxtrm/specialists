# Executor model benchmark protocol (unitAI-gc2a.1)

## 1) Goal

Pick lowest-cost non-Anthropic executor model that preserves delivery quality versus current baseline.

Quality floor first. Cost/time optimization second.

---

## 2) Candidate model matrix (non-Anthropic only)

Baseline fixed from `config/specialists/executor.specialist.json`.

| Role | Provider | Exact model ID | Why included |
|---|---|---|---|
| Baseline | OpenAI Codex | `openai-codex/gpt-5.3-codex` | Current production default for executor. Reference line for quality/cost/time. |
| Challenger A | OpenAI Codex | `openai-codex/gpt-5.4` | Known stronger reliability in prior runs when `gpt-5.3-codex` had 0-token failures. Measures premium-quality ceiling. |
| Challenger B | DashScope | `dashscope/qwen3.5-plus` | Existing in repo configs; expected cheaper token profile; tests cross-provider behavior. |
| Challenger C | Z.AI | `zai/glm-5` | Existing in repo configs; useful low-cost challenger with different failure surface. |

### Explicit exclusion

All Anthropic/Claude models excluded by benchmark rule (user constraint + known keep-alive instability memories).

---

## 3) Task corpus design

### 3.1 Corpus size

9 benchmark tasks total.
- 3 bug-fix tasks
- 3 refactor tasks
- 3 implementation tasks

Reason: enough diversity for failure detection, still repeatable and affordable.

### 3.2 Selection rules (must hold)

1. Source tasks from closed beads with known good outcome and reviewer evidence (PASS or PASS-after-fix).
2. Freeze inputs using immutable snapshot branch/tag per task (`benchmark/<task-id>-snapshot`).
3. Each task must touch at least 2 files or include 1 non-trivial behavior change (not typo/docs-only).
4. Include at least:
   - 1 validation/CLI parsing change
   - 1 lifecycle/state transition change
   - 1 observability/metrics change
5. Include both “first-pass PASS” and “needs fix-loop” historical patterns.

### 3.3 Seed task matrix template

Use cloned benchmark beads (`bench-*`) mapped 1:1 from historical seeds:

| Bucket | Seed example bead(s) | Why representative |
|---|---|---|
| Bug fix | `unitAI-y4ia`, `unitAI-ug51`, `unitAI-g4bn` | Covers status lifecycle correctness, crash recovery, token parsing/metrics correctness. |
| Refactor | `unitAI-22tq`, `unitAI-aq1k`, `unitAI-k7lg` | Multi-file structural changes with behavior preservation and constraint handling. |
| Implementation | `unitAI-8zui`, `unitAI-vozx`, `unitAI-5us0` | New capability delivery + integration paths + reviewer-verifiable outcomes. |

> If any seed task unavailable, replace with same bucket + same complexity class, then freeze new snapshot before runs.

---

## 4) Controlled run procedure

## 4.1 Pre-run freeze

1. Create benchmark branch from clean main: `benchmark/unitAI-gc2a-<date>`.
2. Create per-task snapshot branches:
   - `benchmark/<task-id>-snapshot`
3. Clone beads into benchmark namespace (`bench-...`) with fixed prompt text and AC.
4. Lock reviewer model for benchmark to one ID:
   - `openai-codex/gpt-5.3-codex`

## 4.2 Execution invariants (must be identical for all models)

1. Same executor prompt template and specialist config except `execution.model`.
2. Same task text, same bead metadata, same context-depth.
3. Same clean worktree creation per run.
4. Same reviewer workflow:
   - reviewer runs after executor
   - same verdict rubric (PASS/PARTIAL/FAIL)
   - same evidence requirements
5. Same post-run checks:
   - `npm run lint`
   - `npx tsc --noEmit`

## 4.3 Run order and replication

- Randomize model order per task (round-robin shuffle) to reduce time-of-day/provider noise.
- Run each (model, task) pair twice minimum.
- Total minimum runs: `4 models × 9 tasks × 2 reps = 72 runs`.

## 4.4 Per-run data capture schema (required)

Capture these fields for every run:
- `model_id`
- `task_id`
- `replicate`
- `lint_pass` (bool)
- `tsc_pass` (bool)
- `reviewer_verdict` (PASS|PARTIAL|FAIL)
- `reviewer_score` (0-100 if present)
- `token_usage` (input/output/total if available)
- `cost_usd`
- `elapsed_ms`
- `retry_count`
- `failure_type` (none|empty_output|hang|tool_error|other)
- `notes`

---

## 5) Scoring rubric

## 5.1 Quality gate (hard floor)

Run counts as quality-pass only when all true:
1. `lint_pass == true`
2. `tsc_pass == true`
3. `reviewer_verdict == PASS`

Model-level quality floor:
- PASS-rate across all runs >= 90%
- Zero critical integrity failures (wrong-branch review, empty diff with fake success, unresolved compile errors)

Any model below floor = reject. No cost comparison step.

## 5.2 Efficiency ranking (only after floor)

For models that pass floor, compute normalized score:

`score = 0.50 * quality_stability + 0.30 * cost_efficiency + 0.20 * speed_efficiency`

Where:
- `quality_stability`: inverse of variance in PASS/PARTIAL across tasks
- `cost_efficiency`: baseline_cost / model_cost (capped)
- `speed_efficiency`: baseline_elapsed / model_elapsed (capped)

---

## 6) Decision rule (replace vs reject)

Cheaper model accepted as baseline replacement only if all true:

1. Meets quality floor.
2. Mean `cost_usd` improvement >= 25% vs baseline.
3. Mean `elapsed_ms` not worse than baseline by > 15%.
4. Retry/failure burden not worse than baseline by > 10% relative.

If quality floor met but cost gain < 25% or reliability borderline:
- classify as `shadow-only` (keep baseline default, continue sampling).

If quality floor missed:
- classify as `reject`.

---

## 7) Stop conditions (early fail)

Stop model evaluation early if any trigger:

1. First 6 runs include >= 3 FAIL verdicts.
2. Two consecutive `empty_output` or hang failures.
3. Lint/tsc hard-fail rate > 50% after first 8 runs.
4. Proven systematic workflow break (cannot complete reviewer cycle on frozen snapshots).

Mark model `rejected_early`, record evidence, skip remaining tasks.

---

## 8) Known confounders and controls

1. `supervisor.test.ts` FIFO hang confounder
   - Memory notes: test hangs around FIFO cleanup/readline path.
   - Control: benchmark quality gate uses lint + tsc + reviewer verdict, not full vitest pass.

2. Stale worktree review confounder
   - Prior reports show reviewer PARTIAL caused by stale branch/worktree, not code quality.
   - Control: enforce per-run fresh worktree + verify commit SHA before reviewer dispatch.

3. Keep-alive commit behavior confounder
   - Executor may reach waiting without commit finalized.
   - Control: explicit post-executor `git status`/`git rev-parse HEAD` checkpoint before reviewer; require deterministic commit/diff presence.

4. Intermittent 0-token empty-output confounder (`gpt-5.3-codex` historical)
   - Control: count as failure_type, include retries, keep in reliability denominator (do not silently drop).

---

## 9) Output package from benchmark run

Must produce:

1. Raw run table (all 72+ rows).
2. Model aggregate table (quality, cost, speed, retries).
3. Decision summary per model: `replace` | `shadow-only` | `reject`.
4. Incident appendix for early stops and anomalous failures.

