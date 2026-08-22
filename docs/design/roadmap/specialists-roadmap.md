# Specialists Runtime Roadmap v3.3 — Current Baseline and Deterministic Execution Sequence

> **Status:** canonical reconciliation baseline, 30 July 2026.
>
> **Document role.** This roadmap owns current-state reconciliation, ownership boundaries, and delivery sequence. The lifecycle of one managed Specialist activation remains canonical in [`../execution-protocol-design/specialist-execution-protocol.md`](../execution-protocol-design/specialist-execution-protocol.md). Repository code and executable contracts remain authoritative when this document and source disagree.
>
> **Historical record.** The complete pre-v3.3 critique, friction catalog, opportunity set, rollout, chain-template discussion, and decision log remain available in [`history/specialists-roadmap-v3.2-2026-07-24.md`](history/specialists-roadmap-v3.2-2026-07-24.md). That archive is evidence and history, not an executable plan.
>
> **PRD companion.** Current implementation packages and acceptance gates are specified in [`enhanced-prd.md`](enhanced-prd.md).

## 0. Verified baseline

| Repository | Released | Source baseline | Post-release delta |
|---|---:|---|---|
| `xtrm-dev/core` | `0.11.3` | `5a897c89` | Pi-native tool rendering is source-only and belongs to the next release. |
| `Jaggerxtrm/xtmux` | `0.2.3` | `12d6709e` | No material post-release runtime delta was observed. |
| `xtrm-dev/specialists` | `3.21.2` | `eaf044f0` | PR #242 ships `CHANGELOG.md` in the next package and compacts future changelog formatting. |

The source baselines are the corresponding `origin/master` heads verified on 30 July 2026. AC0 is closed. The released trio is no longer a source-only or coordinated-release dependency.

> Versions are current as of the snapshot 0.11.4 / 0.2.3 / 3.21.x era above; [`current-release-snapshot.md`](current-release-snapshot.md) owns release-version truth. Re-check at write time before citing versions.

### 2026-08-22 — integrated native runtime model

The accepted cross-domain runtime model lives in the xtrm repository canon at text path `xtrm-dev/xtrm:docs/runtime/` (relative GitHub paths across repositories do not resolve; always cite the repo-qualified path). It defines the object model this roadmap's delivery sequence builds on:

- Authored workflows are `ChainSource` (templates are one variant among Template/JSON/AdHoc/Imported), normalized to `ChainDefinition`, compiled/frozen to `ResolvedChain`, executed as durable `ChainRun`. A template is a compatibility ChainSource variant, not the ontology.
- Identity: `participant_id` is stable per `(scope, role)`, a new `job_id` per activation, attempts within an activation, and the AgentSession identity owned by Pi. Participant ≠ activation ≠ AgentSession.
- Supervision splits three ways: ActivationSupervisor owns exactly one direct participant activation lifecycle; the xtmux RuntimeSupervisor owns external/interactive runtimes via terminal backends; the pure reducer/scheduler owns chain progression. None of the three inherits another's authority.
- Capabilities: `ResolvedCapabilityGrant = f(specialist request, chain/step policy, operator policy, runtime/sandbox capabilities)`; requested capability ≠ granted capability. Legacy `skills.scripts` compile into typed ProbeDefinitions within the prepare-probes/finalize-validators taxonomy; shell scripts are never a privileged implicit preflight API.
- Channels: communication semantics stay canonical in `xtrm-dev/xtrm:docs/channels/channels.md`; this roadmap does not duplicate them.
- Beads remains the work/evidence authority; chain materialization into Beads happens only after ResolvedChain freeze, and the materializer never invents a second dependency graph.

Acceptance test for the integrated milestone unchanged: the SRE vertical-slice workflow runs fully data-defined through the generic loader/compiler/reducer/runtime with zero SRE-specific runtime topology code.

### 0.1 Release and changelog reconciliation

#### Core

- The `0.11.3` changelog is current and compact.
- Post-release Pi-native tool rendering stays out of the `0.11.3` shipped ledger.
- The rendering change is source-only until the next Core release.

#### xtmux

- The `0.2.3` release content is current.
- The duplicate `# Changelog` title and preamble under `[Unreleased]` must be removed.
- A fixture must require exactly one title, one preamble, and one `[Unreleased]` section.

#### Specialists

- The `3.21.2` release content is current.
- PR #242 cannot retroactively change the package already published as `3.21.2`.
- Do not cut a patch only to restyle historical notes.
- The next release must prove that `CHANGELOG.md` exists in the npm tarball.

### 0.2 Pull-request reconciliation

| Pull request | Disposition |
|---|---|
| Specialists #243 | Keep. Rebase onto current `master`, align future-roadmap wording with v3.3, and merge after document review. |
| Specialists #160 | Re-evaluate. Rebase only if current exclusion and health logic still reproduces the blind-tool defect; otherwise close with evidence. |
| Specialists #94 | Close as stale or recreate from current chat/TUI behavior. |
| Specialists #79 | Close as stale or recreate from the current `sp ps` output contract. |
| Specialists #44 | Close as stale because project installation architecture changed materially. |

## 1. Current authority and retrieval model

### 1.1 Authority table

| Concern | Current authority |
|---|---|
| Task contract, readiness, dependencies, gates, and acceptance | Beads |
| Implementation evidence | GitHub |
| Integration state and commit policy | Git |
| Specialist jobs and the managed activation protocol | Specialists |
| Runtime causality | `xtrm.forensic.v1` |
| Bridge delivery, obligations, monitoring, and wakes | xtmux |
| Program and epic projection | Jira |
| Multi-repository operator presentation | Console read model |

Beads remains the durable work authority until a reviewed replacement is active. Git remains the integration authority. xtmux owns bridge coordination state; it does not own Specialist jobs, chain state, finalization, or scheduling.

Jira contains epics, program state, and release evidence only. It must not duplicate step-level Beads state.

### 1.2 Public retrieval hierarchy

Use the narrowest durable surface that answers the question:

1. `bd show`, dependency, state, and gate commands for task contracts and acceptance.
2. `xtmux message-get` for an exact message and `xtmux agent-last` for a completed pane turn.
3. `sp result` for a completed Specialist result.
4. `sp feed`, `sp log`, and `sp forensic` for runtime event history; use their JSON forms for machine consumers.
5. `sp ps` for actionable process and job status.
6. `sp console` for the multi-repository operator read model.
7. `xtmux dashboard`, `xtmux topology`, and `xtmux log query` for bridge topology and coordination evidence.

Live pane capture is a bounded diagnostic surface. It is not final-result storage.

### 1.3 Current Beads surface inventory

The v3.3 architecture reuses current Beads primitives instead of rebuilding them in Specialists.

| Beads primitive | Current role | Specialists responsibility |
|---|---|---|
| `bd merge-slot` | Exclusive access with holder and queued waiters | Observe and surface lease state; do not create a competing lease authority. |
| `bd gate` | Typed async conditions for human, timer, GitHub run, GitHub PR, and Bead waits | Consume gate outcomes as validated evidence. |
| `bd swarm` | Epic plus child DAG composition and validation | Reuse its graph checks when a future compiler materializes Beads work. |
| `bd state` / `bd set-state` | Multi-dimensional issue state | Use for durable workflow dimensions that belong to work state. |
| issue `skills` field | Required capability declaration | Resolve execution profiles without duplicating capability metadata. |
| first-class acceptance, design, context, metadata, and wait fields | Structured task contract data | Prefer native fields over another contract serialization. |
| `bd federation` | Cross-workspace coordination primitive | Evaluate before adding a Specialists-specific cross-repository store. |

Any new Specialists-side primitive must state why the existing Beads primitive is insufficient.

## 2. Current observability and identity design

### 2.1 Five-layer identity model

The current bridge separates role identity from execution identity:

| Layer | Field | Type | Cardinality | Label-safe | Lifetime |
|---|---|---|---|---|---|
| 1 | `participant_kind` | bounded enum | low | yes | constant |
| 2 | `participant_role` | bounded enum | low | yes | constant |
| 3 | `participant_id` | opaque, stable for `(scope, role)` | high | no | membership |
| 4 | `job_id` | opaque, new for each activation | high | no | one execution |
| 5 | `turn_id` / `tool_call_id` / `event_id` | opaque, per fact | very high | no | one fact |

#### Identity derivation

| `participant_kind` | `participant_role` examples | `participant_id` derivation | `job_id` | Layer-3 scope |
|---|---|---|---|---|
| `specialist` | `executor`, `reviewer`, `obligations-scanner` | `${chain_id}::${role}` | UUID per run | chain |
| `orchestrator` | `claude-code-session`, `auto-mode-harness` | `orch::${session_uuid}` | UUID per session run | session |
| `pulse_emitter` | `chain-coordinator-hygiene`, external triggers | scoped opaque identity | UUID per emission | container or global |
| `adapter` | MCP and harness adapters | opaque UUID per registered adapter | UUID per invocation | global |
| `node_member` | `coordinator`, member role | `node::${node_id}::${role}::${member_index}` | UUID per run | node |

#### Identity invariants

1. Two activations of the same role in the same scope have the same `participant_id` and different `job_id` values.
2. Two activations of the same role in different scopes have different `participant_id` values.
3. `participant_kind × participant_role` is not sufficient to identify a participant.
4. Only Layers 1 and 2 are eligible as Prometheus labels.
5. Layers 3 through 5 remain correlation fields or event-body data.
6. A synchronous tool invocation is not a participant unless it has its own lifecycle, runs, and state.

### 2.2 Shipped bridge status

- `xtrm.forensic.v1` envelopes carry the canonical identity layers.
- Specialist forensic events persist the canonical envelope.
- `sp forensic` queries persisted envelopes.
- JSON feed and log output expose additive forensic data.
- `sp metrics` emits a low-cardinality Prometheus projection.
- Tests cover identity derivation, redaction, forbidden-label rejection, persistence, and replay-safe table-derived counters.

Remaining telemetry work is incremental source-family coverage and consumer migration. It is not permission to create a second event authority.

### 2.3 Console

Console is a read model over durable runtime and bridge data. It can materialize and correlate current state, history, results, and evidence. It does not become the writer or authority for messages, jobs, chain state, finalization, scheduling, Beads, or Git.

## 3. Opportunity 19 — deterministic Specialist execution protocol

Every managed activation runs through one versioned `specialists.execution.v1` protocol:

1. resolve context and validate the structural contract;
2. deliver mandatory rules and persist acknowledgement;
3. make the conditional memory decision;
4. persist a typed local plan;
5. execute role work;
6. validate required evidence;
7. apply Git and commit policy;
8. persist one validated result;
9. hand off the Bead and notify the parent with typed outcomes;
10. clean up owned resources.

The deterministic shell is implemented once in Specialists. A Specialist definition selects an execution profile and declares role-specific capabilities and evidence. The step Bead carries the current mandate.

`job completed` does not mean `step satisfied`. Only validated evidence can advance deterministic state.

### 3.1 Protocol ownership

| Concern | Owner |
|---|---|
| Structural contract and acceptance | Beads plus the execution-protocol validator |
| Activation phase state and protocol events | Specialists |
| Required evidence schema | Execution profile |
| Role-specific work | Specialist definition |
| Integration policy | Git policy evaluated by Specialists |
| Parent delivery and wake | xtmux bridge contract |
| Operator projection | `sp ps`, forensic surfaces, and Console |

### 3.2 Protocol invariants

- Phase state is persisted before side effects are acknowledged.
- Evidence is typed and validated before satisfaction.
- Finalization is idempotent.
- Parent notification has one typed outcome.
- Owned-resource cleanup is explicit and replay-safe.
- Observe mode can collect protocol state without changing advancement authority.
- Shadow, warn, and enforce modes require measured promotion criteria.

Canonical design: [`../execution-protocol-design/specialist-execution-protocol.md`](../execution-protocol-design/specialist-execution-protocol.md).

## 4. Bridge economics and replacement boundary

Substrate and Channels are future replacement targets. Until reviewed cutover criteria pass:

- Beads remains task and acceptance authority;
- Git remains integration authority;
- xtmux remains bridge delivery and wake authority;
- Specialists remains the job and execution-protocol runtime;
- Console remains a read model.

Design intent does not transfer current ownership.

### 4.1 Bridge classes

| Class | Typical lifespan | Carrying cost | Retirement gate |
|---|---|---|---|
| Migration bridge | Days to weeks | Duplicate projection and operator cognitive load | Replacement projection passes parity and adoption checks. |
| Durable compatibility bridge | Until an explicit data migration | Drift against both current and future schemas | Migration and rollback evidence pass. |
| Throwaway diagnostic | Until its replacement authority ships | Test and release maintenance | Replacement provides equal or better evidence. |

### 4.2 Required bridge ledger

Every active bridge records:

1. the concrete failure mode it covers;
2. the current authority and future target;
3. the owner of cutover;
4. forensic instrumentation for usage and failures;
5. a parity or drift check;
6. operator-visible deprecation state;
7. a measurable retirement gate;
8. a rollback path.

A bridge without this ledger is an unowned subsystem and cannot enter DO0.

### 4.3 Durable ownership split

| Owner | Owns | Does not own |
|---|---|---|
| xt | Git, worktree, branch, PR, and integration primitives | Specialist job state, evidence validation, bridge delivery |
| Specialists | Job runtime, activation protocol, evidence validation, and job observability | Beads task authority, merge-slot arbitration, Git implementation |
| Beads | Task contracts, dependencies, readiness, gates, acceptance, and merge slots | Runtime telemetry and Specialist execution |
| xtmux | Message delivery, obligations, monitoring, wake delivery, and topology | Specialist jobs, chain advancement, finalization, scheduling |
| Console | Materialized operator views | Authoritative writes to any runtime or work system |
| Substrate / Channels | Reviewed future replacement surfaces | Current authority before cutover |

When Specialists needs a primitive owned elsewhere, it opens or extends work in the owning system and consumes that surface. It does not absorb the primitive.

## 5. Canonical delivery sequence

```text
R0 — v3.3 documentation and board reconciliation
  → apply mechanical Beads cleanup
  → close the AC0 record
  → produce one approved DO0 graph through /spec-dispatch

DO0.1 — specialists.execution.v1 foundations
  → schemas
  → execution profiles
  → protocol events
  → observe-mode preflight/rule/memory/plan/evidence state

DO0.2 — deterministic chain shape
  → one canonical template compiler/resolver
  → one immutable persisted ResolvedChain

DO0.3 — deterministic advancement
  → one pure evidence-driven reducer
  → exact scheduler intents
  → one side-effect executor

DO0.4 — activation finalization and recovery
  → validated result
  → Git/commit policy
  → idempotent persistence, Bead handoff, parent notification, and cleanup
  → logical sessions and replay-safe recovery

DO0.5 — coordinator and cognition
  → coordinator consumes validated state
  → evaluated role profiles, prompts, and models
  → pull-based memory

DO0.6 — product and governance
  → Console materialization
  → policy observe/shadow/warn/enforce
  → release and rollback evidence
```

R0 closes reconciliation work. DO0 starts only from one approved graph produced against this revision and current repository heads.

### 5.1 DO0 invariants

- One compiler/resolver owns canonical chain shape.
- One immutable `ResolvedChain` is the persisted shape.
- One pure reducer converts validated evidence into state and scheduler intents.
- One effect executor performs external side effects.
- One activation protocol owns validation, finalization, persistence, handoff, notification, and cleanup.
- Coordinator logic consumes validated state; it does not infer success from process exit alone.
- Recovery is idempotent and replay-safe.

## 6. Independent companion programs

These programs remain outside the critical DO0 path and must not become runtime authorities.

### 6.1 CLI actionable outcomes

`xtmux`, `sp`, and `xt` mutation commands should return:

- an explicit outcome;
- a stable reason code;
- exact next actions.

This program improves operator and adapter ergonomics. It does not own message storage, jobs, chain state, finalization, or scheduling.

### 6.2 Harness-native adapters

Claude MCP and Pi native tools consume the public CLI/runtime contract. Their first responsibility is adapter ergonomics and instruction reduction. They do not duplicate runtime state or policy.

## 7. Live bug lane outside DO0

Narrow correctness fixes may ship before DO0 when they remain compatible with the future protocol.

| Bead | Scope |
|---|---|
| `unitAI-63xi3.1` | quota and rate-limit fallback |
| `unitAI-63xi3.2` | canonical catalog fallback |
| `unitAI-ucpcy` | package-only global init |
| `unitAI-0jc35.3` | READ_ONLY capability mismatch |
| `unitAI-anjk2` | fork dry-run/help mismatch |
| `pzncp`, `tdpnn`, `7osqy`, `xqvut`, `k2czn`, `yhb99`, `1s8xs`, `e8eq2` | selected loader, reviewer, and closure P3 defects |

Do not bury these defects in architecture epics. Do not expand a narrow fix into a competing orchestration subsystem.

## 8. R0 board reconciliation

Review the audit batch before mutation. Then:

1. close mechanically obsolete items and duplicates;
2. close or supersede historical architecture trees;
3. update blocked or human-decision items with exact evidence and one answerable question;
4. preserve the live bug lane;
5. relate retained history to replacements instead of leaving two executable plans;
6. create DO0 Beads only after `/spec-dispatch` approves one graph.

The audit estimate is approximately 30 live relevant Beads, 9 blocked or human-decision Beads, and 123 mechanical close/supersede candidates. The target is approximately 39 active Beads before the DO0 graph is created.

### 8.1 Execution order

1. Review the full board audit and batch commands.
2. Apply mechanical close, duplicate, and supersede actions.
3. Update blocked and human-decision items with evidence.
4. Merge or close current documentation pull requests.
5. Approve this v3.3 revision and its PRD companion.
6. Run `/spec-dispatch` against v3.3 and current repository heads.
7. Create DO0 Beads and dependencies.
8. Update Jira at epic and program level only.

## 9. Exit criteria

R0 is complete when all conditions hold:

- one current release and source baseline exists;
- AC0 is recorded as closed and no open-gate wording remains;
- executable sections contain no duplicate historical architecture;
- no future task describes behavior already shipped in Core `0.11.3`, xtmux `0.2.3`, or Specialists `3.21.2`;
- the future design specifies one compiler, one persisted shape, one reducer, one effect executor, and one activation protocol;
- old Beads trees are closed, superseded, or explicitly related to replacements;
- current live bugs remain visible and narrowly scoped;
- Jira contains only current epics, program state, and release evidence;
- the next Specialists package check proves that `CHANGELOG.md` is present.
