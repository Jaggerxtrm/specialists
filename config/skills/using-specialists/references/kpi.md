# Specialists KPI and observability

Use when investigating Specialists runtime cost, waiting/stall time, turns/tool calls,
prompt payload, token trajectories, model/role outliers, or regressions in execution
quality. This is an advanced reference of `/using-specialists`, not a separate runtime
skill.

Start from the current observability surface:

```bash
sp db --help
sp db stats --help
sp db extract --help
```

If querying SQLite directly, inspect the live schema before writing a query. Metrics can
evolve across releases.

Prioritize evidence in roughly this order:

1. real active/paid runtime rather than total wall time;
2. failed/crashed/stalled jobs;
3. waiting time that indicates forgotten keep-alives;
4. first-turn and cumulative token usage;
5. prompt/skill/rule payload size;
6. turns and tool-call distribution;
7. model/role outliers and variance.

API/provider token telemetry is authoritative when available. Payload-component events or
file-size/token approximations explain cost but are not exact billing truth.

When a large attached skill dominates repeated first-turn input, prefer a concise router
plus on-demand references or deterministic scripts. High elapsed time with low active
runtime often indicates continuation/waiting policy rather than model speed; correlate it
with lifecycle events before changing models.

A useful KPI report states the sample/window, source, top roles/models by active runtime
and token cost, failure/stall/waiting outliers, payload/context outliers, likely cause with
evidence, one or two changes worth testing, and how the next runs will prove improvement.
Prefer before/after or A/B evidence over a prose-only optimization recommendation.
