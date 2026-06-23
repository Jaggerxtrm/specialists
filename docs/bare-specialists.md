---
title: Bare Specialists
scope: authoring
category: guide
version: 1.0.0
updated: 2026-05-23
synced_at: bf6baf7a
description: How to author bare-mode specialists for non-coding LLM transforms.
source_of_truth_for:
  - "config/specialists/bare.specialist.json"
  - "src/specialist/runner.ts"
  - "src/specialist/schema.ts"
  - "config/skills/specialists-creator/SKILL.md"
domain:
  - authoring
---

# Bare Specialists

## What bare mode is

Bare mode runs specialist prompt with runtime injections stripped away, so output starts from only `prompt.system` plus `prompt.task_template` and does not pick up package-class specialist framing.

## When to use it

Use bare mode for non-coding LLM transforms:
- research
- summarization
- extraction
- document analysis
- translation

Do not use it for coding agents, implementation work, or specialist roles that need runtime rules, tools, or workflow framing.

## What gets disabled

Bare mode disables these package-runner injection sites:

| Injection site | Disabled in bare mode |
|---|---|
| Specialist Run Context | yes |
| Output Style | yes |
| GitNexus mandate | yes |
| `STATIC_WORKFLOW_RULES_BLOCK` | yes |
| memory injection | yes |
| GitNexus pre-query snapshot | yes |
| reviewer patch retrieval | yes |
| output contract | yes |
| task-side mandatory rules | yes |
| reviewer diff context | yes |

## Orthogonality with `system_prompt_mode`

| `execution.bare` | `prompt.system_prompt_mode` | Result |
|---|---|---|
| `false` | `append` | default package-class runtime; base prompt plus specialist runtime injections |
| `false` | `replace` | package-class runtime with coding-agent base prompt removed; teach all behavior explicitly |
| `true` | `append` | bare runtime; only `prompt.system` plus `prompt.task_template` matter |
| `true` | `replace` | bare runtime; same stripped surface, with base prompt removed too |

## How to create one

Copy starter from installed npm package, not repo clone:

```bash
cp "$(node -p \"require.resolve('@jaggerxtrm/specialists/package.json').replace(/package\\.json$/, '')\")config/specialists/bare.specialist.json" ".specialists/user/<your-name>.specialist.json"
```

Then edit fields:
- `metadata.name` — kebab-case specialist id
- `metadata.description` — routing summary for `specialists list`
- `prompt.system` — task-specific instruction set; include every behavior bare mode will not inject

## Verification

- `specialists list` shows your specialist
- `sp config show <name> --resolved` shows resolved tools and runtime surface
- `bun config/skills/specialists-creator/scripts/validate-specialist.ts <path>` validates schema

## Caveats

- Bare mode bypasses `mandatory_rules` entirely; put needed rules directly in `prompt.system` text instead.
- `script-class` specialists are an alternate path for the simplest cases; see [Script-Class vs Package-Class Runtime](authoring.md#script-class-vs-package-class-runtime).
