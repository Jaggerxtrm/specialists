---
name: using-specialists
description: >
  Use Specialists as a governed XTRM execution backend for tracked implementation,
  debugging, review, testing, security, documentation, research, and other role-shaped
  work. Use when work already has a durable XTRM contract and benefits from a distinct
  specialist role, supervised job lifecycle, review/fix loop, or retained evidence.
  Read live `specialists list --full` and `sp help` before relying on remembered roles
  or flags. This skill describes released Specialists behavior, not planned ChainRun
  architecture.
version: 4.0
---

# Using Specialists

Specialists is one execution backend inside XTRM. XTRM owns the work contract,
continuity, and system-level coordination. Specialists owns specialist selection,
job execution, retained results, role boundaries, and specialist-specific review loops.

Do not use this skill as a substitute for `/using-xtrm`, `/planning`, or
`/multiplexing`.

## Start from live truth

Before a substantial dispatch:

```bash
specialists list --full
sp help
```

Use subcommand help before exact invocation when a flag matters. The installed CLI and
registry are authoritative. Static examples in this skill are shapes, not a promise that
an old flag still exists.

The current released product supports supervised specialist jobs and related node/script
surfaces. The programme is moving toward the XTRM
`ChainSource -> ChainDefinition -> ResolvedChain -> ChainRun` architecture, but that
generic native chain runtime is not yet a released contract. Do not pretend it is.

## Contract precondition

A specialist receives a durable XTRM work item. The bead must already be a usable
contract before dispatch.

- Read it with `bd show <id>`.
- If it is a draft, incomplete, stale, or contradicted by current code, repair it through
  the XTRM planning/contract workflow before dispatch.
- Do not use an ad-hoc prompt to smuggle missing requirements around the bead.
- The same contract-quality rule applies to every XTRM worker, not only Specialists.

The detailed contract-writing doctrine belongs to `/planning`; Specialists consumes it.

## Choose a specialist when the role adds value

Use a specialist when the task benefits from a bounded role, independent context,
explicit permissions, retained execution evidence, or a review/test/security gate.
Typical roles include explorer, debugger, executor, reviewer, seconder, test roles,
security-auditor, researcher, and documentation/release roles. Resolve the actual list
from the live registry.

Do small, obvious work in the current XTRM agent when delegation would create more
coordination than value. XTRM is multi-agent by design; that does not mean every edit
requires a child agent.

## Basic job lifecycle

The stable conceptual lifecycle is:

```text
contract ready
  -> select live specialist
  -> dispatch against the bead
  -> observe job state/evidence
  -> consume the persisted result
  -> verify findings against current tree/state
  -> run required review/test/security follow-up
  -> publish or hand back through the owning XTRM workflow
```

For exact commands and monitoring envelopes, read these references only when needed:

- `references/chain-recipes.md` — role selection and production-diff review shapes.
- `references/monitoring.md` — waiting, feed/result semantics, keep-alive and failure handling.
- `references/merge-and-integration.md` — current integration/publish behavior.
- `references/registry-and-locations.md` — live registry and source locations.
- `references/dispatch-preconditions.md` — git/worktree prerequisites for dependent work.

## Evidence rules

A specialist result is a claim, not live truth.

- Prefer persisted job/result evidence over terminal scraping.
- Verify important claims against the current tree, tests, runtime state, or external
  system before acting on them.
- A terminal state tells you the job stopped; it does not tell you the result is correct.
- Reviewer/seconder findings require a fix loop when valid. Do not reinterpret a failing
  gate as advisory because the implementation looks plausible.
- Classify test failures as in-scope regression, pre-existing failure, or infrastructure
  failure before changing unrelated code.

## Production changes

For a production diff, preserve the project-required review and validation gates. The
current role registry and XTRM chain doctrine decide the exact set; do not reconstruct a
frozen pipeline from memory.

At minimum, make sure the work has:

1. implementation/debug evidence;
2. appropriate tests or explicit test evidence;
3. review by an independent role when required;
4. security review when the changed surface warrants it;
5. no unresolved findings hidden by the final summary.

## Dependent waves

Before dispatching work that depends on earlier work, re-derive the base:

```text
working tree clean enough for the next lane
prior required commits/results present
correct branch/worktree selected
no stale job or ownership assumption
```

Stale-base dispatch is a coordination defect. Fix the state before adding another worker.

## Monitoring and continuation

Do not busy-poll. Use the runtime's supported wait/feed/result mechanisms and XTRM
continuation facilities. If the parent session is near its context ceiling, persist the
state and hand off rather than keeping a half-understood specialist swarm alive inside a
failing context window.

General inter-agent messaging and wake/reply semantics belong to `/multiplexing`, not
this skill.

## Advanced Specialists surfaces

`sp script` / `sp serve` and `sp node` are specialized execution modes. They are not the
default tracked-work path and should not expand the core skill body. If they are enabled
in the current XTRM skill profile, load their dedicated optional skills or current CLI
help.

Use script-class execution for bounded request/response, read-only transforms. Use node
coordination when the NodeSupervisor runtime is intentionally selected. Do not infer
that either surface is appropriate merely because it exists.

## What this skill deliberately does not own

- Generic bead/contract authoring -> `/planning` and `/using-xtrm`.
- Session cold-start, context-pressure handoff, resume -> `/starting-and-resuming-work`.
- Native peer/subagent communication -> `/multiplexing`.
- Generic code exploration strategy -> `/gitnexus`.
- Future ChainRun semantics that are not released yet -> current XTRM runtime canon.

The boundary is intentional: one system doctrine, one contract doctrine, and one
Specialists-specific execution doctrine.