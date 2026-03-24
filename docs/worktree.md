---
title: Worktree Integration
scope: worktree
category: guide
version: 1.0.0
updated: 2026-03-23
description: xtrm worktree usage alongside Specialists.
source_of_truth_for:
  - "src/cli/help.ts"
  - "specialists/xt-merge.specialist.yaml"
domain:
  - worktrees
  - xtrm
---

# Worktree Integration

Specialists can be used alongside xtrm worktree workflows.

## Common commands

| Command | Purpose |
|---|---|
| `xt pi [name]` | open a Pi session in a sandboxed worktree |
| `xt claude [name]` | open a Claude session in a sandboxed worktree |
| `xt attach [slug]` | re-enter an existing worktree |
| `xt worktree list` | inspect worktree state |
| `xt end` | close session, push, PR, cleanup |

## Recommended pattern

1. create/claim a bead
2. work in a dedicated worktree
3. use specialists with `--bead`
4. monitor with `specialists feed -f`
5. close the bead and end the worktree session

## PR queue help

Use `xt-merge` when you need a specialist to drain the PR queue in FIFO order.

## See also

- [workflow.md](workflow.md)
- [specialists-catalog.md](specialists-catalog.md)
