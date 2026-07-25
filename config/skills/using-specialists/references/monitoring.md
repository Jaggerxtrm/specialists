# Monitoring and steering

> Current consumer-facing retrieval paths for specialist and coordinator output.
> Loaded on demand from [SKILL.md](../SKILL.md).

## Retrieval hierarchy

Use the narrowest source that already owns the answer:

```text
foreground run → returned stream/result
background/workflow run → sp run/feed --json
terminal truth → sp result --json
waiting → sp result + sp resume
generic interactive turn → agent-last
coordination message → message-get
```

- A foreground `sp run` streams until it returns; consume that output directly.
- For workflow progress, retain the job ID and use `sp feed <job-id> --json`.
- At terminal status (`done`, `error`, or `cancelled`), use `sp result <job-id> --json` as truth.
- A `waiting` job exposes its latest turn through `sp result`; continue it with `sp resume <job-id> "<prompt>"`.
- For an ordinary interactive pane turn, use `xtmux agent-last <pane-or-session> --json`.
- For a coordination notification, preserve its key and use `xtmux message-get <message-key> --json`.

MSG-05 direct parent notification is landing; treat it as a retrieval prompt, not as terminal result data.

Use `sp steer <job-id> "<instruction>"` only while a job is running. The private observability database is an implementation detail, not a consumer contract.
