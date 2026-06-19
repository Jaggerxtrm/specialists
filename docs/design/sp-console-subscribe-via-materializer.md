# sp console as materializer `sync_hint` subscriber — design proposal

> Status: **EXPLORATORY**. This document does NOT commit to a daemon
> architecture. It enumerates the trade-offs of swapping the 1500ms
> poll loop for a push-based subscription, and gives the operator
> enough to decide whether to file the Phase 5 build-out bead or close
> this thread as decided-not-to-build.
>
> Bead: `unitAI-ctb4u.22` (Phase 4 of materializer adoption).

## 1. Why this is worth considering

After Phase 1 (`snapshotDiff`) + Phase 2 (`SourceQueue`) + Phase 3
(per-row paint cache), the sp console poll loop is already at a steady
state of:

- One `git_numstat` + `git_status` (worktree DiffView only).
- One `listProcessSnapshot` per active repo, every 1500ms.
- `snapshotHash` short-circuits the dispatch on no-op snapshots, so most
  polls produce zero render work.

In steady state the cost is dominated by the SQLite read in
`listProcessSnapshot`. That cost is per-repo and per-poll, so a 3-repo
session at 1500ms COALESCE makes 2 SQLite reads/sec just to learn that
nothing changed 90% of the time.

The gitboard materializer already publishes the right signal — it
fires a `specialists:sync_hint` event on `specialists:repo:<slug>` and
`specialists:activity` after every successful run
(`gitboard:packages/core/src/materializer/materializer.ts:104
publishHint`). If sp console subscribes to those channels, the poll
loop collapses to a fallback path used only when the daemon is
unreachable.

## 2. The five enumeration points

### 2.1 The daemon process model

The materializer must outlive a single sp console invocation, so a
long-running process is the load-bearing assumption of this whole
proposal.

Three candidate hosts:

1. **`sp serve` (already shipped)** — extend `sp serve` to mount the
   materializer alongside the existing `/v1/generate` route. Pro:
   single binary, no new daemon vocabulary. Con: `sp serve` is a
   per-project HTTP service; materializer wants to span repos.

2. **New `sp materialize-daemon` subcommand** — explicit daemon
   process. Pro: clean separation; binds a UNIX socket per `$HOME`,
   not per repo. Con: another lifecycle the operator has to manage
   (systemd unit / launchd plist / `xt` integration).

3. **Co-host inside `xt` itself** — `xt` already has a session
   lifecycle (`xt claude`, `xt end`) and a global home at
   `~/.xtrm/`. Materializer becomes an internal `xt materialize-daemon`
   subprocess started lazily on first sp/xt invocation. Pro: leverages
   the existing `xt` lifetime model. Con: cross-repo coupling between
   specialists and xtrm-tools that didn't exist before.

**Recommendation:** option 2 (new dedicated subcommand) is the lowest
cognitive overhead — it stays inside the specialists repo, mounts at
`~/.local/share/specialists/materialize.sock`, and `xt` integration is
a follow-up if it turns out to be valuable. The other two options can
be reconsidered after the operator has lived with option 2.

### 2.2 Authentication / authorization for the channel

The sp console is local-only — operator runs it as themselves on
their own machine. Two transports are practical:

| Transport | Auth surface | Complexity | Cross-host? |
|-----------|--------------|------------|-------------|
| UNIX socket (line-delimited JSON) | File-mode 0600 | ~30 LoC | No |
| HTTP+WS (loopback only) | Bearer token via `~/.config/specialists/daemon-token` | ~80 LoC + bearer check | Yes (with care) |

**Recommendation:** UNIX socket. Zero new auth machinery — file
permissions are the auth surface, and sp console runs as the same uid
as the daemon by definition. A future cross-host need (remote sp
console hitting a remote daemon) is real but speculative; build for
the actual workflow.

The line-delimited JSON wire format mirrors the existing forensic
event shape (`src/specialist/forensic-events.ts` —
`xtrm.forensic.v1`). Each frame is one JSON object terminated by a
newline. Frames are small (~200 bytes per `sync_hint`) so coalescing
at the wire is unnecessary.

### 2.3 The fallback model: subscribe when available, poll otherwise

**Mandatory invariant:** sp console must work standalone. The daemon
is an optimization, not a dependency. The poll loop never dies; it
just changes cadence based on whether subscription is active.

Concrete shape:

```ts
const sub = await trySubscribe('unix:~/.local/share/specialists/materialize.sock');
if (sub.ok) {
  sub.onSyncHint((repoSlug) => queues.get(repoSlug)?.enqueue(repoSlug, refresh));
  // Poll cadence relaxes 6x: COALESCE_MS = 1500 → 9000 (fallback heartbeat).
  RELAX_COALESCE();
} else {
  // Standalone: keep COALESCE_MS = 1500 (existing behavior).
  KEEP_COALESCE();
}
```

The subscription only changes when the queue fires, not what it fires.
The SourceQueue port (unitAI-ctb4u.20) is the right hand-off seam —
the daemon decides _when_ to poke each repo's queue; the queue
decides _whether_ to drain (still coalesces against bursts).

If the socket closes mid-session, sp console drops back to the polling
cadence automatically. Reconnect logic is bounded-exponential (1s, 2s,
5s, 10s, 30s, cap) and a single line per reconnect attempt routes
through `logError` for visibility.

### 2.4 Materializer pieces — gitboard vs specialists

| Piece | Today | Should live |
|-------|-------|-------------|
| `snapshot-diff.ts` | Ported (Phase 1) | both repos (verbatim) |
| `queue.ts` (SourceQueue) | Ported (Phase 2) | both repos (verbatim) |
| `materializer.ts:Materializer` class | gitboard only | gitboard; specialists imports |
| `materializer.ts:realtimeHintFor` | gitboard only | gitboard (channel naming is gitboard's contract) |
| `publishHint` WS fan-out | gitboard only | gitboard (uses `WSRegistry`) |
| sp console subscriber | doesn't exist | specialists (new) |

**Recommendation:** keep the heavyweight pieces in gitboard. The
materializer-as-class is intricate (state cache, cursor management,
deps tracking) and gitboard already has the right tests. specialists
gets a thin subscriber that wraps the UNIX socket and translates the
`{ event: "specialists:sync_hint", data: { repoSlug } }` frames into
`SourceQueue.enqueue` calls.

For the daemon process, two options:

- **Vendor the materializer class into specialists** — copy the
  ~400 LoC of `materializer.ts` plus its deps (`snapshot-diff.ts`,
  `queue.ts`). Big surface area to keep in sync.

- **Import gitboard as a dependency** — adds a 200kB+ workspace
  package boundary. Operator currently uses gitboard as a separate
  monorepo, not a published npm package.

Neither is great. A practical interim: extract the materializer core
to a small published package (`@xtrm/materializer-core`) that both
projects can consume. That's a follow-up bead, not part of this one.

### 2.5 `MaterializedSpecialistJob` vs `ConsoleJob`

Today `ConsoleJob extends SupervisorStatus`. The materializer projects
`SupervisorStatus[]` into `MaterializedSpecialistJob[]` with a
slightly different shape — denormalized fields for fast scans, no
deeply nested `metrics` block, label-keyed views for Prometheus.

**The real fork:** if sp console consumes `MaterializedSpecialistJob`,
the runtime client becomes a thin reader and the materializer is the
shared source of truth. If sp console stays on `ConsoleJob`, two
projections of the same data continue to live.

| Stay on `ConsoleJob` | Adopt `MaterializedSpecialistJob` |
|----------------------|-----------------------------------|
| Zero churn for existing renderers | Renderers refactor to the new shape (~50 sites) |
| ConsoleJob can carry sp-console-only enrichments (`payload_kb`, `next_action`) | Enrichments must live in the materializer or move to a console-local projection layer |
| Two shapes drift; data inconsistencies are possible | Single canonical shape across console + Prometheus + gitboard |
| Phase 5 bead is a thin sub task | Phase 5 bead is a multi-week refactor |

**Recommendation:** stay on `ConsoleJob`. The fork-in-the-road choice
is not the right call to bundle with "stop polling SQLite". Adopting
`MaterializedSpecialistJob` would force a console-wide rendering
refactor on top of the daemon work — too much risk in one step. File
the shape-unification question as a separate bead if/when it becomes
load-bearing for a real workflow.

## 3. Prototype

`src/cli/console/subscribe-prototype.ts` (gated behind
`SPECIALISTS_CONSOLE_SUBSCRIBE_PROTOTYPE=1`) demonstrates the UNIX
socket subscriber + fake materializer locally. It is NOT production
code. It:

1. Spawns a fake materializer that writes synthetic `specialists:sync_hint`
   frames at 5Hz to a tmp UNIX socket.
2. Connects a tiny subscriber that consumes the frames and forwards
   them to a stub `onHint(repoSlug)` callback.
3. Logs every frame + every reconnect attempt to stderr via
   `console.error` (NOT through `logError` since the prototype is
   not production wiring).

Running:

```bash
SPECIALISTS_CONSOLE_SUBSCRIBE_PROTOTYPE=1 bun run src/cli/console/subscribe-prototype.ts
```

When the env var is unset, the module exports a no-op and importing
it has zero side effects. The gate is the only thing protecting
production from accidentally pulling the prototype in.

## 4. Operator decision points

Before filing Phase 5, the operator should answer:

1. **Daemon host:** option 2 (`sp materialize-daemon`) or push back
   for option 1/3?
2. **Transport:** UNIX socket (default) or HTTP+WS (only if cross-host
   becomes a real workflow)?
3. **Materializer source:** vendor into specialists, import gitboard as
   workspace, or extract to `@xtrm/materializer-core`?
4. **Shape:** stay on `ConsoleJob` (default) or adopt
   `MaterializedSpecialistJob` (separate bead)?
5. **Cadence:** when subscription is active, what's the right poll
   fallback heartbeat? 9000ms? 30000ms? Never (only on socket close)?

## 5. Cross-references

- `substrate-review.md` §11 — channels work for the cross-repo
  direction (substrate's `pulse` primitive is the conceptual cousin).
- `src/specialist/snapshot-diff.ts` + `src/specialist/source-queue.ts`
  — the two pieces already in specialists ready to compose with a
  subscriber.
- `gitboard:packages/core/src/materializer/materializer.ts:publishHint`
  — the upstream emit site we'd subscribe to.

## 6. Revision history

- 2026-06-19 — initial proposal landed alongside the gated prototype
  (`unitAI-ctb4u.22`).
