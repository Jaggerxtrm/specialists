# Quarantine failure map — `xtrm-wiy5n.4.11`

Source of truth for the `quarantined` array in `vitest.config.ts`. Every quarantined file
appears here exactly once, in a cluster with a root cause, an owner surface, a reproduction
command, and a restoration order. Quarantine is routing, not a pass claim — a file leaves
this document only by being restored to the default lane or deleted with evidence.

## Baseline

Measured on the reference worktree at `d410d9be` with:

```bash
timeout 480s npm run test:quarantined
```

| | |
| --- | --- |
| Quarantined files at Sprint 2 close | 58 (`attach.integration.test.ts` already restored by PR #226 under `xtrm-wiy5n.4.10`; the bead's "59" predates that merge) |
| Result of the bounded quarantined run | 57 failed, 1 passed, **523 tests: 173 failed / 350 passed**, 213s wall |
| Restored by this PR | 10 files (8 restored, 2 deleted as dead) |
| Remaining quarantined | 48 files |
| Default lane after restoration | `timeout 480s npm test` → 146 files, **1646 passed / 0 failed / 14 skipped**, 87s |

The lane does **not** hang. It completes inside the 480s bound. The 350 passing tests inside
the quarantine are the measure of the harm: they are real coverage that CI does not run.

Reproduce any single file with:

```bash
SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run <path>
```

## Restored in this PR

| Cluster | Files | Root cause | Fix |
| --- | --- | --- | --- |
| R1 retired `.specialists/` paths | `tests/unit/specialist/tool-catalog.test.ts`, `manifest-resolver.test.ts`, `template-hygiene.test.ts` | Tests read the generated, git-ignored install tree (`.specialists/catalog/index.json`, `.specialists/default/*.specialist.json`). The `.specialists/default/` mirror was retired by `31a6421c` and is no longer walked by the loader (`src/specialist/loader.ts:136-142`); the catalog lives at `config/catalog/index.json`. | Repoint at the repo-source paths. `template-hygiene` drops the retired-mirror half and asserts the current sync-docs contract (`c9b37118` replaced "(empty = no bead linked)" with a hard BLOCKED). |
| R2 tests for deleted MCP tools | `tests/unit/specialist/run_parallel.test.ts`, `tests/unit/tools/specialist/start_specialist.tool.test.ts`, `tests/unit/cli/quickstart.test.ts` | `04384c48` ("remove deprecated MCP tools") deleted `run_parallel.tool.ts` and `start_specialist.tool.ts` but left their tests, and left `start_specialist` in quickstart's expected tool list. | Delete the two orphaned test files; drop `start_specialist` from the quickstart expectation. |
| R3 fixture rot | `tests/unit/cli/merge.test.ts`, `tests/unit/cli/version-check.test.ts` | `merge`: the gate message gained "— non-TS repo" (`src/cli/merge.ts:874`). `version-check`: the fake remote tag was pinned at `v3.14.0`, which stopped being newer once `package.json` reached 3.21.1, so the nudge correctly returned `null`. | Match the current message; pin the fake remote far above any releasable local version so it cannot rot again. |
| R4 **real defect** — workflow trust boundary | `tests/unit/scripts/pr-workflow-trust.test.ts` | `.github/workflows/pr-review-gate.yml` declared no top-level `permissions:`, so every job without its own block inherits the repository default token scopes. The trust test caught it; the quarantine suppressed it. | Add `permissions: contents: read` at workflow scope. |
| R5 quarantined without cause | `tests/unit/cli/integration.test.ts` | Passes clean (24 tests, 8s). It was the one green file in the baseline sweep and should never have been listed. | Remove from the array. |

## Remaining clusters, in restoration order

Ordered by tests-recovered per unit of work, with blocking defects first.

### 1. Observability SQLite unavailable in temp repos — 4 files, ~29 tests

| | |
| --- | --- |
| Files | `tests/integration/cli/end.integration.test.ts` (15/15), `epic.integration.test.ts` (5/5), `node.integration.test.ts` (6/6), `epic-flows.integration.test.ts` (3/4) |
| Representative error | `Error: failed to initialize observability sqlite in temp repo` |
| **Real defect inside** | `node.integration`: `Failed after 5 attempts (upsertNodeMemory): ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint` — the node-memory upsert targets a conflict column the schema never declares unique. This fails at runtime, not only under test. |
| Owner surface | `src/specialist/observability-sqlite.ts`, node-memory schema, temp-repo bootstrap in the integration helpers |
| Repro | `SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run tests/integration/cli/node.integration.test.ts` |

Fix the `ON CONFLICT` schema mismatch first — it is a production bug — then the temp-repo
SQLite bootstrap, which unblocks the other three files.

### 2. Console / TUI behaviour drift — 4 files, ~13 failures of 31 tests

| | |
| --- | --- |
| Files | `tests/unit/cli/console-key-gating.test.ts` (9/9), `console-view-model.test.ts` (2/9), `console-bead-view.test.ts` (1/11), `console-e2e-smoke.test.ts` (1/4) |
| Representative errors | `expected 'all' to be 'diff'` (pressing `d` no longer opens DiffView); `expected +0 to be 1` (the `move` reducer does not advance `selectedRow`); a blank line in the rendered frame |
| **Likely real defect** | `console-key-gating.test.ts` is labelled "codex PR #125 review regression". All nine of its cases fail, which means either that regression is back or the reducer/key API changed under it without the guard being updated. Do not repoint these assertions before deciding which. |
| Owner surface | `src/cli/console/view-model.ts`, `src/cli/console/components.ts` |
| Repro | `SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run tests/unit/cli/console-key-gating.test.ts` |

### 3. Node coordinator contract drift — 5 files, ~10 failures

| | |
| --- | --- |
| Files | `tests/unit/specialist/node-contract.consistency.test.ts` (5/6), `node-coordinator-contract.test.ts` (1/1), `node-supervisor-recovery.test.ts` (2/3), `tests/integration/node-actions.test.ts` (1/1), `node-bootstrap.test.ts` (1/1) |
| Representative errors | `TypeError: undefined is not an object (evaluating 'schema.required')` — `config/specialists/node-coordinator.specialist.json` no longer carries `prompt.output_schema`; `supervisor.handleCoordinatorOutput is not a function`; `Invalid NodeSupervisor transition: created -> failed`; the system prompt no longer contains the `## Node Coordinator Contract (SSoT: …)` block |
| **Real defect** | The coordinator config, `NodeSupervisor`, and the SSoT contract block have diverged. The missing `output_schema` means the coordinator ships without its declared output contract. |
| Owner surface | `config/specialists/node-coordinator.specialist.json`, `src/specialist/node-contract.ts`, `NodeSupervisor` |
| Repro | `SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run tests/unit/specialist/node-coordinator-contract.test.ts` |

### 4. Missing / renamed runtime functions — 3 files, ~13 failures

| | |
| --- | --- |
| Files | `tests/unit/cli/edit.test.ts` (6/10), `finalize.test.ts` (4/5), `tests/unit/xtrm/beads-commit-gate.test.ts` (3/4) |
| Representative errors | `Error: process.exit unexpectedly called with "1"` from `resolveTargets` (`src/cli/edit.ts:626` → `fail` at `:101`); `supervisor.emitTimelineEvent is not a function`; `clearReviewerClaimOwnerIfInactive is not a function` |
| Owner surface | `src/cli/edit.ts`, `src/cli/finalize.ts`, Supervisor timeline API, beads commit gate |
| Repro | `SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run tests/unit/cli/edit.test.ts` |

Same family as cluster 3: the tests call an API surface that was renamed or removed without
the callers being swept. Each needs a decision — restore the function or retire the test.

### 5. `run.test.ts` — 1 file, 21 of 44 failures

| | |
| --- | --- |
| File | `tests/unit/cli/run.test.ts` |
| Representative errors | `TypeError: Cannot spy on export "spawn". Module namespace is not configurable in ESM`; `AssertionError: promise resolved "undefined" instead of rejecting` |
| Owner surface | `src/cli/run.ts` and the test's spy strategy |
| Repro | `SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run tests/unit/cli/run.test.ts` |

Not a bun-runner artifact: under `node …/vitest` the same file fails 23/44. The ESM spy
failures need `vi.mock` instead of `vi.spyOn` on a module namespace; the rest are real
assertion failures behind them. Highest single-file test yield left (44 tests) and the file
PR #228 had to route around — that PR placed an assertion outside this file precisely because
CI would never have run it.

### 6. Unbounded child processes — 6 files, 22 failures

| | |
| --- | --- |
| Files | `tests/integration/chat/control.test.ts` (5/5), `chat/launch.test.ts` (2/2), `tests/integration/sp-script.test.ts` (1/3), `tests/unit/specialist/worktree.test.ts` (6/26), `tests/unit/specialist/supervisor-sigterm-append.test.ts` (2/2), `tests/unit/cli/doctor.test.ts` (6/14) |
| Representative error | `Error: Test timed out in 30000ms.` / `in 15000ms` / `Error: Condition not met before timeout` (`supervisor-sigterm-append.test.ts`) |
| Owner surface | Test-side process spawning; same class as the attach hang fixed under `xtrm-wiy5n.4.10` |
| Repro | `SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run tests/integration/chat/control.test.ts` |

Reference fix is already in-tree: wrap every real-CLI spawn in GNU `timeout` so the child dies
with its process group (`docs/testing.md` § "Interactive CLI tests must bound their pty",
`tests/integration/cli/attach.integration.test.ts`).

### 7. CLI integration exit status / output drift — 6 files, ~12 failures

| | |
| --- | --- |
| Files | `tests/integration/cli/init.integration.test.ts` (1/4), `edit.integration.test.ts` (1/3), `validate.integration.test.ts` (1/3), `run.integration.test.ts` (3/7), `merge.integration.test.ts` (1/1), `worktree.integration.test.ts` (6/13), `doctor.integration.test.ts` (2/2) |
| Representative errors | `AssertionError: expected 1 to be +0` (the spawned CLI exits non-zero in a temp repo); message drift — `expected 'specialists init: missing .xtrm/ in t…' to contain 'specialists requires xtrm'`, `to contain 'Category B'` |
| Owner surface | CLI error text and temp-repo preconditions |
| Repro | `SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run tests/integration/cli/validate.integration.test.ts` |

Capture the spawned CLI's `stderr` in the assertion before triaging — the current failures only
show the exit code, which is why this cluster reads as one bucket rather than several.

### 8. Prompt / documentation drift — 4 files, ~7 failures

| | |
| --- | --- |
| Files | `tests/integration/docs/ownership-guidance.integration.test.ts` (3/3), `tests/unit/specialist/changelog-keeper.test.ts` (2/3), `changelog-drafter.test.ts` (1/2), `tests/smoke/telemetry-readiness.smoke.test.ts` (1/2) |
| Representative errors | `expected '# Surface Ownership and Precedence…' to contain 'Managed mirror (repo, generated by in…'`; `expected 'Draft release notes…' to contain 'Inject xt report bundle first…'`; `Error: ENOENT: docs/telemetry/forensic-event-contract.md` |
| Owner surface | `docs/`, `config/specialists/changelog-*.specialist.json` |
| Repro | `SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run tests/integration/docs/ownership-guidance.integration.test.ts` |

`telemetry-readiness` needs an ownership decision, not a fix: `docs/telemetry/` was deleted by
`092c0462` ("declutter docs/ for xtrm monorepo migration"). Either the assertion follows the
docs to their new home or it retires with them.

### 9. Performance budgets — 2 files, 2 failures

| | |
| --- | --- |
| Files | `tests/unit/cli/chat-feed.test.ts` (1/2), `tests/unit/cli/console-perf.test.ts` (1/7) |
| Representative errors | `expected 1052.593417 to be less than 50`; `expected 7983.361 to be less than 5000` |
| Owner surface | `src/cli/chat/feed.ts` (`ChatFeed.render`), `src/cli/console/theme.ts` |
| Repro | `SPECIALISTS_TEST_QUARANTINED=1 bun --bun vitest run tests/unit/cli/chat-feed.test.ts` |

`ChatFeed.render` is 21× over its budget on 1000 appended rows. That margin is too wide to
blame on machine jitter — profile before touching the threshold. Raising these numbers to make
the files green would be exactly the loosening this bead exists to prevent.

### 10. Individually-owned failures — 12 files, 22 failures

| File | Failures | Error | Note |
| --- | --- | --- | --- |
| `tests/unit/cli/log.test.ts` | 5/5 | `expected '' to contain 'joblog'` | The command produces no output at all under test. |
| `tests/integration/chat/mailbox-routing.test.ts` | 1/3 | `expected { kind: 'steer' } to deeply equal { kind: 'reject' }` | **Real gap.** `executeInput` reads job state exactly once (`src/cli/chat/control.ts:46`) and applies its terminal guard to that single read (`:49`). The test asserts two reads — dispatch, then a re-check immediately before execute (`expect(callCount).toBe(2)`) — so a job that reaches a terminal state inside that window still gets steered. Needs an owner decision on whether the double read is the intended contract; do not delete the assertion to close the gap. |
| `tests/unit/specialist/script-runner.test.ts` | 1/50 | `expected [ … ] to not include '--no-skills'` | **Real defect.** `--no-skills` is hardcoded into the base arg list (`src/specialist/script-runner.ts:1113`) and the trusted `skills.paths` / `prompt.skill_inherit` entries are appended after it as `--skill` (`:1116`), so every script run ships both flags. The forwarding is either dead or depends on undocumented flag precedence in pi. |
| `tests/unit/cli/doctor-drift.test.ts` | 1/4 | `expected false to be true` | `detectDriftForRepo` never emits `diverged-consider-migrating`. |
| `tests/unit/cli/list.test.ts` | 1/23 | `expected false to be true` | One human-output row missing. |
| `tests/unit/cli/list-rules.test.ts` | 2/5 | `expected '…27 sets, 27…' to match /5 sets, 2 specialists/` | Fixture counts a 5-set rule library; the repo ships 27. |
| `tests/unit/specialist/skill-paths.test.ts` | 3/9 | `expected [ { …(2) } ] to deeply equal []` | |
| `tests/unit/specialist/runner.test.ts` | 2/54 | `expected "vi.fn()" to not be called at all, but actually been called 1 times` | |
| `tests/unit/specialist/supervisor-waiting-auto-close.test.ts` | 2/2 | `expected "vi.fn()" to be called once, but got 0 times` | |
| `tests/unit/tools/specialist/use_specialist.tool.test.ts` | 2/2 | `expected "vi.fn()" to be called with arguments: [ { name: 'code-review', …(5) } ]`; `promise resolved "{ status: 'error' }" instead of rejecting` | The MCP tool's call shape and its error contract both drifted from what the test pins. |
| `tests/unit/cli/init.test.ts` | 1/27 | `expected '# Project…' to contain 'Custom text here.'` | **Real defect.** The case is named "does not overwrite existing AGENTS.md that already has `## Specialists`" and the custom text is gone from the result: `specialists init` destroys user content in `AGENTS.md`. This is data loss on a user file and should be fixed ahead of everything else in this section. |
| `tests/smoke/sp-chat.smoke.test.ts` | 1/3 | `expected 'hello from smoke\r\n/notes hello…' to match /> (?:\x1b_pi:c\x07)?\x1b\[7m/` | Prompt-rendering assertion against a pty. |

## Defects the quarantine is hiding

Named plainly, per the bead's constraint. None of these are repaired by editing the test.

1. **`specialists init` overwrites user content in `AGENTS.md`** — `tests/unit/cli/init.test.ts`. Data loss on a file the user owns.
2. **`pr-review-gate.yml` had no workflow-scope `permissions:`** — `tests/unit/scripts/pr-workflow-trust.test.ts`. Fixed in this PR; it is listed here because the quarantine is what let it land.
3. **`upsertNodeMemory` targets an `ON CONFLICT` column with no matching unique constraint** — `tests/integration/cli/node.integration.test.ts`. Fails after 5 retries at runtime.
4. **`chat.executeInput` reads job state once, not twice** — `tests/integration/chat/mailbox-routing.test.ts`. Freeform input reaches a job that turned terminal inside the dispatch→execute window.
5. **`runScriptSpecialist` sends `--no-skills` alongside explicit `--skill` args** — `tests/unit/specialist/script-runner.test.ts`, `src/specialist/script-runner.ts:1113-1116`. Trusted skill forwarding is dead or precedence-dependent.
6. **`node-coordinator.specialist.json` ships without `prompt.output_schema`** — `tests/unit/specialist/node-coordinator-contract.test.ts`. The coordinator has no declared output contract.
7. **`ChatFeed.render` is 21× over its stated budget** — `tests/unit/cli/chat-feed.test.ts`.
8. **`.specialists/default/` is still written by `specialists init` but no longer read by the loader** — found while restoring cluster R1 (`src/cli/init.ts:191-234` vs `src/specialist/loader.ts:136-142`). A dead write that leaves stale specialist copies on disk.

## CI does not run the test suite

The bead asks for "CI visibility for quarantine count and regressions". That cannot be built
yet, because **no workflow runs `npm test`**. The only vitest job in `.github/workflows/` is
`telemetry-contract.yml`, which runs three named files and only when their sources change:

```yaml
bun --bun vitest run \
  tests/unit/specialist/forensic-events.test.ts \
  tests/unit/specialist/prometheus-projection.test.ts \
  tests/unit/specialist/observability-sqlite.test.ts
```

So the quarantine currently changes nothing about CI — it changes what the local pre-PR gate
runs. Restoring a file makes it real again for every developer running `npm test`, which is
the gate this project actually enforces, but it does not yet make it real for a pull request.

Correct sequence, in order:

1. Make the default lane hermetic (below) — otherwise a new required check is flaky on day one.
2. Add a workflow that runs `timeout 480s npm test` on `pull_request`.
3. Only then report the quarantine count from that job, and fail on growth without an issue link.

Do not do 3 before 1.

## The default lane is not hermetic

Found while validating this PR, and not a quarantined file: `tests/unit/cli/status.test.ts`
runs the real `status` command, which shells out via `spawnSync` and calls
`getVersionCheckResult()` (`src/cli/status.ts:35,44,473`) — a live `git ls-remote` against
GitHub, once per test. Eleven tests take **73 seconds in isolation** against a per-test budget
of 20 seconds, and the file times out whenever the machine is under load: it failed in two of
three full default-lane runs during this work and passed standalone.

This is a pre-existing flake, not a consequence of restoring files, but it is the thing that
makes "default `npm test` is deterministic" untrue today. It must not be quarantined — the fix
is to stub the version check and the `which` probes so the suite stops touching the network.
Track it separately from this bead.

## Index — every quarantined file, exactly once

The 48 entries of the `quarantined` array in `vitest.config.ts`, each assigned to exactly one
cluster. This table is the authoritative assignment; a file named elsewhere in this document
is a cross-reference, not a second home. Adding or removing an array entry means editing this
table in the same commit.

| # | File | Cluster |
| --- | --- | --- |
| 1 | `tests/integration/chat/control.test.ts` | 6 unbounded child processes |
| 2 | `tests/integration/chat/launch.test.ts` | 6 unbounded child processes |
| 3 | `tests/integration/chat/mailbox-routing.test.ts` | 10 individually-owned |
| 4 | `tests/integration/cli/doctor.integration.test.ts` | 7 CLI integration exit status |
| 5 | `tests/integration/cli/edit.integration.test.ts` | 7 CLI integration exit status |
| 6 | `tests/integration/cli/end.integration.test.ts` | 1 observability SQLite |
| 7 | `tests/integration/cli/epic-flows.integration.test.ts` | 1 observability SQLite |
| 8 | `tests/integration/cli/epic.integration.test.ts` | 1 observability SQLite |
| 9 | `tests/integration/cli/init.integration.test.ts` | 7 CLI integration exit status |
| 10 | `tests/integration/cli/merge.integration.test.ts` | 7 CLI integration exit status |
| 11 | `tests/integration/cli/node.integration.test.ts` | 1 observability SQLite |
| 12 | `tests/integration/cli/run.integration.test.ts` | 7 CLI integration exit status |
| 13 | `tests/integration/cli/validate.integration.test.ts` | 7 CLI integration exit status |
| 14 | `tests/integration/cli/worktree.integration.test.ts` | 7 CLI integration exit status |
| 15 | `tests/integration/docs/ownership-guidance.integration.test.ts` | 8 prompt / documentation drift |
| 16 | `tests/integration/node-actions.test.ts` | 3 node coordinator contract |
| 17 | `tests/integration/node-bootstrap.test.ts` | 3 node coordinator contract |
| 18 | `tests/integration/sp-script.test.ts` | 6 unbounded child processes |
| 19 | `tests/smoke/sp-chat.smoke.test.ts` | 10 individually-owned |
| 20 | `tests/smoke/telemetry-readiness.smoke.test.ts` | 8 prompt / documentation drift |
| 21 | `tests/unit/cli/chat-feed.test.ts` | 9 performance budgets |
| 22 | `tests/unit/cli/console-bead-view.test.ts` | 2 console / TUI drift |
| 23 | `tests/unit/cli/console-e2e-smoke.test.ts` | 2 console / TUI drift |
| 24 | `tests/unit/cli/console-key-gating.test.ts` | 2 console / TUI drift |
| 25 | `tests/unit/cli/console-perf.test.ts` | 9 performance budgets |
| 26 | `tests/unit/cli/console-view-model.test.ts` | 2 console / TUI drift |
| 27 | `tests/unit/cli/doctor-drift.test.ts` | 10 individually-owned |
| 28 | `tests/unit/cli/doctor.test.ts` | 6 unbounded child processes |
| 29 | `tests/unit/cli/edit.test.ts` | 4 missing / renamed runtime functions |
| 30 | `tests/unit/cli/finalize.test.ts` | 4 missing / renamed runtime functions |
| 31 | `tests/unit/cli/init.test.ts` | 10 individually-owned |
| 32 | `tests/unit/cli/list-rules.test.ts` | 10 individually-owned |
| 33 | `tests/unit/cli/list.test.ts` | 10 individually-owned |
| 34 | `tests/unit/cli/log.test.ts` | 10 individually-owned |
| 35 | `tests/unit/cli/run.test.ts` | 5 `run.test.ts` |
| 36 | `tests/unit/specialist/changelog-drafter.test.ts` | 8 prompt / documentation drift |
| 37 | `tests/unit/specialist/changelog-keeper.test.ts` | 8 prompt / documentation drift |
| 38 | `tests/unit/specialist/node-contract.consistency.test.ts` | 3 node coordinator contract |
| 39 | `tests/unit/specialist/node-coordinator-contract.test.ts` | 3 node coordinator contract |
| 40 | `tests/unit/specialist/node-supervisor-recovery.test.ts` | 3 node coordinator contract |
| 41 | `tests/unit/specialist/runner.test.ts` | 10 individually-owned |
| 42 | `tests/unit/specialist/script-runner.test.ts` | 10 individually-owned |
| 43 | `tests/unit/specialist/skill-paths.test.ts` | 10 individually-owned |
| 44 | `tests/unit/specialist/supervisor-sigterm-append.test.ts` | 6 unbounded child processes |
| 45 | `tests/unit/specialist/supervisor-waiting-auto-close.test.ts` | 10 individually-owned |
| 46 | `tests/unit/specialist/worktree.test.ts` | 6 unbounded child processes |
| 47 | `tests/unit/tools/specialist/use_specialist.tool.test.ts` | 10 individually-owned |
| 48 | `tests/unit/xtrm/beads-commit-gate.test.ts` | 4 missing / renamed runtime functions |

Cluster totals: 1→4, 2→4, 3→5, 4→3, 5→1, 6→6, 7→7, 8→4, 9→2, 10→12. Sum 48.

## Rules for changing the quarantine array

- No entry without an `// ISSUE: …` link and a cluster in this document.
- A file leaves the array only when it passes in the default lane unmodified in intent — not by relaxing a threshold, deleting an assertion, or repointing one at whatever the code currently does.
- A file whose subject was deliberately deleted leaves by being deleted, with the removing commit cited.
- Adding a file requires evidence (the failing output) and an owner.
