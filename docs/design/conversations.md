# Conversations: A Reusable Inter-Specialist Communication Layer

> Status: Design draft (sequenced v0 → v3)
> Scope: Add a reusable inter-specialist communication layer that powers pair-talk, lateral wakeups, human-in-the-loop steer, and (eventually) self-managed nodes.
> Non-goal: Replace `specialist_results`, `node_memory`, or job lifecycle. This sits *between* them as connective tissue.
> Sequencing note: The full design (judge, freeform topology, derived memory, conversation engine) is the v3 endpoint. v0–v2 are honest stepping stones, each shippable and reversible. See §11 Sequenced Implementation. The critique that produced this sequencing lives on bead `unitAI-jzhim`.

## 1. Problem

Today's specialist runtime is point-to-point and orchestrator-mediated:

- Reviewer reads executor `result.txt`; executor cannot see reviewer findings until the orchestrator manually `sp resume`s it.
- Node coordinator is a *router* (drives `spawn-member` / `wait-phase`) not a *judge*. Members never talk laterally.
- Human participation is per-job (`sp steer <job>`), not per-workstream.
- `node_memory` captures curated findings but has no notion of message ordering, addressing, or subscription.
- No reusable "two specialists talk until done" primitive — every chain reimplements the loop in the orchestrator's head.

This makes multi-agent collaboration ceremonial and brittle.

## 2. Goals

1. One primitive — **conversation** — that powers: pair-talk, self-managed nodes, reviewer loops, parallel-review consensus, and human chat.
2. Lateral peer wakeups (reviewer → executor) without orchestrator round-trips.
3. Spec-declared participation: a specialist's `.json` says what it subscribes to and emits.
4. Machine-readable messages with a discriminated-union schema, so judges and routers can act deterministically.
5. Anti-spam by construction: messages are pointers + summaries, not raw turn output.
6. CLI ergonomics: ad-hoc conversations from the command line, no node config required.
7. Backwards compatibility: nodes, epics, `sp steer`, `sp resume` keep working; conversation is the new substrate underneath.

## 3. Non-Goals

- New IPC layer. Conversations live in `observability.db`, polled by the existing waiting-loop tick.
- New transport for raw turn output. `specialist_results` remains canonical for verbose content.
- Replacing `node_events`. Events stay for lifecycle (job starting/done); messages carry content.
- Free-form prose protocols. Every actionable message kind has a typed shape.

## 4. Concepts

| Concept | Definition |
| --- | --- |
| Conversation | Ordered, append-only stream of messages scoped to a workstream. Has participants, topology, stop conditions. |
| Participant | A specialist job, the coordinator/judge, the human user, or `system`. Each has a key, role, and subscription filter. |
| Message | Typed, structured payload. Carries pointers (`result_id`, `diff_range`) rather than raw blobs. |
| Subscription | Per-participant cursor over the message stream, filtered by `kind:target`. |
| Topology | How turns are taken: `turns` (round-robin), `reactive` (peer-driven), `freeform` (self-electing). |
| Judge | Optional coordinator that subscribes to terminal-candidate messages and decides done/continue. |
| Stop condition | Declarative termination: `judge.done`, `consensus`, `budget`, `idle:K`, `manual`. |

## 5. Architecture

### 5.1 Storage (`observability.db`)

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                -- 'pair' | 'node' | 'epic-channel'
  topology TEXT NOT NULL,            -- 'turns' | 'reactive' | 'freeform'
  bead_id TEXT,
  node_run_id TEXT,                  -- nullable: pair conversations have no node
  judge_key TEXT,                    -- nullable: pair conversations have no judge
  participants_json TEXT NOT NULL,   -- [{key, specialist, job_id, role, subscribe, emits}]
  stop_on_json TEXT NOT NULL,        -- ["judge.done","budget","idle:8"]
  max_turns_per_member INTEGER,
  status TEXT NOT NULL,              -- 'open' | 'closed' | 'aborted'
  created_at_ms INTEGER NOT NULL,
  closed_at_ms INTEGER,
  close_reason TEXT
);

CREATE TABLE conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  author_kind TEXT NOT NULL,         -- 'specialist' | 'user' | 'system' | 'gate' | 'judge'
  author_key TEXT NOT NULL,
  author_job_id TEXT,
  kind TEXT NOT NULL,                -- see §5.3
  target_key TEXT,                   -- nullable: addressed message
  body_json TEXT NOT NULL,           -- discriminated union, validated on write
  refs_json TEXT,                    -- {result_id, diff_range, files[]}
  ts INTEGER NOT NULL,
  UNIQUE(conversation_id, seq)
);

CREATE TABLE conversation_subscriptions (
  conversation_id TEXT NOT NULL,
  participant_key TEXT NOT NULL,
  last_seq_seen INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, participant_key)
);

CREATE INDEX conversation_messages_conv_seq ON conversation_messages(conversation_id, seq);
```

Existing tables unchanged. `node_memory` becomes a **derived view** seeded by `kind=finding` messages with `confidence >= threshold`.

### 5.2 Lifecycle

```
created -> open -> closed
              -> aborted
```

A conversation is `open` while at least one participant has unread messages or is `running`. The judge (or stop condition evaluator) closes it by writing a terminal `system.done` message.

### 5.3 Message Kinds (discriminated union)

Every message body validates against a schema keyed by `kind`. Invalid messages are downgraded to `kind=note` and do **not** trigger wakeups.

| Kind | Author | Body shape | Wakes |
| --- | --- | --- | --- |
| `turn` | specialist | `{summary, refs}` | nobody by default |
| `finding` | specialist, judge | `{severity, file?, line?, rule?, summary, refs}` | subscribers with matching `wakes_on` |
| `verdict` | reviewer, judge | `{verdict: PASS\|PARTIAL\|FAIL, target_key, summary, findings[]}` | `target_key` participant if subscribed |
| `proposal` | specialist | `{kind: terminate\|swap\|redirect, summary}` | judge |
| `steer` | user, judge, peer | `{target_key, instruction}` | `target_key` participant |
| `ack` | specialist | `{refs: [seq...], decision}` | proposal author (for quorum) |
| `escalation` | any | `{reason, refs}` | judge |
| `system.continue` | judge | `{reason}` | all open participants |
| `system.done` | judge | `{reason, outcome}` | all (terminal) |
| `system.redirect` | judge | `{target_key, instruction}` | `target_key` |
| `system.swap` | judge | `{out, in, reason}` | runtime (member swap) |
| `system.idle` | runtime | `{turns}` | judge |
| `system.budget` | runtime | `{tokens, threshold}` | judge |
| `note` | any | `{text}` | nobody |

**Anti-spam guarantee:** `turn` messages carry `{summary <= 500 chars, refs: {result_id, range}}`. Verbose reasoning lives in `specialist_results`. Peers dereference only when they need detail.

### 5.4 Subscription Model

Each participant declares a subscription expression. Defaults are conservative (addressed messages + verdicts + system).

Format: `kind[:target_filter]`

| Pattern | Meaning |
| --- | --- |
| `steer:me` | steers addressed to my participant key |
| `verdict:me` | verdicts targeting me |
| `finding:scope-overlap` | findings whose `refs.files` intersect my scope |
| `turn:peer` | reviewer-style: every other participant's turns |
| `system.*` | all system messages (on by default) |
| `proposal` | unaddressed proposals (judge default) |

Runtime resolves subscriptions on conversation open and stores them in `conversation_subscriptions`. Cursor advances only on messages matching the filter.

### 5.5 Runtime Integration

The existing waiting-loop tick gains one read:

```ts
// in runner.ts waiting loop, alongside steer.pipe poll
const newMessages = client.readConversationMessagesSince(convId, myKey, lastSeq);
for (const msg of newMessages) {
  if (msg.kind === 'steer'   && msg.target_key === myKey) enqueueResume(msg.body.instruction);
  if (msg.kind === 'verdict' && msg.target_key === myKey) enqueueResume(formatVerdict(msg));
  if (msg.kind === 'system.done') terminate(msg);
  if (msg.kind === 'system.redirect' && msg.target_key === myKey) enqueueResume(msg.body.instruction);
}
client.advanceSubscription(convId, myKey, lastSeqOfBatch);
```

`steer.pipe` becomes a **shim**: writing to it produces a `kind=steer, target=me` message. One source of truth (the DB), one read path.

### 5.6 Topologies

| Topology | Turn selection | Use case |
| --- | --- | --- |
| `turns` | Coordinator/runtime picks next in declared order | Phased nodes, reviewer-after-executor |
| `reactive` | Last poster's `target_key` wakes; otherwise judge picks | Pair conversations, debugger↔test-runner |
| `freeform` | Every member evaluates `should_i_respond?` cheaply each tick | Self-managed nodes, brainstorming |

`freeform` requires per-author cooldown (no N turns in a row) and per-member turn cap to prevent runaway loops.

### 5.7 Stop Conditions

Declared as a list; first to fire wins.

| Condition | Trigger |
| --- | --- |
| `judge.done` | Judge posts `system.done` |
| `consensus:N` | N matching `verdict=PASS` from distinct authors |
| `budget:tokens=T` | Aggregate token usage across participants exceeds T |
| `budget:turns=N` | Total turn count reaches N |
| `idle:K` | K consecutive ticks without a `turn`/`finding`/`verdict` |
| `manual` | User runs `sp conv close <id>` |

Runtime evaluates after every message write; on trigger, writes `system.done` and marks conversation `closed`.

## 6. Spec Schema (`.specialist.json` addition)

```json
{
  "name": "executor",
  "permission": "MEDIUM",
  "conversation": {
    "subscribes": ["steer:me", "verdict:me", "finding:scope-overlap", "system.*"],
    "emits": ["turn", "ack", "escalation"],
    "wakes_on": ["verdict.PARTIAL", "verdict.FAIL", "system.redirect"],
    "turn_summary_max_chars": 500
  }
}
```

Reviewer:

```json
{
  "name": "reviewer",
  "conversation": {
    "subscribes": ["turn:peer", "system.*"],
    "emits": ["verdict", "finding"],
    "wakes_on": ["turn:peer"]
  }
}
```

Judge (node coordinator):

```json
{
  "name": "node-coordinator",
  "conversation": {
    "role": "judge",
    "subscribes": ["verdict", "finding", "proposal", "system.idle", "system.budget", "escalation"],
    "emits": ["system.continue", "system.done", "system.redirect", "system.swap"],
    "decision_schema": "judge.decision.v1"
  }
}
```

`decision_schema` enforces structured output:

```json
{
  "decision": "done | continue | redirect | swap | escalate",
  "reason": "string",
  "redirect": { "target_key": "string", "instruction": "string" } | null,
  "swap":     { "out": "string", "in": "string" } | null
}
```

Judge prose lives in its `specialist_results`. Only the structured decision becomes a `system.*` message.

## 7. Node Config Schema (additions)

```json
{
  "name": "self-managed-design-review",
  "conversation": {
    "topology": "freeform",
    "members": ["explorer", "debugger", "executor"],
    "judge": "node-coordinator",
    "stop_on": ["judge.done", "budget:turns=40", "idle:8"],
    "max_turns_per_member": 12
  },
  "completion_strategy": "manual"
}
```

Phased nodes (existing behavior) become a thin wrapper: `topology: turns` + per-phase member subsets. `wait-phase` and `spawn-member` remain as escape hatches but are no longer the primary mechanism.

## 8. CLI Surface

### 8.1 New commands

```bash
# Ad-hoc pair / multi-party conversation, no node config
sp talk executor reviewer --bead <id> --turns 6 --stop-on pass
sp talk debugger test-runner --bead <id> --topology reactive
sp talk a b c --judge node-coordinator --stop-on judge.done --topology freeform

# Inspect / participate
sp tail <conv-id> [-f] [--kind verdict,finding] [--jq '.body.severity']
sp say  <conv-id> "focus only on retry path"            # human posts steer
sp conv inject <conv-id> --as system --kind finding ... # synthetic message
sp conv pause  <conv-id> <participant>
sp conv resume <conv-id> <participant>
sp conv close  <conv-id> --reason "..."

# List
sp conv list [--node <id>] [--bead <id>] [--status open]
sp conv show <conv-id>
```

### 8.2 Existing commands (compat shims)

| Today | Tomorrow |
| --- | --- |
| `sp steer <job> "..."` | Writes `kind=steer, target=<job's participant key>` to the job's conversation, or per-job channel if standalone |
| `sp resume <job> "..."` | Same — semantically a steer |
| `sp node run <cfg>` | Opens a conversation per node config, attaches judge, runs |
| `sp epic merge <id>` | Unchanged; epics are merge identities, not conversations |

## 9. Self-Managed Node Flow

```
1. sp node run self-managed-design-review --bead <id>
2. Runtime opens conversation C, spawns members + judge.
3. Members run in `freeform` topology. Each subscribes per spec.
4. Member emits `turn` → peers with matching subscription wake.
5. Reviewer-style member emits `verdict=PARTIAL target=executor`.
6. Executor (waiting + keep-alive) wakes from C, applies fixes, posts new `turn`.
7. Eventually a member emits `proposal=terminate`. Quorum requires M acks.
8. On quorum, judge wakes, evaluates, posts:
     {decision: done, reason: "..."}  → system.done → conversation closed
   or
     {decision: redirect, redirect: {target: executor, instruction: "..."}}
9. On idle:8, judge wakes for nudge / swap / done ladder.
10. Conversation closed → node merges per completion_strategy.
```

Coordinator is now a **gatekeeper**, not a router.

## 10. Permission & Safety

- A `kind=steer` from peer participant requires both jobs to share a worktree owner OR the steer specialist to declare `can_steer_peers: true` in its spec.
- `--force-job` semantics are preserved at the conversation router: a MEDIUM peer cannot steer a running MEDIUM job in another worktree without it.
- Judge cannot directly write files; it can only emit `system.*` messages. Worktree edits stay with edit-capable specialists.
- Message body size cap (e.g. 8 KB) enforced on write; oversized payloads must be referenced via `refs.result_id`.
- Rate limit: per-participant token bucket on message writes (matches agentpipe's pattern). Default 1 message / 2s per participant.

## 11. Sequenced Implementation (v0 → v3)

Each version is independently shippable, reversible, and pays its own way. **Do not move to vN+1 until vN has shipped and proven value on real workflows.** Earlier versions never block on later ones.

### Design invariants across all versions

These hold from v0 forward and constrain every later version:

- **Storage model:** `id INTEGER PRIMARY KEY AUTOINCREMENT` is the cursor. No `MAX(seq)+1` allocation; no multi-writer race. SQLite gives us monotonic ids for free.
- **Delivery semantics:** at-least-once. Cursor advances *after* the resume payload is enqueued on the receiver. Receivers dedupe by `(workstream_id, msg_id)` in their job-local state.
- **Crash recovery:** a receiver that crashes mid-resume re-reads from `last_seen_id` on restart. Duplicates are the receiver's problem, not the substrate's.
- **DB churn safety:** mailbox messages are *not* prune candidates while their workstream is open. Pruning rules in `observability-sqlite.ts` must exclude `workstream_messages` whose `workstream_id` is in `open` status.
- **Worktree isolation preserved:** lateral steer between MEDIUM jobs requires either shared worktree owner OR explicit `can_steer_peers: true` in the sender's spec. Default is **off**.
- **Message body cap:** 8 KB. Larger payloads must reference `specialist_results` via `refs.result_id`.
- **Spec is forward-compatible:** the `mailbox` block on a `.specialist.json` is the same shape from v0 to v3. Fields are added, never renamed or repurposed.
- **Single scheduler per workstream kind.** Pair-talk workstreams: the runner's mailbox read enqueues resumes directly. Node workstreams: the runner's mailbox read enqueues *intent* into a supervisor inbox; `node-supervisor` is the sole scheduler that decides whether and when to actually resume a member. Members never wake from a mailbox bypass while inside a node. This invariant prevents the v2 split-brain risk identified on bead `unitAI-jzhim`.

### v0 — Substrate + Spec (Mailbox)

**Goal:** Reviewer can autonomously wake an executor. Human can steer a workstream without knowing the job id. No orchestrator round-trip.

**What ships:**

1. One new table: `workstream_messages` (see §5.1, but only this table — not `conversations` or `conversation_subscriptions` yet).
   ```sql
   CREATE TABLE workstream_messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     workstream_id TEXT NOT NULL,
     target_job_id TEXT,                -- null = broadcast
     author_kind TEXT NOT NULL,         -- 'specialist' | 'user' | 'system'
     author_job_id TEXT,
     kind TEXT NOT NULL,                -- 'verdict' | 'finding' | 'steer' | 'done' | 'note'
     body_json TEXT NOT NULL,
     refs_json TEXT,
     ts INTEGER NOT NULL
   );
   CREATE INDEX idx_workstream_messages_target
     ON workstream_messages(workstream_id, target_job_id, id);
   ```
2. `MailboxClient` in `src/specialist/` with `post / readSince / markSeen`. Discriminated-union validator for the 5 kinds.
3. `.specialist.json` gains the `mailbox` block — see §6. Subscription expressions parsed but only `kind:me` and `kind:*` filters resolved in v0. Richer filters (`finding:scope-overlap`) parse but no-op until v2.
4. Runner waiting loop adds one read per tick: `client.readMailboxSince(workstreamId, jobId, lastSeenId)`. Messages addressed to the job become resume payloads.
5. Reviewer specialist updated to emit a `verdict` message on completion (alongside its existing `result.txt`). Findings dual-write to both `node_memory` (current path) and as `kind=finding` messages.
6. CLI: `sp say <workstream> "..."`, `sp tail <workstream> [-f]`, `sp mailbox post --workstream <id> --target <job> --kind <k> --body <json>`.

**What does NOT ship in v0:**

- No `conversations` table. Workstream id is just a string (chain id, node id, or a fresh `pair-<uuid>`).
- No subscriptions table. Receivers query by `target_job_id` directly.
- No topology, no judge, no freeform.
- No `node_memory` derivation.
- No node-supervisor changes.
- No `steer.pipe` migration. Both paths coexist.

**Acceptance:**

- Reviewer↔executor loop runs end-to-end with no human `sp resume`.
- `sp say <workstream>` reaches a waiting executor and resumes it.
- Existing nodes, epics, chains, `sp steer`, `sp resume` continue to work unchanged.
- `npm run lint`, `npx tsc --noEmit`, mailbox unit tests pass.

### v0.5 — Workflow Validation (no code changes to substrate)

**Goal:** Prove the mailbox is useful across more than one workflow before adding any complexity.

**What ships:**

- 3–4 real workflow trials documented in `docs/design/conversations-v0-trials.md`:
  1. Reviewer↔executor (the canonical case).
  2. Debugger↔test-runner — debugger posts `finding`, test-runner posts `verdict`.
  3. Human-steered explorer — `sp say` redirects an exploring specialist mid-flight.
  4. Parallel-review consensus — two reviewers post verdicts; a synthesizer reads both via `sp tail --kind verdict`.
- Each trial captures: did the loop converge, how many manual interventions were avoided, what spec/CLI rough edges showed up.

**Decision gate:** if 2+ trials show clear win, proceed to v1. Otherwise revise v0 or stop.

### v1 — Pair-Talk CLI + Steer Shim

**Goal:** Make ad-hoc multi-specialist conversations a first-class CLI primitive. Unify the steer paths.

**What ships:**

1. `sp talk <specialist-a> <specialist-b> --bead <id> [--turns N] [--stop-on pass]` — opens a fresh workstream, spawns both jobs into it, wires their mailbox subscriptions per their spec, streams.
2. `sp talk a b c [...]` — N-way pair-talk, no judge yet. Turn order is `reactive`: last poster's `target_key` wakes; if no target, runtime falls back to round-robin.
3. `steer.pipe` becomes a thin shim: writing to it produces a `kind=steer, target_job_id=<self>` message in a per-job workstream. Runner reads only the mailbox cursor; `steer.pipe` is preserved as a resilient fallback for when the DB is unreachable.
4. `sp steer` and `sp resume` reimplemented on top of `MailboxClient.post()`. CLI surface unchanged.
5. Mailbox subscription resolver gains real filters: `finding:scope-overlap` resolves against the job's declared scope.

**What does NOT ship in v1:**

- Still no judge, no freeform, no node-supervisor changes.
- `node_memory` still primary; findings still dual-write.

**Acceptance:**

- `sp talk executor reviewer --bead X --stop-on pass` produces a complete back-and-forth.
- `sp steer` and `sp resume` behave identically to v0 from the user's perspective; under the hood they go through the mailbox.
- DB-unreachable test: kill the DB, `steer.pipe` still works as fallback.

### v2 — Node Lateral Wakeups + Read-Only Judge

**Goal:** Bring lateral messaging *into* nodes without dismantling node-supervisor's phase machinery.

**What ships:**

1. `node-supervisor` opens a workstream on `node run`, registers each member's job_id with the mailbox, and exposes a **supervisor inbox** that receives intent from mailbox reads.
2. Members can post `verdict` / `finding` / `steer` / `note` to peers **within the same phase**. Cross-phase steer requires coordinator approval (posted as `kind=steer` from the coordinator job).
3. **Single scheduler enforcement (hard rule):** inside a node workstream, a mailbox message addressed to a member does **not** directly wake that member. The runner reads the message, validates the sender, and posts intent into the supervisor inbox. `node-supervisor` is the sole authority that converts intent into an actual resume — respecting current phase, in-flight resumes, and member status. This collapses the dual-control-plane risk back to one brain.
4. Coordinator gains a **read-only judge mode**: subscribes to `verdict`, `finding`, `proposal`. Can post `system.done` (close workstream → trigger node completion) or `system.redirect` (post intent that supervisor serializes into a resume). Cannot swap members. Cannot kill jobs. Judge writes never bypass the supervisor.
5. `wait-phase` still drives barriers. Phases still exist. The mailbox is *additive* — members can talk laterally inside a phase via supervisor-serialized resumes; coordinator still gates between phases.
6. Node config gains an optional `mailbox` block:
   ```json
   "mailbox": {
     "enabled": true,
     "judge_mode": "readonly",
     "stop_on": ["judge.done", "phase.complete", "budget:turns=40"]
   }
   ```
7. New canonical node configs: `pair-review.node.json`, `lateral-debug.node.json`.

**What does NOT ship in v2:**

- No freeform topology. Phase-driven turns remain default.
- No `system.swap`. Coordinator can't replace members.
- No derived `node_memory`. Findings still dual-write.

**Acceptance:**

- A node with two reviewers in the same phase can converge on a verdict via mailbox without coordinator intervention.
- A coordinator running in judge mode can terminate a node early via `system.done`.
- `node-supervisor` line count does not grow significantly (additive, not rewrite).
- Existing nodes work unchanged when `mailbox.enabled` is omitted.

### v3 — Full Conversation Engine (only if v2 proves out)

**Goal:** Reach the original design's vision — self-managed nodes, freeform topology, derived memory.

**What ships (only if measurements from v2 justify it):**

1. Promote `workstream_messages` schema toward the full §5.1 design: add `conversations` and `conversation_subscriptions` tables for richer lifecycle and replay.
2. `freeform` topology: members self-elect each tick via cheap "should I respond?" probe.
3. Active judge mode: coordinator can post `system.swap` (replace a member), with explicit safety gates from §10.
4. `node_memory` becomes a derived view over `kind=finding` messages, with a backfill migration.
5. New stop conditions: `consensus:N`, `idle:K`, `budget:tokens=T`.
6. Per-participant token-bucket rate limits on message writes.
7. `using-specialists-v2` skill rewritten to teach mailbox-first patterns; orchestrator-mediated review marked legacy.

**Pre-conditions for starting v3:**

- v2 has been in use for ≥2 weeks across ≥3 distinct workflows.
- Measured outcome: (a) human `sp resume` count per chain dropped substantially, (b) no new class of race or oscillation bug attributable to mailbox, (c) `node-supervisor` either shrunk or held steady.
- If any pre-condition fails, v3 is shelved indefinitely. v2 is a stable equilibrium.

### Reversal plan

Each version can be disabled without breaking earlier ones:

- v0: drop the table, remove the spec block, remove the runner read. No data loss elsewhere.
- v1: revert `sp talk` and the steer shim; `steer.pipe` direct path still works.
- v2: set `mailbox.enabled: false` per node; lateral messaging is silently no-op.
- v3: stop writing to `conversations` table; revert `node_memory` to direct writes (backfill is one-way, plan migration carefully).

### Out of scope across all versions

- Cross-workstream messaging (epic-level coordinator watching N chain workstreams). Deferred indefinitely.
- Multi-user identity in messages. Single `user` author key.
- Bidirectional integration with external systems (Slack, GitHub comments). The mailbox stays internal.

## 12. Open Questions

1. **Conversation per node, or conversation per chain inside an epic?** Leaning per-node for self-managed; per-chain for traditional executor→reviewer. Allow both via `kind` field.
2. **Verdict targeting when reviewer reviews multiple executors?** Either multi-target (`target_keys: []`) or one verdict message per target. Prefer the latter for replay clarity.
3. **Should `system.swap` actually kill the outgoing job, or just unsubscribe it?** Default: unsubscribe + mark waiting; let user `sp stop` if needed. Less destructive.
4. **Cross-conversation references** (epic-level coordinator watching multiple chain conversations)? Possible via `epic-channel` kind, deferred to v2.
5. **User identity in messages** — single `user` key, or per-CLI-invocation? Single for now; revisit if multi-user becomes real.
6. **Judge model selection** — does the judge run a full specialist turn for every wake, or a lightweight classifier? Lightweight first (cheap call returning the decision schema); full turn behind a flag.

## 13. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Runaway freeform loops | Per-member turn cap, idle escalation ladder, total budget stop |
| DB write contention | Pointer-only messages, batched writes per turn, per-participant rate limit |
| Context bloat from over-broad subscriptions | Conservative default subscription, schema-validated `subscribes` field, lint warning on `*` |
| Lateral steer abuse between MEDIUM jobs | Permission gate at router, `--force-job` reuse, per-spec `can_steer_peers` opt-in |
| Migration breakage of nodes/epics | Phased rollout, compat shim for `steer.pipe`, existing CLI surface preserved |
| Judge becoming a bottleneck | Wake-on filters narrow; lightweight decision call; quorum gating reduces wake frequency |

## 14. Success Criteria (per version)

**v0 — Substrate:**
- Reviewer↔executor loop runs end-to-end with zero human `sp resume`.
- `sp say <workstream>` reaches a waiting executor.
- All existing nodes / epics / chains pass unchanged.
- `npm run lint`, `npx tsc --noEmit` clean. Mailbox unit tests cover post / readSince / dedupe / crash-recovery.

**v0.5 — Workflow validation:**
- ≥2 of 4 documented trials show measurable reduction in manual orchestrator interventions.
- No new class of bug attributable to the mailbox after the trial period.

**v1 — Pair-talk + steer shim:**
- `sp talk a b --bead X --stop-on pass` works for any two compatible specialists with no node config.
- `sp steer` / `sp resume` user-visible behavior unchanged; `steer.pipe` fallback still works when DB is unreachable.
- Subscription filters (`finding:scope-overlap`) resolve correctly.

**v2 — Node lateral wakeups + read-only judge:**
- A node with two reviewers in the same phase converges via mailbox without coordinator manual intervention.
- Coordinator in `judge_mode: readonly` can terminate a node early via `system.done`.
- **Single-scheduler invariant verified by test:** no resume of a node member ever bypasses `node-supervisor`. A direct mailbox→runner wake inside a node workstream is a test failure.
- `node-supervisor` source line count holds steady or drops; phase machinery untouched.
- Nodes with `mailbox.enabled` omitted behave identically to today.

**v3 — Full engine (gated on v2 outcomes):**
- Self-managed node terminates correctly on `judge.done`, `idle:K`, and `budget` in tests.
- `node_memory` derivation passes a one-week shadow-write comparison before cutover.
- No oscillation observed in freeform topology with 3+ members under standard cooldowns.
- `sp tail <conv> --jq '.body.severity'` lets a human grep across a workstream.
