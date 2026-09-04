---
name: using-kpi
description: >
  Optional Specialists observability/KPI analysis for runtime cost, waiting/stall time,
  turns/tool calls, prompt payload, token trajectories, model/role outliers, and evidence
  used to tune Specialists. Use when investigating Specialist efficiency or regressions;
  query the current observability schema rather than relying on frozen SQL field lists.
disable-model-invocation: true
---

# Specialists KPI

Use measured runtime evidence to decide where Specialist cost or reliability work is
worth doing.

## Start with the current schema

Inspect current CLI/database surfaces first:

```bash
sp db --help
sp db stats --help
sp db extract --help
```

If querying SQLite directly, inspect table/schema names before writing a query. Metrics
have evolved across releases.

## Priorities

Rank evidence roughly in this order:

1. real active/paid runtime rather than total wall time;
2. failed/crashed/stalled jobs;
3. waiting time that indicates forgotten keep-alives;
4. first-turn and cumulative token usage;
5. prompt/skill/rule payload size;
6. turns and tool-call distribution;
7. model/role outliers and variance.

Do not optimize from a single slow run. Compare enough jobs to separate role shape from
an outlier, and keep model/provider differences visible.

## Prompt and skill cost

API/provider token telemetry is the authority when available. Payload-component events or
file-size/token approximations help explain the total but must not be treated as exact
billing truth.

When a large attached skill dominates repeated first-turn input, prefer a concise router
plus on-demand references or deterministic scripts. Do not inline every reference into a
system prompt merely to reduce skill count; measure actual loaded content.

## Waiting/stall hygiene

High elapsed time with low active runtime often means waiting/continuation policy is the
problem, not model speed. Correlate waiting state with job lifecycle events before tuning
model choice.

## Output

A useful KPI report states:

- sample/window and query source;
- top roles/models by active runtime and token cost;
- failure/stall/waiting outliers;
- payload/context outliers;
- likely cause with evidence;
- one or two changes worth testing;
- how to measure whether those changes improved the next runs.

Prefer an A/B or before/after measurement over a prose-only optimization recommendation.