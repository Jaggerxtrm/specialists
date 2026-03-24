---
title: Specialists Catalog
scope: specialists-catalog
category: overview
version: 1.0.0
updated: 2026-03-23
description: Current project specialists and what each one is for.
source_of_truth_for:
  - "specialists/*.specialist.yaml"
domain:
  - specialists
---

# Specialists Catalog

Current project specialists are defined in `specialists/*.specialist.yaml`.

## Current specialists

| Name | Typical use |
|---|---|
| `auto-remediation` | self-healing workflow for diagnosis → fix → verify |
| `bug-hunt` | deep bug investigation with call-chain tracing |
| `codebase-explorer` | codebase mapping and architecture questions |
| `feature-design` | design and impact analysis for new features |
| `init-session` | session context gathering |
| `overthinker` | multi-phase deep reasoning |
| `parallel-review` | concurrent review across backends |
| `planner` | structured planning for work items |
| `report-generator` | markdown reports from outputs/data |
| `specialist-author` | authoring valid `.specialist.yaml` files |
| `sync-docs` | docs audit and synchronization |
| `test-runner` | run tests and summarize failures |
| `xt-merge` | merge queued xt worktree PRs |

Discover the current set directly:

```bash
specialists list
specialists list --json
```

## Project-only scope

This repo now teaches a project-only model for specialist discovery. Put definitions in `specialists/`.

## See also

- [authoring.md](authoring.md)
- [workflow.md](workflow.md)
