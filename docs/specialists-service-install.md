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

Image runs as non-root and labels expected UID via `org.specialists.uid=1000`.

## Author first specialist

Create one script-class specialist in `.specialists/user/hello.specialist.json`. Minimal example:

```json
{
  "specialist": {
    "name": "hello",
    "description": "Tiny demo specialist",
    "execution": {
      "model": "anthropic/claude-3.5-sonnet",
      "permission_required": "READ_ONLY",
      "interactive": false,
      "requires_worktree": false
    },
    "prompt": {
      "task_template": "Say hello to {{name}} and return JSON with greeting.",
      "output_schema": {
        "type": "object",
        "required": ["greeting"]
      }
    }
  }
}
```

Match runtime contract from `docs/specialists-service.md`: script-class, non-interactive, read-only, no worktree, task template present.

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

Each call writes one row to `.specialists/db/observability.db`.

```bash
sqlite3 .specialists/db/observability.db \
  "SELECT specialist, surface, status FROM specialist_jobs ORDER BY updated_at_ms DESC LIMIT 1;"
```

Expected `surface` value for HTTP script runs: `script_specialist`.

## Common pitfalls

- UID mismatch: container user cannot write bind mount; align `UID/GID` with host file owner.
- `~/.pi` missing: container boots but requests fail auth lookup.
- OAuth refresh mode mismatch: some providers need interactive refresh in host `pi` first.
- Model not in `pi` auth.json: request fails with provider/model resolution error.

## Upgrade story

1. bump image tag in compose file
2. restart container
3. wait for `GET /healthz` to return `{ "ok": true }`
4. let traffic resume after health gate passes

Future work: multi-arch buildx, cosign, SBOM, and rollout automation.
