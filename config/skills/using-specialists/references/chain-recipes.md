# Chain recipes

> Runnable chain shapes: the mandatory QA+Iron gates, single-chain, multi-chain epic, review/fix loop, and mini-flows.
> Loaded on demand from [SKILL.md](../SKILL.md) — not eagerly injected.
> Always-needed policy (rules, gates, escalation, specialist choice) stays in the router; it is not repeated here.

## Mandatory Gates: Seconder, Obligations, Security (Iron-style)

For any substantive production diff, the chain shape is the canonical pipeline from [`docs/design/chain-templates.md` §2](../../../docs/design/chain-templates.md#2-the-canonical-pipeline):

```
writer (executor/debugger) → seconder → test-engineer → test-runner → security-auditor (if surface) → obligations-scanner → reviewer → Release Checklist
```

Reviewer consumes final QA evidence together with Iron gates: test-engineer output, test-runner classification, smoke/E2E proof, telemetry/log assertions, obligations-scanner, and security-auditor when applicable.

`seconder`, `test-engineer`, `test-runner`, `obligations-scanner`, and `reviewer` are mandatory on production diffs (shipped via Opp 14 / `unitAI-sfwe1` + Opp 15 / `unitAI-4e194`). `security-auditor` is mandatory when the diff touches a sensitive surface. Reviewer follows canon §2.2 SCRUTINY as a chain-property, not reviewer input.

### Seconder Gate — `seconder`

Mandatory READ_ONLY scope/compliance + smell/type-safety/simplicity dual-verdict gate (canon §2.3). Every change gets one cheap second pair of eyes before QA and reviewer. If `overall_verdict` is FAIL or UNCLEAR where not allowed, route back to writer.

- Skip permitted ONLY for: test-only diffs (entirely under `test/`, `tests/`, `__tests__/`, `*.spec.*`, `*.test.*`, `*.fixture.*`) or new-file-only diffs (no modifications to existing symbols).
- Any other skip = escalation event. Small diffs hide the worst regressions.

### Obligations Gate — `obligations-scanner`

Mandatory READ_ONLY marker scan. Catches new TODO/FIXME/HACK/XXX/TEMP/WIP/NOTE(release) in production code that would otherwise leak unaccounted. Cheap (<30s, gpt-5.4-mini, bare).

- Accepts structured `// TODO(<bead-id>): reason` markers if the linked bead exists and is in current bead's NON_GOALS.
- Rejects unstructured markers in production code → reviewer issues PARTIAL "obligation: must resolve or accept".
- Markers under test/fixture/mock/e2e/docs paths are noted but never block.

The scanner produces JSON; the reviewer consumes its output directly via job feed.

### Security Gate — `security-auditor`

Mandatory when diff touches: auth, secrets, input handling (user/network/file), dependency lockfiles, agent/MCP/config surfaces, token-storage paths, migrations, permissions/hooks. Scan-only; recommendations only; executor applies fixes.

- Never skip on sensitive-surface diff "because the diff looks small."
- Auto-triggered by reviewer's SCRUTINY auto-escalation table when surface patterns match.

### Dispatch mechanics for all three gates

All run with their own bead and `--job <exec-job>` so they enter the executor workspace.

Routing across chain phases:

- **Per-chain dispatch**: gates run on the chain's job in canon order: seconder → test-engineer → test-runner → security-auditor (if surface) → obligations-scanner → reviewer. Seconder FAIL/UNCLEAR routes back to writer; test-runner misclassifications route to test-engineer or writer per canon §2.5.
- **Debugger-restitch**: same gate order on the debugger's job AFTER the restitch turn, BEFORE reviewer.
- **E2E smoke phase**: cross-cutting security-auditor on cumulative integrated diff if any landed chain touched a sensitive surface.
- **Reviewer rebuttal**: seconder OK and security-auditor "no findings" are legitimate evidence in reviewer rebuttals (cite the advisory job id).

## Canonical Single-Chain Flow

Use for one implementation branch.

```bash
# 1. Create or claim root task bead with complete contract
bd create --title "Fix token refresh retry" --type task --priority 2 --description "PROBLEM: login and refresh flow have a retry bug when transient token refresh fails before backoff clears stale state. SUCCESS: token refresh retries once, login survives transient failure, and terminal failure stays clear. SCOPE: src/auth/refresh.ts, src/cli/login.ts, tests/unit/auth/refresh.test.ts. NON_GOALS: no auth provider redesign, no storage migration, no UI changes. CONSTRAINTS: preserve token format, keep error text backward-compatible, avoid broad retry changes outside auth flow. VALIDATION: add regression test for fail-then-succeed path and run targeted auth tests. OUTPUT: changed files, test proof, residual risks."
bd update <task> --claim

# 2. Optional discovery when path is unknown — nested under task (bd-x.1) + typed edge for relationship semantics
bd create --parent <task> --title "explorer: map auth refresh path" --type task --priority 2 --description "PROBLEM: token refresh retry path is undocumented and likely drifts on failure handling. SUCCESS: evidence-backed plan names exact files, symbols, and risk. SCOPE: src/auth/refresh.ts, src/cli/login.ts, tests/unit/auth/*.test.ts. NON_GOALS: no implementation, no broad audit. CONSTRAINTS: READ_ONLY, cite files/symbols/flows, stay within live repo evidence. VALIDATION: findings cite code path and recommended sequence. OUTPUT: tracked discovery plan with stop condition."
bd dep add <explore> <task> --type discovered-from
specialists run explorer --bead <explore> --context-depth 3
specialists result <explore-job>

# 3. Implementation — nested under task (bd-x.2)
bd create --parent <task> --title "executor: implement token refresh retry" --type task --priority 2 --description "PROBLEM: login fails after transient token refresh error because retry path returns before backoff and clear error state. SUCCESS: retry waits once, preserves session on success, and surfaces final failure clearly. SCOPE: src/auth/refresh.ts, src/cli/login.ts, tests/unit/auth/refresh.test.ts. NON_GOALS: no auth redesign, no storage migration, no UI refresh. CONSTRAINTS: preserve existing token format, keep backward-compatible error text, avoid broad retry changes elsewhere. VALIDATION: add regression test for transient failure then success; run targeted auth tests. OUTPUT: changed files, test evidence, residual risks."
bd dep add <impl> <explore-or-task> --type blocks
specialists run executor --bead <impl> --context-depth 3
specialists result <exec-job>

# 4. Advisory passes when diff smells risky — nested under impl (bd-x.2.1, bd-x.2.2), since they service impl's diff specifically
bd create --parent <impl> --title "seconder: sanity check token retry diff" --type task --priority 2 --description "PROBLEM: auth retry diff has control-flow and state-handling smell that could hide bug. SUCCESS: findings identify concrete simplification or confirm clean shape. SCOPE: executor diff in auth refresh and login flow. NON_GOALS: no edits, no merge gate decision. CONSTRAINTS: READ_ONLY, keep feedback cheap, cite exact lines or symbols. VALIDATION: findings name concrete improvement or say OK. OUTPUT: FINDINGS with severity or OK with caveats."
bd dep add <sanity-bead> <impl> --type validates
specialists run seconder --bead <sanity-bead> --job <exec-job> --context-depth 3

bd create --parent <impl> --title "security-auditor: scan token retry diff" --type task --priority 2 --description "PROBLEM: auth refresh code touches secrets and session handling, so security regression is possible. SUCCESS: findings isolate real risk surface or confirm no obvious issue. SCOPE: executor diff in auth, token storage, and login path. NON_GOALS: no edits, no package updates, no destructive scans, no live exploit tests. CONSTRAINTS: LOW permissions, scan-only, recommendations only. VALIDATION: findings cite auth/secrets/input surface and why it matters. OUTPUT: recommendations for executor to apply in separate bead."
bd dep add <security-bead> <impl> --type validates
specialists run security-auditor --bead <security-bead> --job <exec-job> --context-depth 3

# 5. Final review — nested under impl (bd-x.2.3)
bd create --parent <impl> --title "reviewer: verify token refresh retry" --type task --priority 2 --description "PROBLEM: verify executor output against auth retry requirements. SUCCESS: PASS only if retry behavior, error handling, and tests satisfy contract. SCOPE: executor job, diff, acceptance criteria, and target auth files. NON_GOALS: do not rewrite unless explicitly asked. CONSTRAINTS: code-review mindset; findings first; verify security and sanity findings were handled. VALIDATION: inspect targeted checks and regression coverage. OUTPUT: PASS/PARTIAL/FAIL with file/line findings."
bd dep add <review> <impl> --type validates
specialists run reviewer --bead <review> --job <exec-job> --context-depth 3
specialists result <review-job>

# 6. Close any waiting keep-alive specialists explicitly
sp ps                              # confirm which jobs are still waiting
sp stop <waiting-job-id>           # repeat per waiting job

# 7. Publish via manual git merge (rule #9 — sp merge is prohibited)
git checkout master
git pull --ff-only origin master
git merge --no-ff feature/<impl-bead>-<slug> -m "Merge <impl-bead>: <summary>"
git push origin master
git worktree remove <chain-worktree-path>
git branch -d feature/<impl-bead>-<slug>
bd close <task> --reason "Reviewer PASS; merged to master."
```

Edit-capable specialists with `--bead` auto-provision a clean git worktree. This does **not** provision ignored project dependency artifacts (`node_modules/`, `.venv/`, build caches). If validation tools are missing inside that worktree, have the specialist run the repo's standard bootstrap command (`make bootstrap`, `just setup`, `npm ci`, `uv sync`, etc.) or report that bootstrap is required; do not solve it by tracking dependency directories. `--worktree` is accepted for clarity but usually unnecessary. Use `--job <exec-job>` for reviewer/fix passes that must enter existing executor workspace.

What differs: orchestrator carries full bead contract inline, so downstream specialists inherit the actual job shape, not a title.

## Multi-Chain Epic Flow

Use epic when multiple implementation chains publish together.

```bash
# Epic bead
bd create --title "Epic: auth refresh hardening" --type epic --priority 2 --description "PROBLEM: login and refresh flow have retry drift, weak error surfacing, and unclear follow-up ownership. SUCCESS: epic closes with stable retry behavior, tests, docs, and clean publish. SCOPE: src/auth/*, src/cli/login.ts, tests/unit/auth/*, docs/auth-refresh.md. NON_GOALS: no auth provider swap, no storage migration, no unrelated session revamp. CONSTRAINTS: preserve token format, keep login compatible, sequence risky fixes before merge, use child beads for parallelizable slices. VALIDATION: targeted tests, seconder or security pass if risk appears, final reviewer PASS. OUTPUT: merged chain set with notes on remaining gaps."

# Planner bead — bd-epic.1
bd create --parent <epic> --title "planner: plan auth refresh split" --type task --priority 2 --description "PROBLEM: epic needs disjoint chains before executor starts. SUCCESS: child beads, dependency edges, and file ownership split are explicit. SCOPE: auth refresh epic area. NON_GOALS: no code changes. CONSTRAINTS: keep chains disjoint, identify security-sensitive slice, name review order. VALIDATION: plan names beads and edges. OUTPUT: parallel-ready plan with risk notes."
specialists run planner --bead <plan> --context-depth 3

# Parallel impl beads — bd-epic.2, bd-epic.3
bd create --parent <epic> --title "executor: impl auth retry" --type task --priority 2 --description "PROBLEM: transient refresh failure breaks login flow. SUCCESS: retry path succeeds after one transient failure and preserves session state. SCOPE: src/auth/refresh.ts, tests/unit/auth/refresh.test.ts. NON_GOALS: no UI changes, no storage migration, no unrelated retry framework edits. CONSTRAINTS: preserve error text, keep backoff bounded, avoid side effects outside auth flow. VALIDATION: regression test for fail-then-succeed path. OUTPUT: code diff, test proof, residual risk list."
bd create --parent <epic> --title "executor: impl login handoff" --type task --priority 2 --description "PROBLEM: login CLI does not surface refresh outcome clearly enough for operators. SUCCESS: login shows clear success/failure handoff and no stale token state. SCOPE: src/cli/login.ts, tests/unit/cli/login.test.ts. NON_GOALS: no auth protocol redesign. CONSTRAINTS: preserve CLI flags and error codes, keep output terse. VALIDATION: CLI regression test. OUTPUT: login diff and test evidence."

specialists run executor --bead <impl-a> --context-depth 3
specialists run executor --bead <impl-b> --context-depth 3

# Per-chain review — nested under each impl (bd-epic.2.1, bd-epic.3.1)
bd create --parent <impl-a> --title "reviewer: verify auth retry" --type task --priority 2 --description "..."
bd create --parent <impl-b> --title "reviewer: verify login handoff" --type task --priority 2 --description "..."
bd dep add <review-a> <impl-a> --type validates
bd dep add <review-b> <impl-b> --type validates
specialists run reviewer --bead <review-a> --job <exec-a-job> --context-depth 3
specialists run reviewer --bead <review-b> --job <exec-b-job> --context-depth 3

# Close waiting keep-alive specialists explicitly (per chain)
sp ps                          # see what's still waiting
sp stop <waiting-job-id>       # repeat per waiting job in each chain

# Publish via Cherry-Pick Playbook (canonical multi-chain merge — see Integration Phase section)
bd dep cycles                  # stop if relationship rewiring introduced a cycle
git checkout -b integration/$(date +%Y%m%d)-$EPIC_TAG
# For each PASS chain in dependency order:
git merge --squash feature/<chain-bead>-<slug>
git restore --staged .beads .pi AGENTS.md CLAUDE.md   # noise filter
git commit -m "<type>(<scope>): <summary> (<bead-id>)"
# Operator FF-merges integration → master when satisfied.
```

Use `--epic <id>` when job belongs to epic but bead is not direct child. Avoid parallel executors on same file; sequence them or consolidate work.

What differs: orchestrator splits graph first, then launches parallel work only when file scopes are provably disjoint.

## Review And Fix Loop

A chain stays alive until merged or abandoned.

```text
executor/debugger -> waiting
optional seconder/security-auditor -> advisory findings
reviewer -> PASS | PARTIAL | FAIL
```

- `PASS`: verify expected commit/diff + clean Release Checklist. Close any waiting keep-alive jobs explicitly with `sp stop <job-id>`. Then publish via manual git workflow (per-chain `git merge --no-ff` or Cherry-Pick Playbook for multi-chain epics).
- `PARTIAL`: resume same executor/debugger with exact findings, then re-review (`sp resume <reviewer-job>`).
- `FAIL`: stop and decide whether to replace chain, re-scope bead, or ask operator if judgment is required. If replacing a bad chain with a narrower one, use `bd supersede <failed-impl> --with <replacement>`; if reviewer discovered separate follow-up work, use `bd dep add <follow-up> <reviewer-bead> --type discovered-from`.

Prefer resume over new fix executor when original job is waiting and context is healthy:

```bash
sp resume <exec-job> "Reviewer PARTIAL. Fix only these findings: ..."
```

Do not treat job completion, seconder OK, security no-findings, or test-runner pass as equivalent to reviewer PASS.

What differs: orchestrator uses PASS/PARTIAL/FAIL as real control flow, not just status labels.

## Mini-Flows For Under-Promoted Specialists

Planner:
- Use when epic needs bead split, dependency graph, or file ownership before code starts.
- Bead shape: task/epic contract with clear success criteria, child beads, and edge plan.
- Chain position: first or pre-impl.

Debugger:
- Use when symptom exists and root cause is unclear.
- Bead shape: reproduction, logs, expected vs actual, scope to investigate.
- Chain position: before executor, or after a failing review when cause is unclear.

Overthinker:
- Use for risky design, cross-cutting tradeoffs, or premortem before lock-in.
- Bead shape: options, risks, constraint conflicts, decision asked for.
- Chain position: before planner/executor when design uncertainty is high.

Researcher:
- Dispatch **BEFORE** answering any library/API/framework/CLI question from training data. Training is months stale; APIs change; cheap CLI lookups (`ctx7`, `deepwiki`, `ghgrep`) replace the guess.
- Use for: API syntax checks, config options, version migrations, library-specific debugging, "how do others implement X", recent releases, public repo internals.
- Anti-pattern to break: "I think Library X works like Y…" → instead dispatch researcher with the exact question. The cost (~30s, `openai-codex/gpt-5.4-mini` via tool mode) is far less than shipping wrong API usage.
- Bead shape: source list (which libraries/repos), question set, required citations (library ID or `npx ctx7 docs /org/project "..."` output).
- Chain position: before executor when outside facts matter; alongside explorer when a question mixes local code with external behavior.
- Keep-alive: ask follow-ups in the same job rather than re-dispatching — researcher stays in waiting state after each turn.

Three modes — researcher picks automatically based on bead shape; you write the bead, not the mode:

- **Targeted lookup** (most common): "How do I configure X in library Y v1.2?" / "What does Z.method() return now?" / "Are foo and bar still the canonical replacements for baz?" → researcher resolves library ID via `ctx7 library`, then `ctx7 docs /org/project "<intent-rich query>"`. For repo-specific internals (e.g. "How does Vite handle X internally?"), `deepwiki ask <owner/repo> "..."`.
- **Discovery**: "How do production codebases handle X?" / "Find good examples of pattern Y" / "What does the ecosystem do for Z?" → `ghgrep "<literal pattern>" --lang <langs> --repo <maybe>`, scan results, drill into the best repos with `deepwiki toc` + `deepwiki ask`.
- **Media / discussion-recency** (rare): YouTube transcripts, social-media trends. Triggers on URLs or "what are people saying about X right now". Researcher loads `last30days` skill on-demand for this — don't fold its setup into the bead.

### Dispatch triggers — when the orchestrator should reach for researcher

Concrete agent thoughts that MUST be replaced with a researcher dispatch:

| Agent thought | Researcher bead |
|---|---|
| "I think `useEffect` cleanup works like…" | `ctx7 docs /facebook/react "useEffect cleanup with async operations"` |
| "Next.js app router middleware should be…" | `ctx7 docs /vercel/next.js "app router middleware patterns"` |
| "Let me check if `--target` is a valid flag for tool X" | `ctx7 docs /org/tool-x "--target flag"` or `tool-x --help` (orchestrator-side if it's installed) |
| "Production code probably handles X by…" | `ghgrep "<X-pattern>" --lang TypeScript --limit 5` then `deepwiki ask <best-repo> "<design question>"` |
| "Library Y added feature Z in v3 (I think)" | `ctx7 library <Y> "Z"` → `ctx7 docs /org/Y/<version> "Z"` to verify version + behavior |
| "Repo X's authentication architecture is…" | `deepwiki ask owner/X "How does the auth middleware work? What stores tokens? What controls expiry?"` |
| "Cross-library: do A and B compose like Z?" | `deepwiki ask repo-A repo-B "How do these interact for use-case Z?"` |

If you catch yourself making any of these claims without first dispatching researcher, you are about to ship stale information. Stop and dispatch.

### Cost framing

Researcher runs on `openai-codex/gpt-5.4-mini` via tool mode, keep-alive. Typical turn: 20-40s wall clock, ~$0.005-0.02 per call. The cost of shipping a wrong API call (debugger turn + executor fix + reviewer re-run, or worse, production regression) is orders of magnitude higher. Default to dispatch.

### What researcher does NOT do

- Local code mapping → use `explorer` (READ_ONLY, traces project code without external CLI cost).
- Bug root-cause when symptoms are local → use `debugger`.
- Reading internal docs already in this repo → use direct file read or `explorer`.
- Security audit of third-party packages → use `security-auditor`; researcher's job is the API surface, not the threat model.

Test-runner:
- Use when commands need to run and failures need classification, not fixes.
- Bead shape: exact command list, suites, and expected failure taxonomy.
- Chain position: after executor or between fix loops.

Sync-docs:
- Use when one doc drifts and must be synced to source truth.
- Bead shape: one-doc scope, source cross-check, drift checks.
- Chain position: parallel to code only when doc scope is isolated; otherwise after code settles.

What differs: orchestrator uses specialists beyond the common trio, so planning, diagnosis, research, tests, and docs do not collapse into executor work.

## Bug Diagnosis Chain

For symptoms, errors, regressions, flakes, or failing tests where cause is unknown, start with diagnosis — not implementation. Do not dispatch executor while cause is unknown; executor is for clear implementation scope only.

Default chain:

1. **test-runner** or **debugger** establishes a fast deterministic feedback loop. If no loop can be built, debugger reports the blocker — do not patch in the dark.
2. **debugger** reproduces the symptom, writes 3–5 falsifiable hypotheses, and tests one variable at a time. Any temporary instrumentation must be tagged `[DEBUG-<id>]` and removed before completion.
3. **debugger** applies the minimal root-cause fix on the fault line and verifies via targeted lint/typecheck plus the focused repro.
4. **test-runner** reruns the original repro/regression command (full-suite validation is its job, not debugger's).
5. **seconder** runs if the fix smells brittle, overcomplicated, or type-risky. **security-auditor** runs if the fix touches auth/session/secrets/input handling, dependency logic, or agent/MCP/hook config.
6. **reviewer** gates the final diff against the bead contract.
7. If no correct regression-test seam exists, route the architecture/testability finding to **overthinker** or **planner** — do not force a brittle test just to close the loop.

Explorer is useful before diagnosis only when no concrete symptom exists and architecture is unknown. For real bugs with a symptom, use debugger.

## Seconder

The mandatory post-writer gate (canon §2.3): one READ_ONLY dual-verdict pass over the writer's diff that checks **scope/compliance** (does the diff satisfy the bead contract sections?) and **implementation quality** (complexity, duplication, type safety, brittle async/error handling) together, before test-engineer and reviewer.

Bead shape:

```text
PROBLEM: Verify the writer diff satisfies the bead contract and is implementation-sound before expensive QA.
SUCCESS: Dual-verdict isolates any scope or quality issue, or confirms the diff is clean.
SCOPE: Writer diff, risky files, and any nearby helpers.
NON_GOALS: No edits, no broad refactor, no release blessing, no security audit, no broad reviewer phase-2.
CONSTRAINTS: READ_ONLY, keep feedback cheap, cite exact sections/lines/symbols.
VALIDATION: scope_verdict + quality_verdict + overall_verdict with concrete findings.
OUTPUT: JSON dual-verdict (scope_verdict / scope_findings / quality_verdict / quality_findings / overall_verdict).
```

The chain reducer reads `overall_verdict`: PASS advances to test-engineer; FAIL routes back to the writer. Hand findings back with `sp resume <exec-job> "Seconder overall_verdict=FAIL — scope: ...; quality: ..."`.

A seconder PASS is the upstream scope gate for the reviewer; it is not itself a reviewer PASS.

What differs: orchestrator uses seconder as cheap smell screen, not as merge gate.

## Security-auditor

Use security-auditor when diff touches auth, secrets, input handling, dependency logic, or agent/config surfaces. Keep it advisory and scan-only.

Bead shape:

```text
PROBLEM: Diff may open auth, secrets, input, dependency, or agent-config risk.
SUCCESS: Findings isolate real security concern or confirm no obvious issue.
SCOPE: Executor diff, touched configs, and security-relevant paths.
NON_GOALS: No edits, no package updates, no destructive scans, no live exploit tests.
CONSTRAINTS: LOW permissions, scan-only, recommendations only.
VALIDATION: Findings cite risk surface and why it matters.
OUTPUT: Recommendations for executor to apply in a separate bead.
```

Use `sp resume <exec-job> "Security findings: ..."` or `sp resume <exec-job> "Security scan clean; continue to reviewer."`.

No findings is not reviewer PASS. Executor still applies fixes if any, then reviewer decides publish.

What differs: orchestrator uses security-auditor to surface risk early, not to bless merge.

