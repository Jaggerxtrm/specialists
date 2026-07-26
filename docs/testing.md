# Testing

Install dependencies with `bun install --frozen-lockfile` before running tests.

## Test lanes

| Command | Purpose | Expected result |
| --- | --- | --- |
| `npm test` | Default Vitest baseline | Green; quarantined and runtime-gated tests do not run |
| `npm run test:quarantined` | Tests currently outside the default baseline | May fail or hang; bound the run and follow each issue link in `vitest.config.ts` |
| `npm run test:bun` | `bun:sqlite` tests unsupported by Vitest's Node environment | Green |
| `npm run test:supervisor` | FIFO-heavy Supervisor suite isolated from worktree runs | Tracked by `unitAI-9n93`; run outside nested specialist sessions |

The initial inventory found 57 failing/noisy files; a bounded rerun added `chat/launch.test.ts`, so 58 files are tracked under `xtrm-wiy5n.4.11`. `attach.integration.test.ts` was quarantined separately under `xtrm-wiy5n.4.10` and is back in the default baseline. `vitest.config.ts` is the source of truth; do not add an exclusion without an `// ISSUE: ...` link. Quarantine is routing, not a pass claim.

Bound full runs with `timeout 480s npm test`; the baseline completes in about 56 seconds on the reference worktree.

## Interactive CLI tests must bound their pty

`attach` requires a TTY and hands live jobs to a TUI that exits only on `/quit` or Ctrl+C. An unbounded `spawnSync('script', ...)` therefore hangs the entire run: `spawnSync` blocks the Vitest worker synchronously, so `testTimeout` can never fire, and the pty child is reparented to init when the run is killed.

Wrap every pty-backed CLI spawn in GNU `timeout`, which runs the command in its own process group and signals the whole group so the pty child dies with it. Keep `spawnSync`'s own `timeout` as the outer backstop, gate the test on both `script` and `timeout` being present, and assert termination is bounded. `tests/integration/cli/attach.integration.test.ts` is the reference implementation and covers the stuck-attach case explicitly.

## Expected skips

Live suites run only with `SPECIALISTS_LIVE_SMOKE=1`. Capability-gated integration tests may skip when tmux, Git worktrees, `bd`, or `script` are unavailable. Static skips must carry an issue link, and committed tests must not use `.only`.
