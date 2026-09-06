# NodeSupervisor coordination

Use only when an XTRM workflow explicitly selects the released `sp node` surface. This is
an advanced reference of `/using-specialists`; it is not the generic XTRM multi-agent
model and it does not imply that the future generic ChainRun runtime is released.

A node coordinator coordinates; member specialists perform the work. Derive current
commands and state from the live runtime:

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
Specialist jobs use the root `/using-specialists` lifecycle.
