# Shepherd: Always-On Context Injection for Specialists

> Status: Design draft (sequenced v0 → v2)
> Scope: Add a small, always-on sidecar that watches a specialist's feed and forces relevant memories, paths, and scope reminders into the next turn. Default-on, opt-out only for specialists that should wander.
> Non-goal: Replace the orchestrator, the reviewer, the mailbox, or the runner. Shepherd is decoration *forced* into prompts; it does not author work and does not schedule.
> Companion design: [conversations.md](./conversations.md). Shepherd dual-writes hints to the mailbox as `kind=hint` for observability, but its behavioral channel is the forced prompt block.

## 1. Problem

Specialists today run unsupervised between `started` and `done`/`waiting`:

- Nobody checks for scope drift mid-run. Out-of-scope edits surface only when the human reads the feed.
- Memories (`bd memories`, `bd recall`) and prior-incident knowledge are *available* but never consulted unless the prompt explicitly told the specialist to.
- Code-intelligence resources (file:line pointers, GitNexus impact, related-symbol graphs) live one tool call away but are never spontaneously suggested.
- The "aha, I've seen this before" layer that humans rely on does not exist for specialists.

Empirical pattern: opt-in context channels die. AI agents will not voluntarily use a "you may consult X" mechanism. Context that is not *forced* into the prompt is context that does not exist.

## 2. Goals

1. Always-on by default. Specialists do not choose to consult the shepherd; the shepherd consults the specialist.
2. Force injection into the next turn via the same mechanism the project already trusts (PostToolUse-style hook stdout, like quality gates).
3. Cheap to free in steady state — Layer 1 is deterministic rules, Layer 2 uses free-tier hosted models with a local fallback.
4. Severity-tiered: `info` (one-shot), `warning` (cooldown), `blocker` (sticky until acked).
5. Suppression by default to prevent spam: dedupe by hint hash, per-pattern cooldown, per-job hint cap.
6. Auditable: every hint dual-writes to the mailbox so `sp tail` and `sp shepherd hints <job>` show what the specialist was told.
7. Single-scheduler invariant preserved — shepherd touches *prompt content*, never resume scheduling. Mailbox copy is read-only audit, not a control channel.

## 3. Non-Goals

- Authoring code or making decisions. Shepherd suggests; specialist acts.
- Terminating or steering jobs. Steering remains a mailbox `kind=steer` from the user, reviewer, or coordinator.
- Replacing the reviewer. Shepherd is per-tool-call decoration; reviewer is end-of-turn judgment.
- Calling expensive models. Haiku-tier and above are out of scope; the shepherd should be cheaper than the specialist it watches by at least an order of magnitude.

## 4. Concepts

| Concept | Definition |
| --- | --- |
| Shepherd | Sidecar process or hook bound to a specialist job. Tails events, emits hints. |
| Hint | Structured suggestion (memory, path, scope reminder, warning) injected into the next prompt turn. |
| Severity | `info` \| `warning` \| `blocker`. Controls suppression and stickiness. |
| Layer 1 | Deterministic rule matchers in TypeScript. Free, fast, runs every event. |
| Layer 2 | Small free-tier LLM. Called only when Layer 1 is quiet and the job has gone N events without a hint. |
| Forced injection | Hint block prepended to the next turn's prompt. Specialist cannot collapse or skip it. |
| Hint pane | The fenced `<shepherd>...</shepherd>` block in the prompt. |
| Ack | Structured tool call from the specialist clearing a sticky `blocker` hint. |

## 5. Architecture

### 5.1 Where shepherd runs

Shepherd is a **PostToolUse-style hook on the runner**. It receives the most recent tool call + result + the running event tail, evaluates Layer 1 matchers, optionally invokes Layer 2, and emits a hint block on stdout. The runner's prompt-construction step prepends pending hints to the next turn — same surface as ESLint output and GitNexus impact warnings today.

This placement is intentional:
- No new scheduler. No new IPC.
- Reuses the prompt-injection mechanism specialists already obey.
- Single-scheduler invariant from `conversations.md` is automatically preserved (shepherd never resumes, never wakes anyone).

### 5.2 Two-layer model

**Layer 1 — Deterministic matchers (free, runs every tool call):**

Pure TypeScript rules in `src/specialist/shepherd/matchers/*.ts`. Each matcher is a pure function:

```ts
type Matcher = (event: ToolEvent, ctx: JobCtx) => Hint | null;
```

Initial matcher set:

| Matcher | Triggers | Hint |
| --- | --- | --- |
| `scope-drift` | Edit/Write outside bead `SCOPE` glob | `severity=blocker, type=scope, summary, refs` |
| `repeat-mistake` | Tool error message keyword hits `bd memories <kw>` | `severity=warning, type=memory, refs={memory_keys}` |
| `relevant-memory` | File path / symbol / dir name from a recent event hits FTS5 query against `memories_cache` (score > threshold) | `severity=info, type=memory, refs={memory_keys}` |
| `tool-pattern` | Recognized file/area pattern (e.g. `Edit src/cli/node.ts`) | `severity=info, type=path, refs` |
| `gitnexus-impact` | Edit on a high-impact symbol per cached impact data | `severity=warning, type=impact, refs` |
| `budget-threshold` | Token usage crosses 50% / 70% / 85% | `severity=info \| warning, type=budget` |
| `forbidden-action` | Detect destructive command (rm -rf, force push, schema drop) | `severity=blocker, type=safety` |
| `stale-claim` | Edit while bead is closed or unclaimed | `severity=blocker, type=workflow` |

These cover most of what the user described ("inject memories", "inject paths", "remind about scope"). Layer 1 must produce no false negatives at `severity=blocker` (a missed scope drift is a real failure); false positives at `info` are tolerable.

**Layer 2 — Small free-tier model (called only when needed):**

Triggered when:
- Layer 1 has produced no hint for K consecutive events (default K=8), AND
- Job has been quiet enough that an associative thought might help (no recent ack/hint), AND
- Per-job hint budget not exhausted.

Single prompt: "Given the last N events from this specialist, name one missing piece of context worth injecting. Output strict JSON or `none`."

```json
{
  "hint": "string | null",
  "type": "memory | path | pattern | reminder",
  "refs": ["file:line", "memory_key", "bead_id", ...],
  "confidence": "low | med | high"
}
```

Hard rules:
- `refs` required; hints without refs are dropped.
- `confidence < med` is dropped.
- `severity` is always `info` for Layer 2 (never blocker; deterministic-only).
- Output that fails schema validation is dropped silently.

Model chain (first available wins):
1. Groq-hosted small model (Llama-3.1-8B / Minimax-mini)
2. Nvidia NIM free tier
3. Local Ollama (llama-3.1-8b / qwen-2.5-7b)
4. Skip Layer 2 entirely (degrade to Layer-1-only)

Steady-state cost target: **$0**. Layer 2 is opportunistic, not load-bearing.

### 5.3 Forced injection format

Every turn after a tool call, the runner checks for pending hints and prepends:

```
<shepherd>
[BLOCKER · scope] You edited src/billing/foo.ts but bead unitAI-xxxx
                  scope is src/auth/*. Confirm intentional or revert
                  before next edit. Ack with: shepherd_ack(["scope-drift"]).
[WARNING · memory] auth-redis-failover-2026-03 — last incident notes
                   for this pattern. Run: bd recall auth-redis-failover-2026-03
[INFO    · path]   node-supervisor.ts:1849-1878 has wait-phase correlation
                   logic; you may be re-deriving it.
</shepherd>
```

Specialist cannot collapse, scroll past, or opt out. Same surface as gates.

## 6. Hint Schema

```json
{
  "id": "string",                // hash(matcher_id + canonical_subject)
  "matcher_id": "scope-drift | repeat-mistake | tool-pattern | ...",
  "severity": "info | warning | blocker",
  "type": "scope | memory | path | impact | budget | safety | workflow | pattern | reminder",
  "summary": "string (<= 240 chars)",
  "refs": {
    "files": ["path:line", ...],
    "memory_keys": [...],
    "bead_ids": [...],
    "tool_ids": [...]
  },
  "ack_required": "boolean",
  "ts": "INTEGER"
}
```

Storage: dual-write.
- Forced injection: in-memory pending list per job, persisted to `.specialists/jobs/<job-id>/hints.json` for crash recovery.
- Audit copy: `mailbox` `kind=hint` row in `workstream_messages` (see conversations.md §11 v0).

## 7. Suppression Rules

Forced ≠ spammed. Without suppression, the same hint fires every turn and becomes noise.

| Rule | Default |
| --- | --- |
| Dedupe by `hint.id` | A hint with the same id is never injected twice in the same job |
| Per-pattern cooldown | `scope-drift`: 5 events. `repeat-mistake`: 10 events. `tool-pattern`: 20 events. |
| Per-job hint cap | 20 hints across the entire job (configurable) |
| Per-severity behavior | `info`: inject once, then silenced. `warning`: inject per cooldown. `blocker`: inject every turn until acked. |
| Layer 2 quiet window | Layer 2 will not fire within 30s of any other hint |
| Manual clear | `sp shepherd clear <job> [--id <hint-id>]` removes pending hints |

### Acknowledgment

A new tool exposed to specialists in `tools/shepherd_ack.tool.ts`:

```ts
shepherd_ack(["scope-drift", "stale-claim"])
```

Calling this clears the named blockers from the pending list and writes a `kind=hint-ack` message to the mailbox. The specialist must call it explicitly — not implicitly satisfied by changing behavior. This makes ack a structured event the human can audit.

If a blocker is unacked for K turns (default 3), shepherd posts `kind=escalation` to the mailbox so the human or coordinator notices. (In a node, escalation routes through the supervisor inbox per the single-scheduler invariant.)

## 8. Spec Schema (`.specialist.json` addition)

Default behavior is **always-on**. Spec exists only to opt out or tune.

```json
{
  "name": "executor",
  "shepherd": {
    "enabled": true,
    "matchers_enabled": ["scope-drift", "repeat-mistake", "tool-pattern", "gitnexus-impact", "budget-threshold", "forbidden-action", "stale-claim"],
    "matchers_disabled": [],
    "layer2": {
      "enabled": true,
      "model_chain": ["groq-llama-3.1-8b", "nvidia-nim-small", "local-ollama"],
      "max_calls_per_job": 6
    },
    "max_hints_per_job": 20,
    "min_seconds_between_hints": 15
  }
}
```

Specialists with `shepherd: false` opt out entirely:

```json
{ "name": "explorer", "shepherd": false }
{ "name": "researcher", "shepherd": false }
```

Defaults shipped with project:
- ON: `executor`, `debugger`, `test-runner`, `sync-docs`, `node-coordinator`, `parallel-review` members
- OFF: `explorer`, `researcher` (they are *supposed* to wander)
- Recursive guard: shepherd jobs themselves never get a shepherd. Hard rule, not configurable.

## 9. CLI Surface

```bash
# Inspection
sp shepherd hints <job-id>           # list hints injected so far
sp shepherd hints <job-id> --pending # only currently-pending blockers
sp shepherd matchers                 # list registered matchers
sp shepherd matchers --explain <id>  # show what a matcher does

# Operator overrides
sp shepherd clear <job-id>                      # clear all pending hints
sp shepherd clear <job-id> --id <hint-id>       # clear a specific hint
sp shepherd disable <job-id> --matcher <id>     # disable a matcher mid-run
sp shepherd inject <job-id> --severity warning --summary "..." --refs ...

# Diagnostics
sp shepherd stats <job-id>           # hint counts per matcher, layer2 calls, dropped
sp shepherd doctor                   # check model chain availability, matcher registry
```

`sp tail <workstream>` already shows mailbox messages including `kind=hint`, so cross-job hint visibility is free.

## 10. Permission & Safety

- Shepherd never edits files. Hint generation is read-only.
- Layer 2 model calls are sandboxed — no tool use, no file access, single-shot completion only.
- `forbidden-action` matcher cannot prevent a destructive command itself (the specialist still has the tool); it injects a `blocker` hint that surfaces immediately. Hard prevention belongs in PreToolUse hooks, not shepherd.
- Shepherd's mailbox writes are tagged with `author_kind=shepherd` so they're distinguishable from specialist or user authors.
- Per the single-scheduler invariant: a shepherd hint can never wake a job. It can only annotate the next turn the runner already constructs.
- Recursion guard: `shepherd-for-shepherd` is forbidden at the runner level, not just by spec convention.

## 11. Sequenced Implementation (v0 → v2)

Same philosophy as `conversations.md`: each version shippable, reversible, pays its own way.

### Design invariants across all versions

- **Always-on by default.** Opt-out is per-spec, never per-run.
- **Forced injection.** Hints prepend to the next prompt turn; specialist cannot suppress them.
- **Suppression to prevent spam.** Dedupe + cooldown + cap from day one.
- **Audit dual-write.** Every hint also lands in the mailbox as `kind=hint`.
- **Cost ceiling.** Steady-state $0. Layer 2 is best-effort, not required.
- **No scheduling.** Shepherd never resumes, wakes, or steers.
- **Recursive guard.** Shepherd jobs never get a shepherd.

### v0 — Layer 1 only (deterministic, ships standalone)

**Goal:** Force scope-drift, repeat-mistake, and tool-pattern hints into every executor / debugger / test-runner / sync-docs run, with no model spend.

**What ships:**
1. `src/specialist/shepherd/` module: matcher registry, hint store, suppression engine.
2. PostToolUse hook integration in the runner: after each tool result, run all enabled matchers, store hints, prepend pending block to next prompt.
3. Initial matcher set: `scope-drift`, `repeat-mistake`, `relevant-memory`, `tool-pattern`, `budget-threshold`, `forbidden-action`, `stale-claim`. (`gitnexus-impact` deferred to v1 because it needs cached impact data.) The `relevant-memory` matcher reuses the existing FTS5 `memories_cache` infrastructure already used at session start; mid-run it queries on tokens extracted from the most recent event (file basenames, parent dirs, symbol names from edits) with a configurable score threshold and per-memory-key cooldown.
4. `shepherd_ack` tool exposed to specialists.
5. Persistence: `.specialists/jobs/<job-id>/hints.json` for crash recovery.
6. CLI: `sp shepherd hints`, `sp shepherd clear`, `sp shepherd matchers`, `sp shepherd doctor`.
7. Defaults applied: opt-in ON for executor/debugger/test-runner/sync-docs/node-coordinator; OFF for explorer/researcher.

**What does NOT ship in v0:**
- No Layer 2 model.
- No mailbox dual-write (mailbox table doesn't exist yet — see conversations.md v0).
- No `gitnexus-impact` matcher (needs cached graph data integration).
- No node-supervisor integration (works the same in or out of nodes — hints are per-job).

**Acceptance:**
- An executor that edits outside bead `SCOPE` sees a sticky `BLOCKER · scope` hint until it acks or reverts.
- A debugger that hits an error matching a stored memory key gets the memory injected within one turn.
- An executor editing a file whose path/symbol matches a stored memory (FTS5 hit on `memories_cache`) sees a `INFO · memory` hint pointing at the memory key, without exhausting per-job hint cap on repeated edits to the same area.
- An executor crossing 70% token usage sees a `WARNING · budget` hint.
- Specialists with `shepherd: false` see zero injection.
- All quality gates and existing hooks continue to pass.

### v0.5 — Mailbox dual-write (lands when conversations v0 is in)

**Goal:** Make hints observable across the whole workstream via `sp tail`.

**What ships:**
1. Shepherd writes each hint as `kind=hint` to `workstream_messages` (see conversations.md §11 v0).
2. `author_kind=shepherd` distinguishes them from specialist/user/system authors.
3. `sp tail <workstream> --kind hint` filters to shepherd activity across the workstream.
4. `sp shepherd hints <job-id>` reads from the mailbox copy when available, falls back to `hints.json` otherwise.

No new behavior. Pure observability bridge between shepherd (v0) and mailbox (conversations v0).

### v1 — Layer 2 small-model fallback + gitnexus-impact matcher

**Goal:** Catch the patterns Layer 1 missed in v0 with a free-tier model. Add high-value matchers that need external integration.

**What ships:**
1. Layer 2 invocation logic with the model chain (Groq → Nvidia → local Ollama → skip).
2. Strict JSON schema validator for Layer 2 output; refless or low-confidence hints dropped.
3. `gitnexus-impact` matcher: on edit of a tracked symbol, inject impact summary as `severity=warning`.
4. Layer 2 quiet window + per-job call cap enforcement.
5. `sp shepherd stats` reports Layer 2 calls, dropped hints, and dollar cost (should always be zero).
6. Spec block `shepherd.layer2.enabled` and `model_chain` honored.

**Pre-conditions for starting v1:**
- v0 has been in use for ≥1 week across real executor/debugger runs.
- Logs show concrete patterns Layer 1 misses (justifying the model spend even at $0).
- Free-tier API access verified for at least one provider.

**Acceptance:**
- Layer 2 fires only when Layer 1 is quiet for K events.
- Layer 2 produces a hint with valid `refs` ≥X% of the time across a sample week.
- Cost stays at $0 in steady state. Local fallback works when network is offline.

### v2 — Node-aware escalation + matcher SDK

**Goal:** Make shepherd a first-class participant in the multi-specialist system without violating the single-scheduler invariant.

**What ships:**
1. Inside a node workstream, blocker escalations route through the supervisor inbox (per conversations.md v2 invariant), not directly to the coordinator.
2. Node config can override matcher defaults per-member (e.g. enable `gitnexus-impact` only for the implementation member).
3. Matcher SDK: documented API for project-specific matchers loaded from `config/shepherd/matchers/*.ts`.
4. Pattern library: shipped matchers for common project failure modes (e.g. `forgot-bd-claim`, `editing-without-impact-check`, `untested-migration`).
5. Per-spec hint policy in `using-specialists-v2` skill so authors know when to opt out.

**Pre-conditions for starting v2:**
- conversations.md v2 (single-scheduler enforcement) has shipped.
- v0 + v1 metrics show measurable drift reduction.

### Reversal plan

- v0: remove the PostToolUse hook entry; shepherd module sits dormant. No data loss.
- v0.5: stop mailbox dual-write; reads fall back to `hints.json` automatically.
- v1: disable Layer 2 globally via env var `SHEPHERD_LAYER2=off`; Layer 1 keeps working.
- v2: project-specific matchers can be deleted; node escalation falls back to direct mailbox post.

### Out of scope across all versions

- Active intervention. Shepherd never edits files, never kills jobs, never authors work.
- Cross-job context. Each shepherd watches one job; no shared shepherd memory across jobs (the mailbox already provides that surface).
- Adaptive matchers (matchers that learn from past hints). Manual rule additions only — keeps behavior auditable.
- Replacing PreToolUse safety hooks. Shepherd warns; PreToolUse blocks.

## 12. Failure Modes & Mitigations

| Risk | Mitigation |
| --- | --- |
| Hint spam overwhelms specialist context | Dedupe by id, per-pattern cooldown, per-job cap, severity tiers |
| Layer 2 hallucinates non-existent files | Mandatory `refs`, schema validation, refless hints dropped |
| Shepherd misses a scope drift | Layer 1 must produce no false negatives at `severity=blocker`; backed by tests |
| Free-tier rate limit exhaustion | Provider chain with local Ollama fallback; degrade to Layer-1-only |
| Specialist ignores blocker forever | Auto-escalation to mailbox after K turns unacked |
| Shepherd-on-shepherd recursion | Hard guard at runner level, not just spec convention |
| Node coordinator floods on shepherd escalations | Escalations route through supervisor inbox, rate-limited |
| Matcher false positive interrupts good work | `info`-tier injection is one-shot; only `blocker` is sticky and `blocker` requires Layer 1 (deterministic) |

## 13. Open Questions

1. Should `bead.SCOPE` become structured (glob list) at bead-create time? Otherwise `scope-drift` matcher has to parse free text. Leaning yes — small change to `bd` schema, big leverage for shepherd correctness.
2. What's the right K (events of silence before Layer 2 fires)? Default 8, revisit after v1 metrics.
3. Should `shepherd_ack` accept a free-text reason that auto-writes to bead notes? Probably yes — preserves audit trail.
4. Is there a case for a user-only shepherd channel (`sp say --as-shepherd`) so the human can manually inject a sticky reminder? Defer to v2.
5. Do we want a "shadow shepherd" mode for new matchers — log what would have been injected without actually injecting? Useful for tuning. Defer to v1.

## 14. Success Criteria (per version)

**v0 — Deterministic shepherd:**
- Scope-drift caught and acked on real executor runs in ≥3 distinct chains.
- Zero shepherd-for-shepherd recursion incidents.
- No measurable runtime overhead per tool call (Layer 1 matchers must be <5ms total).
- Specialists with `shepherd: false` see zero hint injection.

**v0.5 — Mailbox dual-write:**
- `sp tail <workstream> --kind hint` produces complete shepherd activity timeline.
- `sp shepherd hints <job-id>` returns identical results from mailbox and `hints.json`.

**v1 — Layer 2 + gitnexus-impact:**
- Layer 2 produces a usable hint at least once per typical chain (anecdotal validation).
- 0 Layer 2 hallucinations slip through (every shipped hint has valid `refs`).
- Total Layer 2 cost across a week of normal use stays at $0.
- `gitnexus-impact` hint correlates with at least one prevented broken edit in the trial period.

**v2 — Node integration + matcher SDK:**
- A blocker hint inside a node escalates to the supervisor inbox within one tick.
- Project-specific matcher loaded from `config/shepherd/matchers/` fires correctly.
- `node-supervisor` source LOC unchanged.

## 15. Cross-Reference

- Mailbox storage and `kind=hint` schema: [conversations.md §5.1, §11 v0](./conversations.md).
- Single-scheduler invariant (shepherd MUST honor): [conversations.md §11 design invariants](./conversations.md).
- Critique trail behind sequenced approach (shepherd inherits same philosophy): bead `unitAI-jzhim` (closed).
