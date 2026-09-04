---
name: using-script-specialists
description: >
  Optional Specialists script-class reference for current `sp script` and `sp serve`
  request/response execution. Use only when a caller intentionally needs a bounded,
  synchronous, read-only LLM transform or sidecar endpoint. Do not use for tracked
  implementation, multi-turn work, review chains, or file-writing work.
disable-model-invocation: true
---

# Script-class Specialists

`sp script` and `sp serve` are advanced Specialists surfaces, not the normal XTRM work
path.

Use them when the job is intentionally request/response shaped: structured variables in,
structured output out, no worktree, no file mutation, no multi-turn supervision.

Before integration, inspect current help and the target specialist definition:

```bash
sp script --help
sp serve --help
specialists list --full
```

Do not copy remembered flags or model names into long-lived automation. Pin the behavior
that your caller depends on and verify it in a fresh process.

Switch to `/using-specialists` when the work needs any of these:

- a durable bead contract and supervised job lifecycle;
- file writes or a worktree;
- resume/steer behavior;
- independent review or test gates;
- multi-step implementation/debug work.

XTRM owns credentials, permissions, durable contracts, and system coordination. This
skill only explains when the script-class surface is the right execution shape.