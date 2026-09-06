# Script-class Specialists

Use when a caller intentionally needs a bounded, synchronous, read-only LLM transform or
sidecar endpoint through current `sp script` / `sp serve`. This is an advanced reference
of `/using-specialists`, not a separate default capability.

Use script-class execution when the job is request/response shaped: structured variables
in, structured output out, no worktree, no file mutation, and no multi-turn supervision.

Before integration, inspect current help and the target specialist definition:

```bash
sp script --help
sp serve --help
specialists list --full
```

Do not freeze remembered flags or model names into long-lived automation. Pin the behavior
your caller depends on and verify it in a fresh process.

Switch back to the normal `/using-specialists` lifecycle when work needs a durable bead
contract, file writes/worktree, resume/steer behavior, independent review/test gates, or
multi-step implementation/debugging.

XTRM owns credentials, permissions, durable contracts, and system coordination. This
reference only explains when the script-class Specialists surface is appropriate.
