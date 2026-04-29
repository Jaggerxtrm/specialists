# specialists-service — Production Evaluation

> Anchor for revising `docs/specialists-service.md`. Treats the existing draft as poorly written and grounds every decision in actual schema/runtime evidence.
> Sources: explorer `unitAI-hr6mm` (runtime map), overthinker `unitAI-nauhr` (first-pass critique), overthinker `unitAI-f8hii` (second-pass critique). Files: `src/specialist/{schema,loader,runner,supervisor,observability-sqlite,mandatory-rules,memory-retrieval}.ts`, `src/cli/{edit,run}.ts`, `src/pi/session.ts`, `src/index.ts`, `package.json`.

## Open blockers (must resolve before implementation)

A second-pass critique (`unitAI-f8hii`) found unresolved contradictions and gaps. Each is patched inline below; the table here is the decision-forcing index.

| # | Blocker | Resolution | Section |
|---|---|---|---|
| B1 | Loader scans `.specialists/default`, `config/specialists`, legacy dirs — service must not | Service-only loader mode: single root, no fallback, fail-closed on invalid spec | §9.5, §11.1 |
| B2 | `skills.paths` + `prompt.skill_inherit` inject host files into pi prompts — prompt-injection vector | Force-empty on script surface unless trusted-mode flag set; provenance-log every resolved skill source | §11.1 |
| B3 | `execution.max_retries` exists in schema/runner — script surface must force `0` | Compatibility validator forces `0`; HTTP/CLI response exposes `meta.attempts` | §11.1 |
| B4 | `sp serve`, `sp script`, `sp validate --target`, `runScript()` export do not exist in `src/index.ts` or `package.json` today | Required-implementation surface enumerated; image cannot ship before these land | §12 |
| B5 | Read-only `~/.pi` mount conflicts with pi's oauth refresh write-back path | Two supported modes: (a) read-only mount + host-side token freshness (refresh unsupported in container), (b) writable `auth.json` cache scoped to `/state/pi-tokens` with strict file-mode guard | §9.5, §11.2 |
| B6 | Strict-validation verdict in §29 was wrong — engine exists at `runner.ts:689-789` and warns; enforcement mode is what's missing | Reword to "convert configurable validation failures from warning to typed error per spec" | §29 |
| B7 | Cache invalidation only handles modify-time; deletes, renames, atomic-saves serve ghost specs | Watcher emits delete/rename → cache purge; per-request snapshot capture so in-flight requests are immune to mid-request reload | §9.8 |
| B8 | DB-write failure mid-request is undefined | Model success + audit-write failure → response succeeds with `meta.trace_persisted=false`; structured error log; readiness toggles `degraded` if failure rate > threshold | §9.9 |
| B9 | SIGTERM mid-request orphans pi subprocess and breaks client socket | Drain contract: on SIGTERM, stop accepting, finish in-flight up to grace, SIGTERM children, SIGKILL after grace+5s, return `503 shutting_down` to queued | §9.13 |
| B10 | Credential model contradicted itself — old secret-file text remained after pi-delegation pass | All secret-file/`--api-key-*` references removed; pi delegation is the only path | §9.3, §9.15 |
| B11 | Multi-replica shared-state, supply-chain, and transport-parity-with-`--no-trace` claims unaddressed | New §11 "Unsupported topologies and supply-chain requirements"; transport-parity rephrased as "same audit schema when tracing enabled" | §10.1, §11 |

## TL;DR

- **Boundary cuts (no orchestration, no keep-alive, no worktree ownership, no Supervisor file lifecycle): mostly right.** They fit a synchronous HTTP boundary.
- **Mechanism (a separate "script class" with its own forbidden-fields list): wrong.** The doc forbids names that don't exist in the schema (`tools`, `permissions`, `keep_alive`, `worktree`, top-level `scripts`) and outlaws fields that do exist and are load-bearing (`skills`, `capabilities`, `beads_integration`).
- **Schema fork risk is the headline.** The fix is one schema with a `class` discriminator + per-surface compatibility validators. Anything else guarantees drift between `sp run` and the HTTP service.
- **Two latent bugs the spec ignores but production will surface:** Zod object schemas strip unknown keys on parse → `sp edit` already loses fields (`communication.publishes` in `config/specialists/explorer.specialist.json`). **Verified by direct round-trip test** against the compiled schema. And `renderTemplate()` doesn't fail on missing `$vars` — the promised `template_variable_missing` error has no implementation path.
- **Distribution model is sidecar-per-service.** A consumer repo ships only a pinned `docker-compose.yml`, a `.specialists/user/` directory of JSON specs, and a bind-mount of `~/.pi`. **No secret file, no `--api-key-*` flag, no env-var key plumbing** — pi already owns multi-provider credentials in `~/.pi/agent/auth.json`, the service delegates entirely. The published image carries `sp serve`, `sp script`, and `sp validate` so authoring and non-HTTP usage work without the specialists source. Section 9 spells out the mount contract, version policy, hot reload semantics, and air-gap support. Section 10 covers `sp script` CLI, programmatic embedding, and cron.

## Why we are dropping functionality (justified cuts)

| Drop | Justified because… | Risk if we don't drop |
|---|---|---|
| Multi-stage orchestration | Sync HTTP one-shot can't own pipeline state, idempotency, saga semantics, partial replay. | Service becomes a queue/orchestrator with no leader, no retry contract; debuggability collapses. |
| Keep-alive / steer / resume | HTTP request cannot hold a long-lived pi RPC session across LBs/timeouts/retries. | Leaked sessions, hung clients, stateful retries that fight load balancers. |
| Worktree ownership | A stateless service should not branch git. | Branch leaks, GC complexity, multi-tenant cross-talk on shared FS. |
| Supervisor file lifecycle (`status.json`, `events.jsonl`, `result.txt`, `jobs/<id>/`) | Designed for long-running async jobs. One sync request doesn't need a job dir. | Disk churn per request; concurrency bugs on shared dir; pointless I/O. |

These match real failure modes. They are not "simpler is better"; they're cost-of-failure cuts.

## Why we are NOT dropping functionality (unjustified cuts in the spec)

Each row is a "non-goal" or "forbidden field" the doc proposes that we should reshape, not drop.

### §7 non-goals

| Doc says | Reality | Verdict |
|---|---|---|
| Nested / strict JSON schema validation — non-goal | **Engine already exists** at `runner.ts:689-789` (recursive object/array/type validation). What's missing is the *enforcement mode*: failures are emitted as warnings only. The doc's `schema_required_missing` enum is unreachable today. | **RESHAPE.** Keep the engine. Add an `output_validation` mode in the spec (`warn` default, `fail_request` opt-in). When `fail_request`, validation failures map to the typed error `output_validation_failed` with detail. Response always includes `meta.validation_mode` so consumers can detect what was applied. |
| Backend-only swap — non-goal | For first migration, sure. As a product rule it's too rigid: many projects want transport-only swap while keeping local prompt logic. | **RESHAPE.** Split transport policy from rendering policy; default to named-spec rendering, but don't pin the product to "you must give us the template too". |
| New specialist categories beyond `class: "script"` — non-goal | The doc invents `class: "script"` while declaring no future classes — guaranteeing a second schema later. Hostile to forward compatibility. | **DROP.** Add the discriminator now; allow future classes via per-surface validators. |
| Tool use — blanket non-goal | Justified by default for shared multi-tenant. But the doc enforces it via a *fake schema field* instead of runtime policy on `execution.permission_required`. | **RESHAPE.** Default `permission_required: READ_ONLY` for the script surface; runtime gate, not schema fiction. |
| Beads — non-goal | Owning beads in the service is correct (no `bd create/close`). But cross-system correlation IDs are operationally needed. | **RESHAPE.** Service must not write beads; should accept a `correlation` field (incl. caller-supplied bead ref) and emit it in the audit row. |
| File-based observability — never | SQLite primary is fine. Forbidding any optional debug sink loses forensic capability for air-gapped/sidecar deployments. | **RESHAPE.** SQLite required, optional file sink behind a flag. |

### §3 "forbidden fields"

The doc lists fields by names that don't all exist. The corrected mapping:

| Doc forbids | Actual schema field | Verdict | Reason |
|---|---|---|---|
| `tools` | not a field; real control = `execution.permission_required` + `capabilities.required_tools` | **RESHAPE** | Attack the right knob. Service surface caps `permission_required: READ_ONLY` and rejects incompatible `required_tools` values. |
| `skills` | `specialist.skills.{paths,scripts}` (real, used in runner.ts:897-904 and via `--skill`) | **DON'T forbid** | Hard-forbidding the field breaks shared-spec reuse. Forbid the *behavior* (script execution; arbitrary skill injection) per surface policy. |
| `scripts` | not top-level; real = `skills.scripts` | **RESHAPE** | Service surface rejects `skills.scripts` (shell exec) unless single-tenant trusted mode opts in. |
| `keep_alive` | not a field; real = `execution.interactive` | **RESHAPE** | Service surface requires `execution.interactive: false`. Name the actual field. |
| `worktree` | not a field; real = `execution.requires_worktree` | **RESHAPE** | Service surface requires `requires_worktree: false`. |
| `beads_integration` | exists, used by runner.ts:1160-1167 | **DON'T forbid** | Field stays in shared schema. Service forces effective behavior to `never` at runtime. Loader doesn't reject it. |
| `capabilities` | exists, validated pre-run at runner.ts:205-216 | **DON'T forbid** | `external_commands` is unsafe in service → reject those values. `required_tools` is metadata → keep. Field-level forbid is too coarse. |
| `permissions` | not a field; real = `execution.permission_required` | **DELETE the entry** | Proves the doc author wasn't reading the schema. |

**Why this matters in production:** every "forbidden field" in the doc that doesn't match a real schema name signals a service that won't actually run real specialist files. Every forbid on a real field forks the schema and breaks `sp edit` round-tripping for any spec touched by both surfaces.

## Latent bugs the spec inherits (must fix before shipping)

### Bug 1 — Silent unknown-key stripping (already broken today, **verified**)

`SpecialistSchema` (schema.ts) uses default Zod `.object({...})` which strips unknown keys. Verified with a direct round-trip test against the compiled schema:

```
input:  specialist.communication.publishes = ["foo"]
        specialist.UNKNOWN_TOP = "should-survive"
output: communication = { next_specialists: "x" }   // publishes gone
        UNKNOWN_TOP = undefined                      // top-level gone
```

Real production example: `config/specialists/explorer.specialist.json` ships with `communication.publishes`; after `parseSpecialist()` the field is gone.

This means:
- `sp edit` that re-serializes from a parsed object **already loses fields** today.
- Any future class discriminator or per-class extension will silently disappear under parse → save.

**Fix:** make every nested object in `SpecialistSchema` use `.passthrough()`. Round-trip becomes lossless. This is a precondition for the discriminator design, not optional cleanup.

### Bug 2 — `template_variable_missing` is unimplemented

The spec promises this error. `templateEngine.ts` `renderTemplate()` leaves unmatched `$var` literally in the prompt and returns success. The error type as written can never fire.

**Fix:** pre-scan rendered template for un-substituted `$ident` tokens and raise the typed error before invoking pi. Otherwise this is a documentation lie.

### Bug 3 — Closed error enum, missing real conditions

The §2 enum lacks: `circuit_open`, `provider_overloaded`, `output_too_large`, `prompt_too_large`, `model_not_allowed`, `concurrency_limit`, `pi_crash`, `reload_in_progress`, `validation_mode_mismatch`. These are concrete failure modes already present (or about to be) in the runtime path; mapping them to `internal` destroys observability.

**Fix:** keep a stable top-level enum *and* add a structured `error_detail.{code, provider_code, validation_detail}` payload.

### Bug 4 — Model resolution is undocumented

Real order in runner.ts:867-874 is:

```
backendOverride (caller) → execution.model (primary)
  → if circuitBreaker.isAvailable(primary) === false → execution.fallback_model
```

Plus `execution.thinking_level` is forwarded as `pi --thinking <level>` (runner.ts:1196). Plus the circuit breaker is global, not request-scoped — a request that "didn't ask for fallback" still gets it.

The spec mentions only `model_override`. That is materially wrong in production: the caller will see model swaps it can't predict.

**Fix:** document the full resolution order; add `meta.resolved_model`, `meta.fallback_used`, `meta.breaker_state`, `meta.thinking_level` to the response; restrict `model_override` to a per-specialist allowlist (otherwise it bypasses cost/safety/provider pinning).

## The schema decision — single SSOT with class discriminator

This is the architectural choice the spec gets wrong. Two paths:

**Bad (the current draft):** new "script class" gets its own field rules, separate validation surface, hard-forbids on real fields. Repo now has two specialist languages. `sp edit` either loses round-trip or has to know about both.

**Good (what we should do):**

1. Base `SpecialistSchema` becomes a **superset** with `.passthrough()` on every nested object.
2. Add `specialist.class: "agent" | "script"` (default `"agent"`).
3. Two **runtime compatibility validators**, layered on top of base parse:
   - `validateForAgent(spec)` — current `sp run` behavior.
   - `validateForScriptService(spec)` — applies script-surface rules below.
4. `sp edit` continues to operate on raw JSON (it already does — see edit.ts) and now accepts the `class` field. No round-trip changes.

### Script-surface compatibility rules (replaces the §3 forbidden-fields list)

For `class: "script"` requested by the HTTP endpoint, all CLI `sp script` invocations, and all programmatic `runScript()` calls:

- `execution.interactive` MUST be `false`.
- `execution.requires_worktree` MUST be `false`.
- `execution.permission_required` MUST be `READ_ONLY` (no tools).
- `execution.max_retries` MUST be `0`. Retries are owned by the caller (HTTP client, cron wrapper, breaker). Internal retries amplify cost and duplicate side effects on non-idempotent downstreams. Response exposes `meta.attempts: 1` for transport parity. *(B3)*
- **`skills.paths` MUST be empty** unless launched in trusted mode (`--allow-skills`). Reason: loader resolves these to host-FS files (`loader.ts:182-189`) and pi injects them into the prompt — a spec author can prompt-inject from any host path the service UID can read. In trusted mode, every resolved skill path is logged in the audit row (`meta.skill_sources`) with its sha256. *(B2)*
- **`prompt.skill_inherit` MUST be absent** unless trusted mode. Same reason. *(B2)*
- `skills.scripts` (local shell hooks) MUST be empty unless `--allow-local-scripts`. Distinct from `--allow-skills` — script execution and prompt injection are different trust decisions.
- `beads_integration` is forced to `never` at runtime regardless of value.
- `capabilities.external_commands` MUST be empty (host commands unsupported).
- `prompt.task_template` MUST be present.
- All variables referenced by `$varname` in the chosen template MUST be in `variables` at call time → `template_variable_missing`.

These run as a compatibility check at request time and on `sp serve` startup (validates every spec in `--user-dir`). Failures return `specialist_load_error` with structured detail. **Boot is fail-closed**: any invalid spec in the authoritative user-dir prevents `/readyz` from going green. *(B1)*

### Why this preserves `sp edit`

`sp edit` works on raw JSON, drives validation through `parseSpecialist()`. With passthrough enabled, every field — including `class`, future class-only fields, and any unknown legacy keys — round-trips byte-for-byte. The user can swap models, change `thinking_level`, toggle `class`, and the file shape stays intact. Compatibility errors surface at validation time with a clear message, not silently via field drop.

## Pi spawn contract (production-grade)

Replaces the doc's offhand `pi --mode json --no-session --no-extensions --no-tools` line.

```
pi --mode json --no-session --no-extensions --no-tools \
   --model <resolved-model> \
   [--thinking <level>] \
   [--skill <path>...] \
   -- <rendered-prompt>
```

Pi reads provider credentials from `$HOME/.pi/agent/auth.json` (or `$PI_HOME/agent/auth.json` if set). The service never opens that file. This keeps key rotation, oauth refresh, and provider proliferation entirely inside pi — exactly where it already works.

Hardening rules:

- **`spawn` with arg array, never `shell: true`.** No template interpolation reaches a shell.
- **Credential handling delegated to pi.** Pi reads `~/.pi/agent/auth.json` itself; the service never reads, stores, copies, or logs API keys. `--model anthropic/claude-sonnet-4-5` is resolved by pi against the user's auth file at spawn time, supporting oauth, api_key, and any provider type pi already understands. The service surface drops every `--api-key-*` flag from the original spec — they are unnecessary and add an attack surface we don't need.
- **Wall-clock kill:** SIGTERM at `timeout_ms`, SIGKILL at `timeout_ms + 5s`. Distinguishes `timeout` (graceful) from `pi_crash` (hard kill).
- **Bounded I/O:** stdout cap (e.g. 4 MB) → `output_too_large`; stderr cap (last 4 KB) included in audit row.
- **Stdin closed after writing key + prompt.** No interactive surprises.
- **Process group isolation:** `detached: false`, but explicit `setsid` so SIGKILL sweeps grandchildren.
- **Exit-code mapping:** non-zero with no final `agent_end` JSON → `pi_crash`, distinct from `network`.
- **Concurrency:** semaphore at `--request-concurrency`; queue with bounded wait → `concurrency_limit` (HTTP 429), not `internal`.
- **Pre-flight:** rendered prompt size cap → `prompt_too_large` before spawn.

## Top 10 caveats the spec ignores

| # | Caveat | One-line fix |
|---|---|---|
| 1 | Concurrency / backpressure | Bounded queue with wait timeout; per-backend caps; HTTP 429/503. |
| 2 | Secrets handling | **Delegated to pi.** Bind-mount `~/.pi` (read-only). The service never reads keys; pi handles oauth refresh, multi-provider auth, rotation. Document log redaction for the `pi` subprocess stderr only. |
| 3 | Prompt injection via `$vars` | Single-pass renderer, no recursive expansion; record rendered-prompt SHA256 in audit. |
| 4 | `model_override` allowlist | Per-specialist allowlist; deny by default; log override source. |
| 5 | Output bounds | Per-spec and global token/char/JSON-size caps; explicit `output_truncated`. |
| 6 | Hot reload | Versioned cache, atomic swap, in-flight requests use snapshot, reload audit event. |
| 7 | Audit completeness | Add `resolved_model`, `fallback_used`, `breaker_state`, `validation_mode`, `prompt_sha`, `caller_id`, `override_source`. |
| 8 | Version pinning | Support `name@version` or `name#sha`; always log resolved version. |
| 9 | Multi-tenant isolation | Tenant auth, namespace, per-tenant secret scope, per-tenant quotas — not name prefixes. |
| 10 | Failure-mode taxonomy | Add the missing error_types (Bug 3); structured `error_detail` payload. |

## Migration story (single SSOT, no breakage)

1. **Phase A — additive:** add optional `specialist.class` (default `"agent"`); flip nested objects to `.passthrough()`.
2. **Phase B — validators:** add `validateForAgent` (current behavior) and `validateForScriptService`. Both run on top of the base parse.
3. **Phase C — tooling:** `specialists-creator` emits `class`; `sp edit` schema-paths know about `class`; `specialists validate --target service|agent`.
4. **Phase D — service launch:** `sp serve` validates user-dir against script-service rules at boot; HTTP requests revalidate per call.
5. **Phase E — hardening:** require explicit `class` for new files; legacy default stays for old files until migration is complete.

## 9. Packaging, distribution, and consumer-repo layout

The original spec describes how the service runs but not how it ships. A consumer repo without the specialists source code must be able to install, configure, validate, and operate the service from a published artifact alone. This section is the contract for that.

### 9.0 Image composition (read this before anything else)

The service is **TypeScript/Node** — same stack as the rest of this repo. The original spec is misleading on this point because §4 ships a Python reference client snippet; that snippet shows how a *Python consumer* calls the HTTP endpoint, not what runs inside the container.

| Layer | What | Why |
|---|---|---|
| Base image | `node:<lts>-slim` (or `gcr.io/distroless/nodejs<lts>` for prod) | Matches the runtime everything in this repo already targets. No Python interpreter, no `pip`, no extra language runtimes. |
| Compiled service | `dist/` from this repo, bundled with esbuild or shipped as the published npm package | Same code path as `sp serve` / `sp script` / `sp validate` on a host. |
| `pi` binary | Bundled into the image (also Node) | Pi is the model client; it spawns as a subprocess per request. |
| `sp` CLI | Bundled and on `$PATH` | Healthcheck shim, in-image `validate`, ad-hoc `script` invocations. |
| Process model | One Node process listening on `--port`, spawns one short-lived `pi` subprocess per request | No daemon, no worker pool inside the container. Concurrency comes from the request semaphore (§9.11). |
| User | Non-root UID (e.g. `10001`), declared in image label `org.specialists.uid` | Required for the `~/.pi` and `.specialists/user` bind mounts to work safely on shared hosts. |
| Filesystem | `read_only: true` root, `tmpfs:/tmp`, writes only under `/state` | Anything that wants to write outside `/state` is a bug. |

**Languages NOT in the image:** Python, Ruby, Go, shell beyond `sh`/`busybox`. If a consumer needs to call the service from Python, that Python lives in the consumer's own image; the HTTP boundary is the entire point of language decoupling.

**For Node consumers specifically:** skip the container entirely. Import `@<org>/specialists` and call `runScript()` directly (§10.3). Same spec format, same audit row, no subprocess except the `pi` it would have spawned anyway.

### 9.1 What the specialists repo publishes

| Artifact | Where | Content | Purpose |
|---|---|---|---|
| Container image | `ghcr.io/<org>/specialists-service:<version>` | Compiled JS, bundled `pi` binary, `sp` CLI, default config, no project files | Run the HTTP service |
| Slim image | `:<version>-slim` | Same minus optional dev tooling | Production deployments |
| Multi-arch | `linux/amd64`, `linux/arm64` | — | Apple Silicon, Graviton |
| npm package | `@<org>/specialists` (existing) | Source of truth, includes `sp serve` and `sp validate` | Local dev, CI authoring |
| Compose template | `docker-compose.example.yml` in the npm package and on the release page | Reference layout | Copy-paste starting point |

**Image must include** the `sp validate` and `sp serve` subcommands so the container itself is the authoring/validation tool — consumers do not need npm or the source repo.

**Image must not include** `.specialists/`, project secrets, or any consumer data. Mounts only.

### 9.2 Versioning and tag policy

| Tag | Mutable? | Use |
|---|---|---|
| `:v1.2.3` | immutable | Production. Pin this. |
| `:v1.2` | floating to latest patch | Stage / dev where patch updates are safe |
| `:v1` | floating to latest minor | Not recommended for prod |
| `:latest` | floating | Never in production |

Image tags follow the npm package semver. Schema-breaking changes require a major bump. Each release publishes a `compat.json` to the GitHub release page documenting which `class` discriminator values and which schema fields the image understands — consumers diff this on upgrade.

### 9.3 Consumer repo layout (canonical)

```
my-project/
├── docker-compose.yml                 # references ghcr image, pinned tag
├── .specialists/
│   └── user/
│       ├── echo-summarizer.specialist.json
│       └── classify-intent.specialist.json
├── .specialists-service/              # gitignored runtime state
│   ├── observability.db               # SQLite, mounted into container
│   └── pi-tokens/                     # only if writable-token mode (§11.2); empty otherwise
├── .gitignore                          # ignores .specialists-service/
└── src/                                # consumer's own code
    └── client.ts                       # calls http://specialists:8000/v1/generate
```

**Rules:** *(B10)*

- `.specialists/user/` is the **authoritative authoring surface**. The service loads from this path only — it does *not* fall back to `.specialists/default/`, `config/specialists/`, or any legacy location. Loader runs in service-isolation mode (§11.1).
- `.specialists-service/` is **runtime state**, gitignored, written by the container.
- **No secret file**, no API key file, no `--api-key-*` flag. Pi reads `~/.pi/agent/auth.json` from the bind-mounted host directory; the service never opens credential files. See §11.2 for the two supported oauth-refresh modes.
- Consumer service talks to the specialists container over the docker network, never over a public address.

### 9.4 Reference docker-compose.yml

```yaml
version: "3.9"

services:
  specialists:
    image: ghcr.io/<org>/specialists-service:v1.2.3
    restart: unless-stopped
    command:
      - sp
      - serve
      - --port=8000
      - --user-dir=/work/.specialists/user
      - --db-path=/state/observability.db
      - --request-concurrency=4
    environment:
      # Pi resolves models and credentials from $HOME/.pi by default.
      # Override here only if the host pi config lives elsewhere.
      HOME: /pi-home
    volumes:
      - ./.specialists/user:/work/.specialists/user:ro
      - ./.specialists-service:/state
      # Pi credentials, models config, and skills — read-only mount.
      # Container UID must be able to read the user's ~/.pi.
      - ${HOME}/.pi:/pi-home/.pi:ro
    healthcheck:
      test: ["CMD", "sp", "health", "--exit-code"]
      interval: 15s
      timeout: 3s
      retries: 5
      start_period: 10s
    deploy:
      resources:
        limits:
          memory: 1g
          cpus: "1.0"
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    networks:
      - app

  app:
    build: ./src
    environment:
      SPECIALISTS_URL: http://specialists:8000
    depends_on:
      specialists:
        condition: service_healthy
    networks:
      - app

networks:
  app:
```

This is the **sidecar-per-service** topology — the supported v1 default.

**Why no `secrets:` block:** pi already owns credential management via `~/.pi/agent/auth.json` (multi-provider oauth + api_key, rotation, refresh). Bind-mounting that directory read-only is the entire credential story. The service binary never reads, copies, or logs keys. This eliminates an entire class of failure modes (key leak in audit rows, env-var inheritance, file-watch races) that the original spec spent paragraphs trying to mitigate.

### 9.5 Mount contract (what the image expects)

| Path inside container | Mode | Required? | Purpose |
|---|---|---|---|
| `/work/.specialists/user` | `ro` | yes | Specialist JSON files |
| `/state` | `rw` | yes | SQLite DB, file watcher state, debug sinks if enabled |
| `/pi-home/.pi` | `ro` | yes | Pi credentials, models config, skills — owned by pi, read by pi |
| `/work` | `ro` | optional | Project root for tooling that needs context |

The image fails fast at boot if `/work/.specialists/user` is missing or empty (`specialist_load_error: empty user dir`) or if `/pi-home/.pi/agent/auth.json` cannot be read (`pi_config_unreadable`). The image runs as a non-root UID; both the user-dir and the `~/.pi` mount must be readable by that UID — document the UID in the image label, and provide a `--user <uid>` recipe for compose users whose host UID differs.

**Two supported oauth modes (B5):**

- **Mode A — host-side refresh (default, recommended):** mount `~/.pi` read-only. Pi's in-container refresh-on-401 path is **disabled** by setting `PI_REFRESH_DISABLED=1` (or equivalent — exact env name is one of the implementation tasks in §12). Tokens are refreshed by the user's host-side pi tooling on a schedule or on demand; the container picks up new tokens on next file-mtime check. Acceptable when host has an active user or a scheduled refresh job. Failure mode: token expires mid-request → pi returns auth error → service maps to `auth` and returns. Caller retries; by then host has refreshed.
- **Mode B — container-writable token cache:** mount `~/.pi` read-only *for everything except* a writable token cache at `/state/pi-tokens/auth.json`. Service launches with `PI_AUTH_PATH=/state/pi-tokens/auth.json`, seeded once from `/pi-home/.pi/agent/auth.json` at boot. Pi refresh writes go to the writable copy only; the host file is never modified from inside the container. Required when the host has no active refresh agent (servers, CI runners, air-gapped hosts). Failure mode: concurrent refresh races between pi subprocesses → mitigated by file-lock around `auth.json` writes (pi already does this; verify on integration).

The image label `org.specialists.oauth-mode` documents which mode is active; mixing modes across replicas is unsupported. Choose at deploy time.

### 9.6 Configuration sources (precedence)

Highest to lowest:

1. CLI flags (`--port`, `--user-dir`, etc.) — explicit, audit-friendly.
2. Environment variables (`SP_PORT`, `SP_USER_DIR`) — for compose/k8s.
3. `/etc/specialists-service/config.yaml` — image default (mostly empty).
4. Built-in defaults.

**API keys are not a configuration concern of this service.** Pi reads `$HOME/.pi/agent/auth.json` for all provider credentials. The service inherits `HOME` (or `PI_HOME` if set), spawns pi as a subprocess, and that's the entire credential surface. There is no `--api-key-*` flag, no env-var fallback, no key file path. The image fails fast at boot if pi cannot read its own config.

### 9.7 Authoring without the specialists repo

The image ships with a `validate` subcommand that runs locally and never makes network calls:

```
docker run --rm \
  -v "$PWD/.specialists/user:/work:ro" \
  ghcr.io/<org>/specialists-service:v1.2.3 \
  sp validate --target script /work/echo-summarizer.specialist.json
```

`--target` selects the compatibility validator (`agent` or `script`). Exit code is 0 on pass, non-zero on schema or compatibility failure. CI hooks this into PR checks for any change under `.specialists/user/`.

### 9.8 Hot reload across bind mounts

The service watches `--user-dir` with a debounced inotify watcher. Constraints:

- **Linux bind mounts:** inotify works.
- **macOS Docker Desktop:** inotify across the VirtioFS bridge is best-effort; document `--reload-poll-ms 1000` as a fallback for dev.
- **Read-only mount:** watching is fine; only file mtimes are read.

**Atomic per-request snapshot (B7):** at request entry the handler resolves the spec by name and captures the **immutable parsed spec object** for the rest of the request. Reloads cannot mutate an in-flight request. Audit row records `meta.spec_sha256` so a later reload that drops or replaces the spec doesn't poison forensic replay.

**File event handling:** the watcher subscribes to `create`, `modify`, `delete`, and `move` events. The cache is name-keyed; every event updates the cache deterministically:

- `create` / `modify` / atomic-save (`tmp` → `rename`): re-parse, validate, atomic swap on success; previous version retained on parse/validation failure with an error event.
- `delete`: purge the cache entry. Subsequent requests for that name return `specialist_not_found` immediately. No ghost serving. Today's loader (`loader.ts:166-200`) only invalidates manually — the service must implement deletion-aware invalidation as part of B7.
- `move` / `rename` (in-dir): treated as delete-old-name + create-new-name. If the move overwrites another name, the destination cache entry is rebuilt.

Every cache mutation writes one `specialist_events` row (`spec_reloaded`, `spec_deleted`, `spec_load_failed`) with old/new sha256. If a reload produces an invalid spec, the previous version is kept and an error event is written; the request endpoint never serves a half-loaded spec.

**Editor atomic-save behavior:** vim/IntelliJ/VS Code typically write a temp file then rename. On Linux bind mounts inotify emits `CREATE` then `MOVED_TO` (rename target) — handler must collapse a `delete`+`create` pair within the debounce window into a single `modify` to avoid a brief window where `specialist_not_found` is returned for the same name.

### 9.9 Health, readiness, and observability scraping

| Endpoint | Returns | Use |
|---|---|---|
| `GET /healthz` | `200` if process alive | Liveness probe |
| `GET /readyz` | `200` if user-dir loaded **and all specs valid** (fail-closed), DB writable, pi config readable. `503` with reason if degraded | Readiness probe |
| `GET /metrics` | Prometheus text | Optional scrape target |
| `GET /v1/specialists` | List of loaded specs with version, class, sha256 | Caller introspection |

`sp health --exit-code` is the Docker healthcheck shim that hits `/readyz`.

**DB-write failure handling (B8):** the audit row is best-effort, never request-blocking. Sequence:

1. Model call returns successfully.
2. Service attempts `INSERT INTO specialist_jobs ...`.
3. On insert failure (disk full, lock timeout, schema mismatch): log structured error to stderr with `trace_id`, increment `db_write_failures_total` Prometheus counter, return the response to the caller with `meta.trace_persisted: false`.
4. If `db_write_failures_total` exceeds a configurable rate (default: 5 failures in 60s), `/readyz` flips to `503 degraded:audit`. Upstream LBs drain traffic until the rate drops; the service does not crash.
5. Configuration `--audit-failure-mode {best_effort|fail_request}` lets operators with strict audit requirements opt into hard-fail (returns `503 audit_unavailable` to the caller). Default is `best_effort`.

This contract is identical across HTTP, `sp script`, and programmatic transports. Caller-visible behavior is fully described by `meta.trace_persisted`.

### 9.10 Logging

- Structured JSON to stdout. One line per request with `trace_id`, `specialist`, `resolved_model`, `duration_ms`, `error_type`, `prompt_sha`, `output_sha`.
- Stderr only for service-level errors and reload diagnostics.
- No prompt or rendered output is logged by default. A `--log-prompts=trace_only` flag enables redacted prompt logging keyed by `trace_id` for forensic replay against `observability.db`.
- API keys are explicitly redacted; the redaction list is documented and tested.

### 9.11 Resource limits and concurrency

The image declares conservative defaults; consumers tune in compose:

| Knob | Default | Notes |
|---|---|---|
| `--request-concurrency` | 4 | Global semaphore. Excess requests wait `--queue-timeout-ms` then return `429 concurrency_limit`. |
| `--queue-timeout-ms` | 5000 | — |
| `--max-prompt-bytes` | 256 KB | Pre-flight cap → `prompt_too_large`. |
| `--max-output-bytes` | 4 MB | Post-call cap → `output_too_large`. |
| Memory limit | 1 GB | Tune for largest expected output × concurrency. |
| CPU limit | 1.0 | Pi process is the dominant CPU consumer; one in-flight request ≈ one core. |

### 9.12 Air-gapped and private registry

- Image must build deterministically from a public Dockerfile (no fetch-from-internet at runtime).
- `pi` and Node modules are bundled into the image — not downloaded on first run.
- For air-gapped sites: `docker save` / `docker load` works because the image is self-contained.
- For private registries: re-tag and push; nothing else changes.

### 9.13 Upgrade story and drain contract

1. Consumer reads release notes and `compat.json` for breaking changes.
2. Run `sp validate --target script` against current `.specialists/user/` using the new image — catches schema regressions before deployment.
3. Bump tag in `docker-compose.yml`.
4. `docker compose up -d` triggers rolling restart; `/readyz` gates traffic until the new container is healthy.
5. If something fails: revert tag, restart. Observability DB is forward-compatible across minor versions (additive columns only); a major upgrade may require an explicit migration step documented per release.

**Shutdown drain contract (B9):** orchestrators send `SIGTERM` then `SIGKILL` after a grace period. The service must handle both cleanly:

| Event | Behavior |
|---|---|
| `SIGTERM` received | (a) stop accepting new requests — listener returns `503 shutting_down` for any new socket; (b) drain in-flight requests up to `--shutdown-grace-ms` (default 30000); (c) flush pending audit writes; (d) close DB; (e) exit `0`. |
| In-flight pi subprocess at SIGTERM | Service forwards `SIGTERM` to each pi child; waits up to `min(shutdown-grace-ms, request-timeout-ms)` for graceful exit; then `SIGKILL` to children before parent exit. Process group via `setsid` ensures grandchildren are reaped. |
| `SIGKILL` (grace exceeded) | Kernel kills parent and process group. Audit rows for in-flight requests are lost (they were buffered in memory). Acceptable trade-off; clients must treat shutdown errors as retryable. |
| Existing connections during drain | Allowed to complete. New requests on existing keep-alive connections also get `503 shutting_down`. |
| Health endpoints during drain | `/healthz` continues to return `200` until the listener closes; `/readyz` returns `503 draining` immediately on SIGTERM so LBs steer away. |

This makes rolling restart safe under any orchestrator (compose, k8s, systemd) without orphan pi processes or broken-socket noise in client logs.

### 9.14 Multi-tenant deployments

Out of scope for v1 as a supported topology. Document explicitly:

- v1 is **single-tenant per container** (sidecar pattern).
- Running multiple consumers against one container is permitted but unsupported: there is no per-tenant authn, no per-tenant rate limit, no per-tenant secret scope.
- A v2 multi-tenant story (tenant header, namespaced user-dirs, per-tenant secret scopes, per-tenant quotas) is a separate design.

### 9.15 What this section guarantees

A consumer repo with **only** a `docker-compose.yml`, a `.specialists/user/` directory, and a bind-mount of `~/.pi` can: *(B10)*

- pull the published image
- validate every spec in CI without source code or npm
- run the service and call `/v1/generate` from its own code
- upgrade by bumping a tag and re-running validate
- audit every call via the SQLite DB it owns
- operate fully air-gapped after the initial image load

If any of those is not true after implementation, the distribution story is incomplete and ship is blocked.

## 10. Non-HTTP usage — `sp script`, programmatic, cron

The HTTP service is one transport. The same script-class spec must run identically without a daemon, without a container, and without any new credential plumbing — because pi already owns credentials on the host.

### 10.1 Architectural rule

**One spec format, one compatibility validator, three transports.**

| Transport | Use when | Surface |
|---|---|---|
| HTTP (`sp serve`) | Multi-process consumers, language-agnostic clients, container deployments | `POST /v1/generate` |
| CLI (`sp script`) | Shell scripts, cron, single-host automation | `sp script <name> --vars k=v --json` |
| Programmatic | In-process Node services, custom embedding | `import { runScript } from '@org/specialists'` |

All three load specs through the same `SpecialistLoader` (in service-isolation mode for the service surface, see §11.1), run the same `validateForScriptService` compatibility check, spawn pi with the same one-shot flags, and — **when tracing is enabled** — write the same SQLite audit row schema. A spec that works in one works in all three. The CLI's `--no-trace` and the HTTP `trace: false` request flag are the only opt-outs from audit writes; neither changes the spec contract or the spawn behavior. Anything that adds a runtime knob to one transport but not the others reintroduces the schema-fork problem at a different layer.

### 10.2 `sp script` CLI

```
sp script <name>
  --vars key=value [--vars key=value ...]
  [--template task_template|normalize_template]
  [--model <override>]
  [--thinking <level>]
  [--user-dir <path>]
  [--db-path <path>]
  [--timeout-ms <n>]
  [--json]                 # emit response as JSON to stdout (default: just the output text)
  [--single-instance <lockpath>]   # cron-safe: flock guard, skip if locked
  [--log-file <path>]
  [--no-trace]             # skip the SQLite write
```

Exit codes (cron-friendly):

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | internal error |
| 2 | spec/load error (`specialist_not_found`, `specialist_load_error`) |
| 3 | template error (`template_variable_missing`) |
| 4 | auth/quota (`auth`, `quota`) |
| 5 | timeout/network (`timeout`, `network`, `circuit_open`) |
| 6 | validation (`invalid_json`, `output_validation_failed`) |
| 7 | output too large / prompt too large |

Stdout is the model output (or full JSON with `--json`). Stderr is structured diagnostic logging. This makes shell composition trivial:

```sh
summary=$(sp script summarize-log --vars content="$(cat /var/log/app.log)") || exit $?
echo "$summary" | mail -s "Daily summary" ops@example.com
```

### 10.3 Programmatic usage

```ts
import { runScript } from '@org/specialists';

const result = await runScript({
  name: 'classify-intent',
  variables: { text: incoming.body },
  userDir: '.specialists/user',
  dbPath: '.specialists-service/observability.db',
  timeoutMs: 60_000,
});

if (!result.success) throw new Error(`${result.error_type}: ${result.error}`);
return result.parsed_json;
```

`runScript` is the same function the HTTP handler calls. No HTTP round-trip, no JSON serialization overhead, same audit row in SQLite.

### 10.4 Cron caveats — what changes when there is no container

Pi's credential ownership eliminates most of the original cron concerns. What's left:

| Caveat | Why it still matters | Resolution |
|---|---|---|
| State ownership | Where does `observability.db` live? | Default to `~/.specialists/observability.db`. Override with `--db-path` or `SP_DB_PATH`. Document the precedence: flag → env → home default. |
| Concurrency | Cron can overlap if a run exceeds the interval; two runs racing on the same DB row writes is unsafe. | `--single-instance <lockpath>` uses `flock`. If locked, exit code 75 (`EX_TEMPFAIL`) so cron logs the skip without alerting. |
| cwd / project resolution | The loader scans `cwd/.specialists/user`. Cron's cwd is minimal. | `cd` into the project root in the cron command, or pass `--user-dir` explicitly. |
| Log rotation | Host scripts don't have a log scraper. | `--log-file` plus document a logrotate snippet. Default: stderr only. |
| HOME not set | Cron sometimes runs without `HOME`. Pi can't find auth.json. | The CLI fails fast with `pi_config_unreadable` and a message naming `HOME`/`PI_HOME`. Cron user must export `HOME` in the crontab. |

What is **not** a caveat: API keys, secret rotation, env-var leakage, key file permissions. None of those exist as service concerns because pi owns them.

### 10.5 Example: cron job using a script-class specialist

`crontab -e`:

```
HOME=/home/dawid
PATH=/usr/local/bin:/usr/bin:/bin

# Every 15 minutes, classify recent error logs and post severe ones to Slack
*/15 * * * * cd /home/dawid/dev/myproject && \
  sp script classify-error-batch \
    --vars window_minutes=15 \
    --single-instance /tmp/sp-classify.lock \
    --json \
    | jq -r '.parsed_json.severe_events[]?' \
    | xargs -I{} curl -s -X POST $SLACK_WEBHOOK -d "text={}" \
    >> /var/log/sp-classify.log 2>&1
```

No secret config. No HTTP. The same `classify-error-batch.specialist.json` could run identically in the HTTP service and in `runScript()` from a Node app — because pi handles the model and the spec handles the prompt.

### 10.6 When NOT to use `sp script`

If you need full agent runtime — tools, worktrees, beads, multi-turn keep-alive, mandatory rules, GitNexus injection — that is `sp run`, not `sp script`. The two commands deliberately have different shapes:

| `sp script` | `sp run` |
|---|---|
| Script-class specs only | Agent-class specs (default) |
| One-shot, no tools, no worktree | Full Supervisor lifecycle |
| Synchronous, returns when done | Background-capable, steer/resume |
| No mandatory rules / memory / GitNexus injection | Full project context injection |
| SQLite row + optional file log | Full job dir, events, status, result |

Picking the wrong one is the same mistake the original HTTP spec made by trying to host both shapes on one transport. Two surfaces, two compatibility validators, one schema.

## 11. Unsupported topologies, isolation rules, and supply-chain requirements

### 11.1 Service-isolation loader mode (B1)

The current `SpecialistLoader.getScanDirs()` (`loader.ts:73-82`) walks seven candidate paths: user dir, nested-user, default dir, nested-default, `config/specialists`, and two legacy locations. For interactive `sp run` this fallback chain is correct and useful. **For the service surface it is dangerous**: a spec name typo or a deleted user-dir file silently falls through to a package-bundled spec, and the operator believes they have an isolated sidecar while the container serves something else.

**Required behavior (must implement before image ships):**

- New loader option `mode: 'service' | 'agent'`. Service mode scans **exactly one root** (the configured `--user-dir`). No `default/`, no `config/specialists/`, no legacy dirs.
- Boot scan validates every file under the root with `validateForScriptService`. Any failure is fatal: `/readyz` stays `503` until fixed. No silent skip-and-stderr.
- Cache is name-keyed and **fail-closed**: a delete event purges the entry; subsequent requests for that name return `specialist_not_found`, never a fallback from another dir.
- The service logs the resolved root path on every startup and includes it in `/v1/specialists` introspection.

This is what makes the §9.3 "authoring surface" claim true. Without it, the claim is fiction.

### 11.2 OAuth refresh modes — see §9.5 (B5)

Mode A (read-only mount + host refresh) and Mode B (writable token cache at `/state/pi-tokens`) are the two supported configurations. Mixing modes across replicas of the same logical service is **unsupported** and will cause refresh races.

### 11.3 Skill-injection trust model (B2)

`skills.paths` and `prompt.skill_inherit` reach pi via `--skill <path>` and modify the agent's instruction context. In service mode they are **denied by default**. Two opt-in paths:

- `--allow-skills` — single-tenant trusted deployments only. Every resolved skill path is logged in `meta.skill_sources` with sha256.
- `--allow-skills-roots <path>[:<path>...]` — restrict permitted skill paths to a list of trusted roots. The loader rejects skills resolving outside those roots at validation time.

Multi-tenant deployments must NEVER enable `--allow-skills` without the path-roots restriction; without it, any spec author can prompt-inject from any path the service UID can read.

### 11.4 Unsupported topologies

| Topology | Status | Why |
|---|---|---|
| Multi-replica sharing one `/state` (SQLite + token cache) | **Unsupported** | SQLite write contention, watcher fan-out duplication, oauth refresh races on shared `auth.json`. Run one replica per `/state` mount. |
| Multi-tenant on a single shared container | **Unsupported in v1** | No tenant authn, no per-tenant rate limit, no per-tenant secret scope. Sidecar-per-service is the supported pattern. |
| Mixed oauth modes across replicas | **Unsupported** | Refresh races. Pick Mode A or B per logical service. |
| `~/.pi` mounted from NFS / remote FS | **Unsupported** | inotify semantics, lock semantics, and atomic-write guarantees vary across remote filesystems. Local bind mount only. |
| Public exposure of the HTTP endpoint | **Unsupported** | No authn, no authz, no rate-limit-per-caller. Container-network access only. |
| Container running as root | **Unsupported** | Image declares non-root UID; running as root defeats the bind-mount permission model. |

These are documented to fail predictably, not to be supported.

### 11.5 Supply-chain requirements

Image must ship with verifiable provenance:

- **SBOM** generated at build (CycloneDX or SPDX); attached to the GitHub release and to the image as an OCI annotation.
- **Image signing** with cosign (sigstore); verification recipe in release notes. Consumers `cosign verify ghcr.io/<org>/specialists-service:v1.2.3 --certificate-identity ...`.
- **Base image refresh policy:** monthly rebuild on the slim/distroless base to pick up CVE patches. Patch releases for CVE rebuilds keep the same code, bump the patch version, document under "security only" in `compat.json`.
- **Pi binary provenance:** if `pi` is bundled, it must come from a pinned npm version recorded in the SBOM. A separate cosign signature on the bundled pi binary is preferred.
- **Dependency scan in CI:** `npm audit --omit=dev` and Trivy/Grype against the built image must pass before publish.
- **Reproducible build:** a documented build recipe that produces byte-identical images from the same inputs (or, at minimum, the same SBOM hash). Required for air-gapped consumers who need to verify what they deployed.

Without these, "production-ready" is a marketing claim, not an operational one.

## 12. Required implementation surface (B4)

The memo references several commands and exports that **do not exist in the codebase today**. They are blockers for the image build, not aspirations. Documented here so the implementation phase has an explicit checklist.

| Surface | Today | Required |
|---|---|---|
| `sp serve` | absent (`src/index.ts:958-967`) | HTTP server entry point: `--port`, `--user-dir`, `--db-path`, `--request-concurrency`, `--queue-timeout-ms`, `--max-prompt-bytes`, `--max-output-bytes`, `--shutdown-grace-ms`, `--audit-failure-mode`, `--allow-skills`, `--allow-skills-roots`, `--allow-local-scripts`, `--reload-poll-ms`. |
| `sp script` | absent | One-shot CLI: `--vars`, `--template`, `--model`, `--thinking`, `--user-dir`, `--db-path`, `--timeout-ms`, `--json`, `--single-instance`, `--log-file`, `--no-trace`. Exit codes per §10.2. |
| `sp validate --target script\|agent` | partial (`src/cli/validate.ts` validates schema, no `--target`) | Add `--target` flag that runs `validateForScriptService` or `validateForAgent` on top of base parse. Image-callable for CI. |
| `sp health --exit-code` | absent | Healthcheck shim hitting `/readyz`, exit 0/1. |
| `runScript()` library export | absent | New entry in `package.json#exports` returning `Promise<GenerateResponse>`. Same code path as HTTP handler. |
| `runScriptStream()` (optional v1) | absent | Streaming variant if needed; defer until consumer demand is real. |
| `class` field in `SpecialistSchema` | absent (`schema.ts`) | Add `specialist.class: 'agent' | 'script'` (default `'agent'`). |
| `.passthrough()` on nested objects | absent — verified bug | Required for `sp edit` round-trip and class-discriminator forward compat. |
| `validateForAgent` / `validateForScriptService` | absent | Two compatibility validators on top of base parse. |
| Service-isolation loader mode | absent | `SpecialistLoader({ mode: 'service', root: <path> })`. |
| Deletion-aware cache invalidation | absent (`loader.ts:166-200` is name-keyed manual-only) | Watcher → cache purge on delete/rename. |
| `template_variable_missing` enforcement | absent (`templateEngine.ts`) | Pre-scan rendered template for un-substituted `$ident`; raise typed error. |
| Output validation `fail_request` mode | partial (engine exists at `runner.ts:689-789`, only warns) | New spec field `output_validation: 'warn' | 'fail_request'`; map failures to `output_validation_failed`. |
| Audit row extensions | partial | Add `resolved_model`, `fallback_used`, `breaker_state`, `validation_mode`, `prompt_sha`, `output_sha`, `attempts`, `skill_sources`, `trace_persisted`, `caller_id`. |
| Image build pipeline | absent | Multi-arch buildx, SBOM gen, cosign sign, Trivy/Grype scan, npm audit, GHCR push on tag. |
| `compat.json` per release | absent | Document supported `class` values, schema fields, and migration notes per release. |

This list is the implementation epic. Until each row is `done`, the memo's promises are forward-looking, not present-tense.

## Final answer to the question that started this

> "Why are we dropping functionalities entirely?"

We are not. Three of the doc's "non-goals" (strict validation, backend-only swap, future classes) **must not be dropped**. Five (multi-stage orchestration, keep-alive, worktree ownership, file-based job lifecycle, beads ownership) **are correctly bounded out of the service**. All eight "forbidden fields" are **the wrong mechanism** — they should become per-surface compatibility rules on real schema field names. The schema must remain a single SSOT with a `class` discriminator and passthrough objects, or every claim of cross-project reusability is false.

Anything that ships under the current draft will fork the schema, break `sp edit` round-trips, hide model swaps from callers, lose forensic data, and silently accept malformed output. None of those are acceptable for production.

## Ship verdict

**BLOCK** until every row in §12 ("Required implementation surface") is implemented and every blocker B1–B11 is resolved by the patches in this memo. Once those land:

1. Re-run the second-pass critique against the patched memo to confirm no contradictions remain.
2. Build the first multi-arch image with full supply-chain attestations (§11.5).
3. Validate end-to-end with one real consumer (HTTP), one real cron user (`sp script`), and one real Node embedder (`runScript()`).
4. Only after all three pass, mark the memo as the canonical spec and rewrite `docs/specialists-service.md` from it.

Until then this is a design contract, not a release plan.
