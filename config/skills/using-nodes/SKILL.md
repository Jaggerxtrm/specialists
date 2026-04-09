---
name: using-nodes
description: >
  Use this skill for node-coordinator behavior. The coordinator is a READ_ONLY
  JSON emitter that declares node phases/actions while NodeSupervisor executes side effects.
version: 1.1
---

# Using Nodes

## Coordinator role and hard constraints

- You are a **READ_ONLY JSON emitter**.
- You do **not** run tools, files, git, bd commands, or specialist CLI commands.
- Output must be **exactly one valid JSON object** matching the declared schema.
- Keep responses declarative: phase/member intent + action intent only.

## Workflow guidance

1. Build explicit `phases` in execution order.
2. Keep parallel work in a phase disjoint by mutating scope paths.
3. Use `create_bead` only for discovered follow-up work.
4. Use `complete_node` only when completion gates are represented in `gate_results`.
5. For failing gates, either run a fix/re_review loop or set `force_draft_pr: true`.

<!-- node-contract:generated:start -->
## Generated node contract reference

### Phase kinds
- `explore`: Discovery and evidence gathering.
- `design`: Design options and decision framing.
- `impl`: Code/config implementation and edits.
- `review`: Structured quality or correctness review.
- `fix`: Apply corrections for review findings.
- `re_review`: Verification pass after fixes.
- `custom`: Project-specific phase with explicit intent.

### Actions
- `create_bead`
  - `type`: Literal action discriminator.
  - `title`: Bead title for created work item.
  - `description`: Detailed bead description.
  - `bead_type`: One of task|bug|feature|epic|chore|decision.
  - `priority`: Integer priority 0..4.
  - `parent_bead_id`: Optional parent bead link.
  - `depends_on`: Optional dependency bead ids.
- `complete_node`
  - `type`: Literal action discriminator.
  - `gate_results`: Quality gate statuses to attach to completion report.
  - `report_payload_ref`: Reference to external report payload.
  - `force_draft_pr`: Allow completion while gates fail by forcing draft PR intent.

### Completion strategies
- `pr`
- `manual`

### State machine
```json
{
  "states": [
    "created",
    "starting",
    "running",
    "waiting",
    "degraded",
    "awaiting_merge",
    "fixing_after_review",
    "failed",
    "error",
    "done",
    "stopped"
  ],
  "transitions": {
    "created": [
      "starting",
      "stopped"
    ],
    "starting": [
      "running",
      "error",
      "stopped"
    ],
    "running": [
      "waiting",
      "degraded",
      "awaiting_merge",
      "done",
      "error",
      "stopped",
      "failed"
    ],
    "waiting": [
      "running",
      "degraded",
      "awaiting_merge",
      "done",
      "error",
      "stopped",
      "failed"
    ],
    "degraded": [
      "running",
      "fixing_after_review",
      "failed",
      "error",
      "stopped"
    ],
    "awaiting_merge": [
      "done",
      "fixing_after_review",
      "failed",
      "error",
      "stopped"
    ],
    "fixing_after_review": [
      "awaiting_merge",
      "running",
      "failed",
      "error",
      "stopped"
    ],
    "failed": [],
    "error": [],
    "done": [],
    "stopped": []
  }
}
```
<!-- node-contract:generated:end -->
