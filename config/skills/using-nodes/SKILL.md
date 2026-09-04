---
name: using-nodes
description: >
  Optional NodeSupervisor coordination reference. Use when an XTRM workflow explicitly
  selects the released `sp node` surface and a coordinator must manage node members and
  phase barriers. Do not use as the default way to delegate ordinary work.
disable-model-invocation: true
---

# Using Nodes

NodeSupervisor is an advanced Specialists execution surface. It is not the generic XTRM
multi-agent model and it is not evidence that the future generic ChainRun runtime is
released.

A node coordinator coordinates; member specialists perform the work. The coordinator
must derive current commands and state from the live runtime:

```bash
sp node --help
sp ps --help
sp result --help
```

Keep these invariants:

- use the runtime-provided node identity, never a remembered ID;
- create explicit member scopes and phase boundaries;
- wait for the phase barrier before consuming member results;
- read persisted member results before synthesizing the next decision;
- keep retries bounded and surface terminal blockers;
- leave operator-only/destructive lifecycle decisions to the owning XTRM workflow.

For ordinary peer/subagent collaboration use `/multiplexing`. For normal tracked
Specialist jobs use `/using-specialists`. This skill exists only for workflows that
intentionally choose NodeSupervisor.