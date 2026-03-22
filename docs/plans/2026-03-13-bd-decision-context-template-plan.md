# Idea Plan: Decision Context Template for Beads-Driven Specialist Work

Date: 2026-03-13
Status: idea (not tracked as a bd issue yet)
Owner: unassigned

## Problem

Specialist runs can inherit task context from beads, but rationale is inconsistently captured.
We often store outcomes, yet miss structured decision context:

- what was chosen (`decision`)
- what else was considered (`alternatives`)
- why this choice was acceptable (`tradeoffs`)

Without this, downstream specialists and future sessions can see *what* happened, but not reliably *why*.

## Goal

Add a lightweight, repeatable convention so issue content can carry decision rationale and flow through `specialists run --bead <id>` pipelines.

## Non-Goals

- No bd schema fork or database migration
- No large redesign of specialists runtime
- No mandatory enforcement in the first iteration

## Proposed Shape

Use a documentation-level template first:

```md
## Decision
## Alternatives Considered
## Tradeoffs
## Rationale
## Follow-ups
```

Store this in issue `description` or `notes`, depending on workflow stage.

## Phased Plan

### Phase 0: Document the convention

- Add canonical template doc under `docs/`
- Add short usage rules and examples:
- When to use full template vs short form
- Minimum quality bar for each section

### Phase 1: Agent-facing adoption

- Update `AGENTS.md` beads workflow guidance to reference the template
- Require template for implementation/refactor/architecture issues
- Keep optional for trivial bugs/chore work

### Phase 2: Prompt-path integration

- Ensure bead context passed to specialists preserves section headings
- Prefer explicit rendering order in prompt context:
- Task
- Notes
- Decision context sections

### Phase 3: Optional guardrail

- Add a non-blocking hook warning when `bd create`/`bd update` for qualifying issues lacks required sections
- Later, optionally make blocking for selected issue types

## Success Criteria

- New implementation issues include decision context sections by default
- Specialists receiving bead context can reference rationale explicitly
- Reduced repeated “why did we pick this?” rediscovery in follow-up runs

## Risks

- Overhead: template may feel heavy for small tasks
- Empty sections: form completion without meaningful content
- Friction: hard gates too early may slow work

## Mitigations

- Start with convention + examples, not blocking
- Scope requirement to high-value issue types first
- Add enforcement only after adoption baseline is reached

## Open Questions

- Which issue types should require full template?
- Should we keep `Rationale` separate from `Tradeoffs`?
- Should memories (`bd remember`) reference these sections directly?

## Suggested Next Step

If this idea is approved, create one bd task to implement **Phase 0 + Phase 1** only, then reassess before enforcement work.
