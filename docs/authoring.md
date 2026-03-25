---
title: Specialist Authoring
scope: authoring
category: guide
version: 1.1.0
updated: 2026-03-23
description: How to write, place, and maintain project specialists.
source_of_truth_for:
  - "src/specialist/schema.ts"
  - "config/skills/specialist-author/SKILL.md"
  - "config/specialists/*.specialist.yaml"
domain:
  - authoring
---

# Specialist Authoring

> **Alias:** `sp` is a shorter alias for `specialists` — `sp run`, `sp list`, `sp feed` etc. work identically.

Project specialists live in:

```text
./specialists/*.specialist.yaml
```

## Minimal skeleton

```yaml
specialist:
  metadata:
    name: my-specialist          # kebab-case, required
    version: 1.0.0               # semver, required
    description: "What it does"  # required
    category: analysis           # required (free text)

  execution:
    model: anthropic/claude-sonnet-4-6   # required — ping before using
    permission_required: READ_ONLY

  prompt:
    task_template: |             # required
      $prompt

      Working directory: $cwd
```

**Common pitfalls:** `task_template` is required in `prompt:`. `READ_WRITE` is not a valid permission — use `READ_ONLY`, `LOW`, `MEDIUM`, or `HIGH`.

## Key sections

| Section | Purpose |
|---|---|
| `metadata` | name, version, description, category |
| `execution` | mode, model, timeout, permissions |
| `prompt` | system prompt and optional user template |
| `skills` | extra skill paths |
| `capabilities` | tool capability toggles |
| `beads_integration` | bead defaults when applicable |

## Skills

Repo-local skills (in config/):

```text
config/skills/specialist-author/SKILL.md
config/skills/specialists-usage/SKILL.md
```

Example:

```yaml
skills:
  paths:
    - ./skills/my-skill
```

## Model setup

Use `specialists models` to see available models and `specialists edit` to update them in-place:

```bash
specialists models                               # list all models + current assignments
specialists edit <name> --model <value>          # set primary model
specialists edit <name> --fallback-model <value> # set fallback (must be different provider)
specialists edit <name> --model <v> --dry-run    # preview before writing
```

**Rule:** `model` and `fallback_model` must use different providers. Ping each before assigning:

```bash
pi --model anthropic/claude-sonnet-4-6 --print "ping"   # must return "pong"
```

For a full model rebalancing workflow, see the `specialist-author` skill (`config/skills/specialist-author/SKILL.md`).

## Validation approach

Recommended loop:

1. write/edit the YAML
2. run `specialists list` to confirm discovery
3. run the specialist with a small ad-hoc prompt or a bead

## Scope rules

- project-first only
- user-scope specialist discovery is deprecated
- canonical project directory is `specialists/`

## See also

- [specialists-catalog.md](specialists-catalog.md)
- [workflow.md](workflow.md)
- [skills.md](skills.md)
