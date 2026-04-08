---
title: RPC Observability Metrics Contract
scope: observability-metrics
category: reference
version: 2.0.0
updated: 2026-04-08
synced_at: e7de0be7
source_of_truth_for: "src/specialist/timeline-events.ts, src/pi/session.ts, src/cli/ps.ts, src/cli/result.ts"
domain: ["observability", "metrics", "timeline"]
summary: "Defines additive metrics from Pi RPC surfaced via specialists status/feed/timeline. v2.0 adds extension_error, model_change events; enriched compaction/retry fields; token_usage CLI display."
---

# RPC Observability Metrics Contract

This document defines additive, backward-compatible metrics captured from Pi RPC and surfaced through specialists status/feed/timeline.

## Metric Source Map

| Metric | RPC source | Capture file | Persisted to |
|---|---|---|---|
| `token_usage.*` | `assistantMessageEvent.done`, `turn_end`, `agent_end` usage-like payloads | `src/pi/session.ts` (`findTokenUsage`) | `status.json.metrics`, `events.jsonl` (`token_usage`), `run_complete.metrics` |
| `finish_reason` | `stopReason` / `finishReason` from `assistantMessageEvent.done`, `turn_end`, `agent_end` | `src/pi/session.ts` (`findFinishReason`) | `status.json.metrics`, `events.jsonl` (`finish_reason`), `run_complete.metrics` |
| `turns` | `turn_start` count | `src/pi/session.ts` | `status.json.metrics`, `run_complete.metrics` |
| `tool_calls` | `tool_execution_start` count | `src/pi/session.ts` (+ supervisor reconciliation) | `status.json.metrics`, `run_complete.metrics` |
| `auto_compactions` | `auto_compaction_end` count | `src/pi/session.ts` | `status.json.metrics`, `events.jsonl` (`compaction`), `run_complete.metrics` |
| `auto_retries` | `auto_retry_end` count | `src/pi/session.ts` | `status.json.metrics`, `events.jsonl` (`retry`), `run_complete.metrics` |
| `extension_error` | Extension error callbacks | `src/pi/session.ts` | `events.jsonl` (`extension_error`) |
| `model_change` | Model change callbacks (`set_model`, `cycle_model`) | `src/pi/session.ts` | `events.jsonl` (`model_change`) |

## Timeline Additions (Additive)

### Event Types

**Core metrics:**
- `token_usage` — token consumption snapshot (input, output, cache, total, cost)
- `finish_reason` — why the model stopped (stop, length, toolUse, etc.)
- `turn_summary` — per-turn metadata with context health
- `compaction` — context compaction lifecycle
- `retry` — automatic retry lifecycle

**New in v2.0:**
- `extension_error` — extension failure events
- `model_change` — model switch events (`set_model`, `cycle_model`)

### Enriched Event Fields

**Compaction events** (`auto_compaction_start`, `auto_compaction_end`):
- `tokens_before` — context size before compaction
- `summary` — what was compacted
- `first_kept_entry_id` — first entry retained after compaction

**Retry events** (`auto_retry_start`, `auto_retry_end`):
- `attempt` — current attempt number
- `max_attempts` — configured retry limit
- `delay_ms` — backoff delay before retry
- `error_message` — transient error that triggered retry

Existing jobs without these events remain valid.

## Surface Coverage

### JSON APIs

- `specialists feed --json`: includes `metrics` envelope from status + additive events.
- `feed_specialist` tool: includes `metrics` from status.
- `specialists status --json`: includes per-job `metrics`.
- `specialist_status` tool: includes per-job `metrics`.

### Human-Readable CLI (v2.0)

**`sp ps` (list view):**
- Total tokens displayed alongside elapsed time: `15s · 2500 tok`

**`sp ps <id>` (inspect view):**
- Dedicated `tokens` line with breakdown: `input=500 · output=2000 · total=2500`
- Dedicated `cost_usd` line: `cost_usd=$0.0125`

**`sp result` (human mode):**
- Metrics footer appended to output:
  ```
  --- metrics: input=500 · output=2000 · total=2500 · cost_usd=$0.0125 ---
  ```

## Backward Compatibility

All new fields are optional:
- `status.json.metrics` may be absent for old runs.
- `run_complete.metrics` may be absent for old runs.
- `extension_error` and `model_change` events only present in jobs after 2026-04-08.
- Enriched `compaction` and `retry` fields only present when those features are triggered.
- Consumers must treat missing metrics as unknown, not zero.

## Open Review Workflow

For every new protocol-derived metric:
1. Open RFC issue with sample RPC payloads and backward-compat notes.
2. Update this matrix with source path and confidence/caveats.
3. Add fixture-driven contract tests from recorded RPC traces.
4. Require two approvals (maintainer + external reviewer) before stable surfacing.
5. Keep added fields optional for at least one minor release window.

## Implementation Notes (v2.0)

### Timeline Event Schema

See `src/specialist/timeline-events.ts` for canonical event type definitions:
- `TimelineEventExtensionError` — extension error events
- `TimelineEventModelChange` — model change events
- `TimelineEventCompaction` — enriched with `tokens_before`, `summary`, `first_kept_entry_id`
- `TimelineEventRetry` — enriched with `attempt`, `max_attempts`, `delay_ms`, `error_message`

### Token Usage Display

Token usage formatting uses shared helpers from `src/cli/format-helpers.js`:
- `formatTokenUsageSummary()` — produces `input=X · output=Y · total=Z`
- `formatCostUsd()` — produces `$0.0125` format

Used by:
- `src/cli/ps.ts` — list and inspect views
- `src/cli/result.ts` — human-mode result display

### Infrastructure Fixes

**initSchema race condition (2026-04-08):**
- Fixed DROP/RENAME race in `src/specialist/observability-sqlite.ts`
- Gates specialist_jobs rebuild to only run when legacy columns are missing
- Prevents "no such table: specialist_jobs" errors during concurrent init/read

**Loader precedence (2026-04-08):**
- Fixed in `src/specialist/loader.ts`
- `config/specialists/` now takes precedence over `.specialists/default/`
- Ensures `sp edit` changes are not overridden by stale default copies
