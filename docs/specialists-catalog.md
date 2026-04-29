---
title: Specialists Catalog
scope: specialists-catalog
category: overview
version: 1.6.1
updated: 2026-04-29
synced_at: c21f3214
description: Current project specialists and what each one is for.
source_of_truth_for:
  - "config/specialists/*.specialist.json"
  - ".specialists/default/*.specialist.json"
  - ".specialists/user/*.specialist.json"
domain:
  - specialists
---

# Specialists Catalog

Current specialists runtime resolution:
- `.specialists/user/` (repo custom, highest precedence)
- `.specialists/default/` (managed mirror)
- `config/specialists/` (package fallback)

Mirror source is `config/specialists/*.specialist.json` during `specialists init --sync-defaults`.

## Current specialists

| Name | Version | Primary model | Permission | Typical use |
|---|---|---|---|---|
| `debugger` | v2.0 | `openai-codex/gpt-5.3-codex` | HIGH | deep bug investigation, keep-alive, 4-phase debug-fix-verify workflow |
| `executor` | v1.0 | `openai-codex/gpt-5.4-mini` | HIGH | production-quality implementation, strict type safety |
| `explorer` | v1.1 | `zai/glm-5` | READ_ONLY | architecture/codebase mapping |
| `memory-processor` | v1.1 | `dashscope/qwen3.5-plus` | MEDIUM | synthesize memories + commits |
| `node-coordinator` | v1.3 | `openai-codex/gpt-5.4` | LOW | worktree lifecycle coordination |
| `overthinker` | v1.0 | `openai-codex/gpt-5.4` | READ_ONLY | multi-phase deep reasoning |
| `planner` | v1.1 | `openai-codex/gpt-5.4` | HIGH | task decomposition, phased bd issue board, test-planning per layer |
| `researcher` | v1.1 | `dashscope/qwen3.5-plus` | MEDIUM | library docs lookup + GitHub code discovery, keep-alive |
| `reviewer` | v1.0 | `openai-codex/gpt-5.3-codex` | MEDIUM | post-run requirement compliance audit |
| `specialists-creator` | v1.2 | `anthropic/claude-sonnet-4-6` | HIGH | create/fix specialist JSONs |
| `sync-docs` | v2.0 | `dashscope/glm-5` | MEDIUM | documentation drift sync, 3-mode routing |
| `test-runner` | v1.0 | `anthropic/claude-haiku-4-5` | LOW | test execution + summary |
| `xt-merge` | v1.1 | `anthropic/claude-sonnet-4-6` | MEDIUM | merge queued xt PRs |

## Timeout baseline

`stall_timeout_ms` is standardized to `120000` (120s) across canonical specialists.

## Specialist skills wiring

All specialists now have GitNexus skills wired for code intelligence:

| Specialist | Skills |
|---|---|
| `debugger` | `xt-debugging`, `gitnexus-debugging`, `systematic-debugging` |
| `executor` | `gitnexus-impact-analysis`, `clean-code` |
| `explorer` | `gitnexus-exploring` |
| `memory-processor` | `documenting`, `using-xtrm` |
| `node-coordinator` | `using-specialists` |
| `overthinker` | `gitnexus-exploring`, `deepwiki`, `find-docs`, `github-search` |
| `planner` | `planning`, `test-planning`, `gitnexus-exploring` |
| `researcher` | `find-docs`, `deepwiki`, `github-search` |
| `reviewer` | `using-quality-gates`, `clean-code`, `gitnexus-refactoring`, `gitnexus-impact-analysis` |
| `specialists-creator` | `specialists-creator` |
| `sync-docs` | `sync-docs`, `gitnexus-exploring` |
| `xt-merge` | `xt-merge` |

## Version highlights

### debugger v2.0
- **Permission**: HIGH
- **Mode**: keep-alive (long-running debug sessions)
- **Workflow**: 4-phase debug-fix-verify cycle
- **Skills**: `gitnexus-debugging`, `xt-debugging`, `systematic-debugging`

### planner v1.1
- **Permission**: HIGH (elevated for bd issue creation)
- **Mode**: keep-alive (interactive)
- **Workflow**: GitNexus codebase exploration → phased bd issue board → test-planning per layer → epic ID output
- **Skills**: `planning`, `test-planning`, `gitnexus-exploring`

### specialists-creator v1.2
- **Permission**: HIGH
- **Config format**: JSON (`.specialist.json`) — YAML no longer supported
- **Workflow** (create):
  1. Model selection protocol — ping primary + fallback before writing anything
  2. Run `scaffold-specialist.ts` first to materialise all schema fields
  3. Mutate fields with `sp edit <name> <dot.path> <value>`
  4. Use `sp edit <name> --preset <preset>` for common model/thinking baselines
  5. Use `--file` only for multiline `prompt.system` and `prompt.task_template`
  6. Run `sp view <name>` + schema validation to confirm output
- **Workflow** (fix): identify Zod error → `sp edit` focused fix → explain why invalid
- **Pre-scripts**: `pi --list-models` (model injection), `scaffold-specialist.ts` (field materialisation)
- **Skills**: `specialists-creator`

### executor v1.0
- **Permission**: HIGH
- **Mode**: `auto` (scaffold-populated field)
- **Thinking**: low
- **Skills**: `gitnexus-impact-analysis`, `clean-code`
- **Post-script**: `npm run lint` (tail-5 output)

### xt-merge v1.1
- **Model**: `anthropic/claude-sonnet-4-6`
- **Workflow**: FIFO PR drain — pre-flight, CI check, merge with rebase, cascade rebase of remaining branches, push verify

### researcher v1.1
- **Permission**: LOW
- **Mode**: keep-alive (interactive, multi-turn research)
- **Two modes**: targeted (ctx7/deepwiki for specific library docs) and discovery (ghgrep → deepwiki for ecosystem patterns)
- **Tools**: `ctx7`, `deepwiki`, `ghgrep`
- **Skills**: `find-docs`, `deepwiki`, `github-search`

### reviewer v1.0
- **Permission**: MEDIUM
- **Purpose**: post-run compliance audit — resolves bead requirements, grades output 0-100
- **Scoring**: coverage (0-70) + evidence quality (0-20) + traceability integrity (0-10)
- **Skills**: `using-quality-gates`, `clean-code`, `gitnexus-refactoring`, `gitnexus-impact-analysis`

### sync-docs v2.0
- **Permission**: MEDIUM
- **Routing**: 3-mode (targeted, area, full audit)
- **Context**: commit-based (not PR-based)
- **Drift detection**: automatic via `drift_detector.py`

### node-coordinator v1.1
- **Model**: `anthropic/claude-sonnet-4-6`
- **Permission**: READ_ONLY
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
