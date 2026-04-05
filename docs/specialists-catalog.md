---
title: Specialists Catalog
scope: specialists-catalog
category: overview
version: 1.3.0
updated: 2026-04-05
synced_at: a7dee4b5
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

| Name | Version | Primary model | Permission | Typical use |
|---|---|---|---|---|
| `debugger` | v2.0 | `anthropic/claude-sonnet-4-6` | HIGH | deep bug investigation, keep-alive, 4-phase debug-fix-verify workflow |
| `executor` | v1.0 | `openai-codex/gpt-5.3-codex` | MEDIUM | implementation and fixes |
| `explorer` | v1.0 | `anthropic/claude-haiku-4-5` | LOW | architecture/codebase mapping |
| `memory-processor` | v1.0 | `dashscope/glm-5` | LOW | synthesize memories + commits |
| `node-coordinator` | v1.1 | `anthropic/claude-sonnet-4-6` | MEDIUM | worktree lifecycle coordination |
| `overthinker` | v1.0 | `openai-codex/gpt-5.4` | MEDIUM | multi-phase deep reasoning |
| `parallel-review` | v1.0 | `anthropic/claude-sonnet-4-6` | MEDIUM | concurrent review passes |
| `planner` | v1.0 | `anthropic/claude-sonnet-4-6` | MEDIUM | task decomposition and planning |
| `specialists-creator` | v1.0 | `anthropic/claude-sonnet-4-6` | LOW | create/fix specialist YAMLs |
| `sync-docs` | v2.0 | `anthropic/claude-sonnet-4-6` | MEDIUM | documentation drift sync, 3-mode routing |
| `test-runner` | v1.0 | `anthropic/claude-haiku-4-5` | LOW | test execution + summary |
| `xt-merge` | v1.0 | `anthropic/claude-sonnet-4-6` | MEDIUM | merge queued xt PRs |

## Timeout baseline

`stall_timeout_ms` is standardized to `120000` (120s) across canonical specialists.

## Specialist skills wiring

All specialists now have GitNexus skills wired for code intelligence:

| Specialist | GitNexus skills |
|---|---|
| `planner` | `gitnexus-exploring` |
| `parallel-review` | `gitnexus-refactoring`, `gitnexus-impact-analysis` |
| `overthinker` | `gitnexus-exploring` |
| `executor` | `gitnexus-impact-analysis` |
| `debugger` | `gitnexus-debugging`, `systematic-debugging` |

## Version highlights

### debugger v2.0
- **Permission**: HIGH
- **Mode**: keep-alive (long-running debug sessions)
- **Workflow**: 4-phase debug-fix-verify cycle
- **Skills**: `gitnexus-debugging`, `systematic-debugging`

### sync-docs v2.0
- **Permission**: MEDIUM
- **Routing**: 3-mode (targeted, area, full audit)
- **Context**: commit-based (not PR-based)
- **Drift detection**: automatic via `drift_detector.py`

### node-coordinator v1.1
- **Model**: `anthropic/claude-sonnet-4-6`
- **Scope**: worktree lifecycle management
- **Skills**: `using-specialists`
- **Pre-script**: `sp list` for catalog discovery

## Discover current runtime catalog

```bash
specialists list
specialists list --json
```

## See also

- [authoring.md](authoring.md)
- [workflow.md](workflow.md)
