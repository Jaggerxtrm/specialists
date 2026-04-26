# Darth Feedor — Migration onto specialists-service

**Date:** 2026-04-25
**Status:** Plan; gated on `specialists-service` v1.0.0 being shipped and locally validated
**Companion:** `docs/specialists-service.md` (the feature being adopted)
**Legacy reference:** `docs/script-specialists.md`

This document is the **first reference migration** of a real consumer onto `specialists-service`. The target is the darth feedor VPS stack: ingestion + squawks services that today depend on the legacy YAML-based script-specialists system and `qwen-service`.

It is project-specific. Other consumers can use the structure as a template but should write their own.

---

## Migration shape: clean-room rebuild

- **Not** a big-bang rewrite (legacy and new run side-by-side during the migration).
- **Not** a backend-only swap (the legacy `SpecialistLoader` and YAML format do not survive).
- **Yes** a fresh implementation of the consumer side, gradual port one service at a time, single-commit deletion of legacy code at the end.

## Phase gate — feature must exist first

This migration **does not start** until:

1. `specialists-service` is built in this repo (`src/cli/serve.ts`, `Dockerfile.sp-service`, observability writer, script-class Runner branch).
2. A sample script-class specialist runs end-to-end against the local service.
3. A reference Python client successfully calls `/v1/generate` and parses the response.
4. `specialists-service:v1.0.0` is tagged.

If any of these fail, the migration is paused, not worked around.

---

## Phase 0 — Locked decisions for darth feedor

| Question | Answer |
|---|---|
| Is `specialists-service` the strategic platform? | **Yes.** |
| Will services remain orchestrators (multi-stage)? | **Yes.** Orchestration stays in Python for this migration. |
| Will model transport be owned by services? | **No.** Transport moves into `specialists-service` (via pi). Services lose direct LLM access. |
| Is `qwen-service` retired, wrapped, or replaced? | **Replaced.** `llm_gateway/` and `~/.qwen` rotation are deleted after Phase 4. |
| Where do darth feedor specialists live? | `.specialists/user/` (script-class JSON). Legacy `specialists/**/*.specialist.yaml` is converted then deleted. |

These five answers are settled. Do not re-litigate during implementation.

---

## Schema target — what every converted YAML becomes

Every legacy `*.specialist.yaml` becomes a `.specialist.json` file in `.specialists/user/` matching the **script-class** subset of the canonical schema. Authoritative reference: [`docs/authoring.md` § Script-class authoring](authoring.md#script-class-authoring). The service-side runtime constraints come from `compatGuard` in `src/specialist/script-runner.ts` and are visible in [`docs/specialists-service.md`](specialists-service.md).

### Field translation (legacy YAML → new JSON)

The legacy `script-specialists` system used a flat YAML shape; the new schema is nested under `specialist.{metadata,execution,prompt,…}`. The mapping is mechanical:

| Legacy YAML field | New JSON path | Notes |
|---|---|---|
| `name` | `specialist.metadata.name` | kebab-case unchanged |
| `version` | `specialist.metadata.version` | must be quoted string in JSON |
| `description` | `specialist.metadata.description` | one sentence |
| (none — implicit) | `specialist.metadata.category` | required; pick from `"analysis"`, `"workflow"`, `"synthesis"`, etc. |
| `model` | `specialist.execution.model` | provider/model id, e.g. `anthropic/claude-haiku-4-5` |
| `fallback_model` | `specialist.execution.fallback_model` | optional, recommended cross-provider |
| `timeout_ms` | `specialist.execution.timeout_ms` | optional, default 120000 |
| `max_retries` | `specialist.execution.max_retries` | **must be `0` for script class** — caller owns retries |
| `response_format` (`"json"`) | `specialist.execution.response_format` | `"text"` / `"json"` / `"markdown"` |
| `prompt` (string) | `specialist.prompt.task_template` | rendered with `$varname` (single-dollar, no braces) |
| `prompt_normalize` (rolling-context analyst) | `specialist.prompt.normalize_template` | optional second template, callable via `template: "normalize_template"` from Python |
| `output_schema.required` | `specialist.prompt.output_schema.required` | shape preserved; nested validation is warn-only today |
| (must add — see Phase 0) | `specialist.execution.interactive: false` | constraint enforced by service |
| (must add) | `specialist.execution.requires_worktree: false` | constraint enforced by service |
| (must add) | `specialist.execution.permission_required: "READ_ONLY"` | constraint enforced by service |

If the legacy YAML uses anything not in this table — `tools`, `worktree_required`, `keep_alive`, host shell scripts — that field is out of scope for `specialists-service`. Stay on `sp run` for those specialists, or open a deferred bead (see `unitAI-3k6sa` for skill trust modes).

### Worked example — `mercury-atomic-summarizer`

This is the spec called out by Phase 1. The shape applies to all five YAMLs being ported.

```json
{
  "specialist": {
    "metadata": {
      "name": "mercury-atomic-summarizer",
      "version": "1.0.0",
      "description": "Summarizes one news article into one structured row.",
      "category": "synthesis"
    },
    "execution": {
      "mode": "auto",
      "model": "anthropic/claude-haiku-4-5",
      "fallback_model": "openai-codex/gpt-5.4-mini",
      "timeout_ms": 60000,
      "interactive": false,
      "response_format": "json",
      "output_type": "synthesis",
      "permission_required": "READ_ONLY",
      "requires_worktree": false,
      "max_retries": 0
    },
    "prompt": {
      "task_template": "Summarize the article below into JSON of shape {\"summary\": \"...\", \"controlled_tags\": [...]}.\n\nTitle: $title\n\nContent:\n$content",
      "output_schema": { "required": ["summary", "controlled_tags"] }
    }
  }
}
```

The Python adapter (`shared/specialists_client.py` from Phase 1) calls this with:

```python
client.run("mercury-atomic-summarizer",
           variables={"title": article.title, "content": article.body})
```

Variable names must match the `$varname` tokens in the chosen template; missing variables produce `error_type: "template_variable_missing"`.

### Multi-template specialists (rolling-context analyst)

Per Phase 3, the analyst stage uses both `task_template` (default) and `normalize_template` (alternate). Both live on the same JSON file:

```json
"prompt": {
  "task_template": "Initial analysis of …\n$context",
  "normalize_template": "Normalize the prior synthesis …\n$context",
  "output_schema": { "required": ["sessions"] }
}
```

Python calls the alternate path with `template="normalize_template"`. No second JSON file is needed.

### Validation before commit

For each converted JSON, run the in-image validator:

```bash
docker run --rm \
  -v "$PWD/.specialists/user:/work/.specialists/user:ro" \
  specialists-service:local \
  sp validate --target script /work/.specialists/user/mercury-atomic-summarizer.specialist.json
```

(`sp validate --target script` is not in v1 — see the deferred-items list in `docs/specialists-service-evaluation.md` §12. Until that lands, drop the spec into `.specialists/user/` and start `sp serve` once: the loader surfaces schema errors at request time and `compatGuard` surfaces script-class violations as `specialist_load_error`.)

---

## Phase 1 — Adapter and one converted spec

In the darth feedor (VPS) repo:

1. **`shared/specialists_client.py`** — thin HTTP client wrapping `specialists-service`. Public API is **service-shaped**, not runtime-shaped:

   ```python
   class SpecialistsClient:
       def run(self, name: str, variables: dict,
               template: str = "task_template",
               timeout_ms: int = 60_000) -> SpecialistResult: ...
   ```

   `SpecialistResult` matches the existing `qwen_client` return shape (`success`, `output`, `error`, `error_type`, `attempts`) plus `parsed_json` and `meta.trace_id`. Existing call sites change in a minimal way.

2. **Convert one YAML to JSON** — start with `mercury-atomic-summarizer`. Drop into `.specialists/user/mercury-atomic-summarizer.specialist.json` per `docs/specialists-service.md` §3.

3. **Smoke test** — point a local script at staging `specialists-service`; verify one real article summarization round-trip works and produces an `articles.summary` row identical (or equivalent) to legacy output on the same input.

4. **Unit tests** for the adapter: HTTP transport, error-type mapping, JSON parsing, missing-required handling, `meta.trace_id` propagation into service logs.

## Phase 2 — Port single-stage consumers

5. **`ingestion/summarizer.py`** — replace `SpecialistLoader + render_prompt + QwenClient` with `SpecialistsClient.run(...)`. Preserve preprocessing, truncation, table injection, controlled-tags handling, and the `articles.summary` write. Run the existing service tests against `specialists-service`.

6. **`ingestion/official_docs.py`** (`official-document-analyzer`) — same pattern. Removes the direct `requests.post()` divergence at the same time. Convert the YAML to JSON in `.specialists/user/`.

After each port, run the corresponding integration tests against a real `specialists-service` instance. No production cutover until the test suite is green on the new path.

## Phase 3 — Port rolling_context (Python orchestration preserved)

7. **`squawks/rolling_context.py`** — port the **invocation layer only**. The three pipeline stages remain three Python `SpecialistsClient.run(...)` calls.

   Stays in Python (these are non-goals for `specialists-service`):
   - cross-stage state passing (extractor → curator → analyst)
   - curator fallback to extracted events
   - synthesis topical grounding heuristics
   - timestamp resolution and degraded-input metadata
   - confidence computation
   - `squawk_rolling_context.processed_data` persistence

8. **Replay harness** — adapt `tests/test_rolling_context_specialists.py` into a regression harness that runs the full pipeline against a real `specialists-service` with recorded fixtures. **This is the safety rail; do not skip.** Rolling context has many implicit operational guarantees that can drift silently.

9. Convert all three rolling-context YAMLs to JSON in `.specialists/user/`:
   - `squawk-rolling-context.specialist.json`
   - `squawk-event-curator.specialist.json`
   - `squawk-session-analyst.specialist.json`

   Note that the analyst stage uses `normalize_template`. Pass `template: "normalize_template"` from Python.

## Phase 4 — Production cutover

10. Deploy `specialists-service` container to the VPS (sidecar pattern, one per consuming service initially — can collapse to shared later).
11. Switch `ingestion/summarizer` to the new adapter in production. Monitor `error_rate` / `duration_ms` queries (per `docs/specialists-service.md` §5) for one full operational cycle.
12. Switch `ingestion/official_docs`. Same monitoring.
13. Switch `squawks/rolling_context`. Watch the replay harness output; compare a week of synthesized output against legacy output on the same squawks before declaring success.

## Phase 5 — Decommission

After all three consumers run on `specialists-service` cleanly for one week:

14. Delete `shared/specialist_system/` (loader + schema).
15. Delete `shared/qwen_client.py`.
16. Delete `llm_gateway/` and remove `qwen-service` from `ingestion/infra/docker-compose.yml`.
17. Delete `specialists/**/*.specialist.yaml`.
18. Update or remove `docs/guides/qwen-service-integration-guide.md` and `specialists/SPECIALIST_SYSTEM_IMPLEMENTATION.md`.
19. Remove `~/.qwen` references from operator skills/runbooks.

After Phase 5 the VPS has no legacy script-specialist surface left.

---

## Deferred — externalizing rolling_context orchestration

Whether rolling_context's three-stage chain should eventually move out of Python and into a runtime feature is a **separate future evaluation**. If revisited, the candidate is the **node-coordinator** system in this repo (`.specialists/default/nodes/`), not `specialists-service`. That feature is built for chained specialist work; `specialists-service` is not.

This deferral is intentional and is the only future expansion point in this plan.

---

## Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Hidden behavior regression in rolling_context (retry-once, curator fallback, synthesis rejection, EOD reset) | Replay harness in Phase 3, week-long parallel comparison in Phase 4 |
| 2 | Losing service-owned observability during transition | `meta.trace_id` returned to Python; service logs correlate to `observability.db` rows |
| 3 | Partial migration leaving split-brain | Phase 5 deletes all legacy artifacts in one commit, only after Phase 4 is green |
| 4 | Over-generalization of `specialists-service` to absorb orchestration | §7 non-goals in `docs/specialists-service.md` are enforced; orchestration relocation is explicitly deferred |
| 5 | Validation gaps persisting under new branding | Shallow-required validation is documented; strict-schema validation is a follow-up feature, not in this scope |
| 6 | Pi backend instability replacing qwen-service instability | `specialists-service` is the only place that talks to pi; if pi changes, only one container changes |

---

## File impact

### darth feedor repo

**New:**
- `shared/specialists_client.py`
- `tests/test_specialists_client.py`
- `.specialists/user/mercury-atomic-summarizer.specialist.json`
- `.specialists/user/official-document-analyzer.specialist.json`
- `.specialists/user/squawk-rolling-context.specialist.json`
- `.specialists/user/squawk-event-curator.specialist.json`
- `.specialists/user/squawk-session-analyst.specialist.json`
- rolling-context replay fixtures

**Modified:**
- `ingestion/summarizer.py`
- `ingestion/official_docs.py`
- `squawks/rolling_context.py`
- `ingestion/infra/docker-compose.yml` (add `specialists-service`, remove `qwen-service`)
- legacy docs (or delete and replace with pointer)

**Deleted (Phase 5):**
- `shared/specialist_system/`
- `shared/qwen_client.py`
- `llm_gateway/`
- `specialists/**/*.specialist.yaml`

### This repo

No changes for the migration itself. All `specialists-service` work happens in Phase 1 of the feature build (see `docs/specialists-service.md`).

---

## Validation checklist before declaring the migration done

- [ ] `mercury-atomic-summarizer` running on `specialists-service` in production for ≥ 7 days with no regression in `articles.summary` quality vs. legacy baseline
- [ ] `official-document-analyzer` likewise
- [ ] Rolling context replay harness passes on recorded fixtures
- [ ] Rolling context running in production for ≥ 7 days with parallel comparison vs. legacy showing no behavioral drift
- [ ] All five legacy YAMLs deleted
- [ ] `qwen-service` and `llm_gateway/` removed from docker-compose
- [ ] No `~/.qwen` references in active operator runbooks
- [ ] `observability.db` queries (per `docs/specialists-service.md` §5) show healthy error rates

When every box is ticked, close the migration.
