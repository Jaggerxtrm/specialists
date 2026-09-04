---
name: specialists-creator
description: >
  Create, inspect, or change a Specialist definition against the current Specialists
  schema and installed runtime. Use when adding a new specialist role, changing role
  permissions/model/runtime configuration, or diagnosing definition drift. Prefer live
  schema/CLI discovery and bundled validators over copied model lists or static field
  manuals.
disable-model-invocation: true
---

# Specialists Creator

A Specialist definition is executable runtime configuration. Keep the skill small and
let the schema, CLI, and validators describe mutable details.

## Start from live truth

Before authoring:

```bash
specialists list --full
sp help
pi --list-models
```

Inspect the current schema/source when a field or behavior matters:

- `src/specialist/schema.ts` — accepted definition shape.
- `src/specialist/runner.ts` and session/runtime code — execution semantics.
- `sp config show <name> --resolved` — effective definition after overlays.

Do not copy a model name, permission field, extension name, or CLI flag from an old
example without confirming it exists now.

## Authoring flow

1. Define the role boundary: choose when, do-not-choose-when, expected output, and
   permission/risk level.
2. Reuse an existing role if the new role would only differ by prompt wording.
3. Scaffold the definition with the bundled helper when creating a new file.
4. Make narrow field changes through the current `sp edit` surface where practical.
5. Validate against the actual schema.
6. Inspect the resolved runtime view.
7. Smoke the role on a representative bounded task before relying on it in a chain.

Bundled deterministic helpers:

```bash
node config/skills/specialists-creator/scripts/scaffold-specialist.ts <file>
bun config/skills/specialists-creator/scripts/validate-specialist.ts <file>
bun config/skills/specialists-creator/scripts/audit-spec-uniformity.mjs
```

Use current `--help` for exact `sp edit` syntax.

## Model selection

Select only models reported by the current Pi/runtime inventory. Match model capability
and cost to the role; keep fallback/provider diversity when the runtime supports it.
Verify a candidate model can actually answer before baking it into a definition.

Do not preserve static “best model” tables in this skill. They age faster than the
Specialists release itself.

## Permission and capability rule

Grant the least capability that can complete the role. Read-only analysis should not gain
write tools merely because another role has them. If a specialist requires an extension,
script, external binary, or worktree, declare/verify that dependency through the current
schema rather than relying on ambient operator state.

## Prompt and skill payload

Keep the Specialist system/task prompt focused on role-specific judgment. Shared XTRM
work-contract, coordination, and safety doctrine belongs to XTRM/runtime-owned surfaces,
not duplicated inside every specialist prompt.

For attached skills/references, use progressive disclosure where the runtime supports it.
Avoid eager multi-kilobyte bodies that every run pays for when only a small subset of jobs
needs them.

## Long-running roles

If the role is interactive/keep-alive, define:

- what `done` means;
- what evidence is persisted per turn/final result;
- bounded stall/continuation behavior;
- a handoff shape that survives context pressure.

Do not rely on the model remembering to remain alive. Lifecycle belongs to the runtime.

## Validation standard

A definition is ready when:

- schema validation passes;
- resolved config shows intended tools/model/skills/permissions;
- referenced files/commands exist;
- a representative smoke produces the expected output contract;
- no copied rule or model assumption contradicts the current runtime.

If the current schema or CLI contradicts this skill, the live runtime wins and this skill
needs updating.