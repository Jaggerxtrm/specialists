---
title: Specialists Service Install
scope: specialists-service-install
category: deployment
version: 2.0.0
updated: 2026-04-29
synced_at: c21f3214
description: Install runbook for consumers who do not clone specialists source. Deployment steps, trust/readiness gates, hot-reload, common pitfalls.
source_of_truth_for:
  - Dockerfile
  - docker/compose.example.yml
cross_references:
  - docs/specialists-service.md (HTTP contract, CLI flags, trust gates, hot-reload)
  - docs/authoring.md (script-class schema)
---

# Specialists Service Install

Install path for consumers who do **not** clone specialists source.

For HTTP contract details, CLI flags (`--allow-skills`, `--allow-skills-roots`, `--allow-local-scripts`, `--reload-poll-ms`), trust gates, and hot-reload semantics, see the SSOT: **[docs/specialists-service.md](specialists-service.md)**.

## Prerequisites

- Docker
- host `pi` config at `~/.pi`
- local writable `.specialists/` directory for specs and observability state

The container reads `pi` auth from a bind-mounted `~/.pi` directory. No secret file ships in image.

## Build the image

> Image publishing to a registry is deferred. For now, build from this repo's source.

```bash
git clone https://github.com/Jaggerxtrm/specialists.git
cd specialists
docker build -t specialists-service:local .
# or with rootless podman:
podman build -t specialists-service:local .
```

Tag whatever you want (`:local`, `:v0.1`, etc.) — your compose file references the same tag.

The image runs as non-root, UID `10001` (label `org.specialists.uid=10001`). Override at runtime with `--user $UID:$GID` (Docker) or `--userns=keep-id --user $UID:$GID` (rootless Podman) so container writes are owned by your host user. The compose template wires this automatically.

The image installs `@mariozechner/pi-coding-agent@latest` at build time. Pin to a specific version in the Dockerfile if you need reproducible rebuilds across pi releases.

> **Future** — `docker pull ghcr.io/<org>/specialists-service:<tag>` once the image is published.

## Author first specialist

Create one script-class specialist in `.specialists/user/hello.specialist.json`. Minimal example:

```json
{
  "specialist": {
    "metadata": {
      "name": "hello",
      "version": "1.0.0",
      "description": "Tiny demo specialist",
      "category": "demo"
    },
    "execution": {
      "mode": "auto",
      "model": "anthropic/claude-haiku-4-5",
      "timeout_ms": 30000,
      "interactive": false,
      "response_format": "json",
      "output_type": "custom",
      "permission_required": "READ_ONLY",
      "requires_worktree": false,
      "max_retries": 0
    },
    "prompt": {
      "task_template": "Say hello to $name and return JSON of shape {\"greeting\": \"...\"}.",
      "output_schema": { "required": ["greeting"] }
    }
  }
}
```

Variable substitution uses `$name` (single-dollar, no braces). Pick a model your host's `~/.pi/agent/auth.json` has credentials for. The runtime contract — script-class, non-interactive, read-only, no worktree, task_template present — is enforced at request time; mismatches return `specialist_load_error`.

A working reference example ships with the repo at [`docs/examples/smoke-echo.specialist.json`](examples/smoke-echo.specialist.json) — copy it into your `.specialists/user/` to verify a fresh deployment end-to-end.

For the full schema (every required, optional, and forbidden field with explanations), see [`docs/authoring.md` § Script-class authoring](authoring.md#script-class-authoring).

## Compose file walkthrough

Copy `docker/compose.example.yml` and replace placeholders.

- `image`: published tag or local build tag
- `user`: align host UID/GID with container UID label
- `/.specialists:/work/.specialists`: shared state for specs and trace DB
- `${HOME}/.pi:/pi-home/.pi:ro`: read-only pi auth mount
- `HOME=/pi-home`: makes pi resolve auth from mounted home
- `working_dir: /work`: keeps relative specialist paths anchored to consumer project
- `networks`: internal app network for sidecar calls

No secret file needed. pi handles model auth from its own config.

## First request

Before sending traffic, verify readiness:

```bash
curl -sS http://localhost:8000/readyz
```

Returns `200 {"ready":true}` when all checks pass, or `503` with a reason when degraded. Six failure reasons exist: `draining`, `degraded:audit`, `pi_config_unreadable`, `db_not_writable`, `empty_user_dir`, `invalid_spec_in_user_dir`. See [specialists-service.md](specialists-service.md#readiness) for full taxonomy.

For trusted single-tenant deployments needing skill-driven specs, pass trust flags at container start: `--allow-skills`, `--allow-skills-roots=<sha256>`, `--allow-local-scripts`. Default is **deny all**. See [specialists-service.md](specialists-service.md#trust-flags).

Send one generate request:

```bash
curl -sS http://localhost:8000/v1/generate \
  -H 'content-type: application/json' \
  -d '{"specialist":"hello","variables":{"name":"world"}}'
```

Expected shape:

```json
{
  "success": true,
  "output": "...",
  "parsed_json": { "greeting": "..." },
  "meta": {
    "specialist": "hello",
    "model": "anthropic/claude-3.5-sonnet",
    "duration_ms": 1234,
    "trace_id": "..."
  }
}
```

Process health check:

```bash
curl -sS http://localhost:8000/healthz
```

`/healthz` is process-alive only. Use `/readyz` for operational readiness.

## Verify trace row

Each call writes one row to `.specialists/db/observability.db`. The `surface` marker is stored inside the `status_json` JSON column, queryable with `json_extract`:

```bash
sqlite3 .specialists/db/observability.db \
  "SELECT job_id, specialist,
          json_extract(status_json, '\$.surface') AS surface,
          json_extract(status_json, '\$.model') AS model,
          json_extract(status_json, '\$.elapsed_s') AS sec
   FROM specialist_jobs
   WHERE json_extract(status_json, '\$.surface') = 'script_specialist'
   ORDER BY updated_at_ms DESC LIMIT 5;"
```

This is the same DB `sp run` writes to; filter by surface to separate script-service calls from agent runs.

## Common pitfalls

- **UID mismatch.** Container default UID is `10001` (image label). To write into a bind-mounted host directory owned by your user, override at runtime: `--user "$UID:$GID"` (Docker) or `--userns=keep-id --user "$UID:$GID"` (rootless Podman). The compose template wires this with `user: "${UID:-1000}:${GID:-1000}"`.
- **`~/.pi` missing or empty.** Container boots, but every request fails auth lookup. Run `pi --version` on the host first and ensure at least one provider is configured in `~/.pi/agent/auth.json`.
- **OAuth refresh.** The default mount is `:ro` (read-only). If a provider's token expires mid-request, pi inside the container cannot refresh it back to disk. Refresh on the host (the host's pi tooling can do it interactively) and the container picks up new tokens on next file read.
- **Model not in `pi` auth.json.** Request fails with `auth` or `internal`. Either run `pi auth` on the host to add the provider, or pick a model the host already has access to.

### Rootless Podman / Fedora SELinux

If you're using `podman` instead of `docker` on a Fedora-family host:

- Add `:z` to bind-mount specs so SELinux relabels the dir for container access:
  ```
  -v ./.specialists:/work/.specialists:z
  -v $HOME/.pi:/pi-home/.pi:ro,z
  ```
- Add `--userns=keep-id` so the container's UID maps to your host UID instead of a subuid (otherwise the container can read/write into a "1000:1000" host dir but the kernel still denies it).
- Don't override `--user` to a UID outside the rootless `subuid` range; `1000:1000` (your user) is what `keep-id` will map.

A working rootless podman invocation that mirrors the compose example:

```bash
podman run -d --rm --name specialists \
  --userns=keep-id --user "$UID:$GID" \
  -v "$PWD/.specialists:/work/.specialists:z" \
  -v "$HOME/.pi:/pi-home/.pi:ro,z" \
  -e HOME=/pi-home \
  -p 8000:8000 \
  specialists-service:local
```

The compose template targets standard Docker; if you're on Fedora + rootless Podman, copy the above command form instead.

## Hot-reload

The watcher auto-reloads `.specialists/user/*.specialist.json` on change. Native `fs.watch` is default. For container environments without inotify, use `--reload-poll-ms=1000` for polling fallback. See [specialists-service.md](specialists-service.md#hot-reload).

## Upgrade story

1. bump image tag in compose file
2. restart container
3. wait for `GET /readyz` to return `{"ready":true}`
4. let traffic resume after readiness gate passes

Future work: multi-arch buildx, cosign, SBOM, and rollout automation.
