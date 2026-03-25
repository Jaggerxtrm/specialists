---
title: Skills Catalog
scope: skills
category: overview
version: 1.2.0
updated: 2026-03-23
description: Skills shipped in this repo and what they are for.
source_of_truth_for:
  - "config/skills/**/*.md"
domain:
  - skills
---

# Skills Catalog

Skills are prompt packages that add focused guidance to specialist runs.

## Repo-local skills

### `specialists-usage`

Location: `config/skills/specialists-usage/SKILL.md`

Purpose:

- when to delegate to specialists vs doing the work directly
- CLI usage patterns
- background job workflow
- MCP usage patterns

Note: a dedicated skill/doc synchronization follow-up is tracked separately.

### `specialist-author`

Location: `config/skills/specialist-author/SKILL.md`

Purpose:

- write valid `.specialist.yaml` files
- model setup and rebalance workflow
- schema guidance and common validation fixes
- capability, permission, and beads integration references

Key areas covered:

- minimal skeleton and validation loop
- model inventory and assignment strategy
- schema sections (`metadata`, `execution`, `prompt`, `skills`, `capabilities`, `beads_integration`)
- common error patterns and fixes

## Referencing a skill

Example:

```yaml
skills:
  paths:
    - ./skills/my-skill
```

Or with direct inheritance:

```yaml
prompt:
  skill_inherit: skills/my-skill/SKILL.md
```

## See also

- [authoring.md](authoring.md)
- [specialists-catalog.md](specialists-catalog.md)
