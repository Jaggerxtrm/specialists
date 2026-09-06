# Monitoring Specialist jobs

Monitor by state transition/evidence, not tight polling.

Use the current `sp ps`, feed/log, wait, and result surfaces exposed by the installed
version. Prefer structured JSON/event envelopes when a coordinator must make decisions.

Stable semantics:

- `running` means work is active, not successful;
- `waiting` is often a keep-alive/continuation state, not automatically terminal;
- terminal/completed state says execution stopped, not that the answer is correct;
- a persisted final result is the worker's claim and must be consumed before advancing;
- errors/crashes/timeouts need an explicit recovery/escalation decision.

For long jobs, use an event/monitor/wakeup mechanism provided by the active XTRM harness
rather than repeated manual sleeps. General peer messaging/reply obligations belong to
`/multiplexing`.

When context pressure threatens the coordinator, persist job IDs, states, pending
findings/replies, and next action, then hand off through `/starting-and-resuming-work`.