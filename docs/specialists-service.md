# specialists-service

A thin HTTP wrapper around `pi` for running script-class specialists. Same shape as `qwen-service` is for qwen-cli. Sidecar-per-consumer, no multi-tenant, no orchestration, no session lifecycle.

## What it does

- Listens on one HTTP port.
- On each request, loads a specialist JSON by name from a configured user dir, renders its prompt template with caller-supplied variables, spawns one `pi` subprocess, returns the output.
- Writes one row to the project's existing `.specialists/db/observability.db` per call — same table, same writer, same shape as `sp run` already produces. The audit trail is unified.

That's it. Anything beyond this lives in the existing specialists CLI/runtime; the service does not reimplement it.

## HTTP contract

### Request

```
POST /v1/generate
{
  "specialist": "kebab-case-name",
  "variables": { "key": "value", ... },
  "template": "task_template",          // optional, default
  "model_override": "anthropic/...",    // optional
  "timeout_ms": 60000,                  // optional, overrides spec
  "trace": true                          // optional, default true
}
```

### Response

```
200 OK
{
  "success": true,
  "output": "<final assistant text>",
  "parsed_json": { ... },               // present if response_format=json and parse succeeded
  "meta": {
    "specialist": "name",
    "model": "<resolved>",
    "duration_ms": 1234,
    "trace_id": "<uuid>"
  }
}
```

Failures return `200` with `success: false` and one of:

```
specialist_not_found | specialist_load_error | template_variable_missing |
auth | quota | timeout | network | invalid_json | internal
```

`400` is reserved for malformed HTTP requests (missing `specialist`, bad JSON, unknown template name).

## How it runs

One Node process, one HTTP listener, one `pi` subprocess per in-flight request. `pi` is invoked with the same one-shot flags the existing CLI uses for non-interactive runs:

```
pi --mode json --no-session --no-extensions --no-tools \
   --model <resolved> [--thinking <level>] -- <rendered-prompt>
```

Credentials are read by `pi` from `~/.pi/agent/auth.json`. The service never touches API keys.

Concurrency: a global semaphore (`--concurrency`, default 4) bounds in-flight requests. Excess requests wait briefly, then return `429`.

## Specialist authoring

Specialists are the same JSON files the rest of this repo uses. The service reads them through the existing `SpecialistLoader`. To be runnable through the HTTP endpoint, a spec must be compatible with one-shot non-interactive execution. The service rejects at request time (`specialist_load_error`) any spec where:

- `execution.interactive` is `true`
- `execution.requires_worktree` is `true`
- `execution.permission_required` is anything other than `READ_ONLY`
- `skills.scripts` is non-empty (local shell hooks)
- `prompt.task_template` is missing
- a referenced `$varname` in the chosen template isn't supplied in `variables` (`template_variable_missing`)

Any other spec runs as-is — same model resolution, same `fallback_model` and circuit-breaker behavior, same `thinking_level`, same `output_schema` validation as `sp run` performs today.

## Configuration

```
sp serve
  --port <n>                  default 8000
  --user-dir <path>           default ./.specialists/user
  # DB path is resolved automatically (same as sp run): <git-root>/.specialists/db/observability.db
  # or $XDG_DATA_HOME/specialists/observability.db when set.
  --concurrency <n>           default 4
  --request-timeout-ms <n>    default 120000
```

No API-key flags. No secret files. Pi handles auth.

## Deployment

Sidecar pattern. One service per consumer.

```yaml
services:
  specialists:
    image: specialists-service:local        # build from this repo until publishing lands; future: ghcr.io/<org>/specialists-service:<version>
    command: [sp, serve, --port=8000]
    user: "${UID:-1000}:${GID:-1000}"          # match host file owner
    environment:
      HOME: /pi-home
    volumes:
      - ./.specialists:/work/.specialists      # specs + observability.db live here
      - ${HOME}/.pi:/pi-home/.pi:ro            # pi credentials
    working_dir: /work
    networks: [app]
    restart: unless-stopped

  app:
    # consumer service calls http://specialists:8000/v1/generate
    depends_on: [specialists]
    networks: [app]

networks:
  app:
```

The same `.specialists/` directory the consumer's project uses for `sp run` is mounted into the container. `.specialists/user/*.specialist.json` is the source of specs; `.specialists/db/observability.db` collects the trace rows (canonical path resolved by `observability-db.ts`, same as `sp run`). No separate state directory.

### SQLite + bind mount notes

The service and host-side `sp run` both open the same `observability.db`. This works cleanly under a few constraints — none surprising, but worth pinning down:

- **WAL mode on the database.** SQLite handles concurrent writers without corruption only in WAL mode. The existing `observability-sqlite.ts` writer enables this; verify with `PRAGMA journal_mode;` returning `wal` after first write.
- **Mount the directory, not the file.** SQLite creates `observability.db-wal` and `observability.db-shm` next to the database. The compose snippet bind-mounts `.specialists/` (the directory), so the siblings land on the host FS where they belong. Mounting only the `.db` file would break recovery.
- **UID alignment.** The container's process must be able to read and write the bind-mounted files. `user: "${UID}:${GID}"` matches the host owner, which is the simplest path on a developer machine. On servers, set explicit numeric UIDs that match the file owner.
- **Local filesystem only.** SQLite's file locking is unreliable on NFS, SMB, and similar remote filesystems. Bind-mount from a local disk.

If any of these is violated the symptom is usually `database is locked` errors or stale reads, not silent corruption — but stick to the four rules and there is no issue.

For non-container use (cron, scripts, programmatic Node embedding) — just use `sp run` directly. The HTTP service exists for cross-language / cross-process callers; it is not the only way to run a specialist.

## Observability

Every call writes one row to the project's `.specialists/db/observability.db` via the existing `observability-sqlite.ts` client — the same writer `sp run` uses. Operators query the database the same way they already do:

```sql
SELECT job_id, specialist, status, json_extract(status_json, '$.duration_ms') AS ms
FROM specialist_jobs
WHERE updated_at_ms > strftime('%s','now','-1 hour') * 1000
ORDER BY updated_at_ms DESC;
```

Set `trace: false` in the request to skip the row. No file-based job dirs (`status.json`, `events.jsonl`, `result.txt`) — those belong to the long-running `sp run` lifecycle, not to one-shot HTTP calls.

## Non-goals

- Multi-stage orchestration, tool use, keep-alive sessions, worktrees, beads — use `sp run` for any of these.
- Multi-tenant on a single container. Sidecar-per-consumer.
- Public exposure. Container-network access only.
- Reimplementing model resolution, validation, or trace writing — all delegated to the existing runtime.

## Versioning

`/v1/generate` is the only endpoint. Breaking changes ship under `/v2/...`. Image tags follow the npm package semver. Pin to `:vX.Y.Z` in production.

---

The service is a transport, not a runtime. Everything underneath it is the specialists code that already works.
