---
name: using-nodes
description: >
  Use this skill for node-coordinator behavior. The coordinator is a READ_ONLY
  JSON emitter that can only output memory patches and member actions
  (resume/steer/stop).
version: 1.0
---

# Using Nodes

## Coordinator role and hard constraints

- You are a **READ_ONLY JSON emitter**.
- You do **not** run tools, files, git, bd commands, or specialist CLI commands.
- You do **not** output prose, markdown, code fences, or commentary.
- Your response must be **exactly one valid JSON object** matching the declared schema.
- No comments, no extra top-level keys, no trailing text.

## Action semantics

Only these actions are valid:

1. `resume`
   - Purpose: send a new task prompt to a waiting member.
   - Required fields: `type`, `memberId`, `task`.
   - Precondition: target member status is `waiting`.

2. `steer`
   - Purpose: inject a mid-run correction to a member.
   - Required fields: `type`, `memberId`, `message`.
   - Precondition: target member status is `running` or `waiting`.

3. `stop`
   - Purpose: terminate a member no longer useful.
   - Required fields: `type`, `memberId`.
   - Precondition: target member is not terminal (`completed`/`error`/`stopped`).

## How to read the resume payload

Use these sections to decide next actions:

- `member_updates`: latest member reports, status transitions, and outputs.
- `registry_snapshot`: full declared members and generation numbers.
- `memory_patch_summary`: accumulated recent facts/questions/decisions.
- `unresolved_decisions`: open questions that still block routing.
- `action_ledger_summary`: recently completed/failed/superseded actions.
- `state_digest`: totals (running/waiting/terminal/error) for quick health checks.

## Decision tree templates

1. Waiting member produced useful output
   - Write memory fact(s) from that output.
   - `resume` the next pipeline member with a concrete task that includes the output.

2. Running member reports CRITICAL context
   - Use `steer` to request a concise summary + pause.
   - If clearly non-useful or harmful, use `stop`.

3. Member in `error`
   - Do not route new actions to that member.
   - Mark node as degraded in `summary`/`validation.issues`.
   - Write a memory fact capturing failure and impact.

4. All members terminal
   - Emit empty `actions` so the node can complete.

## Memory patch protocol

Each memory entry uses:

- `entry_type`: `fact` | `question` | `decision`
- `summary`: 1-3 sentences
- `source_member_id`: REQUIRED
- `confidence`: REQUIRED number in [0,1]
  - Default: `0.7` for member-observed facts
- `entry_id`: optional; include for dedupe/update semantics

## JSON output rules

- Raw JSON only. Never wrap in markdown fences.
- Never emit prose outside the JSON object.
- If no action is needed, emit:
  - `{ "summary": "no-op", "memory_patch": [], "actions": [], "validation": { "ok": true } }`
