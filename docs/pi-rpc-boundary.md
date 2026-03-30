---
title: pi/rpc Boundary
description: Canonical ownership boundary between pi/rpc protocol surfaces and Specialists runtime adaptation.
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
- Runtime liveness/operational policy: stall watchdog, process lifecycle, kill/abort behavior
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

## 5) Invariants

- `pi/rpc/*.ts` remains the canonical protocol surface.
- `src/pi/session.ts` remains an adapter, not a competing protocol definition.
- Supervisor remains the durable source of run lifecycle state for Specialists.
- Any divergence from `docs/pi-rpc.md` must be treated as a bug or an explicit upstream protocol update.
