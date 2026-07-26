# Monitoring and steering

> Retrieval paths, steering verbs, sleep cadence, and rebuttal doctrine for specialist output.
> Loaded on demand from [SKILL.md](../SKILL.md) — not eagerly injected.
> Flag surfaces are deliberately **not** restated here — run `sp ps --help`, `sp feed --help`,
> `sp result --help`. Restated flags are what rotted this file twice. The one exception is
> `sp run`'s dispatch form, stated below because choosing it wrong kills the job silently.

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
- Dispatch form. A foreground `sp run` BLOCKS the calling shell until the job ends. From an agent pane, always use `--background`: it detaches at process level, returns the job id immediately, and keeps the parent binding so the terminal notification still arrives. A trailing `&` is NOT sufficient — an agent bash tool reaps descendant processes when it returns or times out, which kills the job and reports `SessionKilledError` with zero turns. `--bead` and `--prompt` are mutually exclusive.
- For workflow progress, retain the job ID and use `sp feed <job-id> --json`.
- At terminal status (`done`, `error`, or `cancelled`), use `sp result <job-id> --json` as truth.
- A `waiting` job exposes its latest turn through `sp result`; continue it with `sp resume <job-id> "<prompt>"`.
- For an ordinary interactive pane turn, use `xtmux agent-last <pane-or-session> --json`.
- For a coordination notification, preserve its key and use `xtmux message-get <message-key> --json`.

MSG-05 direct parent notification is landing; treat it as a retrieval prompt, not as terminal result data.

The observability database is private to the repo that owns it and is an implementation detail, not a
consumer contract (`docs/cli-reference.md`, `specialists integration record`). Read job state through
the verbs above, never by opening `specialist_jobs` yourself. For genuine KPI/forensic analysis of that
database, load `/using-kpi`.

## Monitoring And Steering

`sp ps` for state, `sp feed` for a running job, `sp result` for a finished or waiting turn, `sp steer`
to redirect a running job, `sp resume` to continue a `waiting` keep-alive job.

Semantics the help text does not give you:

- Default `sp ps` is the actionable dashboard, not raw history. Error/cancelled rows stay visible until
  an operator acknowledges them with `sp clean --ps`; cleaned rows remain in SQLite and reappear under
  `--include-cleaned` / `--all`.
- `steer` lands only on a `running` job and is best-effort — the agent picks it up on its next turn.
  `resume` lands only on a `waiting` job, and only if it was started `--keep-alive`.
- The `ctx%` column is an action signal: 0–40% healthy, 40–65% monitor, 65–80% steer toward conclusion,
  above 80% finish, summarise, or replace the job. Raw token totals are not context percentages.

## Monitoring Long-Running Jobs: Sleep Timers Are Mandatory

A foreground `sp run` streams until the specialist finishes — **the shell call blocks**. From an agent
pane, dispatch with `--background` (see the Dispatch form bullet above). A trailing `&` is not enough:
it backgrounds only inside the shell, and an agent bash tool reaps its descendant processes when it
returns or times out, killing the job and reporting `SessionKilledError` with zero turns. `--background`
detaches at process level — a separate tmux session with a live feed, or a detached re-invocation —
and propagates the runtime origin so the terminal notification still binds to the original pane
(`src/cli/run.ts:938-996`).

Wrapping a foreground `sp run` in a caller-side timeout likewise kills your own job; the `cancelled`
row that follows is your timeout, not a product defect. Misreading that cost a full misdiagnosis on
2026-07-26.

For a **one-shot** job, prefer `sp result <job-id> --wait` over a hand-rolled poll loop — it blocks
until the job is terminal and needs no cadence at all. Do **not** use `--wait` on a `--keep-alive` job:
it parks in `waiting` after each turn, and `--wait` counts `waiting` as still active
(`src/cli/result.ts:472`), so it polls until your timeout instead of handing you the turn. Plain
`sp result <job-id>` returns a waiting job's latest turn; resume it with `sp resume`.

Poll only when you must do other work meanwhile, and size the first sleep by role:

| Role | Typical duration | First sleep |
|------|------------------|-------------|
| sync-docs, changelog-keeper, seconder, security-auditor | 60–180s | 60s, then 60s |
| reviewer | 90–240s | 90s, then 60s |
| explorer, debugger, planner, overthinker | 120–300s | 120s, then 90s |
| executor | 180–600s+ | 180s, then 120s |
| test-runner | varies with suite | 120s, then adjust |

- After a backgrounded dispatch, `sleep 10 && sp ps` first — confirm `running`, not `queued` or already failed.
- Never poll faster than every 30s afterwards; it only burns context.
- On terminal status, consume with `sp result` immediately, before context grows.
- Past 2× the typical duration, inspect with `sp feed <job-id>` before declaring a hang.
- Pi runtime: dispatch `sp` / `xt` / `gh` from the bash tool, not pi's `process` tool — `process` strips
  PATH and `sp` exits 127 (xtmux-19y). Use an absolute path or `bash -lc` if you must.
- Operator-offline runs: pair the per-dispatch sleep with a fixed-cadence heartbeat. The sleep waits for
  an expected completion; the heartbeat catches the ones that land while you are busy reading another
  result. **Claude Code** has this built in — `/loop 180s sp ps`. `/loop` is a Claude Code slash command,
  not a shell or `sp` verb: from **Pi** or any other runtime, schedule the heartbeat externally (cron, a
  systemd timer, or a detached `while true; do sp ps; sleep 180; done`).

You are not done until every dispatched job is terminal **and consumed**.

## Specialist Rebuttal As Routine

Several roles default to an over-cautious verdict when an evidence gate looks unsatisfied. Challenging
that verdict with cited evidence is the orchestrator's job, not optional politeness.

- Reviewer `PARTIAL — missing gitnexus_impact` on a test-only or LOW-blast-radius diff → cite the scope
  (files entirely under `test/`, or the executor's `impact_report.highest_risk: LOW` plus LOC and
  consumer count). The reviewer prompt accepts `gitnexus_impact` **or** `gitnexus_detect_changes` **or**
  a LOW `impact_report` as evidence.
- Reviewer `FAIL` on a suite failure that is a known concurrent-run flake → rerun the suspect test in
  isolation, paste the clean output, resume with "Isolated rerun: P/P. Re-evaluate."
- Overthinker "hold for operator decision" / "close as superseded" / "split vs merge" with no stated
  reason → demand file-line evidence for the claim. If a supersede is verified, record it structurally
  with `bd supersede <old> --with <new>`; if the beads stay parallel siblings, link them with
  `bd dep relate`, never `blocks`.

Argue from new evidence, not authority. A clean seconder verdict or a security-auditor "no findings" is
legitimate ammunition against a reviewer's "looks too complex" or "may have security risk" — cite the
advisory job id.

**One rebuttal per reviewer.** A second FAIL after rebuttal means stop and report. After a successful
rebuttal, `bd remember` it so the next session inherits the pattern.
