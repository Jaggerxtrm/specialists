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
- Dispatch form. A foreground `sp run` BLOCKS the calling shell until the job ends. From an agent pane, always use `--background`: it detaches at process level, returns the job id immediately, and keeps the parent binding so the terminal notification still arrives. A trailing `&` is NOT sufficient — an agent bash tool reaps descendant processes when it returns or times out, which kills the job and reports `SessionKilledError` with zero turns. `--bead` and `--prompt` are mutually exclusive. Note: `sp run --help` does not currently list `--background`; the flag is implemented in `src/cli/run.ts`.
- For workflow progress, retain the job ID and use `sp feed <job-id> --json`.
- At terminal status (`done`, `error`, or `cancelled`), use `sp result <job-id> --json` as truth.
- A `waiting` job exposes its latest turn through `sp result`; continue it with `sp resume <job-id> "<prompt>"`.
- For an ordinary interactive pane turn, use `xtmux agent-last <pane-or-session> --json`.
- For a coordination notification, preserve its key and use `xtmux message-get <message-key> --json`.

MSG-05 direct parent notification is landing; treat it as a retrieval prompt, not as terminal result data.

Use `sp steer <job-id> "<instruction>"` only while a job is running. The private observability database is an implementation detail, not a consumer contract.
