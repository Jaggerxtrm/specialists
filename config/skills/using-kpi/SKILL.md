---
name: using-kpi
description: >-
  Analyze specialist KPI data in observability SQLite. Use for runtime, payload,
  waiting, tool-call, and outlier analysis. Token estimates use cl100k_base-style
  approximation with ~±5% accuracy.
gemini-command: using-kpi
version: 3.1.0
disable-model-invocation: true
---

# using-kpi

KPI analysis skill for `sp db stats` / `sp db extract` data.

## Quick rule

`active_runtime_ms` = real paid runtime. Rank by that first. `elapsed_ms` is total wall time. `waiting_ms` catches forgotten keep-alives.

Token counts are approximate, cl100k_base-style, about ±5%. Bytes are exact UTF-8 size.

## Recipe 1 — specialist × model leaderboard by active cost

```bash
sp db stats --format json \
  | jq -r '
      .rows
      | group_by([.specialist, .model])
      | map({
          specialist: .[0].specialist,
          model: .[0].model,
          jobs: length,
          active_ms: (map((.active_runtime_ms // 0)) | add),
          total_ms: (map((.total_runtime_ms // .elapsed_ms // 0)) | add),
          turns: (map((.total_turns // 0)) | add),
          tools: (map((.total_tools // 0)) | add),
          payload_kb: (map((.payload_kb // 0)) | add)
        })
      | sort_by(-.active_ms, -.jobs)
      | .[]
      | [ .specialist, .model, .jobs, .active_ms, .total_ms, .turns, .tools, .payload_kb ]
      | @tsv'
```

## Recipe 2 — outliers above p95

```bash
sp db stats --format json \
  | jq '
      .rows as $rows
      | {
          active: ($rows | map(.active_runtime_ms // 0) | sort),
          tools: ($rows | map(.total_tools // 0) | sort),
          turns: ($rows | map(.total_turns // 0) | sort),
          payload: ($rows | map(.payload_kb // 0) | sort)
        } as $s
      | {
          active_p95: $s.active[(($s.active|length)*95/100|floor)],
          tools_p95: $s.tools[(($s.tools|length)*95/100|floor)],
          turns_p95: $s.turns[(($s.turns|length)*95/100|floor)],
          payload_p95: $s.payload[(($s.payload|length)*95/100|floor)]
        } as $p
      | $rows
      | map(select(
          ((.active_runtime_ms // 0) >= $p.active_p95) or
          ((.total_tools // 0) >= $p.tools_p95) or
          ((.total_turns // 0) >= $p.turns_p95) or
          ((.payload_kb // 0) >= $p.payload_p95)
        ))
      | .[]
      | [ .job_id, .specialist, .model, .active_runtime_ms, .total_tools, .total_turns, .payload_kb ]
      | @tsv'
```

## Recipe 3 — payload bloat ranking

```bash
sp db stats --with-payload --format json \
  | jq -r '
      .rows
      | group_by(.specialist)
      | map({
          specialist: .[0].specialist,
          jobs: length,
          avg_payload_kb: ((map((.payload_kb // 0)) | add) / length),
          max_payload_kb: (map((.payload_kb // 0)) | max)
        })
      | sort_by(-.avg_payload_kb)
      | .[:10]
      | .[]
      | [ .specialist, .jobs, (.avg_payload_kb|tostring), (.max_payload_kb|tostring) ]
      | @tsv'
```

## Recipe 4 — waiting-state hygiene

```bash
sp db stats --format json \
  | jq -r '
      .rows
      | map(select((.waiting_s? // 0) != 0))
      | map(. + {waiting_ratio: ((.waiting_ms // 0) / ((.total_runtime_ms // .elapsed_ms // 1) + 0.0))})
      | sort_by(-.waiting_ratio, -.waiting_ms)
      | .[]
      | [ .job_id, .specialist, .model, (.waiting_ms|tostring), (.total_runtime_ms // .elapsed_ms|tostring), (.waiting_ratio|tostring) ]
      | @tsv'
```

## Recipe 5 — tool-call distribution per specialist

```bash
sp db stats --format json \
  | jq -r '
      .rows
      | group_by(.specialist)
      | map({
          specialist: .[0].specialist,
          counts: (map(.tool_call_counts_json? // "{}")
            | map(fromjson)
            | add)
        })
      | .[]
      | .counts
      | to_entries
      | sort_by(-.value)
      | .[]
      | [ .key, .value ]
      | @tsv'
```

## Recipe 6 — payload vs active runtime correlation

```bash
sp db stats --with-payload --format json \
  | jq -r '
      .rows
      | map(select((.payload_kb? // 0) > 0 and ((.active_runtime_ms? // 0) > 0)))
      | map([(.payload_kb|tonumber), (.active_runtime_ms|tonumber)])
      | if length < 2 then empty else
          (map(.[0]) | add / length) as $mx |
          (map(.[1]) | add / length) as $my |
          (map((.[0]-$mx)*(.[1]-$my)) | add) /
          ((map((.[0]-$mx)^2) | add) * (map((.[1]-$my)^2) | add)) ^ 0.5
        end'
```

## Recipe 7 — payload component breakdown per specialist

**Truth source first.** The actual prompt size billed by the API is the first turn's `input_tokens` from `token_trajectory_json[0]`. Use it as the ground truth — `payload_breakdown` events undercount (tool definitions and harness framing are not captured) and historical rows before the rule N× fix overcount mandatory_rule by attached-rule count.

```bash
DB=.specialists/db/observability.db
sqlite3 "$DB" "SELECT specialist, model, AVG(json_extract(token_trajectory_json, '\$[0].token_usage.input_tokens')) AS avg_first_in, COUNT(*) AS n FROM specialist_job_metrics WHERE token_trajectory_json IS NOT NULL AND status='done' GROUP BY specialist, model ORDER BY avg_first_in DESC"
```

Use this number for cost decisions. Use `payload_breakdown` only for *relative* component analysis (which knob to tune), not absolute sizing.

`sp db stats --with-payload` only surfaces total `payload_kb` / `payload_tokens`. To audit *what* fills the prompt (system_prompt vs mandatory rules vs skills vs bead_context vs memory), query `payload_breakdown` events directly. Use this for eager-load bloat investigations, prompt/rule consolidation planning, or duplication hunts — but cross-check against the truth source above.

```bash
DB=.specialists/db/observability.db
sqlite3 "$DB" "SELECT specialist, event_json FROM specialist_events WHERE type='payload_breakdown' GROUP BY specialist ORDER BY t DESC" \
  | python3 -c '
import json, sys
rows = []
for line in sys.stdin:
    if "|" not in line: continue
    spec, js = line.split("|", 1)
    d = json.loads(js)
    agg = {}
    for c in d["payload_breakdown"]["components"]:
        a = agg.setdefault(c["kind"], {"tokens":0,"n":0})
        a["tokens"] += c["tokens"]; a["n"] += 1
    rows.append((spec, d["payload_breakdown"]["totals"]["tokens"], agg))
rows.sort(key=lambda r: -r[1])
print(f"{\"specialist\":<22}{\"total\":>8}{\"rules\":>8}{\"rules_n\":>8}{\"sys\":>8}{\"skills\":>8}{\"bead\":>8}{\"mem\":>8}")
for s, t, a in rows:
    g = lambda k: a.get(k, {"tokens":0,"n":0})
    print(f"{s:<22}{t:>8}{g(\"mandatory_rule\")[\"tokens\"]:>8}{g(\"mandatory_rule\")[\"n\"]:>8}{g(\"system_prompt\")[\"tokens\"]:>8}{g(\"skill\")[\"tokens\"]:>8}{g(\"bead_context\")[\"tokens\"]:>8}{g(\"memory\")[\"tokens\"]:>8}")
'
```

Component kinds: `system_prompt`, `mandatory_rule` (one event entry per attached rule), `skill` (path/description label only — full bodies are eagerly injected at runtime but NOT counted here), `task_template`, `bead_context`, `memory`.

**Important:** `skill` entries in `payload_breakdown` show only the path/description label (~10-40 tokens). The full skill body is forcefully injected via `skills.paths` on every run and IS billed as input tokens. To measure the real eager-skill cost, see Recipe 8.

Optimization signals (from breakdown alone):
- `mandatory_rule` total dominates: audit wrapper inflation by comparing `bytes` per rule in the event vs `wc -c config/mandatory-rules/<id>.md`. Mismatch >5x means a wrapper or richer source is adding hidden cost.
- `bead_context` huge: bead description is bloated — orchestrator should write more concise contracts.
- `memory` huge: stale or noisy memories — run `bd memories` cleanup or consolidation.

## Recipe 8 — eager skill-body cost per specialist

`skills.paths` are eagerly injected on every run; the bodies appear in the API-billed prompt but the `payload_breakdown` event records only the path label. To derive the real eager-skill cost:

```
eager_skill_cost ≈ first_turn_input_tokens − sum(payload_breakdown non-skill components)
                   − constant per-specialist framing/tool-defs overhead
```

Two-step audit:

```bash
# Step 1: real first-turn input tokens per specialist (truth)
DB=.specialists/db/observability.db
sqlite3 "$DB" "
  SELECT specialist, AVG(json_extract(token_trajectory_json, '\$[0].token_usage.input_tokens')) AS avg_first_in, COUNT(*) AS n
  FROM specialist_job_metrics
  WHERE token_trajectory_json IS NOT NULL AND status='done'
  GROUP BY specialist ORDER BY avg_first_in DESC"

# Step 2: per-specialist measured non-skill components (post-kdl4n)
sqlite3 "$DB" "SELECT specialist, event_json FROM specialist_events WHERE type='payload_breakdown' GROUP BY specialist ORDER BY t DESC" \
  | python3 -c '
import json, sys
for line in sys.stdin:
    if "|" not in line: continue
    spec, js = line.split("|", 1)
    d = json.loads(js)
    non_skill = sum(c["tokens"] for c in d["payload_breakdown"]["components"] if c["kind"] != "skill")
    print(f"{spec:<22}{non_skill:>10}")
'
```

Then `delta = first_in − non_skill_total`. The framing/tool-defs constant is roughly the same across specialists with the same model — you can estimate it by running a specialist with NO `skills.paths` attached as a baseline.

Per-skill body weight: `wc -c <skill-path>/SKILL.md` divided by 4 (cl100k_base approximation). High-frequency, large-body skills are the inlining candidates; low-frequency or small ones stay attached.

Optimization signals (skills):
- `delta` >> sum of attached skill body bytes/4: framing/tool defs are the bulk — leave skills alone.
- `delta` ≈ sum of skill body weights: skills dominate eager cost — inline frequently-used hot guidance into `system_prompt`, keep rare deep references as skills, consider splitting big mixed skills.

## References

- `docs/observability-metrics.md`
- `src/cli/db.ts`
- `src/specialist/observability-sqlite.ts`
