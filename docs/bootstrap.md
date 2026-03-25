---
title: Specialists Bootstrap
scope: bootstrap
category: guide
version: 1.0.0
updated: 2026-03-23
description: Project bootstrap and installation flow for Specialists.
source_of_truth_for:
  - "src/cli/init.ts"
  - ".mcp.json"
  - "AGENTS.md"
  - "CLAUDE.md"
domain:
  - bootstrap
  - mcp
---

# Specialists Bootstrap

`specialists init` is the **sole** project bootstrap command.

Specialists is built on the **[pi coding agent](https://github.com/Jaggerxtrm/pi-coding-agent)** and is designed to run alongside **[xtrm-tools](https://github.com/Jaggerxtrm/xtrm-tools)**. pi provides the multi-provider execution layer, lifecycle events, and RPC protocol; xtrm-tools provides the surrounding worktree/session workflow and hook environment. Specialists bootstraps the project-local specialist runtime, workflow instructions, and MCP registration on top of that stack.

## Install

```bash
npm install -g @jaggerxtrm/specialists
```

## Bootstrap a project

From the project root:

```bash
specialists init
```

What it does:

1. creates `specialists/`
2. creates `.specialists/` with runtime subdirectories
3. adds `.specialists/` to `.gitignore`
4. injects the canonical workflow block into `AGENTS.md` and `CLAUDE.md`
5. registers the Specialists MCP server at project scope with `claude mcp add --scope project`

## Force-refresh workflow instructions

If `AGENTS.md` or `CLAUDE.md` already contain a managed block and you want to rewrite it from the canonical source:

```bash
specialists init --force-workflow
```

Managed markers:

```md
<!-- specialists:start -->
## Specialists Workflow
...
<!-- specialists:end -->
```

## Directory structure

Specialists live in `.specialists/` in the project root:

```
.specialists/
├── default/     # canonical specialists (from init)
│   └── specialists/
├── user/        # custom specialists
│   └── specialists/
├── jobs/        # runtime (gitignored)
└── ready/       # runtime (gitignored)
```

Add custom specialists to `.specialists/user/specialists/`.

## Verify bootstrap

```bash
specialists status
specialists doctor
specialists list
```

## Deprecated commands

These commands are migration shims only:

- `specialists setup`
- `specialists install`

They should redirect users to `specialists init`.

## See also

- [workflow.md](workflow.md)
- [mcp-servers.md](mcp-servers.md)
- [hooks.md](hooks.md)
