# Iron Review Hardening — DevOps QA Chain Extension

> **⚠ ARCHIVED — superseded 2026-05-30 / further evolved 2026-05-31.** This document is preserved for historical / archeological reference only. Its content was first absorbed into the canonical chain-templates design (2026-05-30) as a "QA overlay" §3.2, then **restructured the same day to drop the overlay framing** (Iron + QA are canonical pipeline, not opt-in overlays — neither lives at §3.2 anymore), then **further revised 2026-05-31** with the seconder fusion (code-sanity + reviewer phase-1 → single dual-verdict step) which changes the chain position of `test-engineer`. The `test-engineer` role and behavioral-validation contract are preserved unchanged; only the chain position around them moved.
>
> For current canonical guidance, consult:
> - [`docs/design/chain-templates.md`](../design/chain-templates.md) **§2** — the canonical pipeline (writer → seconder → test-engineer → test-runner → security-auditor? → obligations-scanner → reviewer)
> - [`docs/design/chain-templates.md`](../design/chain-templates.md) **§2.3** — roles table (test-engineer + test-runner + seconder definitions, ambidextrous test-engineer note)
> - [`docs/design/chain-templates.md`](../design/chain-templates.md) **§2.5** — behavioral-validation contract (test-engineer JSON output schema, test-runner failure-routing matrix)
> - [`docs/design/chain-templates.md`](../design/chain-templates.md) **§3.14** `code-with-tests` and **§3.15** `test-only` — the two templates that consume `test-engineer` in different positions
> - [`docs/design/chain-templates.md`](../design/chain-templates.md) **§3.16** — ambidextrous-roles pattern (test-engineer × 2 positions; mode-agnostic system_prompt + position-injection mechanism for pre-substrate vs substrate)
> - [`docs/design/roadmap/specialists-roadmap.md`](../design/roadmap/specialists-roadmap.md) **Opp 14** — implementation track for `test-engineer` + `test-runner` upgrade (this archived doc's downstream implementation)
>
> Companion `chain-templates.html` exists as an editorial snapshot in `substrate.html` style but is **not maintained going forward** — the MD is the only living source.
>
> Implementation tracking remains: epic `unitAI-sfwe1` (test-engineer + test-runner upgrade), task `unitAI-f9kku` (chain_template formula integration), related epic `unitAI-4e194` (seconder fusion + reviewer phase-2-only refactor — sibling work that changes the gate immediately before test-engineer).
>
> ---
>
> **Original status:** draft design · sibling to `iron-review-hardening.html`
> **Original tracking:** `unitAI-3cdtf` (closed — design absorbed into canonical)
> **Original scope:** future `test-engineer` specialist, upgraded `test-runner` handback, and
> planning/test-planning integration for devops-oriented autonomous chains.

## Why this exists

`iron-review-hardening.html` hardens the review pipeline around Jane Street Iron
concepts: scrutiny profiles, mandatory seconders, ddiff re-review, obligations
tracking, and release checklists. That makes review stricter, but it still leaves
one gap in autonomous specialist chains:

> Who turns a production diff into the **right behavioral tests, smoke/E2E
> checks, and telemetry assertions** before the reviewer sees it?

The answer should not be the generic executor and should not be `test-runner`.
The future role is **`test-engineer`**:

- `planner` + xtrm `test-planning` define expected coverage before implementation.
- `executor` / `debugger` change production behavior.
- `test-engineer` reads the actual diff and writes tests/smoke checks/telemetry
  assertions.
- `test-runner` executes exact commands and classifies failures.
- failures route back to `test-engineer` when the test/harness is wrong, or back
  to `debugger` / `executor` when source behavior is wrong.
- Iron gates (`code-sanity`, `obligations-scanner`, `security-auditor`,
  `reviewer`) consume the resulting evidence.

This is devops-oriented because autonomous runs are only debuggable when they
produce the right logs, telemetry, health checks, and end-to-end proof. Static
checks such as `pyright`, `tsc`, lint, schema validation, or `ruff` remain useful
build evidence; they are **not** substitutes for smoke/E2E behavior when the
bead changes a shell, boundary, agent, hook, deploy, MCP, or operational path.

## Inputs from xtrm planning/test-planning

The xtrm planning skills now require two contracts in every implementation bead:

1. **Logging / telemetry contract** — events, fields/format, emission points,
   redaction rules, and artifact/query location.
2. **Smoke / E2E contract** — commands or live checks that exercise the integrated
   path, plus fallbacks/follow-up beads when live boundaries are unavailable.

The xtrm `test-planning` skill now treats testing as more than unit coverage:

- core: unit/property/example tests;
- boundary: live-contract or fixture-backed contract tests;
- shell: integration + smoke tests;
- operational / agentic: smoke + E2E + telemetry assertions.

It also defines **chain mode**: after implementation, a test-focused specialist
reads the actual diff and produces concrete test-writing plus `test-runner`
contracts. In specialists, that chain-mode role should be implemented as
`test-engineer`.

## Old Iron chain vs QA-extended Iron chain

### Current Iron hardening chain

```text
executor/debugger
  → code-sanity              # mandatory seconder for production diffs
  → security-auditor?        # mandatory on sensitive surfaces
  → obligations-scanner      # TODO/FIXME/HACK/XXX/TEMP/WIP/NOTE(release)
  → reviewer                 # scrutiny-aware, ddiff-aware, Release Checklist
```

### QA-extended chain

```text
planner + test-planning      # before implementation: expected coverage contract
  → executor/debugger        # production change + static verification
  → test-engineer            # writes/updates tests, fixtures, smoke checks, telemetry assertions
  → test-runner              # runs exact commands, classifies failures, captures artifacts
  → fix loop                 # test-engineer OR debugger/executor based on failure owner
  → code-sanity              # Iron seconder
  → security-auditor?        # sensitive-surface scan
  → obligations-scanner      # Iron obligations gate
  → reviewer                 # release gate; consumes QA + Iron evidence
```

For small docs-only or static-analysis-only beads, `test-engineer` can be skipped
with an explicit reason. For shell/boundary/operational/devops work, skipping
behavioral QA is an escalation event unless the bead explicitly defers it with a
follow-up.

## Role boundaries

| Role | Owns | Must not do |
|---|---|---|
| `planner` | Phase-level decomposition; initial test strategy via xtrm `test-planning`; bd test issues | Write final tests from an unknown future diff |
| `executor` | Production implementation from a clear bead contract; static lint/typecheck | Own full behavioral validation or broad test writing |
| `debugger` | Root-cause fixes for symptoms/failing tests; targeted repro verification | Run broad suites or redesign unrelated tests |
| `test-engineer` | Plan-from-actual-diff, write/update tests/fixtures/smoke scripts/telemetry assertions, emit exact `test-runner` commands | Patch production source by default; decide release readiness |
| `test-runner` | Execute exact commands, classify failures, capture log/telemetry artifacts | Write tests; fix source; silently expand scope |
| `code-sanity` | Iron seconder: cheap implementation quality/simplicity/type-safety pass | Validate product behavior or test coverage |
| `obligations-scanner` | Iron obligations marker scan | Act as a test gate |
| `security-auditor` | Security scan for sensitive surfaces | Bless release or write fixes |
| `reviewer` | Final PASS/PARTIAL/FAIL and Release Checklist | Write the missing tests itself |

## `test-engineer` specialist contract

Recommended default name: **`test-engineer`**. `test-planner` is too weak because
this role should write tests, not only plan them.

Recommended posture:

- permission: `MEDIUM` (test editing requires writes);
- phase: `post-impl`;
- worktree: enter the executor/debugger workspace via `--job <impl-job>`;
- edit scope: tests, fixtures, smoke scripts, test harness support, telemetry
  assertions; production-source edits only with explicit bead permission;
- skills: should load or embed the xtrm `test-planning` contract;
- output: structured handoff to `test-runner` and reviewer.

Required inputs:

- implementation bead and its original test plan/test bead;
- actual changed files and diff;
- existing test style and fixture conventions;
- planning-time logging/telemetry contract;
- planning-time smoke/E2E contract;
- any prior `test-runner` failure output on retry.

Required output:

```json
{
  "status": "tests_written|blocked|source_bug_suspected",
  "files_changed": ["tests/..."],
  "coverage_map": [
    {"impl_path": "src/...", "test_path": "tests/...", "critical_path": "..."}
  ],
  "smoke_e2e_commands": ["..."],
  "telemetry_assertions": [
    {"event": "...", "fields": ["..."], "query_or_grep": "...", "redaction": "..."}
  ],
  "test_runner_commands": ["..."],
  "known_deferred_paths": [
    {"path": "...", "reason": "...", "follow_up_bead": "..."}
  ],
  "source_bug_suspicions": ["..."]
}
```

If `test-engineer` discovers the implementation is not testable without a source
change, it should report `source_bug_suspected` or create a follow-up. It should
not quietly patch production code and blur ownership.

## Upgraded `test-runner` contract

`test-runner` remains LOW permission and does not write files. Its contract needs
to become a better peer for `test-engineer`:

- prefer exact commands supplied by `test-engineer` / orchestrator;
- run smoke/E2E/live-contract checks when requested, not only manifest suites;
- capture requested log/telemetry artifacts or grep/query evidence;
- classify failures by owner:
  - `test_engineer` — bad expectation, bad fixture, bad harness, flaky test shape;
  - `debugger_or_executor` — source regression or unhandled behavior;
  - `infrastructure` — missing service, network, credentials, unavailable DB;
  - `pre_existing` — failure already present outside the chain scope;
- return enough evidence for routing without requiring the orchestrator to parse
  raw logs.

Current tension to resolve in implementation: the existing pre-script auto-runs a
manifest-wide suite, while `test-runner-execution-scope` says “run only requested
tests.” For this QA chain, the preferred behavior is:

1. if exact commands are supplied, run them verbatim;
2. if no exact commands are supplied, run a safe manifest-detected smoke/default
   and clearly label it as fallback;
3. never silently expand a pinned test scope.

## Feedback routing matrix

| `test-runner` finding | Next recipient | Example instruction |
|---|---|---|
| Test expectation wrong | `test-engineer` | “Expected JSON field was renamed by accepted implementation; update assertion only.” |
| Fixture/harness broken | `test-engineer` | “Fixture omits required env var; fix setup/teardown, then rerun same command.” |
| Required telemetry missing | `debugger` or `executor` | “Implementation never emits `component=runner event=job_finished`; add source instrumentation.” |
| Source behavior regression | `debugger` | “Smoke command exits 0 but produced stale state; root-cause before edits.” |
| New source feature untested | `test-engineer` | “Diff added retry fallback; add failure-path test + log assertion.” |
| Infrastructure unavailable | orchestrator / reviewer note | “Prometheus unavailable; mark infra failure and use recorded fallback if defined.” |
| Pre-existing unrelated failure | reviewer note | “Classify as pre-existing; do not block this chain unless critical path overlap exists.” |

## Channel model extension

The Iron channel design already lets specialists wake on messages instead of the
orchestrator hand-carrying state. QA adds two more message kinds before the Iron
gates:

```text
executor/debugger posts: turn(diff)
test-engineer wakes on: turn(diff)
test-engineer posts: qa_plan_and_tests + test_runner_commands
test-runner wakes on: qa_plan_and_tests
test-runner posts: test_verdict

if test_verdict.owner == test_engineer:
  test-engineer wakes, fixes tests, posts qa_plan_and_tests Δ
  test-runner reruns exact commands

if test_verdict.owner == debugger_or_executor:
  debugger/executor wakes, fixes source, posts turn(Δ)
  test-engineer revalidates affected tests

when test_verdict is clean:
  code-sanity/security/obligations/reviewer proceed
```

This keeps ddiff semantics intact: reviewer should see the final test evidence and
only re-review the delta after PARTIAL. Prior clean test-runner evidence carries
forward unless the new diff touches the tested path or invalidates an artifact.

## Release Checklist additions

The reviewer’s Release Checklist should gain QA evidence lines when the chain
includes behavioral work:

```text
- [ ] test-engineer required: yes|no|not-required (reason)
- [ ] test-engineer completed: yes|no|N/A
- [ ] test-runner commands executed: yes|no|N/A
- [ ] smoke/E2E evidence present: yes|no|N/A
- [ ] telemetry/log assertions present: yes|no|N/A
- [ ] failures classified and routed: yes|no|N/A
```

For `SCRUTINY: low` docs/test-only diffs, these can be `not-required` with a
reason. For `SCRUTINY: high|critical`, absence of behavioral QA evidence should
be a PARTIAL unless the bead is static-only.

## DevOps-specific examples

### Hook or MCP change

```text
executor changes hook/MCP behavior
→ test-engineer adds temp-repo smoke harness and asserts stdout/stderr/log event
→ test-runner runs exact smoke command
→ obligations/code-sanity/reviewer consume artifact paths
```

Required evidence:

- command exit code;
- expected file or tool result;
- structured log line with component, event, outcome, duration;
- redaction proof if the path touches secrets/config.

### Deploy or health-check change

```text
deployer/executor updates deploy envelope
→ test-engineer adds dry-run/preflight smoke + rollback/cleanup assertion
→ test-runner classifies any service unavailable error as infra unless source changed it
→ reviewer checks Release Checklist + telemetry evidence
```

Required evidence:

- pre-validate and post-validate command output;
- health-check result;
- rollback/failure-mode path or explicit deferred bead;
- log/metric query path.

### Agent chain behavior change

```text
executor changes specialist orchestration
→ test-engineer writes a minimal fake-chain/e2e smoke
→ test-runner runs it and captures job/feed/result evidence
→ reviewer verifies code-sanity OK + obligations CLEAN + QA evidence
```

Required evidence:

- job state transitions;
- feed/result output shape;
- no orphaned worktree/process state;
- telemetry proving start/end/failure events.

## Implementation beads implied by this design

1. **Define chain contract** — convert this design into `using-specialists-v3` and
   any channel/handoff schema docs.
2. **Add `test-engineer` specialist** — MEDIUM, post-impl, test-edit scoped,
   with output schema above.
3. **Upgrade `test-runner`** — exact-command-first, owner routing, telemetry
   artifact capture, no silent broadening.
4. **Reviewer checklist update** — include QA evidence fields for behavioral work.
5. **Smoke/eval** — prove: test-engineer writes tests → test-runner fails →
   failure routes back to test-engineer; source bug routes to debugger/executor.

## Design decision summary

- Name the new role **`test-engineer`**, not `test-planner`, because it writes
  tests from the actual diff.
- Keep `test-runner` as LOW-permission execution/classification only.
- Keep Iron gates separate; QA evidence feeds reviewer but does not replace
  code-sanity, obligations, security, or final review.
- Treat logs/telemetry as testable product behavior for devops/agent paths.
- Treat smoke/E2E as mandatory for integrated behavior; static checks are not enough.
