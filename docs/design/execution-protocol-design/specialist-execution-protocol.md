# Deterministic Specialist Execution Protocol

**Status:** proposed canonical design  
**Target repository path:** `docs/design/execution-protocol-design/specialist-execution-protocol.md`  
**Owner:** `xtrm-dev/specialists`  
**Protocol identifier:** `specialists.execution.v1`  
**Scope:** one Specialist activation executing one root or step Bead contract  
**Companions:** `docs/design/roadmap/specialists-roadmap.md`, `docs/design/roadmap/chain-templates/README.md`, the Specialists modernization PRD, `xtrm/docs/channels/channels.md`, and the Substrate design.

---

## 1. Document role

This document is the canonical design for the execution protocol applied to every managed Specialist activation.

It defines:

- the runtime-owned lifecycle surrounding the model;
- the typed phases a Specialist role may require;
- contract readiness and mandatory-rule acknowledgement;
- optional memory retrieval;
- typed local planning;
- execution and evidence collection;
- Git and commit finalization;
- result persistence;
- automatic Bead handoff, parent notification, forensic emission and cleanup;
- failure, replay and idempotency semantics.

It does **not** define chain topology. Chain templates define which participants and gates exist and how they depend on one another. This protocol defines how one selected participant executes its assigned step safely and reproducibly.

The executable TypeScript schemas and reducer tests become the runtime authority once implemented. This document remains the semantic contract.

---

## 2. Problem

Today a Specialist receives a substantial task and policy envelope, performs work, and usually produces a result. Several critical operations still depend partly on prompt prose or orchestration discipline:

```text
read the correct Bead and bounded dependency context
recognize whether the contract is complete enough to execute
acknowledge applicable mandatory rules
retrieve memory only when relevant
form a bounded plan
collect the required evidence
commit the intended change
produce a schema-valid result
append the durable Bead handoff
notify the parent
release owned runtime resources
```

When these actions are left as prose, a capable agent may still omit, reorder or reinterpret them. The target is not to make the model deterministic. The target is to put deterministic boundaries around the model so that omission, ambiguity and policy drift become explicit runtime states.

---

## 3. Core decision

A Specialist activation consists of a **deterministic shell** around a **typed agentic core**.

```text
runtime-owned PREPARE
  → typed agentic PLAN
  → typed agentic EXECUTE
  → runtime-owned FINALIZE
```

The runtime owns:

```text
context resolution
structural contract validation
mandatory-rule resolution and delivery receipt
phase applicability
schema validation
scope/capability validation
required-evidence presence and freshness checks
Git-state validation
commit orchestration
result persistence
Bead note append
parent notification
forensic events
terminal cleanup
```

The model owns, within those boundaries:

```text
semantic readiness judgment
conditional memory-need judgment
local execution plan
implementation, review, testing or research work
interpretation of evidence
result content and bounded rationale
```

The distinction is normative:

```text
agent finished
  ≠ protocol completed

result exists
  ≠ result validated

job completed
  ≠ chain step satisfied

mandatory rules delivered and acknowledged
  ≠ mandatory rules complied with
```

---

## 4. Ownership layers

### 4.1 Runtime protocol

The common protocol is implemented once in Specialists. It defines phase order, state transitions, validation, persistence and automatic terminal actions.

### 4.2 Specialist execution profile

A Specialist definition selects a versioned execution profile and declares only role-specific differences:

- permission posture;
- applicable phases;
- memory policy;
- planning policy;
- evidence requirements;
- validation ownership;
- commit policy;
- output schema;
- allowed overrides.

The full lifecycle is not copied into every Specialist JSON.

### 4.3 Step contract

The current root or step Bead declares the work-specific mandate:

- problem or mandate;
- inputs;
- outputs or deliverables;
- scope;
- non-goals;
- validation;
- acceptance.

### 4.4 Chain template and reducer

The chain template decides that an executor, reviewer, test-runner or other participant exists. The resolved chain and chain reducer decide when that participant is runnable and whether its validated result satisfies the chain step.

The Specialist execution protocol does not choose the next chain node.

---

## 5. Canonical activation lifecycle

```text
created
  → preparing
      → blocked_contract
      → blocked_policy
      → waiting_input
      → planning
  → executing
      → waiting_input
      → failed
  → finalizing
      → blocked_evidence
      → blocked_git
      → failed
  → terminal
      → done
      → waiting
      → error
      → cancelled
```

The lifecycle is recorded as protocol phase events, not inferred from terminal text.

### 5.1 Phase outcomes

Each phase records one of:

```text
passed
blocked
skipped_by_policy
failed
```

A skipped phase must identify the policy that made it inapplicable. Silent omission is invalid.

### 5.2 Fail-closed rule

The activation cannot enter `planning` or `executing` when:

- the structural contract is NOK;
- mandatory rules cannot be resolved;
- the role cannot comply with an applicable mandatory rule;
- the resolved scope conflicts with role permissions;
- required input evidence is missing and no explicit waiting/escalation path exists.

---

## 6. PREPARE phase

## 6.1 Context resolution

The runtime resolves and fingerprints:

```text
current Bead
root Bead when current Bead is kind:step
bounded dependency context using configured context_depth
resolved chain identity and current step identity when available
upstream result/evidence pointers
repository, worktree, branch and base identity
resolved Specialist definition
resolved mandatory rules
resolved skills and capability packs
candidate/runtime fingerprint
```

The resolved envelope records whether bounded dependency context is complete. A depth-limited context must never be presented as the complete chain history.

Example:

```json
{
  "schema_version": "specialists.context.v1",
  "bead_id": "unitAI-step",
  "root_bead_id": "unitAI-root",
  "chain_id": "chain:abc",
  "context_depth": 3,
  "dependency_context_complete": false,
  "upstream_refs": [],
  "repository": "xtrm-dev/specialists",
  "worktree": "/repo/.worktrees/unitAI-step",
  "branch": "sp/unitAI-step"
}
```

## 6.2 Seven-field structural contract gate

The default root/change-contract readiness profile contains seven body fields:

1. `problem`
2. `scope`
3. `non_goals`
4. `dependencies_or_inputs`
5. `deliverables`
6. `validation`
7. `acceptance`

`type` and `scrutiny` are required metadata and are validated separately.

A step contract uses its role-specific equivalent:

```text
mandate
inputs
outputs
authorized scope
non-goals
validation
downstream acceptance/handoff obligation
```

The concrete field catalog is versioned in schema. The runtime validates:

- field presence;
- non-empty normalized values where required;
- valid field type;
- parseable scope references;
- valid scrutiny enum;
- no structurally impossible combination;
- root-versus-step discriminator consistency;
- explicit authority for any requested production write;
- required validation and acceptance content for write-capable roles.

Output:

```json
{
  "schema_version": "specialists.contract-preflight.v1",
  "status": "OK",
  "profile": "change-contract.v1",
  "missing_fields": [],
  "invalid_fields": [],
  "warnings": []
}
```

`NOK` is terminal for this attempt. It produces a typed blocker and cannot proceed to planning.

## 6.3 Semantic readiness gate

Structural validity cannot prove that a contract is semantically usable. For example, `acceptance: works correctly` is present but not falsifiable.

A bounded readiness evaluator returns:

```text
READY
UNCLEAR
INVALID
```

It evaluates:

- whether the problem or mandate is understandable;
- whether scope and non-goals conflict;
- whether validation can establish acceptance;
- whether required inputs are available;
- whether ambiguity would force uncontrolled scope invention.

Policy:

```text
READY   → continue
UNCLEAR → waiting/escalation; no work
INVALID → blocked_contract; no work
```

This evaluator may be model-based, deterministic, or hybrid. Its output is typed and never hidden in prose.

## 6.4 Mandatory-rule resolution and acknowledgement

The runtime resolves the effective mandatory-rule set and records a delivery receipt:

```json
{
  "schema_version": "specialists.mandatory-rules-receipt.v1",
  "rule_ids": ["core-session-boundary", "git-workflow-safe"],
  "rules_hash": "sha256:...",
  "resolved_at_ms": 0,
  "delivery_surface": "system-and-task-envelope"
}
```

The Specialist returns a bounded acknowledgement as part of preflight:

```json
{
  "can_comply": true,
  "conflicts": [],
  "clarifications_required": []
}
```

If `can_comply=false`, execution cannot proceed. The runtime persists the conflict and moves the job to waiting or blocked according to policy.

The acknowledgement proves explicit contract handshake. It does not prove later compliance. Compliance is evaluated from tool events, diff, result and deterministic graders.

## 6.5 Capability and skill resolution

The runtime resolves applicable capabilities and skills after contract and role resolution. Examples:

```text
GitNexus
Serena/LSP
service skills
planning skill
research tooling
test-planning
deploy/SRE validation
```

The resolved capability set is fingerprinted. Missing required capabilities block before work. Optional capabilities remain discoverable but do not become mandatory implicitly.

## 6.6 Memory decision and retrieval

Memory is a conditional capability, not an unconditional ritual.

A Specialist profile declares:

```text
never
conditional
required
```

For `conditional`, the agent emits:

```json
{
  "memory_needed": true,
  "reason": "A previous migration decision affects compatibility",
  "lenses": ["herd", "workgroup"],
  "query_terms": ["migration compatibility"]
}
```

If `memory_needed=false`, the reason is still recorded and execution continues without retrieval.

If retrieval runs, the runtime records:

- query lens and terms;
- returned memory IDs;
- memory payloads opened;
- memory references consumed in plan or result;
- provenance and freshness status;
- token and latency cost.

Memories remain contextual evidence. Current contract, code, environment and authoritative external sources outrank memory.

---

## 7. PLAN phase

Planning is agentic but typed.

The local execution plan is not a second Beads graph and not a replacement for the chain template. It is an activation-local plan for carrying out the assigned mandate.

Example:

```json
{
  "schema_version": "specialists.execution-plan.v1",
  "steps": [
    {
      "id": "inspect-impact",
      "kind": "read",
      "scope_refs": ["symbol:provisionWorktree"],
      "depends_on": [],
      "expected_evidence": ["gitnexus-impact"],
      "validation": []
    },
    {
      "id": "implement",
      "kind": "write",
      "scope_refs": ["file:src/specialist/worktree.ts"],
      "depends_on": ["inspect-impact"],
      "expected_evidence": ["diff"],
      "validation": []
    },
    {
      "id": "validate",
      "kind": "command",
      "scope_refs": [],
      "depends_on": ["implement"],
      "expected_evidence": ["test-result"],
      "validation": ["bun test tests/unit/specialist/worktree.test.ts"]
    }
  ]
}
```

The runtime validates:

- plan scope is a subset of authorized contract scope;
- role permissions permit each action kind;
- no write step exists for a read-only role;
- no undeclared destructive operation exists;
- step IDs are unique and dependencies acyclic;
- required validation is represented;
- required evidence has at least one producer;
- plan size and complexity stay within configured bounds.

An invalid plan may receive one bounded repair attempt. Continued invalidity blocks execution.

---

## 8. EXECUTE phase

The model performs the assigned role using the validated plan and current runtime state.

The runtime does not force every local plan step to execute in the original order when new evidence justifies a bounded adjustment. Material plan deviation must be recorded:

```json
{
  "kind": "plan.deviation",
  "from_step": "implement",
  "reason": "The target symbol moved to a different declared-scope file",
  "new_scope_refs": ["file:src/specialist/branch.ts"]
}
```

A deviation that expands beyond authorized scope requires waiting/escalation or a contract update. It cannot be legitimized by model prose.

## 8.1 Work ownership

Role permissions remain authoritative:

```text
writer       may edit only declared paths and may commit according to policy
read-only    may inspect and produce evidence but cannot mutate project files
operator     may authorize exceptional transitions but does not silently widen role permissions
```

## 8.2 Waiting

When required input or judgment is unavailable, the Specialist emits a typed waiting result rather than continuing speculatively.

The runtime persists waiting state, appends the bounded Bead handoff, and sends the parent notification automatically.

---

## 9. Evidence protocol

Each Specialist definition declares evidence requirements rather than relying only on prompt reminders.

Example:

```json
{
  "evidence_requirements": [
    {
      "kind": "gitnexus-impact",
      "required_when": ["repository_indexed", "production_code_change"],
      "phases": ["pre_change", "post_change"],
      "freshness": "current-diff"
    },
    {
      "kind": "validation-result",
      "required": true,
      "producer": "declared-validation"
    },
    {
      "kind": "diff",
      "required": true,
      "freshness": "current-head"
    }
  ]
}
```

Evidence requirement kinds are extensible through a catalog. Examples include:

```text
root-contract
upstream-result
diff
commit
GitNexus impact
Serena/LSP reference evidence
test result
security verdict
obligations verdict
deployment observation
external citations
memory provenance
```

The runtime validates presence, producer identity, target identity and freshness where deterministically possible.

Evidence interpretation remains role-specific. Evidence existence and referential integrity do not.

---

## 10. FINALIZE phase

Finalization is runtime-owned and ordered.

```text
result candidate received
→ output schema validation
→ required evidence validation
→ Git state and authorized-path validation
→ commit orchestration when applicable
→ final result enrichment and persistence
→ Bead note append
→ job/step evidence transition
→ typed parent message
→ forensic events
→ owned-resource cleanup
```

## 10.1 Result candidate and schema validation

The model produces a result candidate conforming to the merged output schema. The runtime rejects malformed output or routes it through a bounded repair path.

The result candidate may contain placeholders for runtime-owned facts such as final commit SHA. The runtime enriches these fields after commit and before authoritative persistence.

## 10.2 Git and commit policy

A Specialist profile declares:

```text
required
allowed
forbidden
```

For `required`, the runtime:

1. verifies changed paths are authorized;
2. preserves unrelated staged state;
3. stages only owned paths explicitly;
4. verifies no unresolved conflict exists;
5. creates the commit using the Bead/step identity;
6. records branch, base and commit evidence;
7. refuses completion if commit creation fails.

The model does not need to remember the terminal commit ritual. Read-only roles use `forbidden`.

## 10.3 Authoritative result persistence

The final result is persisted only after schema, evidence and Git checks pass.

`sp result <job-id> --json` remains the authoritative complete result surface.

## 10.4 Automatic Bead note

The runtime appends a structured handoff to the input Bead automatically. It contains bounded result data and durable evidence references, not raw hidden reasoning.

Idempotency key:

```text
(job_id, result_version, bead_id)
```

A retry cannot append the same final handoff twice.

## 10.5 Automatic parent notification

After result and Bead handoff persistence, the runtime sends a bounded typed message to the verified parent through the existing xtmux/Channels bridge.

The message contains pointers and exact retrieval/action commands. It does not duplicate the full result.

Delivery failure is recorded but does not change an otherwise successful job verdict.

## 10.6 Forensic and protocol events

The runtime emits correlated events for each phase transition and finalization side effect. Raw prompts, full result bodies and secrets are not copied into low-cardinality telemetry.

## 10.7 Cleanup

The runtime releases only resources owned by the activation:

- child process/process group;
- owned legacy tmux session;
- steer/resume FIFO;
- temporary prompt and materialization files;
- transient markers.

It preserves:

- branch;
- worktree;
- result;
- Bead handoff;
- forensic and integration evidence.

Worktree pruning is a separate, evidence-gated process.

---

## 11. Specialist definition contract

The recommended shape is profile-based to avoid duplicating the lifecycle.

```json
{
  "metadata": {
    "name": "executor"
  },
  "execution_protocol": {
    "version": "specialists.execution.v1",
    "profile": "code-writer.v1",
    "contract_profile": "change-or-step-contract.v1",
    "memory_policy": "conditional",
    "planning_policy": "typed-required",
    "commit_policy": "required",
    "semantic_readiness": "required",
    "overrides": {}
  },
  "capabilities": {
    "writes": true,
    "external_research": false,
    "memory_query": true
  },
  "evidence_requirements": [
    "current-contract",
    "gitnexus-impact-when-indexed",
    "current-diff",
    "declared-validation"
  ],
  "prompt": {
    "output_schema": "..."
  }
}
```

A reviewer profile might use:

```json
{
  "execution_protocol": {
    "version": "specialists.execution.v1",
    "profile": "read-only-final-gate.v1",
    "memory_policy": "conditional",
    "planning_policy": "typed-bounded",
    "commit_policy": "forbidden"
  },
  "capabilities": {
    "writes": false
  },
  "evidence_requirements": [
    "root-contract",
    "current-diff",
    "required-upstream-gate-results",
    "current-diff-fingerprint"
  ]
}
```

Profiles supply defaults by role class. Specialist definitions override only demonstrated differences.

---

## 12. Step-contract integration

The current chain step may add execution-specific requirements without redefining the role:

```xml
<step-contract role="executor">
  <mandate>Implement the resolved root deliverable.</mandate>
  <inputs>
    <item ref="bead:root" />
  </inputs>
  <outputs>
    <item kind="diff" />
    <item kind="validation-result" />
  </outputs>
  <scope>
    <path>src/specialist/**</path>
  </scope>
  <non-goals>
    <item>No unrelated refactor.</item>
  </non-goals>
  <validation>
    <criterion>bun test tests/unit/specialist</criterion>
  </validation>
</step-contract>
```

Precedence:

```text
runtime safety invariant
> mandatory rule
> role capability boundary
> step contract
> agent local plan
```

A step contract cannot grant a capability forbidden by the role or runtime.

---

## 13. Protocol event catalog

Minimum events:

```text
protocol.started
context.resolved
contract.structural_checked
contract.readiness_checked
mandatory_rules.delivered
mandatory_rules.acknowledged
capabilities.resolved
memory.decision_recorded
memory.query_started
memory.query_completed
plan.produced
plan.validated
plan.deviation
execution.started
execution.waiting
result.candidate_received
result.schema_validated
evidence.validated
git.validated
commit.created
result.persisted
bead_handoff.appended
parent_notification.sent
parent_notification.failed
cleanup.completed
protocol.completed
protocol.failed
```

Every event carries protocol version, job ID, participant identity, Bead/chain/step pointers, timestamp and candidate fingerprint where available.

---

## 14. Reducer and side-effect split

Protocol state derivation and side effects must remain separate.

```ts
reduceExecutionProtocol(
  state: ExecutionProtocolState,
  event: ExecutionProtocolEvent
): {
  state: ExecutionProtocolState;
  intents: ExecutionProtocolIntent[];
}
```

The reducer is pure and replayable.

Effectful intents include:

```text
invoke model phase
run memory query
run validation command
create commit
persist result
append Bead note
send parent message
release owned resources
```

Every side effect has a stable idempotency key. A crash after performing an effect but before advancing the local cursor must not duplicate the effect on replay.

---

## 15. Failure and recovery semantics

### 15.1 Structural failure

Missing or malformed contract fields produce `blocked_contract`. No model execution work begins.

### 15.2 Semantic ambiguity

`UNCLEAR` produces waiting/escalation. It never silently degrades to best-effort implementation.

### 15.3 Rule conflict

If the Specialist reports it cannot comply with an applicable mandatory rule, the activation blocks before planning.

### 15.4 Missing evidence

A job that performed work but lacks required evidence enters `blocked_evidence`, not `done`.

### 15.5 Git failure

A writer that cannot produce the required clean commit enters `blocked_git` or `error`. The result is not promoted as successful.

### 15.6 Notification failure

A notification failure is non-fatal to the job. It is separately observable and recoverable through polling/result surfaces.

### 15.7 Process death

Recovery replays protocol state from durable events and verifies current Bead, Git, ownership and side-effect state. Conversation resume alone does not prove protocol safety.

---

## 16. Static validation

Before dispatch, `sp validate` or an equivalent schema path validates:

- referenced execution profile exists;
- protocol version is supported;
- role capability and commit policy agree;
- read-only role cannot require write or commit phases;
- evidence requirement kinds exist;
- required evidence has an applicable producer;
- output schema exists;
- memory policy is valid;
- mandatory-rule sets resolve;
- phase overrides do not remove runtime-required safety phases.

---

## 17. Simulation and failure-injection tests

Required fixtures include:

```text
complete contract → plan → work → commit → result → note → notification
missing contract field → hard block before planning
semantic UNCLEAR → waiting and parent notification
mandatory-rule conflict → block
conditional memory not needed → no query
conditional memory needed → query and consumed refs
read-only role proposes write → plan rejection
plan scope expansion → plan rejection
missing GitNexus evidence when required → blocked_evidence
schema-invalid result → bounded repair then fail
commit failure → no successful result persistence
duplicate finalization event → no duplicate commit/note/message
process death after commit before result persistence → replay enriches once
message delivery failure → result remains successful
```

A dedicated `specialist-execution-protocol-v1` eval suite measures both deterministic correctness and role behavior.

---

## 18. Security and privacy

- Prompt, mandatory-rule and memory bodies are hashed or stored only in protected artifact storage.
- Full task payloads do not enter process argv, tmux metadata or notification messages.
- Scope validation prevents an execution profile from silently widening a Bead contract.
- Read-only roles are enforced by tool and filesystem policy where available, not only prompt prose.
- Commit staging is path-explicit and preserves unrelated operator state.
- Evidence and result references are bounded and redacted before external projection.
- Message bodies never grant authority.

---

## 19. Rollout

```text
off
→ observe
→ shadow
→ warn
→ enforce structural contract and output schema
→ enforce evidence and Git finalization
→ enforce full protocol
```

Recommended implementation sequence:

1. publish schemas, profiles and protocol event catalog;
2. instrument existing lifecycle in observe mode;
3. add structural contract gate;
4. add mandatory-rule receipt and typed acknowledgement;
5. add memory decision and typed plan;
6. add evidence validation;
7. centralize commit/result/Bead-note/notification finalization;
8. add replay and idempotency fixtures;
9. promote role profiles gradually;
10. expose protocol state in `sp log`, `sp result` and Console.

Existing Specialists remain compatible through a legacy profile until migrated.

---

## 20. Acceptance criteria

The protocol is complete when:

- every managed Specialist run records a protocol version and profile;
- the configured seven-field contract profile is structurally validated;
- NOK contracts cannot proceed;
- semantic ambiguity enters waiting rather than speculative work;
- the effective mandatory-rule set is fingerprinted and acknowledged;
- memory search is never an unrecorded mandatory ritual;
- required planning emits a schema-valid bounded plan;
- runtime rejects plans outside role or Bead scope;
- required evidence is typed, attributable and fresh;
- writer finalization stages only authorized paths and produces the required commit;
- read-only roles cannot commit;
- the authoritative result is persisted exactly once;
- the Bead note is appended exactly once;
- the parent message is emitted automatically after persistence;
- notification failure does not rewrite the job verdict;
- owned terminal resources are released;
- replay does not duplicate commits, notes, messages or evidence;
- the chain reducer consumes the validated result rather than raw model completion.

---

## 21. Explicit non-goals

This protocol does not:

- turn Specialist-local plans into durable chain DAGs;
- duplicate Beads task authority;
- move chain scheduling into the Specialist definition;
- require memory retrieval on every task;
- require GitNexus for roles or repositories where it is inapplicable;
- make an LLM acknowledgement proof of compliance;
- let the model decide whether finalization side effects occurred;
- create a new notification bus, daemon or database;
- prune worktrees automatically;
- make Archon the execution authority for XTRM-managed Specialists.

---

## 22. Open implementation decisions

The following require code-level verification before dispatch:

1. The final canonical names of the seven root-contract fields and their compatibility aliases.
2. Whether semantic readiness uses a dedicated bounded model call or the first Specialist turn.
3. The exact profile inheritance mechanism in Specialist JSON.
4. Which current roles use `typed-required` versus `typed-bounded` planning.
5. Which existing auto-commit path becomes the single finalization owner.
6. The exact atomic boundary between result persistence, Bead note and message publication.
7. The durable event storage used during the bridge before Substrate state lands.
8. Which evidence validators may enforce immediately and which begin in shadow mode.

---

## 23. Addendum 2026-08-22 — identity, grants and probes reconciliation

This addendum reconciles the protocol with the accepted integrated runtime model in `xtrm-dev/xtrm:docs/runtime/` (runtime PRD + ADR-003/004/006). Sections 1–22 above are unchanged; where wording below differs, this addendum is the current reconciliation.

### 23.1 Identity layers

- `participant_id` is stable per `(scope, role)` for the membership of the participant; it does not change between retries of the same step.
- `job_id` is new per activation; an activation may comprise multiple `attempt`s (crash/retry), each recorded in lineage.
- The AgentSession (Pi session) identity is owned by Pi and is never conflated with participant or job identity. Participant ≠ activation ≠ AgentSession.
- Consequence: replay/resume rebinds a fresh AgentSession to the same participant/job lineage; forensic events carry all layers per the telemetry contract §identity.

### 23.2 Capability grants

A requested capability is not a granted capability:

```text
ResolvedCapabilityGrant = f(specialist request,
                            chain/step policy,
                            operator policy,
                            runtime/sandbox capabilities)
```

`required_tools` expresses requirement only. It must not expose unrestricted generic Pi built-ins; the current adapter posture (`noTools:"builtin"` plus explicit allowlist) remains the reference. A step contract cannot widen a grant beyond what the resolver emits.

### 23.3 Probes taxonomy (replaces overloaded skills.scripts)

The legacy `skills.scripts` field is retired as an overload point. Its responsibilities compile into typed ProbeDefinitions for compatibility:

```text
cognition            skills / prompt / procedures
activation policy    model / timeout / retry
prepare              prepare-probes, finalize-side validators, context resolvers
result contract      schema / evidence requirements
finalize             finalize-validators, projections, terminal effects
```

Shell scripts are never a privileged implicit preflight API. Every preflight check is a typed ProbeDefinition executed by the runtime-owned PREPARE phase; legacy scripts compile into that form and gain no authority they did not declare.

### 23.4 ActivationSupervisor boundary

The ActivationSupervisor owns exactly one activation lifecycle: start, settlement, heartbeat/timeout, retry-signal, cancel, disposal. It never decides chain progression — that belongs to the pure reducer/scheduler consuming validated evidence. External/interactive runtimes route through the xtmux RuntimeSupervisor via terminal backends (ADR-006); direct hosted AgentSessions do not.

### 23.5 Effect receipts and uncertain state

Every external effect carries an idempotency key; outcomes are completed / failed / uncertain. An uncertain outcome blocks blind replay until reconciliation records resolving evidence. Receipts are append-only. Normative source: xtrm ADR-002 (`xtrm-dev/xtrm:docs/runtime/adr/002-container-chainrun-durability.md`).