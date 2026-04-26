# darth-feedor adoption handoff

This is a one-page operator handoff for adopting `specialists-service` v1 in
darth-feedor. Everything on the specialists-repo side is done; the rest is
operator work in the darth-feedor repo on the VPS.

For the full plan see [`docs/darth-feedor-migration.md`](docs/darth-feedor-migration.md).
For the canonical service contract see [`docs/specialists-service.md`](docs/specialists-service.md).
For the install path see [`docs/specialists-service-install.md`](docs/specialists-service-install.md).

## Ready on this side (specialists repo)

- **Tag**: `v3.8.0` on master.
- **Container**: `Dockerfile` (multi-stage bun build → bun-slim runtime, non-root UID 10001, `WORKDIR /work`, pinned via `ARG PI_VERSION=latest`). `docker/compose.example.yml` is the sidecar template.
- **HTTP**: `POST /v1/generate` and `GET /healthz` via `sp serve`.
- **CLI peer**: `sp script <name> [--vars k=v ...] [--json] [--single-instance <lockpath>]` for cron, with documented exit codes (0/1/2/3/4/5/6/7/75).
- **Pre-deploy validator**: `sp validate <path> --target script` runs schema + compatGuard offline.
- **Pi compat**: image tracks `@mariozechner/pi-coding-agent@latest`. Weekly + on-PR CI canary at `.github/workflows/pi-compat.yml` flags any future spawn-flag drift.
- **Reference Python client**: [`docs/examples/specialists_client.py`](docs/examples/specialists_client.py) — stdlib-only, ~165 LOC, live-smoked end-to-end against real pi.
- **Reference script-class spec**: [`docs/examples/mercury-atomic-summarizer.specialist.json`](docs/examples/mercury-atomic-summarizer.specialist.json) — Phase 1 first-spec, copyable.
- **Schema**: strictly 1:1 with the runner. No declarative-only or deprecated-compat fields. Authors can rely on every JSON field having a runtime consumer.

## What you do in darth-feedor

### Phase 1 — adapter + first spec
1. Copy [`docs/examples/specialists_client.py`](docs/examples/specialists_client.py) → `shared/specialists_client.py`. Public API matches Phase 1 step 1 exactly; no design left to do.
2. Copy [`docs/examples/mercury-atomic-summarizer.specialist.json`](docs/examples/mercury-atomic-summarizer.specialist.json) → `.specialists/user/`.
3. Build the image from this repo on the VPS (no registry yet — `git clone && docker build`). Run as a sidecar per `docker/compose.example.yml`.
4. Smoke against staging: one real article, assert the summary lands in `articles.summary` equivalent to legacy.

### Phase 2 — single-stage consumers
- `ingestion/summarizer.py`: replace `SpecialistLoader + render_prompt + QwenClient` with `SpecialistsClient.run(...)`.
- `ingestion/official_docs.py`: same. Removes the direct `requests.post()` divergence at the same time.
- Convert each YAML → JSON per `docs/darth-feedor-migration.md` § Schema target.

### Phase 3 — rolling_context (Python orchestration preserved)
- Port `squawks/rolling_context.py` invocation layer only. The 3 stages remain 3 Python `client.run(...)` calls.
- **Analyst is now two specialist files**: schema is 1:1 — no in-spec alternate template. Ship `squawk-session-analyst.specialist.json` (initial) and `squawk-session-analyst-normalize.specialist.json` (normalize), call each by name. See migration doc § Multi-stage specialists.
- Run the replay harness from `tests/test_rolling_context_specialists.py` against a real `specialists-service` before cutover. Do not skip.

### Phase 4 — production cutover
- Sidecar per consumer initially (collapse later if topology allows).
- Switch one consumer at a time. Monitor `error_rate` / `duration_ms` queries (service docs §5) for one full operational cycle before the next switch.

### Phase 5 — decommission
- Remove `shared/specialist_system/`, `shared/qwen_client.py`, `llm_gateway/`, `qwen-service` from `ingestion/infra/docker-compose.yml`, `*.specialist.yaml`, `~/.qwen` references in operator skills.

## Decisions already locked (do not relitigate)

- Build-from-repo is the official install path. Image publishing to a registry is deferred.
- Pi credentials live in the host's `~/.pi`, mounted read-only as `/pi-home/.pi:ro`. The service does not read API keys directly.
- Multi-tenant on a single container is unsupported. Sidecar-per-consumer is the only supported topology in v1.
- `skills.paths` is forbidden by the script-runner today (prompt-injection vector). Trust flags are deferred behind `unitAI-3k6sa` and require explicit operator opt-in.
- Schema is a single SSOT. Per-surface compat validators sit on top (`sp validate --target script`); no schema fork.

## Open beads gated on consumer demand

- `unitAI-3k6sa` — `--allow-skills` / `--allow-skills-roots` trust flags.
- `unitAI-rw13n` — programmatic `runScript()` export for in-process Node consumers.
- `unitAI-daxxp` — `/readyz` with degraded states (only matters if VPS uses k8s readiness probes).
- `unitAI-or6kw` — `sp serve` hot-reload of specialist files.

File against any of these only if a real Phase 2/3/4 issue forces the requirement.
