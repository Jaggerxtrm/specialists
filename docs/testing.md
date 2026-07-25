# Testing

Install dependencies with `bun install --frozen-lockfile` before running tests.

## Test lanes

| Command | Purpose | Expected result |
| --- | --- | --- |
| `npm test` | Default Vitest baseline | Green; quarantined and runtime-gated tests do not run |
| `npm run test:quarantined` | Tests currently outside the default baseline | May fail or hang; bound the run and follow each issue link in `vitest.config.ts` |
| `npm run test:bun` | `bun:sqlite` tests unsupported by Vitest's Node environment | Green |
| `npm run test:supervisor` | FIFO-heavy Supervisor suite isolated from worktree runs | Tracked by `unitAI-9n93`; run outside nested specialist sessions |

The initial inventory found 57 failing/noisy files; a bounded rerun added `chat/launch.test.ts`, so 58 files are now tracked under `xtrm-wiy5n.4.11`. The independently tracked `attach.integration.test.ts` hang uses `xtrm-wiy5n.4.10` (59 files total). `vitest.config.ts` is the source of truth; do not add an exclusion without an `// ISSUE: ...` link. Quarantine is routing, not a pass claim.

Bound full runs with `timeout 480s npm test`; the baseline completes in about 56 seconds on the reference worktree. The attach regression reproduces with `timeout 45s env SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run tests/integration/cli/attach.integration.test.ts`.

## Expected skips

Live suites run only with `SPECIALISTS_LIVE_SMOKE=1`. Capability-gated integration tests may skip when tmux, Git worktrees, `bd`, or `script` are unavailable. Static skips must carry an issue link, and committed tests must not use `.only`.
