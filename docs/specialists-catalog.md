---
title: Specialists Catalog
scope: specialists-catalog
category: overview
version: 1.2.0
updated: 2026-03-30
synced_at: 116f47d8
description: Current project specialists and what each one is for.
source_of_truth_for:
  - "config/specialists/*.specialist.yaml"
  - ".specialists/default/*.specialist.yaml"
  - ".specialists/user/*.specialist.yaml"
domain:
  - specialists
---

# Specialists Catalog

Current specialists are loaded from:
- `.specialists/user/` (project custom)
- `.specialists/default/` (canonical defaults)

Canonical definitions are sourced from `config/specialists/*.specialist.yaml` during init/update flows.

## Current specialists

| Name | Primary model | Typical use |
|---|---|---|
| `debugger` | `anthropic/claude-sonnet-4-6` | deep bug investigation |
| `executor` | `openai-codex/gpt-5.3-codex` | implementation and fixes |
| `explorer` | `anthropic/claude-haiku-4-5` | architecture/codebase mapping |
| `memory-processor` | `dashscope/glm-5` | synthesize memories + commits |
| `overthinker` | `openai-codex/gpt-5.4` | multi-phase deep reasoning |
| `parallel-review` | `anthropic/claude-sonnet-4-6` | concurrent review passes |
| `planner` | `anthropic/claude-sonnet-4-6` | task decomposition and planning |
| `specialists-creator` | `anthropic/claude-sonnet-4-6` | create/fix specialist YAMLs |
| `sync-docs` | `anthropic/claude-sonnet-4-6` | documentation drift sync |
| `test-runner` | `anthropic/claude-haiku-4-5` | test execution + summary |
| `xt-merge` | `anthropic/claude-sonnet-4-6` | merge queued xt PRs |

## Timeout baseline

`stall_timeout_ms` is standardized to `120000` (120s) across canonical specialists.

## Discover current runtime catalog

```bash
specialists list
specialists list --json
```

## See also

- [authoring.md](authoring.md)
- [workflow.md](workflow.md)
