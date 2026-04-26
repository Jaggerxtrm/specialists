# specialists-service install

Install path for consumers who do **not** clone specialists source.

## Prerequisites

- Docker
- host `pi` config at `~/.pi`
- local writable `.specialists/` directory for specs and observability state

The container reads `pi` auth from a bind-mounted `~/.pi` directory. No secret file ships in image.

## Pull or build

Pull published image:

```bash
docker pull ghcr.io/<org>/specialists-service:<tag>
```

Build locally from this repo:

```bash
docker build -t specialists-service:dev .
```

Image runs as non-root, UID `10001` (label `org.specialists.uid=10001`). Override with `--user $UID:$GID` at runtime so container writes are owned by your host user — see compose example.

The image pins `pi` to a known-good version for predictable spawn behavior. Bump the pin in the Dockerfile when you've verified a newer pi against the script-runner spawn flags.

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

Health check:

```bash
curl -sS http://localhost:8000/healthz
```

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
  ghcr.io/<org>/specialists-service:<tag>
```

The compose template targets standard Docker; if you're on Fedora + rootless Podman, copy the above command form instead.

## Upgrade story

1. bump image tag in compose file
2. restart container
3. wait for `GET /healthz` to return `{ "ok": true }`
4. let traffic resume after health gate passes

Future work: multi-arch buildx, cosign, SBOM, and rollout automation.
