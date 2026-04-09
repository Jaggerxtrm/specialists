---
title: pi/rpc Boundary
description: Canonical ownership boundary between pi/rpc protocol surfaces and Specialists runtime adaptation.
synced_at: a1e9f935
---

# pi/rpc Boundary

This document defines ownership boundaries so protocol changes stay in the right layer.

References:
- `docs/pi-rpc.md`
- `pi/rpc/rpc-types.ts`
- `pi/rpc/rpc-client.ts`
- `pi/rpc/rpc-mode.ts`
- `pi/rpc/jsonl.ts`
- `src/pi/session.ts`
- `src/specialist/supervisor.ts`
- `src/specialist/timeline-events.ts`

## 1) Canonical pi/rpc (source of truth)

Own this in `pi/rpc/*` and treat as canonical protocol contract:

- Command/response/event schema and names (`prompt`, `steer`, `follow_up`, `agent_end`, `message_update`, `tool_execution_*`, etc.)
- Wire-level command typing and response typing
- Extension UI sub-protocol (`extension_ui_request` / `extension_ui_response`)
- RPC mode command dispatch semantics (`rpc-mode.ts`)
- JSONL framing semantics (`jsonl.ts`): LF-delimited records, strict line splitting behavior
- Request/response correlation by `id`

If a behavior is documented in `docs/pi-rpc.md` and represented in `pi/rpc/*.ts`, Specialists should adapt to it, not redefine it.

## 2) Specialists-owned boundary (adapter + orchestration)

Own this in Specialists runtime code:

- `src/pi/session.ts` as adapter from canonical pi/rpc events into Specialists callbacks and lifecycle hooks
- Mapping raw pi event stream into Specialists event labels (`message_start_assistant`, `turn_start`, `tool_execution_start`, etc.)
- Runtime liveness/operational policy: stall watchdog, process lifecycle, kill/abort behavior, **test-aware stall timeout extension**
- Supervisor durability model (`status.json`, `events.jsonl`, `result.txt`) and job lifecycle decisions
- Specialists timeline abstraction in `src/specialist/timeline-events.ts`

Specialists may transform/aggregate events for its own APIs, but must not invent conflicting meanings for existing pi/rpc event names.

## 3) Transport-only concerns (non-semantic)

Transport-only concerns are implementation mechanics, not business semantics:

- stdin/stdout subprocess wiring
- JSONL encode/decode and buffering across chunk boundaries
- newline normalization (`\n`, optional trailing `\r` handling)
- request timeout handling and pending request maps
- low-level process termination mechanics

Changes here must preserve canonical protocol meaning; they should not alter runtime semantics defined by pi/rpc.

## 4) Practical decision rule

When deciding where a change belongs:

- **pi/rpc change** if it introduces/renames/removes protocol fields, commands, or event semantics.
- **Specialists change** if it changes orchestration, persistence, timeline modeling, or job lifecycle policy while consuming the same pi/rpc contract.
- **transport-only change** if it only affects framing, buffering, or subprocess I/O mechanics without semantic changes.

## 5) Specialists-owned stall detection

The stall timeout mechanism is entirely Specialists-owned:

- **Base timeout**: configured via `execution.stall_timeout_ms` in specialist YAML, passed to PiAgentSession
- **Test-aware extension**: PiAgentSession detects test command patterns (vitest, bun test, jest, pytest) and extends the stall window to 300s during tool execution
- **Session kills**: StallTimeoutError thrown by PiAgentSession when no activity is detected within the effective timeout
- **Supervisor staleness**: Separate mechanism (running_silence_warn_ms, waiting_stale_ms) that emits timeline events but does not kill the session

This distinction matters: pi/rpc provides the event stream, but Specialists determines when "no activity" becomes a timeout. The test-aware extension is a Specialists policy decision, not a protocol feature.

---

## 7) Specialists-owned Pi extensions

Specialists can inject Pi extensions at session spawn time for policy enforcement. These extensions live in `$TMPDIR/specialists-pi-extensions/` and are passed to Pi via `-e <path>` arguments.

**What's OK to inject:**

- Pre-tool-call hooks (`pi.on('tool_call', ...)`) — for write-boundary enforcement, tool filtering, argument validation
- Event listeners (`pi.on('message_update', ...)`, etc.) — for logging, metrics, custom event handling
- Post-tool-call hooks — for result filtering, error handling wrappers

**What's NOT OK:**

- Pi protocol changes — extension cannot modify the command/event schema, add new RPC commands, or change wire-level semantics
- Competing with Supervisor lifecycle — extension should not emit `run_complete` or alter job state
- Cross-session state — extension is per-session, cannot persist state across Pi invocations

The RPC boundary remains unchanged: Pi's command/response/event contract is identical whether or not extensions are injected. Extensions are a **policy layer**, not a protocol extension.

**Example: worktree write-boundary enforcement**

The primary use case is blocking write tools (`edit`, `write`, `multiEdit`, `notebookEdit`) from writing outside a declared worktree boundary. The extension:

1. Hooks `tool_call` events
2. Extracts `path`/`file_path` argument from tool input
3. Validates against the boundary (via `WORKTREE_BOUNDARY` env var)
4. Returns `{ block: true, reason: '...' }` for out-of-bounds paths

This enforcement happens entirely inside the Pi process — the Specialists Supervisor does not need to intercept or validate tool calls itself.

---

## 6) Invariants

- `pi/rpc/*.ts` remains the canonical protocol surface.
- `src/pi/session.ts` remains an adapter, not a competing protocol definition.
- Supervisor remains the durable source of run lifecycle state for Specialists.
- Any divergence from `docs/pi-rpc.md` must be treated as a bug or an explicit upstream protocol update.
