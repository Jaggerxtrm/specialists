# Specialist Run Stats — Baseline

> Snapshot generated: 2026-04-24. Source: `.specialists/jobs/*/status.json` (300 dirs, 299 with status). Richer per-event data lives in `.specialists/db/observability.db` (~257MB at snapshot) — not yet aggregated. See `unitAI-9j7n` for the retention/metrics-extraction pipeline.

## Totals

- Jobs on disk: 299
- Done: 194 · Error: 45 · Cancelled: 20 · Waiting: 16 · Other: 24
- Tokens (done only): **7.53M**
- Cost (done only): **$4.08**

## Status breakdown

| Specialist | total | done | error | cancelled | wait |
| --- | ---:| ---:| ---:| ---:| ---:|
| executor | 105 | 75 | 10 | 13 | 7 |
| reviewer | 86 | 56 | 24 | 1 | 5 |
| explorer | 46 | 36 | 4 | 3 | 3 |
| code-review | 25 | 23 | 2 | 0 | 0 |
| debugger | 10 | 5 | 4 | 1 | 0 |
| overthinker | 7 | 6 | 0 | 0 | 1 |
| sync-docs | 6 | 5 | 0 | 0 | 1 |
| parallel-review | 6 | 6 | 0 | 0 | 0 |
| planner | 4 | 4 | 0 | 0 | 0 |
| test-runner | 3 | 0 | 1 | 2 | 0 |
| specialists-creator | 1 | 1 | 0 | 0 | 0 |

## Completion time (done jobs only)

| Specialist | n | avg | median | p90 | min | max |
| --- | ---:| ---:| ---:| ---:| ---:| ---:|
| executor | 75 | 32.9m | 2.8m | 18.1m | 9s | 31.3h |
| reviewer | 56 | 4.8m | 1.3m | 5.0m | 15s | 59.0m |
| explorer | 36 | 4.8m | 2.5m | 10.6m | 9s | 53.5m |
| overthinker | 6 | 3.2m | 4.1m | 5.5m | 54s | 5.5m |
| parallel-review | 6 | 6s | 7s | 7s | 5s | 7s |
| sync-docs | 5 | 4.4m | 2.4m | 12.2m | 6s | 12.2m |
| debugger | 5 | 16.3m | 8.0m | 51.6m | 1.5m | 51.6m |
| planner | 4 | 6.3m | 8.3m | 10.1m | 2.3m | 10.1m |
| specialists-creator | 1 | 14s | 14s | 14s | 14s | 14s |

## Per specialist × model

`n` = total attempts (done + errors + cancelled).  Time/token/cost stats are for done runs only. Rows sorted by specialist name then by done-count desc.

| spec / model | n | done | err | can | avgT | medT | p90T | total tok | avg tok | total cost | avg cost |
| --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:|
| code-review / gemini | 0 | 0 | 0 | 0 | — | — | — | 0 | — | $0.00 | — |
| code-review / unknown | 2 | 0 | 2 | 0 | — | — | — | 0 | — | $0.00 | — |
| debugger / openai-codex/gpt-5.3-codex | 3 | 3 | 0 | 0 | 4.8m | 4.9m | 8.0m | 231.6k | 77.2k | $0.07 | $0.0231 |
| debugger / gpt-5.3-codex | 7 | 2 | 4 | 1 | 33.5m | 51.6m | 51.6m | 112.4k | 56.2k | $0.03 | $0.0125 |
| executor / openai-codex/gpt-5.4-mini | 20 | 20 | 0 | 0 | 2.0m | 1.6m | 5.4m | 817.7k | 40.9k | $0.23 | $0.0116 |
| executor / openai-codex/gpt-5.3-codex | 17 | 17 | 0 | 0 | 2.8m | 2.2m | 6.0m | 696.4k | 41.0k | $0.31 | $0.0183 |
| executor / gpt-5.3-codex | 21 | 17 | 0 | 4 | 2.1h | 9.7m | 1.2h | 1.07M | 63.1k | $0.33 | $0.0196 |
| executor / dashscope/qwen3.5-plus | 8 | 8 | 0 | 0 | 29s | 19s | 1.0m | 0 | 0 | $0.00 | $0.0000 |
| executor / gpt-5.4-mini | 13 | 7 | 2 | 4 | 23.1m | 18.1m | 1.2h | 421.1k | 60.2k | $0.07 | $0.0106 |
| executor / zai/glm-5 | 2 | 2 | 0 | 0 | 6.4m | 10.8m | 10.8m | 133.8k | 66.9k | $0.03 | $0.0159 |
| executor / qwen3.5-plus | 4 | 2 | 0 | 2 | 39.1m | 1.2h | 1.2h | 72.3k | 36.1k | $0.03 | $0.0153 |
| executor / gpt-5.4 | 1 | 1 | 0 | 0 | 14.7m | 14.7m | 14.7m | 81.2k | 81.2k | $0.03 | $0.0280 |
| executor / anthropic/claude-sonnet-4-6 | 1 | 1 | 0 | 0 | 9s | 9s | 9s | 0 | 0 | $0.00 | $0.0000 |
| executor / glm-5 | 7 | 0 | 4 | 3 | — | — | — | 0 | — | $0.00 | — |
| executor / unknown | 4 | 0 | 4 | 0 | — | — | — | 0 | — | $0.00 | — |
| explorer / nano-gpt/zai-org/glm-5 | 12 | 12 | 0 | 0 | 1.7m | 1.6m | 2.9m | 238.3k | 19.9k | $0.04 | $0.0031 |
| explorer / zai/glm-5 | 8 | 8 | 0 | 0 | 2.1m | 2.4m | 3.9m | 376.7k | 47.1k | $0.19 | $0.0238 |
| explorer / glm-5 | 8 | 6 | 2 | 0 | 6.1m | 6.5m | 7.2m | 219.0k | 36.5k | $0.08 | $0.0139 |
| explorer / zai-org/glm-5 | 9 | 6 | 0 | 3 | 15.3m | 11.0m | 53.5m | 133.8k | 22.3k | $0.02 | $0.0037 |
| explorer / nano-gpt/moonshotai/kimi-k2.5 | 2 | 2 | 0 | 0 | 3.5m | 4.7m | 4.7m | 101.1k | 50.6k | $0.02 | $0.0083 |
| explorer / dashscope/qwen3.5-plus | 1 | 1 | 0 | 0 | 13s | 13s | 13s | 0 | 0 | $0.00 | $0.0000 |
| explorer / nano-gpt/qwen/qwen3.5-397b | 1 | 1 | 0 | 0 | 9s | 9s | 9s | 0 | 0 | $0.00 | $0.0000 |
| explorer / unknown | 2 | 0 | 2 | 0 | — | — | — | 0 | — | $0.00 | — |
| overthinker / openai-codex/gpt-5.4 | 6 | 6 | 0 | 0 | 3.2m | 4.1m | 5.5m | 305.1k | 50.8k | $0.82 | $0.1364 |
| parallel-review / anthropic/claude-sonnet-* | 6 | 6 | 0 | 0 | 6s | 7s | 7s | 0 | 0 | $0.00 | $0.0000 |
| planner / openai-codex/gpt-5.4 | 4 | 4 | 0 | 0 | 6.3m | 8.3m | 10.1m | 390.8k | 97.7k | $0.26 | $0.0661 |
| reviewer / openai-codex/gpt-5.3-codex | 47 | 47 | 0 | 0 | 1.5m | 1.3m | 3.4m | 1.77M | 37.6k | $1.38 | $0.0295 |
| reviewer / openai-codex/gpt-5.4-mini | 4 | 4 | 0 | 0 | 1.1m | 1.1m | 1.4m | 132.3k | 33.1k | $0.03 | $0.0077 |
| reviewer / gpt-5.4-mini | 3 | 3 | 0 | 0 | 59.0m | 59.0m | 59.0m | 0 | 0 | $0.00 | $0.0000 |
| reviewer / gpt-5.3-codex | 12 | 2 | 9 | 1 | 6.6m | 7.6m | 7.6m | 68.6k | 34.3k | $0.06 | $0.0305 |
| reviewer / unknown | 15 | 0 | 15 | 0 | — | — | — | 0 | — | $0.00 | — |
| specialists-creator / anthropic/claude-sonnet-* | 1 | 1 | 0 | 0 | 14s | 14s | 14s | 0 | 0 | $0.00 | $0.0000 |
| sync-docs / glm-5 | 3 | 3 | 0 | 0 | 7.2m | 7.0m | 12.2m | 154.0k | 51.3k | $0.03 | $0.0107 |
| sync-docs / dashscope/glm-5 | 1 | 1 | 0 | 0 | 6s | 6s | 6s | 0 | 0 | $0.00 | $0.0000 |
| sync-docs / dashscope/qwen3.5-plus | 1 | 1 | 0 | 0 | 21s | 21s | 21s | 0 | 0 | $0.00 | $0.0000 |
| test-runner / unknown | 3 | 0 | 1 | 2 | — | — | — | 0 | — | $0.00 | — |

## Anomalies

- **parallel-review / anthropic/claude-sonnet-***: 6 runs, all 5-7s, 0 tokens recorded. Specialist is dispatching but not performing substantive work. Filed separately as reliability issue.
- **dashscope/qwen3.5-plus**: 0 tokens recorded on every explorer/executor/sync-docs run (n=10 combined). Backend routing terminates without a model turn. Avoid as default for any specialist.
- **nano-gpt/qwen/qwen3.5-397b**: 9s run, 0 tokens. Upstream returns "400 Model not supported" (see memory `model-backend-gotcha-nano-gpt-qwen-qwen3-5`). Do not use.
- **executor / gpt-5.3-codex max 31.3h (1876m)**: stuck keep-alive outlier that inflates the avg. Median (9.7m) is the real central tendency.
- **reviewer / gpt-5.3-codex (bare ID) 9 errors / 12 attempts**: accumulated from today's `npx vitest` supervisor-crash class. Should drop sharply once mandatory-rules overlay enforces `bunx`.
- **test-runner**: no successful runs recorded. Sample size too small for inference; also may be under-used by orchestrators.
- **`unknown` model rows** (35 total attempts): legacy jobs predating model-ID capture in `status.json`. Leave as-is; future jobs record model.

## How these numbers feed skills

The medians directly drive the sleep-timer table in `config/skills/using-specialists-v2/SKILL.md` (Autonomous Drive > Sleep-Based Polling). Refresh the numbers there when this doc is regenerated.

## Regenerating

Script form (status-json scan):

```bash
node -e '
const fs = require("fs");
const path = require("path");
const dir = ".specialists/jobs";
const by = new Map();
for (const id of fs.readdirSync(dir)) {
  const p = path.join(dir, id, "status.json");
  if (!fs.existsSync(p)) continue;
  let s; try { s = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
  const key = `${s.specialist}\x1e${s.model || "unknown"}`;
  if (!by.has(key)) by.set(key, { spec: s.specialist, model: s.model || "unknown", runs: [], errors: 0, cancelled: 0 });
  const b = by.get(key);
  if (s.status === "error") b.errors++;
  else if (s.status === "cancelled") b.cancelled++;
  if (s.status === "done" && typeof s.elapsed_s === "number" && s.elapsed_s > 0) {
    const tu = s.metrics && s.metrics.token_usage;
    b.runs.push({ elapsed: s.elapsed_s, total: tu?.total_tokens || 0, cost: tu?.cost_usd || 0 });
  }
}
// ... aggregate and print
'
```

A proper extraction pipeline (`unitAI-9j7n`) should move this into the observability DB as a persisted `specialist_job_metrics` table so historical baselines survive event pruning.
