# Decision: Ownership of the Deterministic Specialist Execution Protocol

**Status:** proposed  
**Target repository path:** `docs/design/execution-protocol-design/specialist-execution-protocol-ownership-decision.md`  
**Decision scope:** Specialists runtime, Specialist definitions, chain templates and step contracts  
**Related design:** `docs/design/execution-protocol-design/specialist-execution-protocol.md`

---

## Context

A managed Specialist repeatedly performs the same operational sequence around its role-specific work:

```text
resolve contract and context
validate readiness
acknowledge mandatory rules
optionally retrieve memory
plan
work
collect evidence
commit when applicable
persist result
append Bead note
notify parent
clean up
```

The system needs these operations to be typed and observable. There are several possible places to encode them:

- prompt prose;
- each Specialist JSON;
- each chain template;
- a generic workflow engine such as Archon;
- one common Specialists runtime protocol.

---

## Decision

The common lifecycle is owned by the **Specialists runtime** and implemented once as `specialists.execution.v1`.

A Specialist definition selects a versioned execution profile and declares only role-specific differences.

A step contract declares the mandate, inputs, outputs, scope, non-goals and validation for one execution.

A chain template declares participant topology, dependencies and gates. It does not encode the internal lifecycle of each participant.

The chain reducer decides whether a validated Specialist result satisfies a chain step. A completed model turn or job process is not sufficient.

---

## Authority table

| Concern | Authority |
|---|---|
| Common activation phase order | Specialists execution protocol |
| Structural contract validation | Specialists runtime schema/validator |
| Mandatory-rule resolution and receipt | Specialists runtime |
| Role permission/capability profile | Specialist definition |
| Memory policy | Specialist profile plus current task decision |
| Activation-local plan | Specialist output, schema-validated by runtime |
| Task mandate and authorized scope | Root/step Bead contract |
| Required role-specific evidence | Specialist profile plus step contract |
| Commit/result/Bead-note/message finalization | Specialists runtime |
| Chain topology and mandatory gates | Chain template and resolved chain |
| Runnable/satisfied chain state | Chain reducer over persisted evidence |
| Delivery and wake | xtmux today; Channels target |
| Durable task and acceptance state | Beads |
| Git integration truth | Git |

---

## Consequences

### Positive

- The model no longer has to remember terminal operational rituals.
- All roles receive the same safety shell without duplicated prose.
- Specialist definitions remain typed but compact.
- Chain templates remain promoted, domain-specific workflows rather than growing into a generic DSL.
- Result, Bead note and parent notification become one observable finalization sequence.
- Contract, evidence and commit failures become explicit states.
- Replay can deduplicate side effects through stable keys.
- The same Specialist can be used by native XTRM chains or an experimental Archon adapter without changing ownership.

### Costs

- Specialists requires a protocol state machine and additional schemas.
- Existing roles need migration to execution profiles.
- Structural and semantic readiness must be distinguished.
- Some existing prompt instructions become obsolete and must be removed after enforcement lands.
- Historical runs will have partial protocol completeness.

---

## Rejected alternatives

### Encode the sequence only in prompt prose

Rejected because prose cannot prove that a phase ran, cannot fail closed reliably, and cannot make finalization idempotent.

### Duplicate the full sequence in every Specialist definition

Rejected because definitions would drift and every lifecycle correction would require coordinated edits across all roles. Definitions select profiles and overrides instead.

### Put all phases in each chain template

Rejected because a template should describe collaboration topology. Encoding contract preflight, memory, planning, evidence, commit and notification inside every node would turn chain formulas into a generic workflow language and duplicate role/runtime policy.

### Let Archon own the protocol

Rejected for XTRM-managed Specialists because Archon would duplicate job lifecycle, result and worktree authority. Archon may consume the public NDJSON/result surfaces in experiments.

### Let the coordinator remember and perform finalization

Rejected because coordinator attention is not a reliable transaction boundary and creates procedural dependence on model memory.

---

## Invariants

1. A structurally NOK contract cannot proceed.
2. A mandatory-rule conflict cannot proceed silently.
3. Read-only roles cannot acquire write or commit capability through a step contract.
4. A local execution plan cannot widen Bead scope.
5. A model-completed job is not successful until output, evidence and Git policy validate.
6. Result persistence precedes Bead note and parent notification.
7. Notification failure does not alter the authoritative job verdict.
8. Finalization side effects are idempotent.
9. Chain satisfaction is derived from validated evidence, not self-report.
10. Worktree cleanup remains separate from activation cleanup.

---

## Migration rule

Existing Specialists initially resolve to a `legacy-managed.v1` profile. Migration occurs role by role:

```text
observe current behavior
→ record protocol events
→ enable structural contract gate
→ enable typed plan/evidence checks
→ centralize finalization
→ remove superseded prompt prose
→ enforce
```

No role is promoted to enforcement without regression fixtures and rollback to its previous profile.
