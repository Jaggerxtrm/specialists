# `sp console` session aggregation and performance plan

## Current state

`sp console` already has a first-class multi-repo **ALL** view plus per-repo tabs. The gap is not another repository aggregate: ALL groups active specialist jobs by repository, but it does not show the xtmux session or pane that governs each job.

Measured on 2026-07-17 with 13 configured repositories and the production local databases:

| Operation | Result |
|---|---:|
| repository registry load | 106.6 ms |
| ALL refresh, p50 (12 runs) | 1,456 ms |
| ALL refresh, p95 / max | 3,167 ms |
| largest DB (`darth-feedor`) | 35,589 status rows |
| `darth-feedor` snapshot p50 / p95 | 1,376 / 3,002 ms |
| `specialists` DB | 1,920 status rows |
| `specialists` snapshot p50 / p95 | 485 / 1,337 ms |

The renderer is not the primary bottleneck: paints are coalesced to 20 Hz and process rows are cached. The delay is before rendering:

1. `refreshAllView()` polls every configured repository every five seconds.
2. `listProcessSnapshot()` calls SQLite `listStatuses()`, which selects and parses every `status_json` row before applying active/history filters in TypeScript.
3. The same snapshot also scans every job directory for `status.json`, even when SQLite is canonical, and calls global process-health collection once per repository.
4. Feed display is capped at 250 rendered rows, but `readEvents()` still loads and sorts the complete event history before slicing.

Repository discovery is bounded to depth two and persisted to `console.json`; it is not repeated on each render. No DB re-index was observed. The cost is repeated full materialization of per-repo SQLite data, not index construction.

## Proposed view

Evolve ALL with a **Sessions** grouping mode rather than adding a second repository dashboard:

```text
session xtmux-3ua-orch-r6g-w3-spec  pi  running  specialists/xt/r6g-w3-spec
  pane %5976  agent 46742b7d
    executor  a1b2c3  running  xtmux-r6g.3
    reviewer  d4e5f6  waiting  xtmux-r6g.3

unbound jobs
  explorer  010203  running  unitAI-123
```

### Inputs

- `xtmux dashboard sessions-only --json`: compact session/repo/branch/state summary.
- `xtmux topology --json` (`xtrm.xtmux.topology.v1`): host → session → window → pane topology, including `agent.instance_id` where available.
- `xtmux context --current --json` (`xtrm.runtime-origin.v1`): current-pane origin. The installed CLI rejects bare `xtmux context --json`; callers must pass `--current` until xtmux exposes arbitrary-pane context lookup.
- Specialists status rows: `spawn_origin` and `root_runtime_origin`, already emitted by `sp ps --json` and persisted in `status_json`.

Join each job to a pane in this order:

1. `(host_id, agent_instance_id)` from `spawn_origin.runtime_origin`;
2. `(host_id, tmux_session_id, tmux_pane_id)` when instance ID is absent;
3. the same keys from `root_runtime_origin` for descendant specialist jobs;
4. otherwise place it under **unbound jobs**. Never guess from bead ID or working-directory text.

### Bounded data contract

- Fetch topology/session summaries once per refresh generation, not once per repo.
- Main view queries active statuses only (`starting`, `running`, `waiting`) in SQL and projects only columns needed for rows and joins.
- Terminal history is explicit and paged, with a default limit of 200 per repository.
- Main view never fetches events or results.
- Keep one open read client per configured repo for the console lifetime, or use a bounded cache; do not create a new aggregate database.
- Run process-health collection once per refresh generation.
- Preserve the existing five-second ALL cadence and 50 ms render coalescing until measurements justify changing them.

### Failure behavior

- xtmux unavailable: retain current repository-grouped ALL view and show one dim warning.
- stale topology: keep the last good topology with its age; do not drop jobs.
- missing/legacy origin: show the job under **unbound jobs**.
- one unreadable repo: render the other repos and a per-repo error row.

## Acceptance and measurement

Use a fixture with 13 repositories and at least 40,000 historical status rows:

- initial Sessions snapshot p95 ≤ 250 ms;
- unchanged refresh p95 ≤ 100 ms;
- memory remains bounded while paging terminal history;
- zero event reads in ALL/Sessions mode;
- jobs with direct and inherited runtime origins join deterministically;
- legacy jobs remain visible under **unbound jobs**;
- existing repo tabs, filters, and detail views keep their behavior.

Implementation should begin with filtered/paged status queries and one-per-generation health collection. Building the xtmux grouping before removing the full scans would make the slow path more complex without making it faster.
