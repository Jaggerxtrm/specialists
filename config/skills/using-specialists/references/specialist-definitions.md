# Specialist definitions

Use when adding, inspecting, or changing a Specialist definition against the current
Specialists schema and installed runtime. This advanced authoring material belongs under
`/using-specialists`; it is not a separate default skill.

Start from live truth:

```bash
specialists list --full
sp help
pi --list-models
```

When a field or behavior matters, inspect the current schema/runtime and the resolved
configuration:

- `src/specialist/schema.ts` — accepted definition shape;
- `src/specialist/runner.ts` and session/runtime code — execution semantics;
- `sp config show <name> --resolved` — effective definition after overlays.

Authoring flow:

1. define the role boundary, including when and when not to choose it;
2. reuse an existing role when only prompt wording differs;
3. scaffold/repair the definition with the bundled deterministic helper when useful;
4. make narrow changes through current `sp edit` surfaces where practical;
5. validate against the actual schema;
6. inspect the resolved runtime view;
7. smoke the role on a representative bounded task.

Bundled helpers live under `scripts/specialist-definitions/`:

```bash
bun scripts/specialist-definitions/scaffold-specialist.ts <file>
bun scripts/specialist-definitions/validate-specialist.ts <file>
node scripts/specialist-definitions/audit-spec-uniformity.mjs
```

Select only models reported by the current Pi/runtime inventory. Grant the least capability
that can complete the role. Shared XTRM work-contract, coordination and safety doctrine
belongs to XTRM-owned surfaces rather than duplicated in every Specialist prompt.

A definition is ready only when schema validation passes, resolved config shows the
intended tools/model/skills/permissions, referenced dependencies exist, and a representative
smoke produces the expected output contract.
