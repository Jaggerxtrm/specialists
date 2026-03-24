---
title: Hooks Reference
scope: hooks
category: reference
version: 1.2.0
updated: 2026-03-23
description: Bundled Specialists hooks and their runtime behavior.
source_of_truth_for:
  - "hooks/specialists-complete.mjs"
  - "hooks/specialists-session-start.mjs"
domain:
  - hooks
---

# Hooks Reference

This package bundles hook scripts used by Specialists-aware environments.

## Hook inventory

| Hook | Event | Purpose |
|---|---|---|
| `specialists-complete.mjs` | `UserPromptSubmit` | inject background completion banners |
| `specialists-session-start.mjs` | `SessionStart` | inject active jobs, available specialists, and workflow reminders |

## `specialists-complete.mjs`

Behavior:

- scans `.specialists/ready/` for completion markers
- reads job metadata from `status.json`
- injects a completion banner for finished jobs
- removes the marker after injection

## `specialists-session-start.mjs`

Behavior:

- lists active background jobs
- lists available project specialists
- injects a concise bead-first workflow reminder:
  - `--bead` for tracked work
  - `--prompt` for ad-hoc work
  - `--context-depth` default
  - `--no-beads` semantics

## Installation notes

The current canonical bootstrap is `specialists init`. It manages project dirs, workflow injection, and MCP registration.

Use `specialists doctor` to verify runtime health and hook expectations in your environment.

## Beads hooks

Beads workflow enforcement hooks are owned outside this package. Specialists focuses on specialist execution and workflow guidance.

## See also

- [workflow.md](workflow.md)
- [background-jobs.md](background-jobs.md)
- [bootstrap.md](bootstrap.md)
