# Architecture addendum

## Benchmark and probe cache layout

Benchmark snapshots live under `~/.cache/specialists/benchmarks/<source>.json`.
Each file stores `source`, `source_url`, `fetched_at`, and normalized `models` rows.
Writes use temp file, fsync, then rename.

Agentic follow-through probes live under `~/.cache/specialists/probes/<model>-<spec>-<sha>/<run-id>/`.
Each run directory contains isolated probe workspace files, `events.jsonl`, and `probe-summary.json`.
Probe code passes run directory as specialist `projectDir`; transcript paths remain under probe cache.
