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

## Timeline Additions (Additive)

New event types:
- `token_usage`
- `finish_reason`
- `turn_summary`
- `compaction`
- `retry`

Existing jobs without these events remain valid.

## Surface Coverage

- `specialists feed --json`: includes `metrics` envelope from status + additive events.
- `feed_specialist` tool: includes `metrics` from status.
- `specialists status --json`: includes per-job `metrics`.
- `specialist_status` tool: includes per-job `metrics`.

## Backward Compatibility

All new fields are optional:
- `status.json.metrics` may be absent for old runs.
- `run_complete.metrics` may be absent for old runs.
- consumers must treat missing metrics as unknown, not zero.

## Open Review Workflow

For every new protocol-derived metric:
1. Open RFC issue with sample RPC payloads and backward-compat notes.
2. Update this matrix with source path and confidence/caveats.
3. Add fixture-driven contract tests from recorded RPC traces.
4. Require two approvals (maintainer + external reviewer) before stable surfacing.
5. Keep added fields optional for at least one minor release window.
