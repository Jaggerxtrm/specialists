# Specialists Modernization: Prompt, Chain Context, Interactive Coordination, Observability and Evaluation

## Product Requirements Document

**Status:** Final consolidated implementation and decomposition PRD v3.1; includes the 13–17 July 2026 Beads v1.1/main capability reconciliations
**Date:** 17 July 2026
**Primary repository:** `xtrm-dev/specialists`  
**Related repositories:** `xtrm-dev/core`, `Jaggerxtrm/xtmux`, `Jaggerxtrm/console` / Omniforge, `xtrm-dev/xtrm`  
**Audience:** Specialists runtime maintainers, Core/launcher maintainers, xtmux maintainers, agent-orchestration engineers, Console maintainers, evaluation engineers and platform/observability engineers  
**Scope:** Prompt and rule modernization for reviewer, executor, overthinker, seconder, test-engineer and researcher; progressive-disclosure redesign of `using-specialists`; interactive `chain-coordinator` bootstrap and assignment; chain-member identity and context reconstruction; memory retrieval policy; forensic and metrics hardening; historical and continuous evaluation; controlled model and prompt A/B testing; Console integration.

**Canonical companions:** `docs/design/roadmap/specialists-roadmap.md` for the bridge-runtime roadmap; `docs/design/roadmap/chain-templates/` for executable chain shapes; `docs/design/execution-protocol-design/specialist-execution-protocol.md` for the deterministic lifecycle of one managed Specialist activation; `docs/design/execution-protocol-design/specialist-execution-protocol-ownership-decision.md` for ownership boundaries; `xtrm-dev/core/docs/xt-pi-role.md` for the interactive launcher; `Jaggerxtrm/xtmux/docs/observability-redesign.md` for the current local attention/messaging runtime; `xtrm/docs/channels/channels.md` for future channel semantics; and the newest dated xtrm reconciliation for cross-repository sequencing.

## Revision 2026-07-17 v3.1 — claim pools, proxied-server parity and Dolt compatibility

This revision extends the post-v1.1 contract with four changes verified on Beads `main`. They remain **unreleased** relative to stable v1.1.0 unless the installed binary or an explicitly pinned build proves them.

1. **Pool-aware claim** (`849c05b`). Aliases listed in `claim.pools` may be preassigned by a dispatcher and taken through the normal atomic `--claim` path. Real assignees and unconfigured aliases retain anti-steal protection. After lease expiry, reclaim returns the issue to the unassigned pool rather than restoring the original alias.
2. **Plain formula-name bonding** (`b740f6f`). `bd mol bond <formula-name> ...` resolves the same canonical plain names accepted by `bd formula show`, `bd mol seed`, `bd mol pour` and `bd cook`. Prefix/path workarounds are compatibility fallbacks only.
3. **Expanded proxied-server CLI support** (`3ecbf5b`). `search`, `assign`, `priority`, `note`, `tag`, `edit`, `state`, `state list`, `link`, `q`, `todo`, `children` and `gate list` have proxied implementations. This is command-specific parity, not full formula, molecule, graph or gate-lifecycle parity.
4. **Dolt v2.2.0 pin on current main** (`3fea705`). Dolt 2.2.0 is required only for Beads builds at or after this unreleased commit; it is not retroactively required for stable v1.1.0. The Beads binary, Dolt client/driver and server image are one compatibility tuple.

These changes refine `WP-G02`, `WP-C05` and the interactive/recovery capability contracts. They add no work-package family or critical-path edge.

## Consolidation record

This final document merges two prior artifacts:

1. the 12 July prompt, chain-context, telemetry and evaluation PRD;
2. the 13 July branch consolidation that added current interactive-role, coordinator, xtmux V2, policy-hook and filed-Beads evidence.

A mechanical comparison found that the branch consolidation retained approximately **98.6% of the earlier PRD line-for-line** and added approximately **1,170 lines**. The additions are therefore treated as extensions of one program rather than a competing design.

Accepted net-new scope:

- the shipped `xt pi --role` / `xt claude --role` launch family;
- the bridge interactive `chain-coordinator`;
- progressive disclosure for `using-specialists`;
- a pure interactive assignment renderer owned by Specialists;
- runtime-readiness and secure prompt-file delivery across Core and xtmux;
- the xtmux SQLite V2 attention, message, receipt, handoff and monitor primitives;
- a shared cross-harness Bead/chain policy kernel with durable findings and shadow-first rollout;
- 18 additional work packages: `WP-IC01`–`WP-IC13` and `WP-H01`–`WP-H05`;
- reconciliation instructions for the Beads already filed by the parallel planning branch;
- the Beads v1.1 and post-v1.1 capability audit: molecule-aware readiness, atomic graph creation, fan-in gates, contract metadata, migration safety, memory reuse and unreleased worker-lease/formula/history capabilities.

No previously accepted prompt, chain, memory, telemetry, evaluation, Console or future Channels requirement is removed. Where this document repeats a requirement in an executive section and a detailed workstream, the detailed numbered workstream and Section 15 work-package contract are normative.


---


# 0. Verified baseline and closed runway decisions

This revision incorporates three classes of new evidence that were not represented in the original prompt/eval PRD:

1. A filed cross-repository Beads packet covering `using-specialists` progressive disclosure and interactive role task-context parity.
2. The xtmux Bun/TypeScript + SQLite overhaul and its cross-harness hook/extension pattern, which were evaluated before the later monorepo and interactive-coordinator discussions. This includes typed messages, receipts, handoffs, delivery attempts, agent lifecycle, monitors, durable audit findings, machine-readable inbox queries, Pi reply reminders and automatic monitor arming.
3. The subsequently shipped `xt pi --role` / `xt claude --role` launcher family and the interactive `chain-coordinator` specialist.

The filed Beads are **not authoritative**. They are reconciled in Appendices I and J against current code, this conversation's closed decisions, the canonical Specialists roadmap and the future Substrate design. A local planning agent must update, extend, split or supersede the existing Beads according to that mapping rather than executing them verbatim.

## 0.1 Verified implementation baseline

| Repository | Verified baseline used by this PRD | Consequence |
|---|---|---|
| `xtrm-dev/specialists` | package version `3.18.2`; `chain-coordinator` shipped; `using-specialists` is the canonical skill name; `sp view --raw` returns the merged effective spec | Do not plan creation of these features as net-new. Plan refinement, rendering parity, coordinator doctrine and evaluation. |
| `xtrm-dev/core` | package version `0.10.2`; global skill migration and direct runtime links shipped; Pi/Claude `--role` parity shipped | Runtime paths must follow the global installed skill model. Do not depend on retired `.xtrm/skills/active/*` project paths. |
| `Jaggerxtrm/xtmux` | SQLite V2 is default-on; 39-commit overhaul after the first `xt/hnjk` design deliverable; rollback is explicit `XTMUX_OBS_V2=0` | Treat typed messages, receipts, handoffs, monitors and agent lifecycle as current bridge primitives, not speculative future work. |
| Console/Omniforge | existing materializer consumes per-repository Specialists observability state | Continue the materializer architecture until Substrate and `state.db` actually land. |

## 0.2 Runway assumptions fixed by the operator

- Substrate will arrive materially later than the roadmap bridge work.
- Specialists continues to use each repository's `.specialists/db/observability.db` as its authoritative runtime and eval store during the bridge runway.
- Console remains a separate repository and continues to use its own materializer. It is expanded only after Specialists event, metric and eval contracts stabilize.
- `state.db`, the Substrate daemon and Channels remain future migration targets and are not on the critical path of this PRD.
- No monorepo migration or package graft is required to begin or complete the bridge program.
- Interactive-role permission enforcement is explicitly deferred. Worktree isolation and model discipline remain the bridge safety model; this PRD does not add a new permission subsystem.

## 0.3 Foundational xtmux-derived hook and policy architecture

This decision track predates both the monorepo discussion and the interactive `chain-coordinator` work. It arose from a direct audit of the xtmux overhaul and its latest consolidated commits. It must therefore be represented as an independent architectural input to `specialists-roadmap.md`, not as a coordinator implementation detail.

The verified xtmux implementation is Bun/TypeScript plus SQLite, with Node-compatible Claude hooks and in-process Pi extensions. The important reusable result is not any single hook file. It is the operational pattern:

```text
pure semantic decision logic
        ↓
typed durable state and correlated evidence
        ↓
thin harness-specific adapters
        ↓
agent/operator-visible feedback and wake-up
```

xtmux proved this pattern across messages, receipts, delivery attempts, monitors, handoffs, command telemetry, audit findings and agent lifecycle. In particular:

- a durable message is distinct from a best-effort pane delivery;
- `message-list` is a pure read and `message-ack` is the explicit receipt mutation;
- monitor state is durable, lease-backed and reconciled after crashes;
- repeated audit findings use stable fingerprints and update `last_seen` rather than duplicating rows;
- command runs share correlation IDs across start/finish envelopes;
- hooks and extensions make a repeatedly forgotten workflow invariant structural rather than relying on prompt memory;
- the Claude no-match path uses a cheap shell prefilter so an irrelevant Bash call does not pay a runtime cold-start cost;
- the Pi equivalent runs in-process and can append a concise confirmation to the tool result;
- rollout can proceed through compatibility/shadow modes before a new path becomes authoritative.

### 0.3.1 Consequence for the Specialists roadmap hooks

The roadmap's original Claude-only `PostToolUse` script for `bd create` is too narrow. It must be redesigned as a cross-harness policy layer:

```text
shared Bead/chain policy kernel
├── Claude Code cheap prefilter
│   ├── PreToolUse adapter where an operation can be rejected before mutation
│   └── PostToolUse adapter for created-object inspection, annotation and findings
├── Pi in-process extension adapter
└── authoritative Specialists runtime consumers
    ├── sp chain review
    ├── sp chain approve
    └── sp run / dispatch preflight
```

The shared kernel owns semantic decisions such as:

- contract readiness and `contract:draft` refusal;
- SCRUTINY presence and minimum level;
- bead type/shape mismatch;
- template recommendation;
- scope and sensitive-surface classification;
- whether a finding is advisory, blocking or requires escalation.

It accepts structured input and returns structured decisions. It does not call tmux, Claude, Pi or SQLite directly. Harness adapters translate tool events into kernel inputs and render the result. The authoritative `sp` commands call the same kernel directly with richer runtime state.

### 0.3.2 Lifecycle split

A single `PostToolUse` hook cannot honestly "prevent" a Bead that has already been created. The lifecycle is therefore split:

| Boundary | Responsibility |
|---|---|
| Claude/Pi pre-operation | reject only what is safely decidable from the proposed command/input |
| post-operation adapter | resolve the created Bead, inspect actual state, persist findings, suggest or apply bounded metadata repair |
| `sp chain review/approve` | authoritative composition and contract validation |
| `sp run` dispatch boundary | final refusal when an unsafe or incomplete contract would execute |

Early feedback may be helpful, but optional harness hooks are never the final authority.

### 0.3.3 Durable findings instead of transient warnings

Policy findings must not be printed and lost. They use stable identity and persistence analogous to xtmux audit findings:

```json
{
  "policy_version": "...",
  "fingerprint": "sha256(policy-version + kind + stable-identity)",
  "kind": "reviewer_missing_seconder",
  "bead_id": "...",
  "chain_id": "...",
  "first_seen_ms": 0,
  "last_seen_ms": 0,
  "resolved_at_ms": null
}
```

Volatile details such as current dirty-file count are evidence fields, not fingerprint identity. Re-evaluation updates the existing finding; remediation resolves it. The same finding becomes available to forensic queries, Console materialization and eval backfill.

### 0.3.4 Rollout and evaluation

Every new policy surface supports:

```text
off → shadow → warn → enforce
```

Shadow mode evaluates and persists the decision without blocking or mutating the authoritative flow. Promotion requires measured precision, false-positive rate, latency and parity across Claude, Pi and runtime invocation.

Required measurements include:

- no-match hook latency;
- matched hook latency;
- adapter/kernel parity;
- false positive and override rates;
- finding recurrence and resolution rate;
- divergence between hook advice and authoritative runtime decision;
- missed unsafe dispatches;
- duplicate-mutation/idempotency behavior after retries or crashes.

### 0.3.5 Correlation and identity

Every decision should be correlatable to the available execution identities:

```text
policy_decision_id
command_run_id / tool_call_id
bead_id
chain_id
job_id or interactive activation/session identity
repository/worktree
candidate/config fingerprint
```

The kernel must not infer durable participant identity from free-form message bodies or recycled tmux display names.

### 0.3.6 Directly reusable xtmux behavior

The following current behavior should be reused rather than recreated:

- auto-monitor after `message-send`, `safe-send-pointer` or equivalent handoff;
- agent-visible confirmation that monitoring was armed;
- message/receipt/status queries for short coordination obligations;
- delivery-attempt evidence for pointer injection;
- idempotent monitor registration and crash reconciliation;
- safe no-match filtering and runtime-specific adapters;
- shadow/differential validation techniques.

### 0.3.7 Boundaries that remain separate

The Specialists roadmap must not copy the wrong ownership semantics from xtmux:

- Specialists `observability.db` remains authoritative for managed jobs, chain shape, gate evidence, `step_completed` and evals.
- xtmux `observability.db` remains authoritative for local interactive session state, short messages, receipts, delivery attempts, monitors and handoffs.
- `agent.turn.done` is not `step_completed` and must never advance a chain.
- an xtmux acknowledgement is not a gate verdict or merge authorization.
- tmux session/pane identity is not a substitute for Specialists participant/job/event identity.
- xtmux remains a local attention and transport runtime, not a second chain scheduler and not an early implementation of Channels authority.

### 0.3.8 Immediate roadmap effect

This foundation changes the first roadmap patch itself:

1. `WP-G00` must replace the Claude-only hook description with the shared-kernel/multi-adapter architecture.
2. `WP-G02` must audit existing bd, Core, xtmux hook and Specialists validator primitives before creating new mechanisms.
3. `WP-H01`–`WP-H05` are a standalone workstream, not children of the interactive coordinator work.
4. Interactive coordinator delivery later consumes the same xtmux monitor/handoff primitives, but does not own or motivate this hook architecture.
5. The hook work can begin without monorepo migration, Substrate, Channels or the interactive coordinator.

## 0.4 Repository, persistence and sequencing decisions

The following repository, persistence and sequencing decisions were reached after the foundational xtmux hook audit and before the interactive `chain-coordinator` work entered scope. They are normative for decomposition and must not be reopened implicitly by the coordinator implementation.

### 0.4.1 Repository and program ownership

1. **Start decomposition in `xtrm-dev/specialists`.** The live runtime, mandatory rules, chain templates, per-repository observability store and canonical roadmap are there. The program-level PRD may be indexed from `xtrm`, but implementation Beads belong to the repository that owns the affected files.
2. **Use cross-repository workstreams rather than one fictitious cross-repo Beads tree.** The PRD owns the global hierarchy and dependency map. Specialists, Core, xtmux and Console own their implementation Beads and integration contracts.
3. **The first assigned work remains the documentation/reuse gate:** `WP-G00` through `WP-G03`. This reconciles the roadmap, marks the June reconciliation as historical, audits reusable Beads primitives and registers acceptance-criterion coverage before high-conflict runtime changes.
4. **Do not wait for Substrate.** The Specialists roadmap is a long-lived bridge and must be implemented as a reliable runtime, not as disposable scaffolding expected to survive only a few weeks.

### 0.4.2 Monorepo decision for this runway

The monorepo migration is deferred. No graft is a prerequisite for this PRD. The working repository shape remains:

```text
specialists     autonomous runtime repository
core            autonomous launcher/install repository
xtmux           autonomous local attention and transport repository
Console         autonomous Omniforge/materializer repository
xtrm            umbrella architecture and reconciliation repository
```

A future runtime monorepo containing `core + channels + substrate + specialists` may still be justified because those packages will share protocol, schema and integration tests. Absorbing the full Console/Omniforge workspace is not currently justified; Console should remain an external consumer until a later architecture decision.

The reason for deferral is not that Git worktrees fail to isolate uncommitted changes. Each worktree has its own working tree, index and branch, so dirty state in one worktree is not visible in another. The unresolved risks are instead:

- shared root files and lockfiles;
- package-level write-boundary enforcement;
- merge contention across branches that represent the whole product;
- a shared daemon/socket/database when branches change incompatible schemas or protocols;
- generated mirrors and registry files;
- CI and release coupling;
- the fact that Console is already a separate monorepo with its own deployment and materializer lifecycle.

Before any future graft, a dedicated monorepo readiness decision must prove the following operating model:

| Invariant | Required behavior |
|---|---|
| Worktree ownership | one chain/root Bead owns one worktree |
| Writer lease | at most one write-capable agent operates in a worktree at a time; read-only participants may share it |
| Package write scope | every Bead declares allowed write paths; dependency closure is readable but not automatically writable |
| Root mutation | lockfile, workspace config, CI, schema registry and generated-root changes use a serialized merge slot |
| Staging | path-explicit staging is the default; agents do not use unbounded `git add -A` |
| Cross-package changes | represented as one atomic chain with explicit multi-package scope, not accidental scope expansion |
| Runtime isolation | schema/protocol work can use a worktree-specific daemon, socket and database namespace |
| Cache isolation | non-content-addressed caches are namespaced by branch/worktree |
| CI | affected packages plus reverse dependants are tested |
| Merge | root mutations use rebase/merge queue discipline and a single integration owner |

Sparse checkout may reduce disk use for leaf packages, but it is not a security or ownership boundary. In particular, Specialists' dependency closure would include most of the runtime and therefore yield little isolation.

### 0.4.3 Current persistence and Console boundary

During the bridge runway:

```text
Specialists managed jobs/chains/evals
  -> per-repository .specialists/db/observability.db

Interactive tmux sessions/messages/receipts/monitors
  -> xtmux observability.db

Console
  -> its existing materializer and read model
```

Console is expanded only after Specialists telemetry, forensic and eval contracts stabilize. It must not become the source of truth for evaluation or read directly from arbitrary runtime files. Prometheus remains the aggregate projection; the materialized read model carries high-cardinality drilldown and evidence references.

### 0.4.4 Sequencing fixed before coordinator scope

The pre-coordinator critical path was and remains:

```text
roadmap/reconciliation/reuse gates
-> telemetry correctness and immutable baseline
-> eval core and historical backfill
-> critical chain spine
-> output/runner consolidation
-> role prompt experiments
-> complete chain context and handoff
-> pull-based memory
-> Console materializer/API/UI expansion
-> later Substrate/Channels replacement
```

The interactive coordinator bridge is inserted into this program; it does not replace or reorder the telemetry baseline, eval foundation or chain-spine prerequisites.


## 0.5 Beads v1.1 and post-v1.1 capability integration

A repository audit performed on 13 July 2026 found that Beads now owns more of the graph, ready-queue, claim and workflow mechanics than the earlier Specialists roadmap assumed. The bridge program must therefore prefer thin Specialists orchestration over duplicate graph/scheduler logic.

### 0.5.1 Adoption classes

| Capability | Availability at audit snapshot | PRD decision |
|---|---|---|
| `bd ready --mol`, `--gated`, `--claim`, `--explain`, parent/label/metadata filters | stable v1.1 CLI | adopt as the blocker-aware readiness source used by `sp chain` and coordinators |
| `bd create --graph <plan.json> --dry-run` with symbolic nodes, typed edges, metadata, cycle validation and atomic creation | stable v1.1 CLI | make the preferred Pass-1/Pass-2 backlog materialization path |
| `--waits-for` with `all-children` / `any-children` gates | stable CLI | reuse for deterministic fan-in; do not confuse with semantic judge/Channels consensus |
| `--spec-id`, `--skills`, `--validate`, `--metadata`, `--external-ref`, `--mol-type` | stable CLI | map PRD/WP metadata into native Bead fields where possible |
| `bd init --init-if-missing` and idempotent init/doctor behavior | available in current code line | use in bootstrap after minimum-version verification |
| migration content hashes, designated migrator, smart remote migration/adoption and recovery guidance | stable v1.1 line | add one explicit multi-clone upgrade runbook; agents do not migrate independently |
| `bd memories [query]`, `bd recall`, guarded `bd remember` ergonomics | stable/current | reuse before adding a Specialists memory wrapper |
| claim TTL, `bd heartbeat`, `bd reclaim`, owner-safe unclaim | post-v1.1 `main` / unreleased | design integration now; activate only after released minimum version or pinned compatibility validation |
| configured `claim.pools` and pool-aware atomic claim/reclaim | Beads `main` at `849c05b` / unreleased | use only after capability probing; preserve real-owner anti-steal protection and return expired pool claims to unassigned |
| plain-name `bd mol bond` | Beads `main` at `b740f6f` / unreleased | verify against the canonical formula name; retain prefixes/paths only as old-binary fallbacks |
| `bd formula schema --json`, discoverable verified primitives and smoke fixtures | post-v1.1 `main` / unreleased | use for formula authoring/validation after release or pin; never rely on declared-but-unwired primitives |
| selected proxied-server commands | Beads `main` at `3ecbf5b` / unreleased | record support per command; do not infer full backend parity |
| Dolt v2.2.0 compatibility tuple | Beads `main` at `3fea705` / unreleased | require only for that build line; keep stable v1.1.0 on its separately verified matrix |
| `bd history <id> --events` and issue-scoped `bd gate list <id>` | post-v1.1 `main` / unreleased | add as future evidence/query surfaces behind capability checks |
| PostgreSQL, MySQL and SQLite storage backends behind a conformance seam | post-v1.1 `main` / unreleased | record as architecture watch item; retain Dolt for this bridge runway |
| differential conformance/oracle catalog | post-v1.1 test infrastructure | reuse the methodology for Specialists telemetry, CLI and runtime refactors |

### 0.5.2 Normative consequences

1. **Beads is authoritative for dependency readiness.** Specialists may persist resolved chain shape, job linkage, evidence and UI projections, but it must not maintain a competing blocker-resolution engine. `sp chain` combines its chain/job state with `bd ready --mol`, `bd ready --gated` and `bd gate` results.
2. **Atomic graph creation becomes the default decomposition handoff.** The planning agent emits a versioned `bead-graph-plan.json`; the operator runs `bd create --graph ... --dry-run`; composition/reviewer validates the preview; only then is the graph applied atomically.
3. **Structural fan-in uses native gates.** `all-children` and `any-children` may coordinate deterministic completion. They do not provide semantic review, release authority, quorum judgment or Channels behavior.
4. **Claim ownership and worktree ownership remain distinct.** Native claim leases describe who owns a Bead contract. Configured `claim.pools` describe dispatcher preassignment, not durable worker identity. `merge-slot`/worktree lease describes who may write or integrate in a checkout. Neither replaces the other. Coordinators and recovery code must never take over a live owner through `unclaim; claim`; they coordinate with the owner or reclaim only an eligible expired lease.
5. **`step_completed` shrinks further.** It records visibility, evidence and recommendation only. It neither computes a parallel readiness DAG nor auto-resumes peers.
6. **Memory work starts with a gap analysis.** A Specialists wrapper is justified only for missing provenance, supersession, ranking, token budgets, memory types or telemetry—not for basic search/recall already provided by Beads.
7. **Dolt remains the bridge backend.** Alternative backends are not adopted during this program because history, time travel, merge and remote sync remain useful. A later ADR may reconsider this separately.
8. **Minimum-version and capability checks are explicit.** Stable features may be required by version; unreleased features require a pinned binary/commit and compatibility suite. No agent assumes `main` behavior merely because the design mentions it.
9. **Beads upgrades are serialized.** For remote-backed/multi-clone databases, one designated migrator performs schema migration after backup and synchronization; other clones adopt the migrated state.
10. **Differential testing is preferred for contract-preserving refactors.** Capture current canonical behavior, execute the same scenario corpus against the candidate, canonicalize volatile fields and review only intentional deltas.
11. **Pool assignment is dispatch metadata, not durable worker identity.** Configured aliases use the native atomic claim path; expired pool claims return to unassigned, and live-owner takeover is never implemented as `unclaim; claim`.
12. **Deployment support is command-specific.** Embedded Dolt, direct Dolt SQL-server and proxied-server each require an explicit capability/fallback matrix; selected proxied commands do not establish full parity.
13. **Dolt compatibility is version-paired.** A build at or after `3fea705` requires Dolt v2.2.0 across client/driver/server fixtures; stable v1.1.0 retains its own verified matrix.

### 0.5.3 Capability snapshot required before decomposition

`WP-G02` must capture, for the locally installed binary:

```text
bd version
bd ready --help
bd create --help
bd formula schema --json        # when supported
bd mol bond --help
bd config get claim.pools
bd gate list --help
bd history --help
bd memories --help
bd migrate --help
```

The resulting capability matrix records `supported | unsupported | behavior-needs-verification` for each of embedded Dolt, direct Dolt SQL-server and proxied-server, plus minimum version/commit, required Dolt version and fallback behavior. It becomes an input to every Beads-dependent root Bead. The matrix must independently probe ready/claim/lease, formula/molecule, graph creation, gate create/check/resolve, history and memory; broad claims such as “proxied-server supported” are insufficient.

## Document purpose

This PRD consolidates the complete set of findings and recommendations produced during a detailed audit of the Specialists system. It begins with the original request to reduce the static context payload of six heavy specialist system prompts and expands the scope where the investigation showed that prompt text was only one layer of a larger runtime-composition problem.

The document is intentionally comprehensive. It records not only the final recommendations, but also the corrections and refinements made during the investigation. In particular, the first prompt audit correctly identified substantial duplication and role overlap, but initially did not account for every mandatory-rule layer, runtime-injected block, local override, eager skill body or generated output contract. Subsequent repository inspection established the full package-canonical prompt composition and revealed additional sources of context bloat, policy conflict and observability ambiguity. This PRD incorporates that corrected understanding.

## Document authority and execution contract

This PRD is the implementation and decomposition source of truth for the prompt, chain-context, memory, telemetry and evaluation modernization program. It is intentionally more operational than `specialists-roadmap.md`: the roadmap remains authoritative for the bridge-runtime architecture and its Opportunities, while this PRD defines the concrete work packages, evaluation gates, parallelization boundaries and promotion criteria needed to implement the overlapping modernization safely.

The following precedence applies when local agents encounter apparently conflicting prose:

1. **Current code and executable schemas** define what exists today. Agents must verify before modifying.
2. **The installed Beads executable and its machine-readable capability surfaces** define available graph, gate, claim and formula primitives. The decomposition must record its version/capability snapshot.
3. **`specialists-roadmap.md`** defines the canonical bridge direction, retained Opportunities, Substrate read-forward and Beads/molecule mental model.
4. **This PRD** defines implementation scope, sequencing, grader requirements, work-package boundaries and readiness gates for the modernization program.
5. **Current Core and xtmux public contracts** define the shipped interactive-role launch, tmux identity, message, receipt, handoff, monitor and delivery behavior used during the bridge runway.
6. **`xtrm/docs/channels/channels.md`** defines the future semantic messaging contract. No bridge implementation may grow xtmux into a competing Channels runtime.
7. **Dated `_meta` reconciliation documents** are historical snapshots. They inform drift analysis but do not override newer code, roadmap status or this PRD.
8. **Archived Iron/friction documents** are design archaeology only unless the canonical roadmap explicitly retains a requirement.

This document is ready to be supplied to a local planning agent for Pass-1/Pass-2 decomposition. The planning agent must create Beads work contracts and dependency edges; it must not silently redesign the architecture, duplicate normative text into every Bead, or start implementation during decomposition. The decomposition output must preserve the work-package identifiers and dependency constraints defined in Sections 14 and 15.

The implementation program is split into five coordinated execution tracks:

- **Track A — Specialists bridge runtime:** the critical chain-first spine and remaining roadmap work on the live runtime.
- **Track B — xtrm Stage 0, Substrate and Channels:** daemon/state-store and semantic messaging work owned by xtrm, not reimplemented ad hoc in Specialists.
- **Track C — Prompt, context, telemetry and eval modernization:** the original modernization program defined by this PRD.
- **Track D — Cross-harness policy hooks and xtmux attention architecture:** shared policy kernel, Claude/Pi adapters, durable findings, shadow-first rollout, monitor/handoff reuse and authoritative Specialists validation.
- **Track E — Interactive coordinator bridge:** progressive-disclosure skills, first-user-prompt composition, preheated/direct assignment modes, coordinator doctrine, cross-coordinator hygiene and current attention/messaging integration.

Tracks C, D and E start immediately with telemetry integrity, historical baselining, content audit, the policy-kernel reuse audit and the interactive-role parity contract. Numbered Workstreams A–E later in this document describe capability domains and are not the same labels as these execution tracks. Their fully chain-aware portions consume Track A foundations. Track B is intentionally delayed and replaces bridge mechanisms only when Stage 0, Substrate and Channels are real.

The required result is not merely shorter prompts. The required result is a measurable, versioned and chain-aware agent runtime in which:

1. Each specialist has a small, stable role identity and a clear decision boundary.
2. Shared policies have one source of truth and are injected only when applicable.
3. Chain membership, upstream evidence and downstream obligations are explicit.
4. Historical memories are retrieved deliberately rather than pushed indiscriminately.
5. Runtime telemetry accurately represents thinking, tools, turns, payload, evidence and chain state.
6. Existing and future runs can be evaluated using deterministic, model-based and human graders.
7. Prompt and model changes are promoted through controlled paired experiments rather than intuition.
8. Console provides historical, live and experiment-specific evaluation surfaces without becoming a second telemetry producer.
9. Interactive role sessions receive current task context and mandatory rules as a first user assignment, never buried inside the long-lived system prompt.
10. The interactive coordinator applies future chain-coordinator judgment duties through current Specialists, Beads and xtmux primitives without pretending that xtmux is Substrate or Channels.
11. Every managed Specialist activation runs through a versioned deterministic shell that validates contract readiness, records policy acknowledgement, types planning and evidence, and owns commit/result/Bead-note/notification/cleanup finalization.

# 1. Executive summary

The Specialists architecture already has strong primitives: role-specific agents, Beads contracts, worktree isolation, mandatory gates, structured output schemas, `xtrm.forensic.v1`, per-repository observability databases, Prometheus projection and a Console materializer. The principal problem is that these primitives evolved in parallel and currently overlap in ways that increase context size and weaken semantic clarity.

The six original audited specialists carry large system prompts, in some cases more than 10,000 tokens once all layers are counted. The largest source is not always the role prompt itself. A non-`bare` specialist can receive all of the following:

- its `prompt.system`;
- a task template and Bead context;
- completed dependency descriptions and notes;
- required and default mandatory rules;
- specialist-specific mandatory rules and inline rules;
- eager skill bodies passed through Pi;
- a runtime Specialist Run Context block;
- a global output-style directive;
- a hardcoded GitNexus workflow mandate;
- static Beads workflow and close instructions;
- filtered memory injection;
- an optional GitNexus pre-query snapshot;
- a generated output contract based on response format, output type and output schema;
- reviewer-specific diff and lineage instructions;
- tool definitions and harness framing.

This composition creates four classes of defect.

**Redundancy:** The same policy is expressed in a system prompt, mandatory rule, task template and runner injection. Executor receives multiple GitNexus mandates, multiple scope rules and multiple handoff requirements. Reviewer repeats seconder work and restates an output format already generated by the runner. Test-engineer repeats its source boundary in inline rules, system prompt and task template.

**Contradiction:** The generated output contract, handoff-schema rule and role-specific output prose use incompatible status and verdict vocabularies. Global worktree and close rules are injected into read-only or external-research roles where they are irrelevant or conflicting. A global “stop if local evidence is missing” rule conflicts with researcher’s external-evidence mandate.

**Missing chain identity:** The architecture defines specialists as members of a chain, but the role prompts mostly treat them as isolated agents. A reviewer may need executor, seconder, test-engineer, test-runner, obligations and security evidence, yet dependency preloading is bounded and does not guarantee the full upstream chain. The agent is not deterministically told its chain, position, root contract, upstream members, completed gates or downstream handoff.

**Insufficient evaluation discipline:** Observability captures substantial raw data, but the system lacks a first-class evaluation control plane. It cannot yet reliably answer whether one prompt or model is better for a role, whether chain-awareness improved outcomes, whether memory retrieval was necessary, or whether a shorter prompt changed false-PASS rates. Some current metrics are also unsuitable for A/B decisions until corrected, notably thinking duration and tool-call counting.

The modernization is therefore organized into five tightly related programs:

1. **Prompt and policy consolidation.** Reduce the six core role prompts by approximately 45–90%, depending on role, while preserving role-specific capability. Move deterministic policies to runtime, shared behavior to mandatory rules and deep procedures to on-demand skills.
2. **Chain participant context.** Inject a compact, deterministic chain identity and pointer block. Teach specialists how to reconstruct only the necessary upstream context using Beads and Specialists commands. Extend handoffs with decisions, evidence, assumptions and downstream attention.
3. **Pull-based memory.** Remove eager semantic memory dumps. Provide a short retrieval rule and targeted `bd memories`/`bd recall` workflow, with provenance and observability.
4. **Telemetry hardening.** Correct tool accounting, model thinking spans, forensic-to-Prometheus wiring and activity semantics. Add metrics required for role, chain and evaluation analysis.
5. **Evaluation platform.** Add eval suites, cases, experiments, trials, graders, scores and pairwise comparisons. Support retrospective scoring of existing per-repo databases, automatic post-run and post-chain deterministic evaluation, controlled replay benchmarks and Console visualization.
6. **Interactive coordinator bridge.** Refactor `using-specialists` for progressive disclosure; inject current mandatory rules and tracked Bead context as a first user assignment; support preheated standby and direct `--bead` launch; teach the coordinator canonical chain templates, scope review, collision management, cross-coordinator mechanics, close-time evidence and escalation.

The recommended implementation order is telemetry integrity and immutable baselines first; in parallel, audit and build the interactive assignment seam; then land the critical chain spine; then run prompt, memory and coordinator experiments. This prevents decisions from being made with ambiguous metrics while still removing immediate bridge friction.

# 2. Background and verified current-state architecture

## 2.1 Specialist roles in scope

The original prompt-modernization wave covers six managed specialists:

| Role | Intended responsibility | Current strategic position |
|---|---|---|
| `executor` | Implement the Bead contract in the assigned worktree | Primary production writer |
| `seconder` | Cheap bounded pre-QA gate for scope compliance and implementation sanity | Immediately after writer |
| `test-engineer` | Author tests, fixtures, smoke/E2E assets and telemetry assertions from the actual diff | Between seconder and test-runner |
| `reviewer` | Final evidence-based release verdict and Release Checklist | Final gate |
| `researcher` | Gather current external evidence and synthesize findings | Advisor or standalone investigation |
| `overthinker` | Stress-test uncertain or high-impact decisions | Advisor, premortem or standalone decision review |

The role separation is fundamentally sound and should not be collapsed. The modernization should make these boundaries clearer, not replace them with a general-purpose super-agent.

## 2.2 Canonical production-diff chain

The current design canon defines the production pipeline as:

```text
writer (executor or debugger)
  -> seconder
  -> test-engineer
  -> test-runner
  -> security-auditor when required
  -> obligations-scanner
  -> reviewer
  -> release decision
```

The formula catalog represents a chain as a Beads molecule. The molecule is the chain identity. It contains a root child carrying the overall change contract and step children carrying role-specific mandates. `needs` creates blocking relationships; labels can carry richer semantic edges such as `validates`, `informs`, `implements`, `discovered-from` and `parent-child`.

The `code-standard` formula explicitly states that reviewer inputs include the executor diff, seconder verdict, test evidence, obligations output and root contract. The `code-with-advisors` formula adds explorer, researcher and overthinker outputs before executor and expects the final reviewer to consume advisor findings as well.

## 2.3 Prompt composition at runtime

The effective specialist prompt is not equivalent to `prompt.system`. It is composed from multiple sources.

### System-side content

The Pi session receives:

1. Rendered `prompt.system`.
2. A Specialist Run Context block that distinguishes the specialist from a human developer and controls Bead lifecycle behavior.
3. A global output-style directive.
4. A GitNexus workflow mandate when the repository is indexed.
5. Static Beads workflow rules and a close checklist.
6. Filtered Beads memories when a Bead is present.
7. An optional GitNexus pre-query snapshot.
8. A generated output contract derived from `response_format`, `output_type` and `prompt.output_schema`.
9. Pi-native skill files from `prompt.skill_inherit` and `skills.paths`.
10. Tool and extension definitions resolved from the manifest catalog and permission tier.

### Task-side content

The task prompt receives:

1. The rendered role task template.
2. The root or step Bead contract.
3. Notes attached to the current Bead.
4. Completed blocking dependencies, recursively up to the configured context depth.
5. Runtime worktree boundary rules.
6. Required, default, specialist-specific and inline mandatory rules.
7. Reviewer-specific injected diff context where applicable.
8. Pre-script output and invocation variables.

This distinction matters for optimization. A small `prompt.system` does not guarantee a small first-turn input. The API-billed first-turn input must remain the source of truth, while payload component events are used to identify which layer contributes the bloat.

## 2.4 Mandatory-rule resolution

The canonical rule loader combines:

1. required template sets;
2. default template sets unless default globals are disabled;
3. specialist-declared template sets;
4. specialist inline rules.

The package-level index currently requires `core-session-boundary` and defaults to `git-workflow-safe`. Specialist-specific rules then add executor delivery, code-quality defaults, GitNexus and Serena instructions, handoff schema, Bead ID discipline, research routing and other role-specific behavior.

The package-canonical rules can be audited from the repository. The effective installation may still differ because user or repository overlays and global user configuration can override or append content. Therefore all implementation and experiment tooling must fingerprint and capture the **resolved** configuration, not assume package defaults.

The authoritative inspection path is conceptually:

```bash
sp config show <specialist> --resolved
sp list-rules --specialist <specialist> --json
```

## 2.5 Skills

Among the six package-canonical specialist files inspected, `test-engineer` declares `test-planning`; the other five do not declare explicit skill paths. The corresponding package-canonical skill body was not present at the expected repository path during the audit. It may resolve from an installation/user layer or be stale. This is a concrete reason that eval fingerprints must capture the activated skill path and body hash at runtime.

Skill bodies are eagerly injected by Pi and billed as input tokens, while the current payload breakdown records only skill labels or paths. Their real contribution must be derived from first-turn token use or measured directly by hashing and tokenizing the activated files.

## 2.6 Bead dependency context

`buildBeadContext` includes the current Bead title, description, parent and notes. It also includes descriptions and notes of completed blocking dependencies. Dependency traversal is recursive and bounded by a configured depth, currently defaulting to three in the runner path.

This is useful but insufficient as a chain context contract:

- it follows only completed `blocks` dependencies, not all semantic edges;
- a final reviewer in a long chain may not receive executor or seconder evidence within depth three;
- security gates inserted outside the simple blocking path may be omitted;
- the current parent label can describe a chain molecule as a “Parent epic”, conflating hierarchy levels;
- the agent is not told whether the preloaded window is complete.

## 2.7 Observability storage

Each repository has an observability database. Core tables include:

- `specialist_jobs` for durable run state and startup payload;
- `specialist_events` for canonical timeline events;
- `specialist_results` for final or latest completed output;
- `specialist_job_metrics` for aggregated run metrics;
- `specialist_forensic_events` for `xtrm.forensic.v1` envelopes;
- chain and epic linkage tables;
- node run, member, event and memory tables;
- memory cache and FTS tables.

`specialist_job_metrics` persists identity, timestamps, active and waiting time, turns, tools, token trajectory, context trajectory, stall gaps, run-complete data and startup payload.

Historical job directories can be imported. Aggregate metrics can be recomputed from persisted timeline events. This makes retrospective evaluation feasible for a large subset of dimensions.

## 2.8 Forensic event model

`xtrm.forensic.v1` is already suitable as the universal event envelope. It supports:

- resource identity, including participant role and model;
- high-cardinality correlation, including job, Bead, chain, turn, tool call, trace, commit and eval IDs;
- structured event body;
- redaction state and rules;
- optional trace, OTel, links and diagnostics.

The schema deliberately forbids high-cardinality and sensitive values from Prometheus labels. Detailed evidence stays in forensic storage and evidence references, while Prometheus remains a bounded aggregate projection.

## 2.9 Current Prometheus projection

The current projection emits operational metrics for job state, queue depth, processes, worktrees, terminal job count, job duration, active runtime, chain count and duration, waiting time, turns, context utilization, tool calls and token direction.

The renderer also contains support for forensic-derived metrics such as gate verdicts, evidence references, MCP operations, identity, policy and eval runs/scores. However, the normal `sp metrics --prometheus` path currently reads statuses and job metrics but does not supply forensic events to the renderer. Those metric families are therefore not reliably present in the live scrape despite being implemented in the rendering layer.

## 2.10 Console architecture

Console already has the correct ownership boundary for this project:

- Specialists owns runtime events, forensic envelopes, projections, evaluation semantics and evidence production.
- The materializer reads per-repo Specialists databases and projects job rows, token metrics, forensic events and evidence references into its read model.
- Console owns queries, dashboards, drilldowns, experiment UX and operator decisions.
- Prometheus is used for aggregate operational symptoms; forensic/evidence storage is used for exact run and trial detail.

The Console observability design already includes an `eval` signal kind, eval lookup queries, eval result summaries and an AgentOps Governance dashboard pack. A new standalone application is therefore not required.


## 2.11 Shipped interactive role launcher

`xt pi --role <name>` and `xt claude --role <name>` are current production surfaces. They:

- resolve the effective specialist through `sp view <name> --raw`;
- create a dedicated worktree and branch;
- launch Pi or Claude in the current pane or a new tmux session;
- preserve role, parent, prompt-file and optional Bead metadata through pane options and `XTMUX_AGENT_*` environment variables;
- emit an `agent.role.launched` event;
- support detached orchestration, runtime-specific names, collision suffixing/reuse, model overrides and Pi thinking overrides.

The launcher currently resolves stable role identity and skills but does not reproduce the managed `sp run` task-side assembly. In particular, passing `--bead` currently supplies identity metadata but does not itself guarantee a first user turn containing the rendered Bead/dependency context and mandatory-rule block.

## 2.12 Interactive `chain-coordinator`

The shipped `chain-coordinator` is an interactive, persistent specialist persona scoped today to one epic or task group. It dispatches and monitors child `sp` chains, persists decisions in Beads and escalates judgment calls to a parent orchestrator through xtmux.

This role is retained under its current name during the bridge runway. The future Substrate design uses the same name for a transient coordinator scoped to one chain. The PRD therefore distinguishes:

```text
bridge interactive chain-coordinator
  one epic/task-group
  persistent Pi or Claude session
  applies coordinator duties across child chains

future Substrate chain coordinator
  one chain container
  participant of that chain
  spawned after composition and dies with the chain
```

The semantic overlap is deliberate: the bridge role should inherit the future coordinator's judgment duties where current primitives can support them. The lifecycle and authority model are not claimed to be identical.

## 2.13 xtmux SQLite attention and messaging runtime

xtmux has moved from flat JSONL as the primary runtime into a Bun/TypeScript SQLite implementation. SQLite V2 is default-on and owns typed operational domains for:

```text
messages and receipts
delivery attempts
agent instances, state transitions and completed turns
monitors, leases and terminal outcomes
handoff lifecycle
command telemetry
audit runs and durable findings
migration and retention
```

The generic journal remains a forensic and compatibility surface. Live tmux options remain reconstructible projections.

Current primitives relevant to this PRD include:

- `message-send`, `message-list`, `message-ack`;
- `message-status <message-key>` and `unread-count --for <recipient>`;
- `handoff`, `safe-send-pointer`, `wait-agent`, `monitor-agent`;
- automatic monitor arming after send/pointer operations in both Claude and Pi;
- Pi inbox widgets and deferred-reply reminders;
- durable handoff records and delivery-attempt separation;
- agent-state and turn-completion events.

These mechanisms are the bridge attention plane. They do not own Specialist chain truth, gate authority, resolved chain shape or final release decisions.

## 2.14 Bridge persistence split

During this PRD's implementation horizon:

| State | Authoritative store |
|---|---|
| Managed Specialist jobs, results, chain links, forensic events, metrics and evals | per-repository Specialists `observability.db` |
| Interactive tmux role lifecycle, short messages, receipts, monitors, handoffs and delivery attempts | xtmux `observability.db` |
| Durable task contracts, relationships, notes and memory | Beads |
| Console read model | Console materializer output |

Correlation uses Bead, chain, job, participant/activation and message/handoff identifiers. The stores are not merged prematurely. Console may materialize both sources later, but Specialists remains the evaluation and chain-semantics owner.

# 3. Problem statement

## 3.1 Prompt payload and instruction competition

The six specialist prompts are costly not merely because they are verbose, but because they compete with other instructions. Long prompts contain universal programming opinions, CLI manuals, detailed output examples, role procedures, shared policy and personality cues. The runner and mandatory-rule layers then inject additional versions of the same concepts.

The result is an instruction graph with multiple authorities. The model must infer which version of scope discipline, output schema, Git workflow or evidence ordering is current. This creates hidden failure modes:

- a stale system-prompt section can override a newer shared rule;
- examples become treated as requirements;
- a role over-applies generic guidance that conflicts with repository conventions;
- a generated schema and a prose schema disagree;
- a global rule unintentionally constrains a specialist for which it was not designed;
- critical role instructions are buried beneath tool manuals and style advice.

## 3.2 Role overlap

Reviewer is nominally phase-two and should consume seconder results, but its prompt reconstructs atomic requirements and repeats broad compliance review. Executor carries a complete TypeScript and clean-code manual despite being a general implementation specialist. Overthinker repeats the four-phase rule already injected separately. Researcher embeds command manuals already represented in routing rules. Test-engineer repeats the same source-boundary rule three times.

This overlap increases both token use and behavioral ambiguity. The modernization must enforce the principle that each role owns a narrow decision and trusts upstream work conditionally rather than starting from zero.

## 3.3 Missing participant identity

Specialists are chain participants, but the current role identity is mostly local: “you are reviewer”, “you are executor”. The system does not consistently say:

- which chain the specialist belongs to;
- which formula/template was resolved;
- which root contract governs the overall work;
- which step contract governs the current mandate;
- what upstream roles have completed;
- what evidence each upstream role produced;
- which gates remain pending;
- which downstream role will consume this handoff;
- which evidence is preloaded and which is available on demand.

Without this identity, agents either duplicate upstream work or fail to reconstruct necessary context.

## 3.4 Eager memory context

The runtime currently retrieves a bounded set of memories based on Bead keywords. Although smaller than earlier full-memory injection designs, the retrieval is still eager and lexical. It can inject irrelevant or stale knowledge into fully specified tasks.

The desired model is capability-based memory: the agent knows that historical knowledge exists, recognizes when prior decisions or incidents matter, and retrieves targeted memory with provenance. This should be measured rather than assumed.

## 3.5 Telemetry ambiguity

Several current metrics cannot yet support rigorous comparisons:

- thinking events lack start/end phases and duration;
- thinking character counts are cumulative rather than per delta or final segment;
- reasoning tokens are provider-dependent and not equivalent to reasoning time;
- tool metrics may count lifecycle events rather than unique calls;
- the Pi callback path can report both tool-call construction and tool execution;
- a query checks `think` while the canonical event type is `thinking`;
- forensic-derived Prometheus metrics are not wired into the default scrape path;
- historical rows have heterogeneous schema completeness.

## 3.6 Evaluation gap

Existing observability can describe cost and activity, but it does not yet determine quality. Reviewer PASS rate, for example, is not equivalent to reviewer accuracy. A model may PASS more often because it misses defects. Historical cohort comparisons can be confounded by task difficulty. A shorter prompt can save tokens while increasing false PASS rates. An LLM judge can prefer verbosity or the first answer shown.

A first-class evaluation platform is required to establish repeatable evidence for prompt, rule, runtime and model changes.

# 4. Goals, non-goals and design principles

## 4.1 Goals

The project shall:

1. Reduce static and eager context for the six target roles without reducing task success or role compliance.
2. Establish one source of truth for every shared policy and output contract.
3. Make chain membership and context reconstruction explicit and deterministic.
4. Replace indiscriminate memory push with measured, targeted recall.
5. Correct telemetry semantics before using them for promotion decisions.
6. Support retrospective evaluation of existing runs with explicit completeness labels.
7. Support automatic deterministic evaluation after every run and every chain.
8. Support controlled paired A/B testing across models, prompts, rules and runtime versions.
9. Support external software-engineering benchmarks and internal SWE-bench-style fixtures.
10. Integrate results into Console with historical, live and experiment-specific views.
11. Preserve low-cardinality Prometheus discipline and forensic drilldown.
12. Make every experiment reproducible through candidate and environment fingerprints.

## 4.2 Non-goals

The project shall not:

- merge the six roles into a single generic agent;
- expose private chain-of-thought or require models to reveal it;
- treat model-written success claims as environment truth;
- make LLM graders authoritative blocking gates before calibration;
- add high-cardinality IDs to Prometheus labels;
- create a second telemetry or Console application unnecessarily;
- use historical cohort averages as a substitute for controlled replay;
- force every role to retrieve memories on every run;
- inject entire chain histories into every participant;
- replace repository conventions with a universal clean-code doctrine;
- couple Console materialization to source-of-truth mutation.

## 4.3 Design principles

### Intrinsic role identity in the system prompt

A role prompt should contain only the mandate, boundaries, evidence hierarchy and decision rules intrinsic to that role.

### Shared policy in one reusable layer

Cross-role policies belong in mandatory rules or runtime enforcement, not copied prose.

### Deterministic decisions in code

Scrutiny floors, required gates, path matching, worktree boundaries, output-schema validation and chain identity should be computed by the runtime.

### Deep procedure on demand

CLI manuals and lengthy playbooks belong in focused skills or tool descriptions, loaded only when needed.

### Deterministic shell, typed agentic core

One Specialist activation is not a free-form prompt followed by a terminal result. It executes through a versioned protocol:

```plaintext
runtime PREPARE
→ typed agentic PLAN
→ typed agentic EXECUTE
→ runtime FINALIZE
```

The runtime owns structural contract validation, mandatory-rule receipts, phase applicability, plan/evidence/schema validation, Git finalization, result persistence, Bead handoff, parent notification and cleanup. The model owns semantic readiness judgment, conditional memory choice, local planning, role work and evidence interpretation. A completed process is not a satisfied chain step until the validated result satisfies the step contract.

### Identity pushed, content pulled

The runtime should inject compact chain identity, member indexes and evidence pointers. The specialist should retrieve substantive upstream content only when its role requires it.

### Outcome over self-report

Tests, environment state, diff and evidence artifacts outrank the model’s final statement.

### Hard gates before weighted scores

A role-boundary violation or critical false PASS cannot be compensated by token efficiency.

### Observe before enforce

New graders and policies begin in shadow mode. Enforcement requires measured precision and low false-positive rates.

### Version every evaluator

Prompt, rules, skills, runtime, grader, dataset and environment versions must be recorded.

# 5. Workstream A — Prompt and policy modernization

## 5.1 Target prompt architecture

Each target specialist should resolve into five conceptual layers:

```text
role core system prompt
+ applicable shared mandatory rules
+ compact runtime context
+ role-specific task contract
+ on-demand procedural skills/tools
```

The role core should generally remain within approximately 180–600 tokens. This is a design target, not a hard limit. Content is retained when it materially changes decisions.

The target reductions from the initial audit are:

| Specialist | Estimated system-prompt reduction | Target core size |
|---|---:|---:|
| Reviewer | 70–80% | 350–600 tokens |
| Executor | 80–90% | 250–450 tokens |
| Overthinker | 60–75% | 180–300 tokens |
| Seconder | 45–60% | 220–350 tokens |
| Test-engineer | 55–70% | 250–400 tokens |
| Researcher | 70–85% | 220–350 tokens |

The real KPI is first-turn input and outcome, not the length of the JSON field.

## 5.2 Output contract consolidation

The runtime already generates a base output contract and merges output-type extensions and specialist output schemas. This must become the only normative output definition.

Required changes:

1. Normalize base statuses. Choose one canonical vocabulary, recommended:

```text
success | partial | failed | waiting
```

2. Normalize reviewer verdicts, recommended uppercase at presentation boundaries and a canonical normalized enum in storage.
3. Convert example-shaped output schemas into valid JSON Schema.
4. Remove prose instructions that restate field lists already represented in schema.
5. Remove or radically shrink `per-turn-handoff-schema`; it may explain semantics but must not define a competing schema.
6. Emit schema-validation results as deterministic evaluation events.
7. Version the merged schema and store its hash on each run.

## 5.3 Reviewer modernization

### Current defects

- Repeats requirement normalization and compliance work assigned to seconder.
- Uses an adversarial persona that may increase cosmetic findings and severity inflation.
- Contains a full CLI and evidence-reconstruction manual.
- Computes scrutiny and gate requirements in prompt text rather than consuming resolved policy.
- Repeats output and Release Checklist formats.
- Duplicates the `seconder ran` checklist item.
- Contains obligations and simplification procedures that should be separate gate/policy inputs.

### Target responsibility

Reviewer is the final evidence-based release gate. It should:

- consume the root contract and resolved chain state;
- consume final upstream gate evidence;
- inspect unresolved findings, critical requirement coverage and high-risk changed surfaces;
- detect contradictions or missing required evidence;
- produce PASS, PARTIAL or FAIL with evidence-linked findings;
- use delta mode for re-review after PARTIAL;
- never edit files;
- avoid preference-only findings.

### Runtime-provided inputs

```text
reviewed_job_id
chain_id
root_bead_id
current_step_bead_id
resolved_scrutiny
required_gates
gate_results
upstream_job_ids
injected diff/evidence refs
previous reviewer findings for re-review
```

### Procedures moved out of core prompt

- job and feed lookup command details;
- scrutiny path tables;
- obligation marker vocabulary;
- Release Checklist rendering;
- output JSON examples;
- tool-specific GitNexus syntax;
- full Ddiff procedure, except a concise semantic statement.

## 5.4 Executor modernization

### Current defects

The executor prompt contains an extensive universal style guide: naming rules, function-length limits, nesting limits, TypeScript and Zod requirements, error doctrine, concurrency doctrine, performance doctrine, security rules, testing advice and anti-pattern tables.

Several rules conflict with one another or with repository-specific practice. Examples include “extract at the second duplication” versus “wait until the third use”, “fix adjacent smells” versus strict scope, mandatory Zod for every external input, hard limits on function length and arguments, and “never return null”.

### Target responsibility

Executor should:

- resolve and obey the Bead contract;
- remain within the assigned worktree and scope;
- inspect relevant code and dependency impact;
- make the smallest correct change;
- follow local language/framework/repository conventions;
- reuse existing code and dependencies;
- avoid speculative abstraction and unrelated cleanup;
- perform declared validation and focused checks;
- return a complete evidence-based handoff.

Language-specific standards should be loaded from repository or on-demand skills, not hardcoded globally.

### Validation policy

Executor may run focused validation required by the Bead. Broad authoritative suite execution remains owned by test-runner unless explicitly required. The current blanket “do not run tests” language should be replaced with ownership-aware wording.

## 5.5 Overthinker modernization

### Current defects

- Repeats the four-phase rule already injected separately.
- Forces a multi-phase structure even for simple reversible decisions.
- Uses “multi-persona chain-of-thought” framing.
- Contains hardcoded command permissions that are already enforced by tool tiers.

### Target responsibility

Overthinker is a read-only decision-review specialist. It should scale depth to consequence and uncertainty:

- simple/reversible decision: direct recommendation;
- uncertain/costly decision: compare viable alternatives and trade-offs;
- high-impact/irreversible decision: premortem, disconfirming evidence and confidence.

It reports conclusions, assumptions, alternatives, risks and validation steps, not private reasoning traces.

## 5.6 Seconder modernization

### Current strengths

Seconder is already the best-bounded prompt in the group. Its split between scope verdict and quality verdict is useful. `UNCLEAR` is a valuable state when evidence is truly insufficient.

### Current defects

- smell lists repeat shared code-quality rules;
- output schema appears both in prose and JSON;
- tool-call budget belongs in runtime configuration;
- evidence hierarchy can be shared with other gates;
- eager context expansion could make it a second reviewer.

### Target responsibility

Seconder answers one question: whether the writer output is sufficiently compliant and implementation-sane to justify expensive QA. It should not become a release, security or broad architecture review.

## 5.7 Test-engineer modernization

### Current defects

- source boundary repeated in inline rules, system prompt and task template;
- mode inferred from free text rather than explicit dispatch metadata;
- output schema is example-shaped rather than formal JSON Schema;
- report-section requirements duplicate generated output contract;
- possible stale or installation-local `test-planning` skill reference.

### Target responsibility

Test-engineer receives an explicit mode:

```text
test_only | post_implementation
```

It authors tests and testing assets from actual behavior and diff evidence. Production edits are forbidden unless an explicitly named helper/export change is authorized. When source behavior is wrong, it returns `source_bug_suspected` with evidence.

## 5.8 Researcher modernization

### Current defects

- embeds detailed tool and CLI manuals;
- duplicates research routing rules;
- absolute “never answer from memory” language is too broad;
- does not sufficiently separate internal project memory from external evidence.

### Target responsibility

Researcher applies an epistemic policy:

- use current authoritative sources for unstable claims;
- prefer primary documentation and source repositories;
- distinguish facts, inference and unknowns;
- record dates and versions;
- verify consequential claims where practical;
- stop when success criteria are met;
- report tool failure rather than invent evidence.

Tool syntax stays in tool descriptions or focused skills.

## 5.9 Runner-injected content review

The prompt modernization must include runner blocks, not only specialist JSON.

### Specialist Run Context

Retain, but split into applicable fragments. Bead claim/close instructions should not be injected into every read-only or chain-step role when the orchestrator owns lifecycle.

### Output-style directive

The current global “smart caveman” rule may help agent-to-agent brevity but conflicts with evidence uncertainty and readable research/review output. Replace it with a bounded, role-aware style contract:

```text
Be concise and technical. Preserve uncertainty, evidence qualifiers and exact identifiers. Do not omit required rationale or schema fields.
```

Style effects should be evaluated by role.

### GitNexus mandate

Remove duplication between runner hardcoding, mandatory rules and task templates. Prefer a single runtime-generated tool policy that is aware of repository index health and role. Read-only roles should not receive “before editing” language.

### Static Beads close checklist

Do not inject `git add`, `commit`, `push` into read-only roles. Make it writer-specific and consistent with auto-commit ownership.

### Core session boundary

Split local worktree boundary from evidence-retrieval policy. Researcher must be permitted to retrieve external evidence. Missing local artifacts should not globally prohibit external or chain-context lookup.

## 5.10 Prompt fingerprinting

Every run must record:

```text
system_prompt_hash
task_template_hash
merged_output_schema_hash
mandatory_rules_hash
mandatory_rule_ids and versions
skill_paths and skill_body_hashes
runner_injection_version
tool_catalog_version
resolved_tool_set_hash
specialist_version
```

The system should optionally store redacted prompt component metadata and token counts, not raw sensitive prompt text in Prometheus.


## 5.11 `using-specialists` progressive disclosure

The canonical `using-specialists` skill has grown into a broad orchestration manual. It currently mixes stable doctrine, volatile CLI facts, long chain recipes, recovery procedures, interactive-coordinator guidance and operational reference material. Eagerly loading the complete body into persistent coordinator sessions conflicts with the objective of reducing monitoring context rot.

Target structure:

```text
config/skills/using-specialists/
├── SKILL.md                         compact router and invariant discipline
├── references/
│   ├── contracts-and-beads.md
│   ├── chain-composition.md
│   ├── qa-and-release-gates.md
│   ├── monitoring-and-recovery.md
│   ├── worktrees-merge-restitch.md
│   ├── observability-and-evidence.md
│   └── interactive-coordination.md
├── playbooks/
│   ├── single-chain.md
│   ├── diagnosis-debug.md
│   ├── epic-multiplexing.md
│   ├── security-sensitive.md
│   └── release-integration.md
└── templates/
    └── pointers or packaged copies required for current chain-template discovery
```

Requirements:

- Root `SKILL.md` target: 250–350 lines; hard ceiling 500.
- Every old heading maps to the compact core, an on-demand resource, another canonical document or an explicit deduplication/removal decision.
- No information is copied blindly. Volatile CLI guidance is reconciled against current `sp help`, Core `--role` behavior and xtmux V2.
- Installed global layout is recursively complete and link-valid under the current Core global-skills model.
- Coordinator sessions load only the root skill and coordinator-relevant references initially; phase-specific playbooks are read on demand.
- The old skill remains the baseline artifact for parity and behavior evaluation.

## 5.12 Interactive coordinator role doctrine

The coordinator's stable system prompt defines role identity and long-lived boundaries. It must not contain the current Bead payload or a flattened copy of mandatory rules.

The coordinator receives:

```text
system prompt
  stable identity, one-epic scope, parent relationship, escalation boundary

using-specialists root skill
  current execution mechanics and routing

coordinating-chains skill/reference
  chain-template awareness and coordinator-specific procedures

first user assignment
  current Bead/dependency context
  current mandatory rules
  current parent/peer pointers
  current chain/collision snapshot
```

The current hardcoded role sequence in the coordinator prompt is removed. The coordinator must resolve chain shape from the canonical formula catalog and, once available, from `sp chain review/approve/insert` and the persisted resolved chain shape.

The coordinator-specific guidance must cover:

- correct hierarchy: epic/task group → root Bead → molecule/chain → step Beads;
- chain-template catalog discovery and selection;
- scope/non-goal/scrutiny validation;
- mandatory-gate completeness;
- collision matrix construction and serialization/unification/restitch decisions;
- routine fix-loop routing;
- cross-coordinator mechanical communication;
- parent escalation;
- close-time evidence, clean-git verification, follow-up Beads and memory consideration.

Permission/tool enforcement for interactive roles is not part of this runway. Role-boundary violations are measured in evals and remain prompt/skill discipline until Substrate provides the proper capability model.

## 5.13 Deterministic Specialist execution protocol

Every managed Specialist activation shall use `specialists.execution.v1` or a compatible versioned successor.

Canonical phase sequence:

```plaintext
PREPARE
  resolve Bead/root/step/chain context at bounded depth
  validate the configured seven-field contract profile
  block on structural NOK
  produce semantic readiness READY | UNCLEAR | INVALID
  resolve and fingerprint mandatory rules
  record typed rule acknowledgement/conflicts
  resolve capabilities and skills
  optionally decide and perform memory retrieval

PLAN
  produce a typed activation-local execution plan
  validate plan scope, permissions, evidence producers and validation

EXECUTE
  perform the bounded role work
  record material plan deviations
  collect typed evidence

FINALIZE
  validate result schema and required evidence
  validate Git state and create the required commit for writer profiles
  persist the authoritative result
  append the structured Bead handoff automatically
  send the bounded typed parent message automatically
  emit forensic evidence
  release activation-owned resources
```

The default seven-field change-contract readiness profile is:

```plaintext
problem
scope
non_goals
dependencies_or_inputs
deliverables
validation
acceptance
```

`type` and `scrutiny` are separately required metadata. A step contract resolves the role-specific equivalents: mandate, inputs, outputs, scope, non-goals, validation and downstream handoff obligation.

### Ownership

```plaintext
Specialists runtime
  common phase state machine, validation and automatic finalization

Specialist definition
  selects an execution profile; declares permissions, memory/plan/commit policy,
  output schema and role-specific evidence requirements

root/step Bead
  task-specific contract and authorized scope

chain template / resolved chain
  participant topology, dependencies and gates

chain reducer
  derives runnable/satisfied state from persisted validated evidence
```

The full lifecycle must not be copied into every Specialist JSON or every formula. Definitions select reusable profiles and override only demonstrated role differences.

### Required correctness properties

- Contract NOK cannot proceed to planning.
- `UNCLEAR` waits/escalates rather than executing speculatively.
- Rule acknowledgement is not treated as compliance proof.
- Conditional memory search may be skipped with a recorded reason.
- A local plan cannot widen Bead scope or role capability.
- Missing required evidence prevents successful finalization.
- Commit, result, Bead note and parent message are runtime-owned and idempotent.
- Notification failure does not rewrite the job verdict.
- Chain satisfaction consumes the validated result, not raw model completion.

# 6. Workstream B — Chain participant identity and context reconstruction

## 6.1 Product requirement

A specialist dispatched as a chain step must be told that it is a chain participant. The runtime shall provide enough identity to orient the agent without injecting the complete chain history.

## 6.2 Chain context envelope

Recommended task/system injection:

```xml
<chain-context version="1">
  <chain-id>...</chain-id>
  <chain-template>code-standard</chain-template>
  <root-bead-id>...</root-bead-id>
  <current-step-bead-id>...</current-step-bead-id>
  <current-role>reviewer</current-role>
  <current-class>gate</current-class>
  <position>final</position>
  <scrutiny stated="medium" effective="high" />
  <upstream complete="false">
    <step role="executor" bead-id="..." job-id="..." status="completed" />
    <step role="seconder" bead-id="..." job-id="..." status="completed" />
  </upstream>
  <pending>
    ...
  </pending>
  <preloaded-context depth="3" complete="false" />
  <worktree-path>...</worktree-path>
</chain-context>
```

The envelope must be generated from persisted chain shape and Beads relationships, not inferred by the model.

## 6.3 Shared chain-participant rule

A shared mandatory rule should teach the operational semantics:

- the root change contract governs overall outcome;
- the current step contract governs mandate and boundaries;
- upstream handoffs are evidence, not overriding authority;
- consume preloaded dependency context first;
- reconstruct only missing necessary context;
- prefer `sp result` for final handoff and `sp feed --json` only for claims that require trace verification;
- use `bd show`, `bd dep list` and `bd dep tree` to understand issue relationships;
- do not repeat upstream work unless the current role validates it, evidence is missing or artifacts contradict it;
- report contradictions explicitly;
- produce a downstream-usable handoff.

The rule should apply only when a real chain context exists or the Bead is marked `kind:step`.

## 6.4 Context retrieval hierarchy

Recommended hierarchy:

1. Injected chain context and authoritative runtime metadata.
2. Current step Bead and root change contract.
3. Preloaded completed dependency handoffs.
4. `sp result` for specific upstream jobs.
5. Current diff, repository state and evidence artifacts.
6. `sp feed --json` for verifying claimed tool use, exact chronology or contradictory evidence.
7. Semantic Beads edges for related, discovered-from or validates context.
8. Historical memories only if prior decisions/incidents are materially relevant.

## 6.5 Handoff schema extension

The common output schema should support optional chain collaboration fields:

```json
{
  "inputs_consumed": [
    {"role": "seconder", "bead_id": "...", "job_id": "..."}
  ],
  "decisions": [
    {
      "decision": "...",
      "rationale": "...",
      "evidence": ["..."]
    }
  ],
  "assumptions": [],
  "unresolved_questions": [],
  "downstream_attention": []
}
```

These fields capture decision records, not hidden chain-of-thought.

## 6.6 Role-specific chain behavior

### Executor

Consumes advisor findings and root contract. It should cite material advisor decisions it accepted or rejected.

### Seconder

Consumes writer diff and root contract. It should remain bounded and avoid loading the full chain unless a required input is absent.

### Test-engineer

Consumes writer diff, root validation contract, seconder verdict and prior test-runner output on retries.

### Reviewer

Consumes final evidence from all required gates. It does not independently recreate every gate unless evidence is missing or contradictory.

### Researcher and overthinker

When used as advisors, they must identify the downstream executor as consumer and produce action-oriented evidence rather than standalone essays.

## 6.7 Chain-context evaluation

The `chain-participation-v1` suite shall measure:

```text
chain identity recognition
root and step contract resolution
upstream handoff discovery
selective reconstruction
semantic edge navigation
contradiction detection
non-duplication of upstream work
downstream handoff quality
```

Adversarial cases shall include missing handoffs, conflicting gates, stale memory, incomplete preloaded depth, unrelated semantic edges and cross-chain contamination.


## 6.8 Interactive assignment contract

Interactive roles require a task-side composition path that preserves the managed Specialists design: current task context and mandatory rules are prominent in the user turn and remain separate from the system prompt.

Specialists owns a pure, non-executing renderer. Conceptual contract:

```bash
sp role compose chain-coordinator \
  --surface interactive \
  --mode tracked|standby \
  [--bead <id>] \
  --project-cwd <path> \
  --parent-session <session-id> \
  --output <secure-prompt-file> \
  --json
```

For `mode=tracked`, the renderer reuses the same pure seams as `sp run` for:

1. effective specialist resolution;
2. bounded Bead and dependency context;
3. `task_template` rendering;
4. required/default/role/inline mandatory-rule resolution;
5. token limits and fatal-resolution behavior;
6. component metadata and fingerprinting.

The renderer does not create a job, worktree, session, Bead mutation or runtime event. It never returns the role system prompt. It emits a secure prompt file plus machine-readable metadata containing hashes, component IDs and byte/token counts.

For `mode=standby`, the renderer emits only the minimal bootstrap required for a preheated role to acknowledge its parent and wait for one epic assignment. It does not inject a fabricated Bead context or the full tracked mandatory-rule set.

The coordinator `task_template` must be audited because `$prompt` and `$bead_context` may currently resolve from the same tracked Bead payload. The final contract contains one complete Bead context exactly once.

## 6.9 Two launch modes

### Mode A — preheated standby

```bash
xt pi --role chain-coordinator --new-session --no-attach
xt claude --role chain-coordinator --new-session --no-attach
```

Flow:

```text
launch role and worktree
→ runtime readiness event
→ deliver standby bootstrap as first user turn
→ coordinator sends role.ready to parent
→ coordinator waits
→ parent later assigns exactly one epic
→ Specialists renders tracked assignment
→ xtmux delivers pointer
→ coordinator optionally sends assignment.accepted
```

A preheated coordinator is not a general reusable daemon. It accepts one epic/task group and is retired after that scope completes.

### Mode B — direct tracked launch

```bash
xt pi --role chain-coordinator --bead <epic> --new-session --no-attach
xt claude --role chain-coordinator --bead <epic> --new-session --no-attach
```

Flow:

```text
resolve effective role
→ render tracked assignment in original project cwd
→ fail before provisioning if rendering fails
→ create worktree/session
→ wait for runtime readiness
→ deliver prompt-file pointer as first user turn
→ arm monitor
→ retain @agent_bead and XTMUX_AGENT_BEAD as live identity pointers
```

Passing `--bead` implies automatic tracked assignment unless an explicit debugging escape hatch such as `--no-auto-assign` is provided.

## 6.10 Runtime readiness and secure delivery

The current launcher writes `@agent_state=idle` before the runtime startup hook has proved that Pi or Claude can safely accept input. This creates a startup race.

Required bridge state:

```text
starting | running | needs-input | done | idle | off
```

Core sets `starting` at spawn. The Pi extension or Claude SessionStart hook transitions to `idle` and emits `agent.ready`. `starting` is treated as unsafe by `safe-send-pointer` and readiness waits.

Canonical delivery:

```text
precomposed secure prompt file
→ wait-agent/readiness gate
→ handoff existing prompt file
→ safe-send-pointer one-line pointer
→ monitor-agent or existing automatic monitor hook
```

Full prompt bodies must not appear in process argv, shell-quoted command strings, pane options, messages, launch events or telemetry. A positional initial prompt is rejected as the default bridge transport because process-list exposure and multiline/runtime divergence are avoidable. Pi and Claude receive semantically identical assignment content through their interactive prompt surface after readiness.

xtmux `handoff` should accept a precomposed prompt file without rewriting it and support an atomic high-level mode equivalent to:

```bash
tmux-session-picker handoff \
  --target <pane> \
  --bead <id> \
  --existing-prompt-file <file> \
  --parent <session-id> \
  --wait-ready \
  --monitor \
  --yes
```

`message-send` is used for durable short acknowledgements, status and escalations. It does not replace prompt injection.

## 6.11 Coordinator bridge duties

For each child chain, the interactive coordinator applies four future-facing duties through current primitives.

### Entry gate

Before dispatching step 1:

- verify root contract, scope, non-goals and acceptance criteria;
- verify `contract:ready` state and SCRUTINY;
- inspect the recommended/selected formula;
- verify mandatory pipeline overlays and sensitive-surface gates;
- inspect active collision state and dependency ordering;
- insert or propose missing advisors/gates within the current roadmap's composition rules;
- escalate when scope, architecture or budget is ambiguous.

### Borderline judge

During execution:

- route mechanically clear remediation to the correct writer/gate;
- interpret minor findings against explicit non-goals;
- detect contradictory or stale evidence;
- escalate reviewer FAIL, sensitive findings, architectural disagreement and ambiguous completion.

### Hygiene coordinator

Across parallel child chains:

- maintain an explicit conflict matrix;
- advertise touched paths, gate availability and wait dependencies;
- communicate mechanical hygiene to peer coordinators through xtmux;
- never use peer messages to decide product vision or final merge policy.

### Close-time judge

Before reporting readiness to the parent:

- verify all mandatory gates ran against the latest diff;
- verify no unresolved PARTIAL/FAIL remains;
- verify every intended change is committed and no stray artifacts remain;
- verify evidence references and test results;
- file `discovered-from` follow-up Beads for out-of-scope findings;
- consider `bd remember` for durable lessons;
- report `READY_FOR_PARENT_DECISION` with evidence.

The parent orchestrator retains final vision, merge, abandonment and beyond-policy authority during the bridge runway.

## 6.12 Coordinator communication vocabulary

Current xtmux messages should use a small pointer-oriented vocabulary that reads forward to future Channels/pulses:

```text
role.ready
assignment.accepted
chain.status
collision.notice
gate.available
wait.request
handoff.pointer
escalation.scope
escalation.security
escalation.verdict
chain.ready
```

Messages contain bounded summaries and durable references. Beads and Specialists state remain authoritative. Acknowledgement proves receipt/processing responsibility, not release authority.

Coordinator-to-coordinator communication is limited to mechanics. Direction changes, abandonment, merge ordering, sensitive judgment and architecture go to the parent orchestrator.

## 6.13 Interactive coordinator evaluation

Add an `interactive-coordinator-v1` suite with at least:

```text
template-selection correctness
scope/non-goal validation accuracy
mandatory-gate completeness
collision detection recall and false serialization
routine fix-loop routing accuracy
escalation precision and recall
child-completion consumption latency
role.ready and assignment.accepted behavior
reply-obligation handling
close-readiness accuracy
follow-up Bead quality
memory retrieval precision
parent orchestrator context/token reduction
coordinator compaction/context growth
Pi vs Claude behavior deltas
```

Primary experiment:

```text
parent orchestrator coordinates directly
vs Pi interactive chain-coordinator
vs Claude interactive chain-coordinator
```

# 7. Workstream C — Pull-based memory

## 7.1 Current behavior

The current runtime extracts keywords from Bead title and description, queries the memory cache and injects a bounded set of ranked memories. Ranking uses lexical BM25, recency and access frequency. The injection budget is bounded, but the model pays the cost even when historical context is unnecessary.

## 7.2 Target behavior

Memory becomes an explicit capability. The runtime injects a short policy, not memory content:

```text
Historical project memories are available through bd memories and bd recall.
Query them only when the task depends on prior decisions, conventions, incidents,
accepted exceptions or unresolved ambiguity. Treat memories as context, not
current authority; verify against the root contract, current code and documentation.
```

## 7.3 Retrieval triggers

A specialist should consider memory when:

- the Bead references an existing convention or prior implementation;
- multiple conflicting repository patterns exist;
- a known incident or regression history may change validation;
- an architecture or API choice depends on a previous decision;
- a reviewer needs to understand an accepted exception;
- an overthinker is evaluating a high-impact repeated failure mode.

A specialist should normally avoid memory when:

- the task is fully specified and local;
- the information is directly available in current code or documentation;
- the role is a cheap bounded gate and history is not required;
- the claim concerns current external APIs, versions or standards that require external sources.

## 7.4 Retrieval interface

Preferred capabilities:

```bash
bd memories search --query "..." --limit 5 --json
bd memories relevant --bead <id> --limit 5 --max-tokens 500 --json
bd recall <memory-key> --json
```

Memory results should expose provenance:

```text
memory key
summary/value
created and updated timestamps
source Bead/job/commit
confidence
status: current | superseded | unknown
```

If the current CLI cannot provide this shape, the project should add a Specialists-side wrapper over the existing FTS/ranking cache.

## 7.5 Memory telemetry

Record:

```text
memory query count
query kind and normalized keyword count
result count
tokens/bytes returned
recall count
memory identifiers consumed
whether memory was cited in handoff
query latency
```

Do not put raw query text or memory content in Prometheus labels.

## 7.6 Memory evaluation

Required dimensions:

- necessary-memory recall rate;
- unnecessary-query rate;
- task success with and without memory;
- stale-memory contradiction handling;
- memory token cost;
- retrieval latency;
- provenance use;
- model and role differences in deciding when to query.

A/B rollout should compare eager injection, pull guidance and no-memory control on curated cases.

# 8. Workstream D — Telemetry and forensic hardening

## 8.1 Requirement

No model, prompt or chain promotion decision may depend on a metric with unresolved counting semantics. A telemetry integrity suite must be introduced and pass before the eval platform is used for promotion.

## 8.2 Thinking events

### Current behavior

Pi exposes `thinking_start`, `thinking_delta` and `thinking_end`. Specialists currently emits generic `thinking` events for start and deltas, with only a character count. `thinking_end` is not persisted. The supervisor accumulates characters, so persisted values are cumulative snapshots.

### Required event model

```json
{
  "type": "thinking",
  "phase": "start|delta|end",
  "segment_id": "...",
  "turn_index": 2,
  "delta_char_count": 128,
  "total_char_count": 1840,
  "duration_ms": 7320
}
```

The end event should carry final segment duration and total characters. Raw thinking content should not be stored by default.

### Derived measures

```text
thinking_stream_duration_ms
thinking_segments
thinking_chars
reasoning_tokens
thinking_to_active_runtime_ratio
time_to_first_thinking
time_to_first_tool
time_to_first_text
inter_tool_deliberation_ms
```

The metric must be named as a stream duration, not provider compute time.

## 8.3 Tool-call accounting

### Current risk

Timeline aggregation increments tool counts for every `tool` event, which includes start, update and end. Pi may also call tool callbacks during both LLM tool-call construction and execution.

### Required correction

- Count a tool call only on canonical `tool phase=start` execution events.
- Deduplicate by `tool_call_id`.
- Track uncorrelated calls separately.
- Distinguish construction events from execution events if retained.
- Compute duration by matching start/end on `tool_call_id`.
- Support parallel active tool calls without a single global `toolStartMs`.

### Metrics

```text
xtrm_tool_calls_total
xtrm_tool_errors_total
xtrm_tool_call_duration_seconds
xtrm_uncorrelated_tool_events_total
xtrm_parallel_tool_concurrency
```

## 8.4 Turn and message timing

Add stable start/end pairing for:

```text
turn duration
assistant message duration
tool-result message duration
time to first output token
time from last tool end to final response
```

## 8.5 Activity and stall semantics

Correct queries and state logic to use the canonical `thinking` event name rather than `think`. Stalls should distinguish:

- no protocol activity;
- active thinking stream;
- long-running tool;
- provider/network silence;
- waiting state.

## 8.6 Forensic-to-Prometheus wiring

The default metrics collector must read forensic events within the requested time range and pass them to the projection renderer. Required families include:

```text
xtrm_gate_verdicts_total
xtrm_evidence_refs_total
xtrm_mcp_operations_total
xtrm_identity_operations_total
xtrm_policy_decisions_total
xtrm_policy_mismatches_total
xtrm_eval_runs_total
xtrm_eval_score
```

The collector must use bounded event-family queries and not load unbounded event history.

## 8.7 New operational metrics

Recommended additions:

```text
xtrm_thinking_duration_seconds
xtrm_thinking_segments_total
xtrm_turn_duration_seconds
xtrm_message_duration_seconds
xtrm_time_to_first_action_seconds
xtrm_schema_validation_total
xtrm_handoff_validation_total
xtrm_chain_fix_loops_total
xtrm_chain_time_to_pass_seconds
xtrm_chain_tokens_to_pass_total
xtrm_memory_queries_total
xtrm_memory_results_total
xtrm_grader_duration_seconds
xtrm_eval_assertions_total
xtrm_eval_regressions_total
xtrm_eval_judge_disagreements_total
```

## 8.8 Historical completeness

Every derived historical metric shall record availability:

```text
complete
partial
unavailable
estimated
```

Missing historical fields are unknown, not zero.

## 8.9 Telemetry integrity eval suite

`telemetry-integrity-v1` shall verify:

- exactly one canonical run-complete per run turn;
- monotonic sequence;
- tool starts equal unique calls;
- paired tool durations where IDs exist;
- no negative durations;
- waiting plus active time is consistent with elapsed time within tolerance;
- token trajectory is monotonic/semantically consistent;
- context ratio remains bounded;
- thinking spans are paired;
- forensic conversion preserves identity and timestamps;
- Prometheus projection rejects forbidden labels;
- forensic-derived metrics appear in live scrape when events exist.

# 9. Workstream E — Evaluation platform

## 9.1 Evaluation subject

A candidate is not merely a model. It is the resolved combination:

```text
model
x specialist version
x system prompt
x mandatory rules
x skills
x runner injections
x tool catalog
x permission tier
x thinking level
x chain position
x task/environment
```

Every candidate must have a deterministic fingerprint.

## 9.2 Evaluation levels

### Outcome quality

Did the final environment satisfy the task? Examples: hidden tests, state assertions, schema validation, smoke/E2E, telemetry assertions, diff correctness and absence of regressions.

### Role behavior

Did the specialist obey its mandate and boundaries? Examples: no reviewer edits, no unauthorized test-engineer source changes, bounded seconder behavior, researcher source discipline.

### Chain contribution

Did the specialist consume the right upstream evidence, avoid duplication, detect contradictions and produce a useful downstream handoff?

### Efficiency and reliability

What were the token, time, tool, retry, compaction, stall and variance characteristics?

Efficiency is reported separately and cannot compensate for failed hard gates.

## 9.3 Evaluation entities

### Eval suite

A versioned collection of cases for a capability or regression domain.

### Eval case

A pinned task, environment, expected outcomes and grader configuration.

### Eval experiment

A controlled comparison of one or more candidate configurations.

### Eval trial

One candidate executing one case for one attempt.

### Eval artifact

A reference to output, trace, diff, commit, tests, logs, environment state or external source bundle.

### Eval score

One grader’s result for one trial and dimension.

### Pairwise comparison

A blinded judge preference between two trial outputs/evidence bundles.

### Human annotation

A gold label, adjudication or override with provenance.

## 9.4 Proposed SQLite schema

```sql
CREATE TABLE eval_suites (...);
CREATE TABLE eval_cases (...);
CREATE TABLE eval_experiments (...);
CREATE TABLE eval_trials (...);
CREATE TABLE eval_scores (...);
CREATE TABLE eval_pairwise_results (...);
CREATE TABLE eval_human_annotations (...);
```

Minimum fields are defined below.

### `eval_suites`

```text
suite_id
name
participant_role
suite_kind: regression | capability | telemetry | chain | external
version
dataset_hash
rubric_hash
created_at_ms
```

### `eval_cases`

```text
case_id
suite_id
case_version
title
fixture_ref
task_contract_json
environment_spec_json
expected_outcome_json
grader_config_json
difficulty
tags_json
source_kind
source_ref
is_held_out
```

### `eval_experiments`

```text
experiment_id
suite_id
experiment_kind
candidate_configs_json
randomization_seed
trials_per_case
status
started_at_ms
completed_at_ms
```

### `eval_trials`

```text
trial_id
experiment_id
case_id
candidate_id
job_id
chain_id
model
prompt_hash
rules_hash
skills_hash
runtime_version
tool_catalog_version
environment_hash
attempt_index
status
data_completeness
started_at_ms
completed_at_ms
```

### `eval_scores`

```text
score_id
trial_id
grader_id
grader_type
dimension
score
passed
confidence
evidence_json
grader_version
created_at_ms
```

### `eval_pairwise_results`

```text
comparison_id
experiment_id
case_id
trial_a_id
trial_b_id
judge_id
presentation_order
winner: A | B | tie | insufficient_evidence
confidence
rationale_json
```

## 9.5 Forensic eval event catalog

Add events:

```text
eval.experiment.started
eval.experiment.completed
eval.experiment.failed
eval.trial.started
eval.trial.completed
eval.trial.failed
eval.grader.started
eval.grader.completed
eval.grader.failed
eval.score.recorded
eval.assertion.passed
eval.assertion.failed
eval.comparison.recorded
eval.judge.disagreement
eval.human.annotation.recorded
eval.human.override.recorded
eval.regression.detected
eval.promotion.recommended
eval.promotion.blocked
```

Use `eval_id` and existing job/chain/commit correlation fields.

## 9.6 Grader hierarchy

Use the cheapest reliable grader first:

```text
environment/state grader
-> deterministic trace grader
-> deterministic artifact grader
-> model grader
-> human adjudication
```

### Environment/state graders

Examples:

- hidden tests;
- expected database/file state;
- smoke/E2E result;
- emitted telemetry;
- no leaked secret;
- worktree and commit state.

### Trace graders

Examples:

- required tool called;
- forbidden tool absent;
- no edit/write by read-only role;
- `sp result` used before `sp feed` where required;
- memory recall performed only when triggered;
- chain context consumed;
- output schema valid;
- tool-call budget respected.

### Artifact graders

Examples:

- changed paths match scope;
- required tests added;
- diff minimality heuristics;
- evidence references resolve;
- handoff fields complete.

### Model graders

Use for nuanced qualities:

- reviewer finding materiality and evidence quality;
- researcher citation support and synthesis;
- overthinker risk quality and depth calibration;
- executor unnecessary complexity;
- handoff actionability.

Model graders must be calibrated against human labels and versioned.

## 9.7 Hard gates and score vector

A trial first passes hard gates:

```text
outcome correct
no forbidden action
schema valid
no critical requirement missed
no critical security/scope violation
```

Then a quality vector is reported:

```text
contract compliance
role adherence
evidence quality
chain-context use
handoff quality
operational reliability
```

Cost is reported separately:

```text
input/output/reasoning/tool tokens
active/waiting/elapsed time
tool calls
provider cost when authoritative
```

A composite quality score may be displayed but must not replace dimension-level promotion rules.

## 9.8 Role-specific scorecards

### Reviewer

```text
verdict accuracy
blocking finding precision
blocking finding recall
false PASS rate
false block rate
upstream evidence coverage
contradiction handling
delta-review discipline
evidence traceability
next-action usefulness
```

False PASS is the primary safety metric.

### Executor

```text
acceptance pass rate
scope precision and recall
regression rate
minimality
repository convention adherence
validation execution
handoff completeness
fix-loop count
```

### Seconder

```text
gate accuracy
finding precision and recall
boundedness
context expansion discipline
UNCLEAR calibration
agreement with final outcome
```

### Test-engineer

```text
fail-to-pass effectiveness
pass-to-pass preservation
critical-path coverage
mutation sensitivity
command executability
source-boundary violations
failure-owner accuracy
telemetry assertion quality
harness reuse
```

### Researcher

```text
claim correctness
citation precision and coverage
source authority
freshness
fact/inference separation
contradiction handling
query efficiency
```

### Overthinker

```text
decision quality
assumption discovery
risk precision and recall
alternative quality
disconfirming evidence
actionability
depth calibration
redundancy
```

## 9.9 Regression and capability suites

Regression suites protect reliable behavior and should approach 100% pass rate. Capability suites are intentionally difficult and are used to improve performance.

Initial suites:

```text
reviewer-regression-v1
executor-regression-v1
seconder-regression-v1
test-engineer-regression-v1
researcher-regression-v1
overthinker-regression-v1
chain-participation-v1
telemetry-integrity-v1
```

## 9.10 Dataset sources

Use real system failures first:

- reviewer PARTIAL followed by successful fix;
- false PASS discovered later;
- scope leak;
- wrong diff or wrong worktree;
- invalid handoff schema;
- unnecessary or missing memory retrieval;
- skipped mandatory gate;
- contradictory gate outputs;
- context overflow/compaction;
- tool or extension failure;
- testing ownership misclassification.

Add generated mutation cases:

- remove an upstream handoff;
- make result contradict diff;
- inject stale memory;
- alter root scope;
- add irrelevant relationship edges;
- remove chain identity;
- falsify a tool-use claim;
- insert seeded functional or quality defects.

## 9.11 Retrospective evaluation

### Supported

Existing runs can be evaluated for dimensions whose evidence remains in the database:

- runtime and token efficiency;
- tool use;
- output schema;
- role-boundary compliance;
- handoff quality;
- chain sequencing;
- gate verdict distributions;
- evidence references;
- context and compaction behavior;
- some reviewer and executor benchmark rows.

### Partial

Older runs may lack exact thinking spans, resolved prompt hashes, skill body hashes, complete forensic conversion or correlated tool IDs.

### Requires replay

Causal model comparisons and hidden outcome testing require a pinned repository snapshot and rerun. Historical cohort analysis must not be presented as a controlled A/B result.

### Backfill command

Recommended:

```bash
sp eval backfill --repo .
sp eval backfill --all-repos
```

The command should calculate compatible deterministic graders, emit eval events and mark data completeness.

## 9.12 Continuous evaluation

### After every run

Run deterministic graders asynchronously after run-complete persistence:

```text
schema validation
role boundary
forbidden path/tool
handoff completeness
startup context completeness
telemetry integrity
required evidence refs
```

### After every chain

Run:

```text
canonical gate sequence
mandatory gate completion
final verdict consistency
unresolved failure state
fix loops
time and tokens to PASS
chain outcome
```

### Sampled/high-risk model graders

Run model-based quality graders on:

- all high/critical chains;
- a configured percentage of medium chains;
- detected anomalies/regressions;
- explicit experiments.

Begin in shadow mode and do not block the main run.

## 9.13 Controlled A/B experiments

Use paired design:

```text
same case
same base SHA
same task contract
same upstream artifacts
same tool catalog
same budgets
isolated worktrees
```

Use multiple trials for stochastic agents.

Prompt and model changes should use factorial design where possible:

| | Current prompt | New prompt |
|---|---:|---:|
| Model A | A-current | A-new |
| Model B | B-current | B-new |

This isolates model effect, prompt effect and interaction.

## 9.14 Pairwise judges

For subjective dimensions:

- hide model/provider/cost identity;
- randomize A/B order;
- repeat with swapped order;
- allow tie and insufficient evidence;
- use multiple judges for high-value cases;
- route disagreement to human adjudication;
- monitor position and verbosity bias.

## 9.15 Statistical reporting

Report:

```text
baseline and candidate means
paired delta
bootstrap confidence interval
win/tie/loss
variance across trials
failure category delta
```

Use paired binary methods for pass/fail outcomes and paired bootstrap for continuous scores. Promotion requires practical as well as statistical significance.

## 9.16 Promotion policy

Example:

```yaml
hard_requirements:
  critical_false_pass_increase: 0
  new_role_boundary_violations: 0
  regression_suite_lower_bound: 0.97
  output_schema_validity: 0.995
quality:
  paired_quality_delta_lower_ci: -0.01
  chain_contribution_delta_lower_ci: 0
  pairwise_win_rate: 0.55
efficiency:
  max_active_runtime_p50_regression: 0.20
```

A cost increase requires a material quality improvement. A quality tie with meaningful cost reduction may justify promotion.

## 9.17 External and internal software-engineering benchmarks

External suites such as SWE-bench Pro public and Multi-SWE-bench can measure general model+harness coding capability. They should not replace internal role benchmarks.

The internal executor benchmark should use SWE-bench methodology:

```text
real Bead/issue
pinned repository and base SHA
isolated environment
hidden fail-to-pass tests
pass-to-pass regression tests
deterministic artifact checks
full forensic trajectory
```

Reviewer and seconder require seeded-patch benchmarks with gold defects and verdicts. Test-engineer requires buggy and fixed states to verify test sensitivity. Researcher requires source-backed claim sets. Chain eval requires mutated handoffs, missing gates and contradictions.

# 10. Console product requirements

## 10.1 Decision

Use the existing Console/Omniforge application. Do not create a separate eval application in the first implementation phase.

## 10.2 Data ownership

- Per-repo Specialists databases remain run-level sources of truth.
- Specialists owns eval definitions, trial execution, grading events and detailed evidence.
- The Console materializer projects summaries and forensic references into its read model.
- Prometheus provides low-cardinality time-series aggregates.
- Console provides operator UX and does not mutate source telemetry during normal reads.

## 10.3 Eval routes and surfaces

Add `/console/evals` with:

### Eval overview

Suite health, recent regressions, score by role/model, data freshness and missing signals.

### Experiment detail

Candidate fingerprints, case coverage, win/tie/loss, paired deltas, confidence intervals and promotion status.

### Model/prompt matrix

Role × model × prompt/rule/runtime version.

### Case explorer

Case source, difficulty, tags, expected outcome, fixture and grader definitions.

### Trial detail

Timeline of thinking, tools, turns and output; artifacts; diff; evidence; grader results; data completeness.

### Chain evaluation

Step timeline, queue/runtime, gates, contradictions, fix loops, time/tokens to PASS and final outcome.

### Historical mining

Search existing runs, inspect completeness and promote representative failures into eval cases.

### Live evaluation

Display post-run deterministic graders and experiment progress without blocking the originating job.

### Regression drift

Trend score, false-PASS rate, schema validity, tool/error metrics and cost over runtime/prompt/model versions.

## 10.4 Drilldown

Aggregate panels must drill down through evidence references to:

```text
specialist job
forensic event
Bead/root/step
chain
commit/diff/PR
test artifact
eval trial and grader
```

## 10.5 Realtime

The materializer and WebSocket hint path should publish after committed eval writes. Live views show status transitions, not raw unbounded forensic streams.

## 10.6 Prometheus versus forensic UI

Prometheus charts answer “is a class of runs getting worse?” Forensic/trial detail answers “what happened in this exact run?”. High-cardinality IDs stay in correlation and evidence refs.

# 11. CLI and API requirements

## 11.1 CLI

Recommended commands:

```bash
sp eval suite list
sp eval suite show <suite>
sp eval case show <case>
sp eval run <suite> --candidate <config> [--candidate <config>] --trials N
sp eval compare <experiment-id>
sp eval inspect <trial-id>
sp eval failures <experiment-id>
sp eval disagreements <experiment-id>
sp eval backfill --repo .
sp eval backfill --all-repos
sp eval calibrate <rubric> --human-labels <file>
sp eval promote <experiment-id> --policy <file>
```

## 11.2 Existing DB commands

Retain and integrate:

```text
sp db extract
sp db stats
sp db benchmark-export
sp metrics --prometheus
```

`benchmark-export` should either be versioned as a legacy exporter or rebuilt as an adapter over eval tables.

## 11.3 Evaluator interface

Conceptual TypeScript contract:

```ts
interface EvalGrader {
  id: string;
  version: string;
  type: "environment" | "trace" | "artifact" | "model" | "human";
  supportedRoles?: string[];
  requiredEvidence: string[];
  grade(input: EvalTrialBundle): Promise<EvalScoreResult>;
}
```

## 11.4 Post-run evaluator

The supervisor or an event consumer emits run-complete, then enqueues evaluation. It must not recursively grade evaluator jobs. It must tolerate unavailable graders and record partial results.

## 11.5 Cross-repo experiments

Use globally unique experiment/eval IDs. Each repository retains local trial data; Console aggregates summaries by eval ID. A future state daemon may become the registry, but the initial bridge must not block on it.


## 11.6 Interactive role composition and assignment

Recommended public surfaces:

```bash
# Specialists-owned pure rendering
sp role compose <role> --surface interactive --mode tracked --bead <id> --output <file> --json
sp role compose <role> --surface interactive --mode standby --output <file> --json

# Core-owned launch/assignment UX
xt pi --role <role> [--bead <id>] [--preheat] [--no-auto-assign]
xt claude --role <role> [--bead <id>] [--preheat] [--no-auto-assign]
xt role assign --target <pane-or-session> --role <role> --bead <id>
```

The exact command name may change after CLI review, but ownership and semantics are fixed:

- Specialists composes content.
- Core orchestrates launch and calls the renderer from the original repository cwd.
- xtmux performs readiness-gated delivery and monitoring.
- The assignment is one user turn, not a system-prompt append.

## 11.7 xtmux bridge query surfaces

The bridge may rely on current xtmux V2 machine queries:

```bash
tmux-session-picker message-status <message-key>
tmux-session-picker unread-count --for <session-id> [--pane <pane-id>]
tmux-session-picker wait-agent <target> --timeout <duration>
tmux-session-picker monitor-agent <target> --wait-for-transition --timeout <duration>
```

Do not scrape formatted inbox output when a typed query exists.

# 12. Security, privacy and data governance

## 12.1 Prompt and output storage

Raw prompts and model outputs may contain repository-sensitive data. Store hashes and bounded metadata by default. Detailed raw artifacts remain in existing protected job/evidence storage and are not exported to Prometheus.

## 12.2 Forensic redaction

Continue using `xtrm.forensic.v1` redaction rules. Add grader output and model-judge prompts to the sensitive-field policy. Judge evidence bundles must be minimized and redacted.

## 12.3 Prometheus labels

Never label by:

```text
job_id
bead_id
chain_id
participant_id
trace/span/tool-call/session/eval IDs
raw path/command/error/diff/URL
prompt or output content
credentials or user identifiers
```

## 12.4 Held-out cases

Held-out benchmark fixtures and hidden tests must not be exposed to the candidate agent. The runner must separate candidate worktree/tool access from grader assets.

## 12.5 Human annotation

Record annotator identity internally, but expose only the minimum needed in shared dashboards. Gold labels require provenance and versioning.


## 12.6 Interactive assignment transport

Rendered Bead and mandatory-rule content is sensitive task material.

- Store it in a mode-restricted temporary/runtime file.
- Deliver only a bounded one-line pointer into the interactive prompt field.
- Hash the file at composition and verify before delivery where practical.
- Delete or expire the transport artifact after acceptance according to a documented policy.
- Record component IDs, hashes, sizes, readiness timestamps, delivery result and acknowledgement state; never record the full body.
- A renderer error, missing Bead, malformed task template or fatal mandatory-rule resolution must fail before worktree/session provisioning in direct tracked mode.
- Preheated standby mode may provision without a Bead but must not fabricate tracked context.

# 13. Integration with the Specialists roadmap, xtrm Stage 0 and Channels

## 13.1 Required direct documentation changes

Direct documentation changes are necessary, but they must preserve the distinct role of each source.

### `specialists-roadmap.md`

The canonical roadmap must be updated directly because it is the bridge-runtime source of truth and currently does not represent this modernization as an integrated, evaluation-gated program. The update should be concise and architectural rather than copying this PRD in full.

Required roadmap changes:

1. Add a prominent companion-program reference to this PRD and state that detailed work-package decomposition, graders and model/prompt promotion criteria live here.
2. Add **Track C — Prompt, Chain Context, Telemetry and Evaluation Modernization** to the roadmap sequencing model.
3. Record the ordering invariant:

   ```text
   telemetry integrity and historical baseline
   -> critical chain-first roadmap spine
   -> prompt/rule and memory changes under paired evaluation
   -> Channels replacement of bridge communication
   ```

4. Mark the following as prerequisites for the complete chain-context implementation in this PRD:
   - Opportunity 2: READ_ONLY path binding;
   - Opportunity 3: persisted resolved chain shape;
   - Opportunity 4: composition gate;
   - Opportunity 5: authoritative step identity;
   - Opportunity 10: chain-driven dispatch.
5. Retain Opportunity 8 only as a deliberately minimal bridge. Its payload must be compatible with future `work.turn`, `work.finding` and `work.verdict` messages, and it must not grow into a second scheduler.
6. Add evaluation gates to roadmap changes that alter prompts, rules, memory injection, chain context or operator workflow. “Implemented” is not sufficient; the change must pass its regression and capability suites.
7. Update status annotations against current code. Shipped QA pipeline, seconder fusion and forensic identity work must not be listed as unstarted. Conversely, persisted chain shape, composition gate, `--chain`, memory pull, XML contracts and Skills v4 must not be represented as complete unless verified.
8. Reconcile Opportunities 1, 4 and 8 against existing `bd merge-slot`, `bd gate` and `bd swarm` before creating implementation Beads. The result must be a reuse decision record, not an assumption.
9. Add bridge retirement criteria: every bridge must name the future owner, replacement trigger, migration/export path and deletion condition.
10. Preserve the roadmap as architecture-level SSOT. Do not paste the scorecards, SQL schemas or complete work-package tables from this PRD into it.

### `xtrm/docs/_meta/2026-06-21-design-reconciliation.md`

The 21 June document is explicitly a dated snapshot and should not be rewritten as though it were a live status page. Several claims are now historical, including Console state and portions of Specialists implementation status.

Required treatment:

1. Add a short banner at the top stating that it is a historical snapshot and linking to a newer reconciliation document.
2. Do not rewrite its original body or silently alter conclusions that were correct on 21 June.
3. Create a new dated document, recommended path:

   ```text
   xtrm/docs/_meta/2026-07-13-specialists-roadmap-evals-integration.md
   ```

4. The new reconciliation must record:
   - current verified roadmap status;
   - Track A/B/C ownership;
   - the dependency matrix in this section;
   - Stage 0 ownership and Channels storage decision;
   - the fact that Console now exists and already materializes Specialists observability;
   - the role of xtmux as a notification/transport adapter, not canonical Channels storage;
   - the current bridge-retirement plan;
   - links to this PRD and the canonical roadmap.
5. If the organization prefers append-only meta history, the same content may be an addendum in a new file; it must not replace the June snapshot.


## 13.1A Additional roadmap amendments required by the shipped interactive bridge

`specialists-roadmap.md` must also be amended to recognize that the system now has two bridge execution forms: managed `sp run` jobs and persistent interactive `xt --role` sessions.

Required additions:

1. Add a cross-cutting **Interactive Chain Coordinator Bridge** section.
2. State that the current coordinator is epic/task-group scoped and applies future chain-coordinator duties across child chains; it is not yet the Substrate one-chain participant.
3. Add the two launch modes: preheated standby and direct tracked `--bead` launch.
4. Require task-side Bead context and mandatory rules to enter as a first user assignment, not system prompt content.
5. Make the coordinator a primary consumer of Opportunities 2, 3, 4, 5, 8, 9, 10, 11, 12 and 16.
6. Remove hardcoded chain sequences from coordinator guidance; the chain-template catalog and resolved shape are authoritative.
7. Add scope validation, conflict matrix, peer hygiene communication, close-time evidence and parent escalation to coordinator responsibilities.
8. Record xtmux as the current attention/transport layer and `observability.db` as the current Specialists chain/eval authority.
9. Explicitly defer interactive permission enforcement and Substrate/Channels authority semantics.
10. Add retirement mapping: assignment pointer delivery, xtmux mechanical messages and `step_completed` remain bridge mechanisms until Substrate/Channels provide participant activation, typed semantic messaging and scheduler intent.

## 13.1B Foundational hook architecture amendment — established before coordinator scope

The roadmap's Claude-only `bd create` hook proposal must be replaced using the foundational pattern established by the xtmux audit described near the beginning of this PRD. This is an independent roadmap correction and does not depend on the interactive coordinator:

```text
shared pure policy kernel
├── Claude Code cheap prefilter + Pre/PostToolUse adapters
├── Pi in-process extension adapter
└── authoritative sp chain review/run validator
```

Requirements:

- One matcher/policy implementation for SCRUTINY, contract readiness, type/shape mismatch and template recommendation.
- Cheap no-match path for Claude hooks; no unconditional Node cold start on every Bash call.
- Pi uses in-process extensions where possible.
- Early hook feedback is advisory or shadow/warn; final composition/dispatch validation remains in Specialists.
- Durable policy findings use stable fingerprints and are persisted to forensic/eval state rather than printed and lost.
- Rollout modes: `off → shadow → warn → enforce`.
- Hooks do not decide final release authority or implement a second chain scheduler.

## 13.2 Dependency matrix

| PRD capability | Start now | Requires critical Specialists roadmap spine | Requires Stage 0 | Requires Channels 0.1 | Requires Channels 0.2 |
|---|---:|---:|---:|---:|---:|
| Telemetry correctness fixes | yes | no | no | no | no |
| Historical run backfill and cohort analysis | yes | no | no | no | no |
| Candidate/prompt/rule/skill fingerprinting | yes | no | no | no | no |
| Deterministic post-run graders | yes | no | no | no | no |
| Prompt composition inventory | yes | no | no | no | no |
| Output-schema unification | yes | no | no | no | no |
| Paired model A/B on controlled standalone cases | yes | no | no | no | no |
| Minimal chain-participant guidance using current pointers | yes | partial | no | no | no |
| Complete deterministic `<chain-context>` envelope | no | yes | no | no | no |
| Reliable post-chain evaluator | partial | yes | no | no | no |
| Pull-based memory experiment | yes | Opportunity 11 coordination | no | no | no |
| Automatic reviewer-to-executor remediation | no | useful but insufficient | yes | yes | no |
| Typed message/ack/delivery evaluation | no | no | yes | yes | no |
| Freeform node collaboration evaluation | no | no | yes | yes | yes |
| Console historical eval UI | yes after eval APIs | no | no | no | no |
| Console live channel visualization | no | no | yes | yes | no |

## 13.3 Critical chain-first spine

The following is the minimum Track A foundation that must exist before this PRD can claim complete chain awareness:

```text
bd primitive reuse decision
-> READ_ONLY path binding
-> persisted resolved chain shape
-> composition review/approve/insert
-> authoritative kind:step and semantic-edge lookup
-> chain-driven dispatch and workspace resolution
```

This spine provides stable chain identity and pointers. It does not require Channels. It enables the chain-context envelope, selective upstream retrieval, post-chain grading and reliable model comparisons within a fixed chain topology.

The complete roadmap is not a prerequisite for prompt modernization. `sp epic` rewrite, final branch naming, per-repo bootstrap cleanup, Skills v4 and all dispatch guardrails can follow after the critical spine. Prompt changes that do not depend on chain topology—especially researcher and overthinker—may enter experiments earlier once telemetry and eval baselines exist.

## 13.4 Channels boundary

Channels is the future semantic communication layer. This PRD must not create a parallel protocol in Specialists.

Until Channels 0.1 ships:

- `specialist_results` and Bead notes remain durable verbose handoff stores;
- `sp result`, `sp feed`, Beads edges and the resolved chain shape provide pull-based context;
- `step_completed` may provide a next-step recommendation and evaluation event;
- the orchestrator remains responsible for dispatch/resume;
- xtmux may notify operators or agents, but it is not the semantic source of truth.

After Channels 0.1:

- reviewer findings and verdicts become typed `work.finding`/`work.verdict` messages;
- executor remediation is triggered through scheduler intent, not direct pane injection;
- message delivery, acknowledgement, authority, stop-condition and convergence metrics join the eval framework;
- bridge `step_completed` scheduling logic retires;
- `sp steer` and `sp resume` can be implemented over the ChannelClient while retaining CLI compatibility.

The canonical Channels invariants must be preserved: participant L3 identity distinct from job L4 activation, typed message bodies, pointer-based payloads, read/ack separation, at-least-once delivery, scheduler indirection, authority derived from state rather than body text, forensic/evidence dual-write and explicit stop conditions.

## 13.5 xtmux integration boundary

xtmux already provides practical inter-agent messaging, acknowledgements, unread indicators, safe handoffs and a local event log. It should be used as an operator-facing bridge and as an experimental source of usability data.

Allowed integration:

- show a short notification when a canonical Channel message or Specialists handoff becomes available;
- increment unread badges for a participant/session;
- link to Bead, job, chain, eval or result identifiers;
- measure acknowledgement latency and operator intervention;
- provide safe pointer-based handoff during the bridge period;
- expose multiplexing dashboard, collision audit and local transport health.

Forbidden integration:

- treating the rotating xtmux JSONL log as canonical chain state;
- encoding release authority or gate satisfaction in pane metadata;
- bypassing Channel scheduler/authority checks through direct `send-keys`;
- using session names as canonical participant identity;
- inventing message kinds incompatible with Channels.

The target relationship is:

```text
Channels or Specialists durable state
-> forensic/evidence event
-> optional xtmux notification adapter
-> human/agent attention
```

# 14. Agent-ready decomposition contract

## 14.1 Required planning output

A local planning agent receiving this PRD must produce a Beads hierarchy, not implementation patches. Its output must contain:

1. One program epic for this PRD, or a linked set of repository-owned epics when cross-repo ownership requires separation.
2. Root change Beads corresponding to the work packages in Section 15.
3. Explicit dependency edges between root Beads.
4. `recommended_template` for every root Bead, validated against the installed formula catalog where possible.
5. Priority, scrutiny, owning repository, intended specialist role and parallel lane.
6. File/surface ownership and collision risk.
7. Deterministic validation and eval gates.
8. Non-goals and bridge-retirement requirements.
9. Integration Beads for work that crosses repository boundaries.
10. A final plan-validation report proving that every PRD acceptance criterion maps to at least one Bead.
11. A versioned `bead-graph-plan.json` and the captured `bd create --graph --dry-run --json` preview for the proposed hierarchy.
12. A Beads capability matrix recording the installed version, supported primitives, minimum-version constraints and fallbacks.

The planner must not create vague tasks such as “implement evals” or “improve reviewer”. Each root Bead must have a falsifiable externally observable outcome.

## 14.2 Hierarchy and identity

Use this hierarchy:

```text
program epic
  -> repository/workstream epic when needed
      -> root change Bead
          -> chain molecule and step Beads at composition time
```

A root Bead is the durable work contract. A chain molecule is an execution instance around that contract. Step Beads are role-specific participation contracts. Do not conflate the program epic, chain molecule, root issue and specialist step.

Before the composition gate exists, manual bridge execution may create explicit step/tracking Beads. Such Beads must be labeled `bridge:manual-composition`, linked to the root and treated as temporary orchestration scaffolding. They must not become the permanent data model.

## 14.3 Root change-contract template

Every root Bead produced from this PRD must contain equivalent fields. XML may be stored directly in the Bead description even before a deterministic parser ships because Beads stores text and the future schema is forward-compatible.

```xml
<change-contract work-package="WP-XX" type="feature|bug|refactor|research|docs" scrutiny="low|medium|high|critical">
  <problem>Concrete current defect or missing capability.</problem>
  <scope>
    <repo>xtrm-dev/specialists</repo>
    <path>explicit/file/or/directory</path>
  </scope>
  <non-goals>
    <item>Explicitly excluded adjacent work.</item>
  </non-goals>
  <dependencies>
    <work-package>WP-YY</work-package>
  </dependencies>
  <deliverables>
    <item>Code, schema, docs, fixture or report.</item>
  </deliverables>
  <validation>
    <criterion>Exact deterministic command or state assertion.</criterion>
    <criterion>Named eval suite and threshold.</criterion>
  </validation>
  <acceptance>
    <criterion>Externally observable completion condition.</criterion>
  </acceptance>
  <rollback>How to disable or revert safely.</rollback>
  <retirement-trigger>Required for bridge-only work.</retirement-trigger>
</change-contract>
```

## 14.4 Step-contract template

When a chain is composed, each specialist step must receive:

```xml
<step-contract role="executor|seconder|test-engineer|test-runner|reviewer|researcher|overthinker|...">
  <mandate>One bounded responsibility.</mandate>
  <inputs>
    <item>Root contract and named upstream evidence.</item>
  </inputs>
  <outputs>
    <item>Typed artifact or verdict.</item>
  </outputs>
  <scope>
    <path>Allowed paths or READ_ONLY evidence surface.</path>
  </scope>
  <non-goals>
    <item>Actions owned by other chain members.</item>
  </non-goals>
  <validation>
    <criterion>Evidence the next member can verify.</criterion>
  </validation>
</step-contract>
```

The step contract must not restate the entire PRD. It references the root Bead and only adds role-specific obligations.

## 14.5 Required Bead metadata

Each root Bead should expose, through labels, fields or a structured note:

```json
{
  "work_package": "WP-T02",
  "program": "specialists-modernization",
  "repository": "xtrm-dev/specialists",
  "lane": "telemetry-thinking",
  "priority": "P1",
  "scrutiny": "high",
  "recommended_template": "code-standard",
  "primary_role": "executor",
  "integration_owner": "telemetry-integrator",
  "parallel_safe": true,
  "file_ownership": ["src/pi/session.ts", "src/specialist/timeline-events.ts"],
  "eval_gates": ["telemetry-integrity-v1"],
  "bridge": false
}
```

Where Beads does not support a native field, store the value in labels or the structured description rather than dropping it.

## 14.6 Decomposition quality gates

Before implementation starts, a planning/reviewer pass must verify:

- every work package is represented exactly once;
- the installed Beads version and required capabilities are recorded;
- the proposed graph passes `bd create --graph --dry-run` structural validation before live application;
- no acceptance criterion is orphaned;
- dependency cycles do not exist;
- no two parallel Beads claim exclusive ownership of the same high-conflict file;
- all cross-repo work has an explicit integration owner;
- bridge work names its retirement trigger;
- prompt/model changes have baseline and promotion evals;
- DB migrations have compatibility and rollback tests;
- Console work consumes upstream data rather than synthesizing source truth;
- Channels work is not smuggled into Specialists bridge Beads.

## 14.7 Implementation handoff requirements

Every implementation agent must leave a structured handoff with:

```json
{
  "work_package": "WP-XX",
  "status": "success|partial|failed|waiting",
  "files_changed": [],
  "contracts_or_schemas_changed": [],
  "decisions": [],
  "assumptions": [],
  "validation_commands": [],
  "validation_results": [],
  "eval_results": [],
  "evidence_refs": [],
  "known_deferred_paths": [],
  "downstream_attention": [],
  "bridge_retirement_notes": []
}
```

The handoff contains decision rationale and evidence, not private chain-of-thought.

# 15. Work packages and multiplexed execution plan

## 15.1 Work-package conventions

The identifiers below are stable planning anchors. The local planner may create repository-specific Bead IDs, but each Bead title or metadata must retain its `WP-*` identifier so reports, evals and integration work can map back to this PRD.

Scrutiny defaults:

- **critical:** migrations, lifecycle/identity, authority, worktree safety, evaluator enforcement;
- **high:** telemetry semantics, output contracts, chain state, prompt/rule changes for reviewer/executor;
- **medium:** isolated CLI, fixtures, role prompts with bounded blast radius, Console read surfaces;
- **low:** non-normative documentation or display-only changes.

## 15.2 Gate and documentation packages

| WP | Deliverable | Repo | Dependencies | Parallel lane | Suggested chain | Scrutiny |
|---|---|---|---|---|---|---|
| `WP-G00` | Patch canonical roadmap with Track C, dependency rules, status corrections and PRD reference | specialists | none | docs-specialists | doc-sync or code-quick | medium |
| `WP-G01` | Add historical-snapshot banner to 2026-06-21 reconciliation and create new dated reconciliation | xtrm | none | docs-xtrm | doc-sync | medium |
| `WP-G02` | Produce binding Beads capability/reuse decision across embedded, direct-server and proxied-server modes: merge-slot, gates versus structural fan-in, ready FIFO, custom-active and pool-aware claim, lease/reclaim and anti-steal behavior, plain-name `mol bond`, graph create/dry-run, metadata, history, memory, Beads↔Dolt compatibility and backend capabilities; record minimum version/pin, required Dolt version and fallbacks | specialists | none | architecture-gate | research-only + premortem | high |
| `WP-G03` | Register this PRD in roadmap/MOC indexes and map all acceptance criteria to WPs | specialists + xtrm | G00,G01 | docs-integration | doc-sync | medium |

`WP-G02` is a hard planning gate for chain-foundation implementation, not for telemetry baselining. Its output includes the installed-version and deployment-mode capability matrices, stable-versus-pinned adoption table, Beads↔Dolt compatibility tuple, compatibility fixtures, fallbacks and the decision on which Specialists code paths are deleted or reduced through native reuse.

## 15.3 Telemetry-integrity packages

| WP | Deliverable | Primary files/surfaces | Dependencies | Parallel safety | Eval gate |
|---|---|---|---|---|---|
| `WP-T01` | Correct unique tool-call accounting and lifecycle dedupe | timeline events, supervisor callbacks, job metric aggregation | none | high-conflict owner | tool lifecycle fixtures |
| `WP-T02` | Add thinking start/end spans, segment identity and durations | Pi session, timeline event schema, supervisor mapping | none | separate from T01 only with explicit file split | thinking-span fixtures |
| `WP-T03` | Add turn/message/tool timing and time-to-first-action metrics | event constructors and aggregation | T01,T02 interfaces stable | medium | timing reconciliation |
| `WP-T04` | Correct activity/stall semantics including `think`/`thinking` | observability queries and watchdog fixtures | none | parallel-safe if query-only | activity fixtures |
| `WP-T05` | Wire forensic events into live Prometheus projection | forensic reader, projection collector, metrics tests | none | isolated projection owner | scrape contract |
| `WP-T06` | Persist candidate fingerprint: model, prompt, rule, skill, runtime, tool catalog hashes | loader/runner/startup payload/schema | none | high-conflict with prompt inventory; same owner preferred | fingerprint reproducibility |
| `WP-T07` | Ship `telemetry-integrity-v1` suite and compatibility/version markers | tests/fixtures/docs | T01–T06 | integrator-only | full suite |

`WP-T01`, `WP-T02` and `WP-T06` touch central runtime surfaces and must not be assigned to independent agents without a written file-ownership partition. The safer pattern is one runtime telemetry owner plus separate test/fixture agents.

## 15.4 Evaluation-core packages

| WP | Deliverable | Dependencies | Parallel lane | Suggested role/template | Scrutiny |
|---|---|---|---|---|---|
| `WP-E01` | Eval tables, migrations, DAO and versioned types | T06 schema conventions | eval-storage | executor + seconder + tests | critical |
| `WP-E02` | Eval forensic event catalog and shared writer | E01 type IDs may be stubbed | eval-events | executor | high |
| `WP-E03` | Grader interface, registry and deterministic assertion result schema | none | grader-core | executor | high |
| `WP-E04` | Data-completeness model and historical backfill | E01,E03,T07 | eval-backfill | executor/test-engineer | high |
| `WP-E05` | Post-run evaluator in observe-only mode | E01–E03,T07 | eval-runtime | executor | high |
| `WP-E06` | Post-chain evaluator over resolved shape | E01–E03,C03,C06 | eval-chain | executor | high |
| `WP-E07` | Paired experiment runner, randomization and candidate manifest | E01,E03,T06 | experiment-runner | executor | high |
| `WP-E08` | Statistics, pairwise judge records and promotion policy engine | E07 | experiment-analysis | executor/researcher | high |
| `WP-E09` | `sp eval` CLI: suite/case/run/compare/inspect/backfill | E01,E03,E04,E07 | eval-cli | executor | medium |
| `WP-E10` | Continuous eval scheduling and recursion exclusion | E05,E06 | eval-ops | executor/test-runner | critical |

`WP-E01` owns eval migrations. No other lane may independently edit the same migration block; dependent work must consume exported types or coordinate through the integration owner.

## 15.5 Prompt and policy packages

| WP | Deliverable | Dependencies | Parallel lane | Scrutiny |
|---|---|---|---|---|
| `WP-P01` | Resolved prompt manifest with component hashes/tokens and duplicate/conflict detection | T06 | prompt-inventory | high |
| `WP-P02` | Canonical base status/verdict vocabulary and formal merged JSON Schema | E03 optional | output-contract | critical |
| `WP-P03` | Replace duplicate manual handoff/output rules with generated contract as SSOT | P02 | output-contract | high |
| `WP-P04` | Role-aware runner injections: style, GitNexus, Beads close, read-only/research behavior | P01,P02,T07 | runner-policy | critical |
| `WP-P05` | Overthinker and researcher slim prompts plus procedures moved to skills | P01–P04,E05 | prompt-advisors | medium/high |
| `WP-P06` | Seconder and test-engineer slim prompts; formal test-engineer schema and mode | P01–P04,E05 | prompt-gates | high |
| `WP-P07` | Executor slim prompt and language/procedure skill separation | P01–P04,E05 | prompt-executor | high |
| `WP-P08` | Reviewer slim prompt, upstream-evidence contract and false-PASS safeguards | P01–P04,E05,C06 desirable | prompt-reviewer | critical |
| `WP-P09` | Factorial prompt×model experiments and staged promotion for all six roles | P05–P08,E07,E08 | prompt-eval | high |

Role prompt files are parallel-safe only after `WP-P02` and `WP-P04` freeze shared contracts. Each role owns its own specialist JSON and role-specific tests; one integration owner handles shared mandatory-rule/index edits.

## 15.5A Deterministic Specialist execution packages

| WP | Deliverable | Dependencies | Parallel lane | Scrutiny |
|---|---|---|---|---|
| `WP-XP01` | `specialists.execution.v1` schemas, reusable profiles, protocol state and pure reducer/event catalog | T06, P02 interfaces | execution-protocol-core | critical |
| `WP-XP02` | Context resolver, seven-field structural contract gate and semantic readiness result | XP01, C04/C06 where chain context exists | execution-preflight | critical |
| `WP-XP03` | Mandatory-rule delivery receipt/acknowledgement plus conditional memory decision and telemetry | XP01, M01 | execution-policy | high |
| `WP-XP04` | Typed activation-local plan, scope/capability validator and plan-deviation evidence | XP01, XP02 | execution-plan | high |
| `WP-XP05` | Evidence-requirement catalog and validators, including conditional GitNexus/current-diff evidence | XP01, T07 | execution-evidence | high |
| `WP-XP06` | Central commit → result → Bead note → parent message → forensic → cleanup finalization with idempotency | XP01, P02, notification contract, lifecycle audit closure | execution-finalize | critical |
| `WP-XP07` | `specialist-execution-protocol-v1` simulation, failure-injection and role-profile rollout suite | XP01–XP06, E03 | execution-eval | critical |

`WP-XP01`–`XP05` may run in observe/shadow mode while unrelated audit closure continues. `XP06` enforcement and broad profile promotion require the relevant Git, lifecycle and notification correctness blockers to be closed.

## 15.6 Critical chain-foundation packages

| WP | Deliverable | Dependencies | Parallel lane | Scrutiny |
|---|---|---|---|---|
| `WP-C01` | READ_ONLY path binding independent of owner liveness | G02 | chain-workspace | critical |
| `WP-C02` | Persisted resolved chain shape with ordered steps/gates/status/job pointers | G02 | chain-state | critical |
| `WP-C03` | `sp chain review/approve/insert` using resolved shape plus native Beads graph/gate/readiness primitives; no duplicate blocker engine | C02,G02 | chain-composition | critical |
| `WP-C04` | Authoritative `kind:step`, root/step resolution and semantic-edge query helpers | G02 | chain-graph | high |
| `WP-C05` | Chain-driven dispatch/workspace resolution using native FIFO ready/claim authority, configured `claim.pools`, lease-aware claims and partial-batch reconciliation; preserve anti-steal semantics and distinct pool, issue, worktree and merge-slot ownership; never use `unclaim; claim` as takeover; include the job/worktree flag deprecation bridge | C01–C04 | chain-dispatch | critical |
| `WP-C06` | Deterministic `<chain-context>` envelope with completeness flags and upstream pointers | C02,C04,T06 | chain-context | high |
| `WP-C07` | Shared chain-participant rule and role-specific identity clauses | C06,P04 | chain-policy | high |
| `WP-C08` | Structured handoff extension for decisions, inputs consumed and downstream attention | P02,C06 | handoff-contract | high |
| `WP-C09` | Minimal `step_completed` visibility/evidence/recommendation bridge; no scheduler or duplicate readiness computation; compatible with Channels | C02,C03,E02 | chain-events | medium/high |
| `WP-C10` | `chain-participation-v1` eval suite | C06–C09,E03 | chain-eval | high |

`WP-C09` must not auto-resume peers or implement a scheduler. Its retirement trigger is Channels 0.1 acceptance.

## 15.7 Pull-based memory packages

| WP | Deliverable | Dependencies | Parallel lane | Scrutiny |
|---|---|---|---|---|
| `WP-M01` | Audit actual `bd memories`/`bd recall`/guarded `bd remember` behavior, provenance gaps, filtering, ranking and backend/version constraints before proposing a wrapper | none | memory-research | medium |
| `WP-M02` | Targeted memory search/relevant interface or wrapper with bounded output | M01 | memory-cli | high |
| `WP-M03` | Disable eager injection behind experiment flag and preserve rollback | M01,T06 | memory-runtime | high |
| `WP-M04` | Memory-recall mandatory rule, role opt-outs and authority/provenance policy | M01,P04 | memory-policy | high |
| `WP-M05` | Memory query/recall telemetry and deterministic graders | M02–M04,E03 | memory-eval | high |
| `WP-M06` | Role-by-role A/B rollout and promotion | M05,E07,E08 | memory-experiment | high |

## 15.8 Role-suite packages

These packages are fixture/dataset heavy and can run in parallel after the grader interface stabilizes.

| WP | Suite | Core outcome |
|---|---|---|
| `WP-S01` | `reviewer-regression-v1` | verdict accuracy, false PASS, finding precision/recall |
| `WP-S02` | `executor-swe-style-v1` | hidden tests, scope precision, regression and minimality |
| `WP-S03` | `seconder-regression-v1` | bounded gate accuracy and calibration |
| `WP-S04` | `test-engineer-regression-v1` | fail-to-pass, pass-to-pass and source-boundary discipline |
| `WP-S05` | `researcher-regression-v1` | claim correctness, citation entailment, freshness and inference separation |
| `WP-S06` | `overthinker-capability-v1` | risk/assumption recall, precision and depth calibration |
| `WP-S07` | `chain-participation-v1` | chain identity, selective retrieval, contradiction handling and handoff |
| `WP-S08` | `telemetry-integrity-v1` | metric/event correctness and reconciliation |

All suite cases require versioned provenance. Capability cases that become reliably solved should be promoted into regression suites.

## 15.9 Console packages

| WP | Deliverable | Repo | Dependencies | Scrutiny |
|---|---|---|---|---|
| `WP-U01` | Materialize eval summaries, completeness and evidence refs | console | E01,E02 | high |
| `WP-U02` | Eval query APIs and DTOs | console | U01 | high |
| `WP-U03` | Eval overview, experiment, case and trial routes | console | U02 | medium |
| `WP-U04` | Trial timeline with thinking/tool/text/evidence drilldown | console | U02,T07 | high |
| `WP-U05` | Historical mining and case-promotion workflow | console | U02,E04 | medium/high |
| `WP-U06` | Live eval updates, adjudication and promotion UX | console | U02,E08,E10 | high |

Console does not own evaluator execution or canonical scores. It reads/materializes Specialists output and links to forensic evidence.


## 15.10 Interactive coordinator and skill packages

| WP | Deliverable | Repo | Dependencies | Parallel lane | Scrutiny |
|---|---|---|---|---|---|
| `WP-IC01` | Audit every `using-specialists` heading; produce content migration and prompt-envelope parity matrices | specialists + core | G00 baseline | coordinator-audit | high |
| `WP-IC02` | Implement compact progressive-disclosure `using-specialists` tree and global recursive installation | specialists | IC01 | skill-layout | high |
| `WP-IC03` | Rewrite `chain-coordinator` stable prompt; remove hardcoded chain sequence | specialists | IC01 | coordinator-prompt | high |
| `WP-IC04` | Add coordinator-specific chain-template/scope/conflict/close guidance using native `bd ready --mol --explain`, `--gated`, gate/history queries when supported | specialists | IC01,IC03,G02 | coordinator-skill | high |
| `WP-IC05` | Expose pure interactive task/standby renderer reusing `sp run` task-side assembly | specialists | IC01,T06 | role-renderer | critical |
| `WP-IC06` | Audit/deduplicate coordinator `task_template` Bead rendering | specialists | IC05 | role-renderer | high |
| `WP-IC07` | Add startup `starting → agent.ready → idle` handshake for Pi and Claude | core + xtmux | none | readiness | critical |
| `WP-IC08` | Extend xtmux handoff for an existing prompt file, readiness wait and monitor integration | xtmux | IC07 | assignment-delivery | high |
| `WP-IC09` | Integrate Core direct `--bead` auto-assignment through Specialists renderer + xtmux secure delivery | core | IC05,IC07,IC08 | role-launcher | critical |
| `WP-IC10` | Implement preheated standby bootstrap, `role.ready`, later `xt role assign` and one-epic lifecycle; use native claim or configured pool semantics, preserve real-owner anti-steal protection, reconcile partial claims, never emulate takeover with `unclaim; claim`, and refuse unsafe `.beads/` or ambiguous shared-server identity | specialists + core + xtmux | IC05,IC07,IC08 | role-preheat | high |
| `WP-IC11` | Add coordinator message vocabulary, conflict-matrix artifact and peer/orchestrator protocol | specialists + xtmux docs/tests | IC04 | coordinator-protocol | high |
| `WP-IC12` | Add deterministic/live coordinator evals, Pi/Claude/direct comparison and no-leak tests | specialists + core + xtmux | IC02–IC11,E03 | coordinator-eval | high |
| `WP-IC13` | Integrate coordinator with resolved chain shape/composition APIs and Beads-native readiness/gate evidence rather than manual DAG reconstruction | specialists | C02,C03,C04,IC04 | coordinator-chain-api | critical |

`WP-IC05` owns semantic prompt composition. Core and xtmux must not implement their own Bead traversal or mandatory-rule resolver.

`WP-IC07` and `WP-IC08` should be separate from `WP-IC09`: readiness/delivery are reusable xtmux/Core capabilities; direct tracked assignment is one consumer.

## 15.11 Policy-hook packages

These packages implement the pre-monorepo, pre-coordinator xtmux-derived architecture decision. They are independently valuable and must not be nested under `WP-IC*`.

| WP | Deliverable | Repo | Dependencies | Scrutiny |
|---|---|---|---|---|
| `WP-H01` | Shared pure Bead/chain policy kernel for readiness, SCRUTINY and template recommendation | specialists | G02 | high |
| `WP-H02` | Claude cheap prefilter plus Pre/PostToolUse adapters | specialists/core distribution | H01 | high |
| `WP-H03` | Pi in-process adapter using the same kernel | specialists/core Pi extensions | H01 | high |
| `WP-H04` | Durable policy findings, stable fingerprints and reconciliation | specialists | T06,E02,H01 | high |
| `WP-H05` | Shadow/warn/enforce parity, latency and false-positive evaluation | specialists | H02–H04,E03 | high |

## 15.12 Deferred xtrm/Channels packages

These are linked future epics, not immediate child Beads of the Specialists implementation program unless the operator explicitly starts Track B.

| WP | Deliverable | Dependency |
|---|---|---|
| `WP-X01` | Stage 0 detail spec: daemon, state.db, socket, schema registry, registration | architecture gate |
| `WP-X02` | Resolve canonical Channels storage/ownership in `packages/channels` | X01 |
| `WP-X03` | Channels 0.1 autonomous chain path | X01,X02,critical chain semantics |
| `WP-X04` | xtmux notification adapter over canonical message/handoff events | X03 |
| `WP-X05` | Channels 0.2 freeform/node activation and collaboration evals | X03 plus runtime tuning |

## 15.13 Initial parallel wave

After documentation gate creation, the first multiplexed wave may safely start these lanes:

```text
Lane A: WP-G00 + WP-G01
Lane B: WP-G02 architecture/reuse audit
Lane C: WP-T01/T02 design and fixtures under one runtime telemetry owner
Lane D: WP-T04 activity query fix
Lane E: WP-T05 forensic Prometheus wiring
Lane F: WP-T06 fingerprint design
Lane G: WP-E03 grader interface design
Lane H: WP-M01 memory CLI/provenance audit
Lane I: Console eval datasource/API design spike, no source writes
Lane J: WP-IC01 content/parity audit
Lane K: WP-IC07 readiness contract design and fixtures
Lane L: WP-H01 policy-kernel design in shadow-only scope
```

Implementation of `WP-E01`, `WP-P02`, `WP-C01–C05`, `WP-IC02`, `WP-IC05` and `WP-H02/H03` begins only after their named audit/interface gates are closed.

## 15.14 File-ownership and collision policy

High-conflict surfaces require a single owner per wave:

| Surface | Exclusive owner rule |
|---|---|
| `src/specialist/runner.ts` | one prompt/runtime-policy owner |
| `src/pi/session.ts` + `src/specialist/timeline-events.ts` + central supervisor callback path | one telemetry-runtime owner per wave |
| `src/specialist/observability-sqlite.ts` migrations | one schema/migration owner; other agents consume interfaces |
| `src/specialist/prometheus-projection.ts` | one metrics-projection owner |
| mandatory-rules index/global sets | one policy integration owner |
| base output schema/contract builder | one output-contract owner |
| each `config/specialists/<role>.specialist.json` | one role owner after shared contracts freeze |
| Console materializer schema | one Console data owner |
| `config/skills/using-specialists/**` | one progressive-disclosure skill owner; eval fixtures may be separate |
| `config/specialists/chain-coordinator.specialist.json` | one coordinator prompt/template owner |
| Core `worktree-session.ts` role-launch path | one launcher integration owner |
| xtmux `handoff` / `safe-send-pointer` / readiness state | one xtmux delivery owner |

Agents may work concurrently on tests, fixtures and role-specific files when their production surface does not overlap. `xtmux worktree-collisions` and repository diff checks must be run before integration.

## 15.15 Multiplexing operating protocol

During bridge-era execution:

1. Every agent receives one root Bead and one worktree/branch.
2. Handoffs use Bead notes/results as durable content and xtmux pointer messages as notification.
3. `message-send` is for short state or pointer messages; long requirements remain in the Bead or a versioned file.
4. Recipients acknowledge messages. Lack of acknowledgement is visible but does not mutate release authority.
5. `safe-send-pointer` may steer an idle/needs-input target; it must not inject into a running/thinking target.
6. The integration owner monitors `dashboard`, `audit` and `worktree-collisions`.
7. Agents do not merge or push outside their contract unless the chain explicitly assigns publication ownership.
8. Cross-lane decisions are recorded in the relevant Bead and echoed to dependent lane owners.
9. Findings that require new scope become `discovered-from` follow-up Beads rather than silent expansion.
10. Final integration runs the mapped regression suites and records evidence before closing the parent work package.

## 15.16 Recommended agent roster and assignment

The local orchestrator should instantiate bounded agents by surface, not one agent per arbitrary bullet. A practical initial roster is:

| Agent identity | Primary responsibility | Assigned WPs | Must not own concurrently |
|---|---|---|---|
| `docs-reconciler` | Canonical roadmap/meta patches and cross-links | G00,G01,G03 | runtime code |
| `architecture-reuse-auditor` | `bd` primitive reuse and bridge-retirement decision | G02 | implementation before decision approval |
| `telemetry-runtime-owner` | Pi/timeline/supervisor tool and thinking semantics | T01,T02,T03 | eval DB migrations |
| `telemetry-query-owner` | activity/stall query and historical compatibility | T04 | central callback path without coordination |
| `metrics-projection-owner` | forensic-to-Prometheus wiring | T05 | Console panel implementation |
| `fingerprint-owner` | resolved candidate manifest and startup hashes | T06,P01 | role prompt edits before schema approval |
| `telemetry-integrator` | fixtures, compatibility and telemetry suite | T07,S08 | unrelated prompt work |
| `eval-schema-owner` | eval migrations, DAO and storage types | E01 | other observability migrations in same wave |
| `grader-core-owner` | grader interface and assertion schema | E03 | role-specific judge calibration |
| `eval-runtime-owner` | post-run/backfill/eval CLI | E04,E05,E09 | post-chain logic before chain shape exists |
| `experiment-owner` | paired trials, statistics and promotion | E07,E08 | candidate prompt implementation |
| `chain-architecture-owner` | C01–C05 critical chain spine | C01,C02,C03,C04,C05 | prompt refactors |
| `chain-context-owner` | context envelope, handoff and chain eval | C06,C07,C08,C09,C10,E06 | Channels implementation |
| `prompt-contract-owner` | output schema and runner policy | P02,P03,P04 | role prompt files in parallel without freeze point |
| `advisor-prompt-owner` | researcher/overthinker candidates | P05,S05,S06 | shared runner or global rule index |
| `gate-prompt-owner` | seconder/test-engineer candidates | P06,S03,S04 | reviewer/executor files |
| `executor-prompt-owner` | executor candidate and suite | P07,S02 | reviewer prompt |
| `reviewer-prompt-owner` | reviewer candidate and suite | P08,S01 | executor prompt |
| `memory-owner` | memory audit, runtime, rule and eval | M01–M06 | chain messaging protocol |
| `console-eval-owner` | materializer/API/eval views | U01–U06 | upstream evaluator semantics |
| `interactive-context-auditor` | using-specialists migration map and parity contract | IC01 | implementation before audit decision |
| `coordinator-skill-owner` | progressive skill tree and coordinator doctrine | IC02,IC03,IC04,IC11 | role launcher code |
| `interactive-renderer-owner` | Specialists pure assignment renderer | IC05,IC06 | Core launch mechanics |
| `role-readiness-owner` | Pi/Claude startup readiness contract | IC07 | Specialists prompt composition |
| `xtmux-delivery-owner` | existing-file handoff, readiness wait and monitoring | IC08 | Core launcher planning |
| `role-launcher-owner` | Core tracked/preheated role integration | IC09,IC10 | xtmux internal storage semantics |
| `coordinator-eval-owner` | cross-runtime behavior/no-leak/context tests | IC12 | production implementation under evaluation |
| `policy-kernel-owner` | shared policy decisions and durable findings | H01,H04 | harness-specific adapters initially |
| `integration-reviewer` | cross-lane review, dependency and acceptance coverage | all integration gates | production implementation in reviewed lane |

The roster is a role map, not a requirement to run every agent simultaneously. Concurrency should be limited by integration bandwidth and file overlap. A recommended first wave is six to nine active agents, with one integration reviewer and one orchestrator tracking the whole program.

Assignment rules:

1. An agent owns one high-conflict production surface at a time.
2. Test/fixture agents may support a production owner but cannot independently redefine event or schema semantics.
3. Role prompt owners start only after the prompt-contract owner publishes the frozen base output and injection contract.
4. The chain-context owner consumes the chain-architecture owner’s published resolved-shape API rather than editing its internals opportunistically.
5. The Console owner receives versioned upstream DTO/event contracts; it does not infer them from private database internals.
6. The integration reviewer verifies the Bead contract, diff, tests, eval evidence and downstream effects, but does not become the default fixer.

## 15.17 Recommended integration order

Merge and promotion order:

```text
documentation/reuse decisions
-> telemetry schema and integrity
-> eval schema/grader core
-> interactive content/parity audit
-> readiness and secure delivery primitives
-> progressive skill + assignment renderer
-> chain state foundations
-> output contract and runner policy
-> role prompt candidates
-> chain context and handoff
-> memory treatment
-> model/prompt experiments
-> Console product surfaces
-> enforcement
-> Channels replacement of bridge communication
```

A lane may develop ahead on a feature branch, but it may not be promoted across an unmet integration gate.

# 16. Rollout plan

## Phase 0 — Documentation reconciliation and immutable baseline

1. Complete `WP-G00`–`WP-G03`.
2. Capture resolved configs for all six roles across representative repos.
3. Hash prompt, rules, skills, runner and tool catalog.
4. Export first-turn input, active runtime, tools, tokens, verdicts and fix loops.
5. Freeze historical reviewer/executor/chain cohorts and document completeness.
6. Record current roadmap and code status so later reports do not compare against a moving baseline.
7. Capture the installed Beads version/capability matrix and generate a dry-run graph plan for the modernization backlog.
8. Approve the designated-migrator and backup/adoption runbook for future Beads upgrades.

**Exit criteria:** canonical cross-links exist; the new dated reconciliation is approved; every implementation WP is traceable; a repeatable baseline report exists; the Beads graph dry-run succeeds; stable and pinned capabilities are explicitly separated.

## Phase 1 — Telemetry integrity

1. Complete `WP-T01`–`WP-T07`.
2. Version changed metric semantics rather than silently rewriting historical dashboards.
3. Recompute a sample of historical metrics and compare against raw event traces.

**Exit criteria:** no known counting ambiguity in any metric used for A/B promotion; `telemetry-integrity-v1` passes.

## Phase 2 — Eval core and historical backfill

1. Complete `WP-E01`–`WP-E05` and `WP-E09` in observe-only mode.
2. Backfill selected per-repo databases without mutating raw events.
3. Create data-completeness summaries and initial role cohorts.
4. Start `WP-S01`–`WP-S06` fixture creation in parallel.

**Exit criteria:** historical trials are inspectable; new runs automatically receive deterministic post-run scores; no evaluator can block execution yet.


## Phase 2A — Interactive coordinator bridge foundations

1. Complete `WP-IC01` and approve the content migration/parity matrix.
2. Complete `WP-IC07` and define an observable runtime-ready transition.
3. Complete `WP-IC02`–`WP-IC06` without waiting for the full chain spine.
4. Complete `WP-IC08`–`WP-IC10` using secure prompt-file pointer delivery.
5. Keep `--bead` identity metadata after initial assignment.
6. Validate preheated standby and direct tracked launch under both Pi and Claude.
7. Run `WP-IC12` baseline comparison before enabling the coordinator for broad autonomous epic work.

**Exit criteria:** the coordinator receives current Bead context and mandatory rules exactly once as a user assignment; preheated mode sends `role.ready`; direct tracked mode auto-assigns only after runtime readiness; prompt bodies do not leak; both runtimes remain interactive.

## Phase 3 — Critical chain-first roadmap spine

1. Close `WP-G02` reuse decisions.
2. Implement `WP-C01`–`WP-C05`.
3. Persist chain shapes and expose composition/read surfaces.
4. Use Beads-native molecule readiness, gated-resume and atomic claim semantics; Specialists adds job/evidence/workspace state rather than reimplementing dependency readiness.
5. Integrate `WP-IC13` so the interactive coordinator consumes resolved shape and composition APIs instead of reconstructing them manually.
6. Keep any `step_completed` behavior visibility-only.

**Exit criteria:** a chain has durable identity independent of a live executor; ordered step/gate shape and workspace resolution are queryable and tested; native Beads readiness agrees with `sp chain` projection on fixture graphs.

## Phase 4 — Output contract and runner policy consolidation

1. Complete `WP-P01`–`WP-P04`.
2. Normalize status/verdict schemas.
3. Remove duplicated output, GitNexus, style and Beads workflow instructions.
4. Introduce compatibility shims and output-validation events.

**Exit criteria:** the generated output contract is the single machine-readable SSOT; role-aware injections pass regression fixtures.

## Phase 4A — Deterministic Specialist execution protocol

1. Complete `WP-XP01`–`WP-XP03` in observe/shadow mode.
2. Add structural contract blocking and semantic waiting behavior.
3. Complete typed planning and evidence requirements through `WP-XP04`–`WP-XP05`.
4. Centralize automatic finalization through `WP-XP06` only after lifecycle/Git/notification audit blockers close.
5. Run `WP-XP07` before promoting any role from legacy to enforced profile.
6. Remove superseded prompt prose only after the equivalent runtime invariant is enforced.

**Exit criteria:** one writer and one read-only role complete the protocol end to end; NOK contracts cannot execute; plans cannot widen scope; required evidence and commit policy gate finalization; result, Bead note and parent message are persisted/emitted exactly once; replay fixtures pass.

## Phase 5 — Role prompt experiments

1. Run `WP-P05` first for overthinker/researcher.
2. Run `WP-P06` for seconder/test-engineer.
3. Run `WP-P07` and `WP-P08` last because executor/reviewer have the highest operational blast radius.
4. Use paired or factorial experiments, never unpaired historical PASS rates as the promotion criterion.

**Exit criteria:** prompt reductions meet role-specific thresholds without deterioration of hard gates or confidence-interval promotion rules.

## Phase 6 — Complete chain context and handoff

1. Complete `WP-C06`–`WP-C10` and `WP-E06`.
2. Inject deterministic chain identity and pointers.
3. Add selective retrieval, handoff decision records and chain participation graders.

**Exit criteria:** reviewers and downstream gates can identify all required upstream inputs; context completeness is explicit; chain-participation suite meets threshold.

## Phase 7 — Pull-based memory

1. Complete `WP-M01`–`WP-M05`, beginning with proof of which requirements native Beads memory already satisfies.
2. Run treatment/control with eager injection still available as rollback.
3. Complete `WP-M06` only after necessary-memory and unnecessary-query graders are calibrated.

**Exit criteria:** first-turn memory payload materially decreases with no statistically material increase in historical-context misses.

## Phase 8 — Model/prompt benchmark matrix

1. Complete `WP-E07`, `WP-E08` and remaining role suites.
2. Run reviewer prompt×model factorial experiments first.
3. Expand to executor, test-engineer and researcher.
4. Add internal SWE-bench-style and selected external public benchmarks.
5. Establish scheduled regression and capability runs.

## Phase 9 — Console Eval Lab

1. Complete `WP-U01`–`WP-U06`.
2. Preserve aggregate-to-forensic drilldown and freshness/completeness metadata.
3. Support live experiment visibility without moving evaluator ownership into Console.

## Phase 10 — Enforcement

1. Promote high-precision deterministic graders from observe to warn.
2. Measure false positives and operator overrides.
3. Promote only approved rules to enforce.
4. Keep LLM judges advisory unless separately authorized.

## Phase 11 — Channels integration

After xtrm Stage 0 and Channels 0.1 acceptance:

1. replace manual remediation dispatch with typed scheduler intents;
2. dual-write semantic messages to forensic/evidence;
3. add message delivery, acknowledgement, authority and convergence evals;
4. retire bridge scheduling behavior from `step_completed`;
5. add optional xtmux notification adapter;
6. defer freeform/node collaboration enforcement until Channels 0.2 is measured.

# 17. Detailed implementation backlog

The Epics below are capability groupings. For actual Beads decomposition and parallel assignment, Section 15 work packages are normative. A planner may group multiple WPs under one Epic, but must not merge their contracts or erase their dependencies.


## Epic A — Prompt composition inventory

- Add a resolved prompt manifest command.
- Report component bytes/tokens and hashes.
- Capture eager skill body costs.
- Compare API first-turn truth with component estimate.
- Detect duplicate rule IDs and repeated normalized text.
- Detect conflicting enums/schema fields.

## Epic B — Output contract unification

- Select canonical status/verdict vocabulary.
- Convert all role output schemas to formal JSON Schema.
- Version merged output schema.
- Remove handoff-rule duplication.
- Emit output validation forensic events.
- Add regression fixtures for markdown and JSON modes.

## Epic C — Six prompt refactors

- Reviewer core prompt and policy extraction.
- Executor core prompt and language-skill separation.
- Overthinker adaptive-depth prompt.
- Seconder bounded gate prompt.
- Test-engineer explicit mode and source boundary.
- Researcher epistemic core and routing extraction.

## Epic D — Runner injection cleanup

- Role-aware style directive.
- Single GitNexus policy source.
- Writer-only commit/close instructions.
- Split worktree boundary from evidence retrieval.
- Remove global contradictions for researcher/read-only roles.

## Epic E — Chain context

- Persist/resolve chain template and ordered steps.
- Chain context envelope builder.
- Beads semantic edge query helpers.
- Context completeness flags.
- Shared chain participant rule.
- Handoff extension.

## Epic F — Memory capability

- Search/relevant/recall command design.
- Provenance and supersession fields.
- Query telemetry.
- Pull policy rule.
- Eager injection experiment flag.

## Epic G — Telemetry integrity

- Thinking span model.
- Tool-call deduplication and parallel duration.
- Turn/message timing.
- Activity query fixes.
- Forensic Prometheus collector wiring.
- Candidate fingerprint fields.
- Telemetry integrity suite.

## Epic H — Eval storage and runtime

- Eval tables and migrations.
- Eval forensic events.
- Grader interface and registry.
- Post-run evaluator.
- Post-chain evaluator.
- Historical backfill.
- Trial artifact bundle.

## Epic I — Role suites

- Reviewer seeded-patch suite.
- Executor hidden-test suite.
- Seconder smell/scope suite.
- Test-engineer fail-to-pass suite.
- Research claim/citation suite.
- Overthinker decision-risk suite.
- Chain participation suite.

## Epic J — Experimentation and statistics

- Candidate configuration format.
- Paired runner.
- Trial randomization.
- Pairwise judge and order swap.
- Bootstrap and binary paired analysis.
- Promotion policy engine.

## Epic K — Console integration

- Eval datasource/materializer rows.
- Eval APIs.
- Overview and experiment pages.
- Trial timeline and evidence drawer.
- Historical mining and case promotion.
- Realtime updates.
- Human adjudication and promotion UX.

# 18. Acceptance criteria

### Deterministic Specialist execution

- Every managed run records protocol version and selected execution profile.
- The configured seven-field contract profile is structurally validated before planning.
- A structurally NOK contract cannot proceed.
- Semantic `UNCLEAR` enters waiting/escalation rather than speculative work.
- Effective mandatory rules are fingerprinted and explicitly acknowledged; acknowledgement is not treated as compliance proof.
- Conditional memory search is either performed with recorded provenance or skipped with a recorded reason.
- Required planning emits a schema-valid bounded local plan.
- Plans outside role capability or Bead scope are rejected.
- Required evidence is typed, attributable and current.
- Writer finalization stages only authorized paths and creates the required commit; read-only profiles cannot commit.
- Authoritative result persistence, Bead-note append and parent notification are idempotent.
- Notification failure does not alter the job verdict.
- Terminal cleanup releases only activation-owned resources and preserves branch/worktree/result/evidence.
- Chain progression consumes the validated result and step satisfaction, not process completion alone.

## Beads capability reuse

- The decomposition graph is materialized from a reviewed `bead-graph-plan.json` after a successful dry-run.
- Every Beads-dependent runtime feature declares a minimum released version or pinned commit and a fallback path.
- `sp chain` readiness agrees with `bd ready --mol/--gated` on the canonical fixture set.
- Atomic claims use native `bd ready --claim`; Specialists does not implement a competing issue-claim protocol.
- Structural fan-in uses native Beads waits/gates where sufficient; semantic review remains in Specialists.
- Bead claim lease and worktree/merge-slot lease are modeled as separate ownership dimensions.
- No unreleased Beads capability becomes mandatory without compatibility tests and operator approval.
- Canonical plain formula names resolve consistently through `bd formula show`, `bd mol seed`, `bd mol pour`, `bd cook` and, when supported, `bd mol bond --dry-run`; legacy prefix/path workarounds are not policy.
- Configured `claim.pools` aliases use the atomic claim path; real assignees and unconfigured aliases retain anti-steal protection.
- Expired pool claims return to the unassigned pool, and no coordinator/recovery path uses `unclaim; claim` for live-owner takeover.
- Embedded, direct-server and proxied-server compatibility is recorded per command; unsupported orchestration-critical proxied commands have an explicit fallback or block promotion.
- A build at or after `3fea705` is validated with Dolt v2.2.0 as one client/server compatibility tuple; stable v1.1.0 retains its separately verified matrix.
- Dolt remains the selected backend during the bridge runway.
- Remote-backed upgrades follow a backup, designated-migrator and adoption runbook.

## Prompt modernization

- First-turn input tokens decrease materially for each refactored role.
- No role exceeds baseline critical failure rate.
- Output schema validity is at least 99.5%.
- Reviewer false-PASS rate does not increase.
- Executor scope violations do not increase.
- Seconder remains within configured time/tool budget.
- Test-engineer source-boundary violations remain zero.
- Researcher citation correctness does not regress.

## Chain context

- Every chain step receives valid chain identity and root/step pointers.
- Context completeness is explicitly marked.
- Reviewer can identify all required upstream gates without filesystem hunting.
- Upstream-result retrieval is selective and evidence-linked.
- Handoff decision records are parseable.

## Memory

- Eager memory tokens are eliminated or substantially reduced for treatment candidates.
- Necessary-memory recall remains above an approved threshold.
- Unnecessary memory-query rate is measured and bounded.
- Memory results include provenance.

## Telemetry

- Unique tool-call count is correct in fixture traces.
- Thinking spans are paired and durations non-negative.
- Active plus waiting time reconciles with elapsed time within tolerance.
- Forensic-derived metric families appear in the live projection.
- No forbidden labels are emitted.

## Eval platform

- Existing runs can be backfilled without modifying raw events.
- New runs receive deterministic post-run scores.
- Chains receive post-chain scores.
- Candidate fingerprints allow exact comparison.
- Paired experiments produce confidence intervals and win/tie/loss.
- Promotion policy can block regressions and recommend qualifying candidates.

## Console

- Eval overview and trial detail are accessible from existing Console navigation.
- Aggregate views drill down to forensic evidence.
- Live and historical data display freshness/completeness.
- No direct frontend access to per-repo SQLite is introduced.


## 18.7 Interactive coordinator and role assignment

- `using-specialists/SKILL.md` is within the line budget and all displaced content has a tested destination or explicit removal rationale.
- Source and global installed skill trees are recursively complete and link-valid.
- The coordinator stable system prompt contains no tracked Bead payload or flattened mandatory-rule block.
- A tracked interactive assignment contains task-template/Bead/dependency context followed by current mandatory rules, each exactly once.
- `sp role compose` is read-only and creates no job, worktree, session or Bead mutation.
- Direct `--bead` launch fails before provisioning on renderer failure.
- Runtime readiness is explicit; a newly spawned but unready pane cannot receive the assignment.
- Preheated launch produces `role.ready` and waits for exactly one epic assignment.
- Core/xtmux transport exposes no full prompt body through argv, pane metadata, logs or telemetry.
- Pi and Claude remain interactive after the first assigned turn.
- The coordinator selects/validates chains through the canonical formula catalog and resolved shape, not a hardcoded role sequence.
- Conflict matrix, peer hygiene messaging, close-readiness evidence and escalation behavior pass `interactive-coordinator-v1`.

## 18.8 Existing Beads reconciliation

- Every filed Bead in the 13 July integration packet is mapped to KEEP, REFINE, MERGE, RESEQUENCE, REPLACE or ADD.
- Existing Bead descriptions are updated before dispatch when this PRD changes their transport, scope, dependency or validation contract.
- New xtmux-owned work is not hidden inside a Core Bead.
- Superseded constraints remain visible in Bead notes with a pointer to this PRD; they are not silently deleted.

# 19. Risks and mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| Prompt slimming removes useful tacit behavior | Quality regression | Paired regression suite, staged roles, rollback by version |
| Runtime and prompt change simultaneously | Attribution failure | Factorial design and candidate fingerprints |
| Historical data is incomplete | Misleading retrospective scores | Data completeness flags; separate estimated from complete |
| LLM judge bias | Incorrect promotion | Human calibration, order swap, multiple judges, deterministic hard gates |
| Continuous eval adds latency | Slower chains | Asynchronous post-run evaluation; only hard deterministic gates on critical path |
| Eval recursion | Evaluator jobs grade themselves | Explicit evaluator participant kind and exclusion policy |
| High-cardinality metric explosion | Prometheus instability | Existing allowlist/forbidden labels; forensic drilldown |
| Memory retrieval becomes another ritual | Token/tool waste | Trigger-based rule and unnecessary-query grader |
| Chain context becomes a full history dump | Context bloat | Pointer envelope plus on-demand retrieval |
| Tool count changes break historical dashboards | Apparent discontinuity | Version metric semantics and retain legacy field during transition |
| External benchmark overfits coding only | Misleading role comparison | Internal role and chain suites remain primary |
| Console materializer duplicates source truth | Architectural drift | Summary/evidence projection only; no evaluator ownership in UI |
| Local rule/skill overrides escape experiments | Non-reproducible trial | Resolve and hash all effective components at launch |
| Specialists duplicates Beads readiness/claim logic | Divergent scheduler state and maintenance burden | Make Beads capability reuse a hard architecture gate and differential-test projections |
| Unreleased Beads feature assumed available | Runtime failure across repos | Minimum-version/pin checks, fallbacks and compatibility fixtures |
| Independent Beads migrations across clones | Unmergeable schema forks or downtime | Backup, one designated migrator, push/adopt runbook |


## 19.1 Startup readiness false-positive

**Risk:** the launcher marks a pane idle before the runtime can accept prompt input, causing lost or shell-interpreted assignments.

**Mitigation:** explicit `starting` state, runtime startup event, readiness-gated handoff, bounded timeout and deterministic cleanup.

## 19.2 Prompt transport leakage

**Risk:** passing the rendered assignment as positional argv exposes Bead/rule content in process listings or logs.

**Mitigation:** mode-restricted prompt file, one-line pointer delivery, hash/size-only telemetry and no body in pane options/messages.

## 19.3 Coordinator authority creep

**Risk:** the bridge coordinator starts making vision, merge or architectural decisions intended for the parent orchestrator.

**Mitigation:** explicit mechanical-vs-vision boundary, bounded message vocabulary, escalation evals and `READY_FOR_PARENT_DECISION` rather than autonomous merge.

## 19.4 xtmux becomes accidental Channels

**Risk:** richer peer messaging and receipts evolve into a second semantic scheduler before Substrate.

**Mitigation:** xtmux remains attention/delivery only; authoritative state and gate outcomes stay in Specialists/Beads; bridge retirement triggers are mandatory.

# 20. Decisions and remaining implementation choices

## 20.1 Decisions closed in this revision

- Keep the current `chain-coordinator` name during the bridge runway; document lifecycle/scope distinction from future Substrate semantics.
- Do not add interactive permission enforcement now.
- Mandatory rules and tracked Bead context are user-assignment content, not system-prompt content.
- Specialists owns composition; Core owns launch; xtmux owns readiness-gated delivery and attention.
- Use secure prompt-file pointer delivery as the default bridge transport, not full positional argv.
- Support both preheated standby and direct tracked `--bead` launch.
- Keep Specialists and xtmux observability databases separate until Substrate migration.
- Keep Console's current materializer architecture and expand it after upstream contracts stabilize.
- Keep monorepo migration, Stage 0, Substrate and Channels outside the critical path.
- Keep xtmux as a bridge attention/delivery runtime, not a semantic scheduler or authority layer.
- Use Beads-native molecule readiness, atomic graph creation, fan-in gates and claims before adding Specialists equivalents.
- Use configured `claim.pools` for dispatcher preassignment; preserve anti-steal protection for real owners and unconfigured aliases.
- Never implement live-owner takeover as `unclaim; claim`; coordinate with the owner or reclaim an eligible expired lease.
- Treat `bd mol bond` plain-name resolution as canonical when the installed build includes `b740f6f` or a release containing it.
- Treat proxied-server support as a per-command compatibility matrix, not a backend-wide parity claim.
- Require Dolt v2.2.0 only for Beads builds at or after unreleased `3fea705`; do not apply that minimum retroactively to stable v1.1.0.
- Keep Dolt as the Beads backend during the bridge runway; alternative backends remain a later ADR/watch item.
- Treat post-v1.1 claim leases, formula schema and history-event features as release/pin-gated capabilities, not assumptions.
- The common Specialist lifecycle is owned once by the Specialists runtime; Specialist definitions select profiles, step contracts supply task-specific obligations, and chain templates remain topology definitions rather than generic per-node workflow scripts.

## 20.2 Decisions required before the affected package is dispatched

1. Canonical base status and reviewer verdict casing.
2. Exact CLI naming and versioned JSON schema for `sp role compose` and `xt role assign`.
3. Transport-file location, permissions, expiry and deletion policy.
4. Whether `assignment.accepted` is mandatory or advisory after direct tracked launch.
5. Exact coordinator conflict-matrix serialization and durable location before resolved chain shape lands.
6. Which coordinator-general rules belong in standby bootstrap versus tracked mandatory-rule resolution.
7. How Claude emits the same `agent.ready` fact as Pi without relying on UI scraping.
8. Whether xtmux extends `handoff` compatibly or introduces a narrowly named assignment-delivery subcommand.
9. Exact mapping of roadmap Opportunity 8 events into coordinator notification before Channels.
10. Which coordinator model defaults are selected per formula during the bridge period.
11. Exact memory retrieval CLI surface and provenance availability in Beads.
12. Which deterministic graders may block in the first enforcement wave.

## 20.3 Decisions that do not block the current bridge program

- Global registry location for cross-repository experiment definitions before `state.db`; per-repository eval state remains sufficient initially.
- Authoritative provider cost source; token use remains primary until cost provenance is versioned.
- Minimum trial counts and confidence thresholds by role.
- Retention policy for long-lived eval artifacts and hidden benchmark environments.
- Whether the global style directive is removed entirely or replaced by role-specific concise-output settings.
- Final Channels storage ownership and Stage 0 implementation details.
- Whether dated `_meta` reconciliations remain one-time snapshots or become an append-only series.
- Final retirement boundary between `step_completed`, xtmux bridge notifications and Channel scheduler intent.

---

## Revision summary — 17 July 2026

The PRD now treats claim pools as dispatch metadata over the native atomic claim path, prohibits live-owner takeover through `unclaim; claim`, requires formula plain-name bond compatibility, records CLI support separately for embedded/direct/proxied deployment modes and pins Dolt v2.2.0 only to the corresponding unreleased Beads main line. Existing work packages absorb the changes; no new package family or critical-path edge was introduced.

## Program tracking and operational companion

- **Jira program:** [KAN-115 — Specialists modernization](https://xtrmxt.atlassian.net/browse/KAN-115)
- **Operational companion:** [Specialists Modernization — Manuale operativo v3.1](https://xtrmxt.atlassian.net/wiki/spaces/KAN/pages/14319617)
- **Freshness baseline:** reconciled on 17 July 2026 against this PRD v3.1 and the post-Beads-v1.1 contract.

KAN-115 tracks implementation status and ownership. This page remains the normative product and architecture contract; where Jira summaries or the operational companion conflict with it, this PRD prevails.

# Appendix A — Proposed core system prompts

## A.1 Reviewer

```text
You are the final evidence-based release reviewer for a completed specialist chain.

The seconder owns the initial contract and implementation-sanity gate. Consume
upstream QA, security and obligations evidence before reviewing. Do not repeat an
upstream gate unless its result is missing, contradicted by stronger evidence or
invalidated by a later diff.

Review unresolved findings, critical requirement coverage, changed high-risk
surfaces and required release evidence. Use the root contract and current artifacts
as authority. Treat upstream outputs as evidence-backed claims, not as authority over
observed code or tests.

Never edit files. Do not emit preference-only findings. Every blocking finding must
identify the unmet requirement or gate and cite concrete evidence.

PASS requires all critical requirements and required gates to be evidenced with no
blocking finding. PARTIAL means a fixable gap or insufficient evidence remains. FAIL
means a core requirement is unmet, authoritative evidence is contradictory, or
required review inputs are unusable.

On re-review after PARTIAL, inspect the delta and prior findings. Carry forward
approvals for unchanged areas. Return only the configured output contract.
```

## A.2 Executor

```text
You are a scoped implementation specialist. Implement the supplied Bead contract in
the assigned worktree.

Resolve scope, inspect the relevant implementation and dependency impact, and make
the smallest correct change. Follow repository, language and framework conventions.
Prefer existing code and dependencies over new abstractions or packages.

Do not add adjacent cleanup, speculative flexibility, broad refactors, tests,
documentation or features unless they are in scope. If a necessary change lies
outside authorized scope, return a partial handoff describing the required expansion.

Preserve security, data integrity, compatibility and external-boundary validation.
Run the validation declared by the task plus focused checks needed to establish
implementation correctness. Broad authoritative test execution belongs to the
configured QA gate unless the task explicitly requires it.

Before completion, verify changed paths against scope. Return only the configured
output contract with changes, verification, assumptions, risks and follow-ups.
```

## A.3 Overthinker

```text
You are a read-only decision-review specialist for uncertain or high-impact choices.

Analyze only as deeply as the decision warrants. Report conclusions, evidence,
assumptions, alternatives and risks; do not expose private chain-of-thought.

For costly, risky or difficult-to-reverse decisions, stress-test the leading option
with a counterargument or premortem and identify evidence that would change the
recommendation. For simple reversible decisions, answer directly.

State confidence, material uncertainty and the next validation step. Never edit
files. Return only the configured output contract.
```

## A.4 Seconder

```text
You are the bounded read-only pre-QA gate for a completed writer diff.

Determine whether the output satisfies the root contract and appears implementation-
sane enough to justify expensive QA. Evaluate scope/compliance and implementation
quality as separate dimensions. If evidence for one dimension is missing, mark only
that dimension UNCLEAR rather than guessing.

Do not perform release review, security audit, broad architecture critique, test-
coverage review or style review. Do not emit preference-only findings.

Overall PASS requires both dimensions to pass; FAIL applies when either fails;
otherwise return PARTIAL. Keep inspection within the runtime budget and return only
the configured output contract.
```

## A.5 Test-engineer

```text
You are a test-authoring specialist. The dispatch context explicitly defines
`test_only` or `post_implementation` mode.

Build tests from the root requirements and actual implementation evidence. Follow
existing test, fixture, smoke and harness conventions before introducing new patterns.

Your default edit boundary is tests, fixtures, recorded fixtures, smoke/E2E assets
and test-harness support. Production source changes are forbidden unless dispatch
explicitly authorizes a named helper or export. When source behavior or
instrumentation is wrong, return `source_bug_suspected` with evidence.

Cover critical behavior rather than optimizing line coverage. Add operational or
telemetry assertions when required by the changed surface. Run focused checks needed
to validate authored assets; test-runner owns authoritative broad execution.

Return exact commands, setup/cleanup, coverage mapping, deferred paths and failure
ownership through the configured output contract.
```

## A.6 Researcher

```text
You are an external-evidence researcher.

Use current authoritative sources for unstable claims involving libraries, APIs,
versions, releases, ecosystem behavior or external products. Do not perform external
research when current repository evidence or stable reasoning is sufficient.

Prefer primary documentation, standards, research papers and source repositories.
Record relevant versions and dates. Distinguish sourced facts from inference and
report unresolved gaps. Verify consequential claims across independent sources when
practical and stop when the requested success criteria are met.

Report tool failures instead of inventing evidence. Never expose secrets in queries
and never edit project files. Lead with the answer and return findings, citations,
confidence and gaps through the configured output contract.
```

# Appendix B — Proposed `chain-participant-context` rule

```text
You are a participant in a multi-step specialist chain, not an isolated agent.

The chain root change-contract defines the overall objective and acceptance criteria.
Your current step-contract defines your mandate and edit boundary. Upstream specialist
outputs are evidence and handoffs; they do not override the root contract, current
repository state or directly observed artifacts.

At startup, read the injected chain context and identify the chain, root Bead, current
step, completed upstream steps and required downstream handoff. Consume preloaded
dependency context before additional commands.

When required inputs are absent or ambiguous, reconstruct only the necessary context
using the current step Bead, Beads dependency/relationship commands, `sp result` for
upstream final handoffs and `sp feed --json` only when a claimed action or chronology
must be verified.

Do not repeat work already completed upstream unless your role explicitly validates
it, evidence is missing or current artifacts contradict it. Record contradictions.
Do not request private chain-of-thought; consume decisions, rationale, assumptions,
evidence, verification results and unresolved questions.

Your final handoff must allow the next chain member to continue without reconstructing
your entire session.
```

# Appendix C — Proposed memory recall rule

```text
Historical project memories are available through targeted Beads memory queries.

Query memory only when the task depends on prior decisions, conventions, known
incidents, accepted exceptions or unresolved ambiguity. Use specific subsystem,
operation or file keywords. Refine broad result sets instead of scrolling an entire
memory corpus. Fetch a full memory only after a relevant summary is identified.

Treat memories as contextual evidence, not current authority. Verify them against the
root contract, current code, documentation and external sources where applicable.
Report stale or contradictory memories explicitly.

Do not query memory for fully specified local work or as a ritual. Do not use internal
memory as a source for current external API, release or standards claims.
```

# Appendix D — Initial deterministic grader catalog

| Grader ID | Role/scope | Evidence | Result |
|---|---|---|---|
| `output-schema-v1` | all | final output + merged schema | valid/invalid |
| `role-write-boundary-v1` | read-only roles | tool events + diff | pass/fail |
| `scope-paths-v1` | writers | root/step scope + diff | precision/violations |
| `required-tools-v1` | configured roles | trace | pass/fail |
| `tool-accounting-v1` | telemetry | tool spans | pass/fail |
| `thinking-span-integrity-v1` | telemetry | thinking spans | pass/fail |
| `chain-context-present-v1` | chain steps | startup context | pass/fail |
| `upstream-result-consumption-v1` | gates/advisors | tools + handoff | score |
| `handoff-completeness-v1` | all | final schema | score |
| `review-verdict-consistency-v1` | reviewer | gates + verdict | pass/fail |
| `test-engineer-source-boundary-v1` | test-engineer | diff | pass/fail |
| `research-citation-shape-v1` | researcher | output | pass/fail |
| `memory-query-necessity-v1` | selected cases | trace + case label | pass/fail |
| `canonical-chain-sequence-v1` | chain | member timeline | pass/fail |
| `time-to-pass-v1` | chain | statuses/verdicts | value |

# Appendix E — Metrics catalog after modernization

## Job and model

```text
xtrm_jobs_total
xtrm_job_duration_seconds
xtrm_job_active_runtime_seconds
xtrm_job_wait_seconds
xtrm_turns_total
xtrm_turn_duration_seconds
xtrm_message_duration_seconds
xtrm_context_usage_ratio
xtrm_llm_tokens_total
xtrm_thinking_duration_seconds
xtrm_thinking_segments_total
xtrm_time_to_first_action_seconds
```

## Tools and dependencies

```text
xtrm_tool_calls_total
xtrm_tool_errors_total
xtrm_tool_call_duration_seconds
xtrm_uncorrelated_tool_events_total
xtrm_mcp_operations_total
```

## Chain and gates

```text
xtrm_chains_total
xtrm_chain_duration_seconds
xtrm_gate_verdicts_total
xtrm_chain_fix_loops_total
xtrm_chain_time_to_pass_seconds
xtrm_chain_tokens_to_pass_total
xtrm_evidence_refs_total
```

## Memory

```text
xtrm_memory_queries_total
xtrm_memory_results_total
xtrm_memory_recall_total
xtrm_memory_query_duration_seconds
```

## Evaluation

```text
xtrm_eval_runs_total
xtrm_eval_score
xtrm_eval_assertions_total
xtrm_eval_regressions_total
xtrm_eval_judge_disagreements_total
xtrm_grader_duration_seconds
```

# Appendix F — Source inventory used for this PRD

## Specialists repository

The current-state findings in this PRD were verified against the following repository areas during the audit:

```text
config/specialists/*.specialist.json
config/mandatory-rules/
config/skills/
docs/design/roadmap/chain-templates/
docs/archive/iron-review-hardening-qa-chain-substrate.md
docs/design/roadmap/specialists-roadmap.md
config/skills/using-specialists/SKILL.md
config/skills/using-kpi/SKILL.md
src/specialist/runner.ts
src/specialist/supervisor.ts
src/specialist/beads.ts
src/specialist/timeline-events.ts
src/specialist/forensic-events.ts
src/specialist/observability-sqlite.ts
src/specialist/prometheus-projection.ts
src/pi/session.ts
src/cli/db.ts
src/cli/metrics.ts
```

## xtrm and xtmux repositories

- `xtrm-dev/xtrm/docs/_meta/2026-06-21-design-reconciliation.md`
- `xtrm-dev/xtrm/docs/channels/channels.md`
- `xtrm-dev/xtrm/docs/substrate/substrate_design_it.md`
- `xtrm-dev/core/docs/xt-pi-role.md` and `cli/src/utils/worktree-session.ts`
- `Jaggerxtrm/xtmux/docs/observability-redesign.md`, `bin/tmux-session-picker`, Claude hooks and Pi extensions

## Console repository

```text
README.md
docs/architecture/console-observability-spec.md
docs/architecture/console-architecture.md
```

## Beads repository

The 13 July capability reconciliation inspected `gastownhall/beads` v1.1 and current `main`, including `CHANGELOG.md`, `bd ready`, graph creation, formula primitives/schema, leases/heartbeat/reclaim, history events, memory commands, migration safety, storage backends and differential conformance fixtures. The local planning gate must repeat the capability snapshot against the installed binary because upstream `main` is not a release contract.

## External methodological references

The evaluation design is informed by current public guidance and research on agent evaluations, deterministic and model-based graders, trace versus outcome evaluation, pairwise judge bias, and software-engineering agent benchmarks. Representative sources include OpenAI Agent Evals and Graders guidance, Anthropic publications on building effective agents and agent evaluations, UK AISI Inspect AI, Lost-in-the-Middle research, SWE-bench Pro and Multi-SWE-bench.

These external references inform methodology only. The Specialists runtime, chain, telemetry and Console facts in this document derive from direct repository inspection.

# Appendix G — Copy-paste contract for the local decomposition agent

Use the following instruction with a planning-capable local agent. Replace repository paths only when the local checkout differs.

```text
You are the planning and decomposition agent for the Specialists modernization program.

Authoritative inputs, in order:
1. Current code and executable schemas in the connected repositories.
2. xtrm-dev/specialists/docs/design/roadmap/specialists-roadmap.md.
3. specialists_prompt_chain_evals_prd.md, especially Sections 13–18.
4. xtrm/docs/channels/channels.md for future channel semantics.
5. The newest dated xtrm _meta reconciliation; the 2026-06-21 file is historical.

Planning-only mandate:
- Do not edit production code.
- Do not begin implementation.
- Inspect the installed Beads version, `bd ready/create/formula/gate/history/memories/migrate` capabilities, the live formula catalog and current open/closed Beads before creating duplicates.
- Produce a per-command deployment-mode matrix for embedded Dolt, direct Dolt SQL-server and proxied-server; do not infer full parity from selected command support.
- Record the Beads↔Dolt compatibility tuple; require Dolt v2.2.0 only for builds at or after `3fea705`.
- Verify plain-name formula resolution with `bd mol bond <formula-name> <target> --dry-run` when supported; do not institutionalize legacy name prefixes.
- Use configured `claim.pools` where required, preserve real-owner anti-steal behavior and never use `unclaim; claim` as a takeover shortcut.
- Reconcile existing roadmap Beads to PRD work packages rather than blindly creating a second backlog.
- Preserve every WP-* identifier from Section 15.
- Produce `bead-graph-plan.json`, run `bd create --graph --dry-run`, then create or update program/workstream epics and root change Beads only after review.
- Add explicit dependencies and typed relationships.
- Assign repository, priority, scrutiny, recommended_template, primary role, lane, file ownership, eval gates, non-goals, rollback and bridge-retirement trigger.
- Use the root change-contract template in Section 14.3.
- Do not materialize specialist step Beads during Pass 1 unless the current runtime requires a bridge tracking Bead; label such work bridge:manual-composition.
- Flag file collisions and propose a safe multiplexing wave.
- Map every acceptance criterion in Section 18 to one or more Beads.
- Mark existing Beads as reused, superseded, extended or duplicate candidates; never silently discard them.

Required outputs:
1. Program hierarchy and Bead IDs.
2. WP-to-Bead mapping table.
3. Dependency DAG and critical path.
4. Initial parallel wave with assigned agent identities from Section 15.14.
5. File-ownership/collision matrix.
6. Existing-Bead reconciliation report.
7. Acceptance-criterion coverage report.
8. Open decisions that genuinely block dispatch.
9. Beads capability/version report and graph dry-run result.
10. Beads capability/version report and graph dry-run result.
11. Ready/claim/pool/lease, graph, metadata, memory, migration and worktree compatibility report.
12. Embedded/direct/proxied per-command compatibility and fallback matrix.
13. Beads↔Dolt version compatibility tuple.
14. Exact next dispatch commands or xtmux handoff pointers, but do not execute them.

Stop and report rather than inventing a design when canonical documents conflict materially.
```

# Appendix H — Bridge-era multiplexing dispatcher checklist

Before dispatch:

```text
[ ] Decomposition and reuse audit approved
[ ] Installed Beads version/capability matrix recorded
[ ] `bead-graph-plan.json` passed `bd create --graph --dry-run` review
[ ] Root Bead contains WP identifier and falsifiable contract
[ ] Recommended chain template verified against live catalog
[ ] Dependencies satisfied or explicitly represented
[ ] Worktree/branch created and unique
[ ] File ownership has no collision with active lanes
[ ] Candidate fingerprint/baseline requirement known
[ ] Eval and validation commands named
[ ] Bridge retirement trigger present where applicable
```

Dispatch and coordination:

```bash
# Inspect current agent/worktree state
tmux-session-picker dashboard expanded
tmux-session-picker worktree-collisions
tmux-session-picker audit

# Produce a dry-run handoff pointer for an idle target
tmux-session-picker handoff --target <pane> --bead <bead-id> --note 'WP-XX; read root contract; no scope expansion'

# Send after reviewing the dry-run
tmux-session-picker handoff --yes --target <pane> --bead <bead-id> --note 'WP-XX; read root contract; no scope expansion'

# Short pointer/status messages only
tmux-session-picker message-send --from <orchestrator> --to <agent> --bead <bead-id> --text 'dependency WP-YY merged; rebase/check before continuing'

# Recipient acknowledgement
tmux-session-picker message-list --for <agent> --unacked
tmux-session-picker message-ack <message-id> --by <agent>
```

Before integration:

```text
[ ] Structured implementation handoff present
[ ] Changed files match declared ownership
[ ] Deterministic validation evidence present
[ ] Named eval suite executed or explicitly deferred by gate
[ ] No hidden cross-WP scope expansion
[ ] New findings have discovered-from follow-up Beads
[ ] Compatibility and migration tests pass
[ ] Native Beads readiness/claim/gate evidence agrees with Specialists projection
[ ] Integration reviewer verdict recorded
[ ] Dependent lane owners notified through durable Bead note + pointer message
```



# Appendix I — Filed Beads reconciliation matrix

The following mapping is normative for updating the Beads packet generated on 13 July 2026. Status describes the contract, not whether the Bead remains open.

| Existing Bead | Disposition | Final WP mapping | Required action |
|---|---|---|---|
| `unitAI-6639v` | **REFINE** | IC01–IC06, IC11–IC13 | Retain epic, expand objective beyond skill split/parity to full interactive coordinator bridge and roadmap integration. Remove stale assumptions about project-local skill paths. |
| `unitAI-6639v.1` | **REFINE** | IC01 | Add current release baseline, two launch modes, xtmux V2 primitives, future coordinator four-duty mapping, roadmap Opportunity mapping and explicit secure-delivery decision. |
| `unitAI-6639v.2` | **REFINE/SPLIT** | IC02,IC03,IC04 | Keep skill restructuring but separate coordinator prompt and coordinator-specific doctrine. Remove any Core implementation scope. |
| `unitAI-6639v.3` | **REFINE** | IC12 | Expand scenarios to preheat/direct, readiness race, no-leak, role/assignment ack, chain-template selection, conflict matrix, cross-coordinator mechanics and parent-context reduction. |
| `unitAI-6639v.4` | **REFINE** | IC05,IC06 | Support `tracked` and `standby` render modes; return secure file + metadata; reuse task-side assembly; no system prompt; audit duplicate Bead context. |
| `xtrm-k2ufi` | **REFINE** | IC07–IC10 | Retain Core epic but change transport from presumed positional prompt to readiness-gated secure pointer delivery; include preheated mode. |
| `xtrm-k2ufi.1` | **REPLACE CONTRACT** | IC07,IC09,IC10 | Remove “final positional argument” as default. Add `starting/agent.ready`, renderer-before-provision direct mode, prompt file, xtmux handoff, preheat and atomic cleanup. |
| `xtrm-k2ufi.2` | **REFINE** | IC12 | Add readiness, preheat, direct launch, second-turn interactivity, prompt-leak inspection, message/ack behavior and cleanup across Pi/Claude. |
| No filed xtmux epic | **ADD** | IC08 plus xtmux share of IC07/IC10/IC11 | Create explicit xtmux work rather than hiding handoff/readiness changes inside Core. |
| No filed roadmap-hook work | **ADD** | H01–H05 | Create only after G02/reuse audit; preserve shared kernel and shadow-first rollout. |

# Appendix J — Exact required edits to filed Beads

## J.1 `unitAI-6639v` epic

Add to SUCCESS:

```text
The interactive chain-coordinator becomes the bridge implementation of future
chain-coordination judgment: it validates template/scope/gates, maintains child-chain
collision state, communicates mechanical hygiene to peer coordinators, escalates vision
and ambiguous judgment to the parent, and performs close-time evidence/follow-up checks.
```

Add to SCOPE:

```text
- coordinating-chains coordinator-specific skill/reference
- interactive tracked + standby assignment contract
- roadmap amendment and Bead/WP reconciliation
- coordinator behavior/eval fixtures
```

Remove or supersede:

```text
- any implication that parity is only “same initial prompt as sp run”
- any dependency on project-local .xtrm/skills/active paths
```

## J.2 `unitAI-6639v.1`

The parity matrix must classify:

```text
system prompt                         deliberately separate
root using-specialists skill          align by effective installed resource
phase-specific references             on-demand
tracked task template                  align
Bead/dependency context                align
mandatory rules                        align, task-side and current
specialist run context                 interactive variant
output contract                        omit or adapt; persistent session is not a terminal job
memories                               follow approved pull policy
GitNexus snapshot                      classify by coordinator phase
reviewer diff context                  not applicable unless coordinator is acting as gate
pre-script output                      classify
permissions                            deliberately deferred
extensions/hooks                       runtime-specific but fingerprinted
lifecycle telemetry                    xtmux interactive semantics, not sp job semantics
```

Add evidence from Specialists `3.18.2`, Core `0.10.2` and xtmux V2 default-on.

## J.3 `unitAI-6639v.2`

Split implementation ownership:

```text
IC02 progressive skill tree/global install
IC03 coordinator stable prompt
IC04 coordinator-specific doctrine/templates/conflicts/close behavior
```

Do not include Core launcher edits. Add explicit validation that the coordinator no longer hardcodes the production chain sequence.

## J.4 `unitAI-6639v.3`

Add validation cases:

```text
preheated role sends role.ready and does no work before assignment
direct --bead waits for runtime ready before prompt delivery
tracked assignment contains Bead + mandatory rules exactly once
prompt not present in system prompt, argv, pane metadata, message body or telemetry
Pi and Claude remain interactive for a second turn
coordinator selects code-standard/security-deep/etc. from catalog correctly
coordinator detects seeded path conflict and chooses a justified strategy
coordinator sends mechanics to peer and vision/escalation to parent
close-readiness false-positive corpus
```

## J.5 `unitAI-6639v.4`

Replace the output contract with:

```json
{
  "schema": "specialists.interactive-assignment.v1",
  "role": "chain-coordinator",
  "mode": "tracked|standby",
  "bead_id": "nullable",
  "prompt_file": "/secure/path",
  "prompt_sha256": "...",
  "component_ids": [],
  "mandatory_rule_ids": [],
  "bytes": 0,
  "estimated_tokens": 0
}
```

For tracked mode, content order is task-template/Bead/dependencies then mandatory rules. For standby mode, content is a minimal parent-ack/wait bootstrap.

## J.6 `xtrm-k2ufi` and `.1`

Replace the positional-prompt transport assumption with:

```text
call Specialists renderer from original cwd
fail before provisioning on tracked render failure
create worktree/session with @agent_state=starting
wait for runtime agent.ready/idle
call xtmux handoff with existing prompt file
safe-send-pointer sends one-line pointer into prompt input
automatic monitor is armed or verified
retain Bead metadata
```

Add preheat behavior when no Bead is provided. Core does not own prompt-file contents or xtmux SQLite internals.

## J.7 `xtrm-k2ufi.2`

Add no-leak and readiness inspection across:

```text
ps/process argv
tmux pane options
agent.role.launched event
delivery_attempts and handoff rows
message summaries
Core stdout/stderr
transport artifact permissions and cleanup
```

## J.8 New xtmux epic

Recommended title:

```text
Readiness-gated interactive role assignment and preheated coordinator handoff
```

Children:

```text
1. startup readiness contract for Claude/Pi integration
2. existing-prompt-file handoff + wait-ready
3. preheated role/assignment acknowledgement protocol
4. durable delivery/ack/no-leak tests
5. coordinator mechanical-message conventions
```

# Appendix K — Required direct documentation changes

## K.1 `specialists-roadmap.md`

The roadmap patch must include all items from Sections 13.1 and 13.1A–B, update shipped status to Specialists `3.18.2`, add Track D (policy hooks/xtmux architecture) and Track E (interactive coordinator), and link this PRD. It must not copy all WP tables into the roadmap.

The roadmap should show this bridge sequence:

```text
telemetry/eval baseline
+ interactive content/parity audit
→ readiness + secure assignment bridge
→ critical chain-first spine
→ coordinator consumes resolved shape
→ evaluated prompt/rule/memory modernization
→ Console materializer expansion
→ eventual Substrate/Channels replacement
```

## K.2 xtrm `_meta`

The 21 June reconciliation remains historical. Add a banner and create a new dated reconciliation recording:

- Specialists `3.18.2`, Core `0.10.2`, xtmux SQLite V2 default-on; the xtmux hook/extension audit is treated as an earlier independent design input, before monorepo and coordinator work;
- Track A/C/D immediate work and delayed Track B;
- per-repository Specialists `observability.db` and Console materializer runway;
- two-mode interactive assignment;
- current/future coordinator lifecycle distinction;
- bridge retirement triggers.

## K.3 Core documentation

Update `docs/xt-pi-role.md` with:

- current global skill resolution;
- preheated and direct tracked modes;
- readiness and assignment flow;
- Bead metadata versus startup snapshot distinction;
- secure pointer transport and no-leak contract;
- role/message address spaces and acknowledgement semantics.

## K.4 xtmux documentation

Update the observability/coordination docs with:

- `agent.ready`/starting semantics;
- handoff of a precomposed Specialists assignment;
- prompt delivery as a `delivery_attempt`, not a durable semantic message;
- coordinator message vocabulary;
- exact boundary from Specialists and future Channels.

# Appendix L — Decomposition handoff for the originating PRD agent

The agent receiving this document must not regenerate a fresh backlog without reconciling live Beads. Required sequence:

```text
1. Read current code and release baselines.
2. Read specialists-roadmap.md and chain-template catalog.
3. Read this consolidated PRD.
4. Inspect the filed Beads packet and live Beads state.
5. Apply Appendix I dispositions and Appendix J contract changes.
6. Create missing xtmux and policy-hook Beads.
7. Produce a WP-to-Bead mapping with no orphan acceptance criteria.
8. Recompute dependency DAG and initial parallel wave.
9. Run composition review before implementation dispatch.
```

Required output report:

```text
updated/reused/superseded Bead IDs
WP mapping
changed descriptions and dependency edges
new missing Beads
critical path
parallel-safe wave
file collision matrix
eval/validation coverage
roadmap/meta documentation patch plan
```