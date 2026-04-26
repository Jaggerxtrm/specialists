# Specialists

**One MCP server. Many specialists. Bead-first orchestration.**

[![npm version](https://img.shields.io/npm/v/@jaggerxtrm/specialists.svg)](https://www.npmjs.com/package/@jaggerxtrm/specialists)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

**Specialists is a universal framework for defining and running specialist agents.** You can invoke the same specialist from the terminal, through MCP inside coding agents, inside autonomous multi-agent runtimes, or from scripts and CI/CD pipelines. Each run can explicitly define the model, tool access, system prompt, task input, permission level, timeout, output format, tracking behavior, memory sources, and dependency context.

Specialists is built on top of the **[pi coding agent](https://github.com/Jaggerxtrm/pi-coding-agent)** as its base execution technology. That gives Specialists access to a broad provider surface across many OAuth and API-backed models, a richer lifecycle event stream for tracking session progress and tool execution, and a usable RPC protocol for orchestrating specialist runs as a stable subprocess boundary.

Specialists is intended to run inside the **xt/xtrm architecture** provided by **[xtrm-tools](https://github.com/Jaggerxtrm/xtrm-tools)**. xtrm-tools provides the worktree isolation, execution boundaries, session model, and surrounding workflow environment that Specialists expects. Specialists handles specialist execution; xtrm-tools owns the broader operator workflow and beads enforcement hooks. For tracking and coordination Specialists uses **beads** by **Steven Yegge** as the issue, dependency, and communication layer. I built a similar issue system for Mercury AACS and Terminal back in November, but Beads is already widely used and actively maintained, so xt/Specialists is built around Beads instead of carrying a separate workflow stack. When a specialist run originates from a bead, its output is written back to that same bead, so the task spec, dependency context, coordination state, and result stay inside one tight, controlled loop.

A specialist is a reusable execution spec: model, allowed tools, skills, system prompt, task prompt, timeout, permission level, output format, and background-job behavior. It can run from a plain prompt, from a system+task prompt pair, or directly from an **issue/bead ID as the task source**. Dependency chains can be injected as context, centralized memory can be reused across runs, and jobs can execute in the foreground or as background processes with status, events, and results exposed through the CLI and MCP surfaces.

---

## Quick start

```bash
npm install -g @jaggerxtrm/specialists
specialists init
specialists list
```

`sp` is a shorter alias for `specialists` — both commands are identical:

```bash
sp list
sp run bug-hunt --bead <id>
```

Tracked work:

```bash
bd create "Investigate auth bug" -t bug -p 1 --json
specialists run bug-hunt --bead <id>
specialists feed -f
bd close <id> --reason "Done"
```

Merge worktree branches:

```bash
specialists merge <bead-id>           # single chain or epic (topological)
specialists merge <bead-id> --rebuild # rebuild after merge
```

`specialists run` prints `[job started: <id>]` early and also writes the id to `.specialists/jobs/latest`.

Runtime state lives in `observability.db`; `.specialists/jobs/latest` is legacy convenience pointer only.

Ad-hoc work:

```bash
specialists run codebase-explorer --prompt "Map the CLI architecture"
```

## What `specialists init` does

- creates `specialists/`
- creates `.specialists/` runtime dirs (`jobs/`, `ready/`)
- adds `.specialists/` to `.gitignore`
- injects the canonical Specialists Workflow block into `AGENTS.md` and `CLAUDE.md`
- registers the Specialists MCP server at project scope

Verify bootstrap state:

```bash
specialists status
specialists doctor
```

## Documentation map

`docs/` is the source of truth for detailed documentation. Start with the page that matches your task:

| Need | Doc |
|---|---|
| Install and bootstrap a project | [docs/bootstrap.md](docs/bootstrap.md) |
| Run a script-class specialist over HTTP (`sp serve`) — overview & contract | [docs/specialists-service.md](docs/specialists-service.md) |
| Install `sp serve` in another project (sidecar Docker / Podman) | [docs/specialists-service-install.md](docs/specialists-service-install.md) |
| Build & publish the specialists-service image | [docs/release-image.md](docs/release-image.md) |
| Bead-first workflow and semantics | [docs/workflow.md](docs/workflow.md) |
| CLI commands and flags | [docs/cli-reference.md](docs/cli-reference.md) |
| Background jobs, feed, result, stop | [docs/background-jobs.md](docs/background-jobs.md) |
| Write or edit a `.specialist.yaml` | [docs/authoring.md](docs/authoring.md) |
| Current built-in specialists | [docs/specialists-catalog.md](docs/specialists-catalog.md) |
| MCP registration details | [docs/mcp-servers.md](docs/mcp-servers.md) |
| Hook behavior | [docs/hooks.md](docs/hooks.md) |
| Skills shipped in this repo | [docs/skills.md](docs/skills.md) |
| xtrm / worktree integration | [docs/worktree.md](docs/worktree.md) |
| RPC mode notes | [docs/pi-rpc.md](docs/pi-rpc.md) |
| Pi subprocess isolation and extensions | [docs/pi-session.md](docs/pi-session.md) |
| NodeSupervisor architecture, node lifecycle, and `sp node` CLI | [docs/nodes.md](docs/nodes.md) |

## Ownership model

Specialists uses layered ownership with deterministic loader precedence: user layer overrides default layer, and default layer falls back to package source (`.specialists/user/*` > `.specialists/default/*` > `config/*`). Operationally: `config/*` is upstream source shipped by package, `.specialists/default/*` is managed mirror refreshed by `specialists init --sync-defaults` (scope: specialists + mandatory-rules + nodes), `.specialists/user/*` is repo customization layer, and `.specialists/{jobs,ready,db}` is runtime/generated state. Use `sp edit --fork-from <base>` to promote non-user specialist into user layer before editing.

## Project structure

```text
config/
├── specialists/       canonical specialist definitions (.specialist.json)
├── mandatory-rules/   canonical rule sets injected into specialist prompts (+ README)
├── nodes/             canonical node configs
├── hooks/             bundled hook scripts
├── skills/            repo-local skills used by specialists
└── extensions/        pi extensions (future)
.specialists/
├── default/           managed mirror of canonical (from sp init --sync-defaults)
│   ├── specialists/
│   ├── mandatory-rules/
│   ├── nodes/
│   ├── hooks/
│   └── skills/
├── user/              repo-owned customizations (overrides default + canonical)
│   ├── specialists/
│   ├── hooks/
│   └── skills/
├── mandatory-rules/   repo-specific rule overlay (wins on set-id conflict)
├── jobs/              runtime — gitignored
└── ready/             runtime — gitignored
src/                CLI, server, loader, runner, tools
```

## Core workflow rules

- **Use `--bead` for tracked work.** The bead is the prompt source.
- **Use `--prompt` for ad-hoc work only.**
- `--context-depth` controls how many completed blocker levels are injected.
- `--no-beads` does **not** disable bead reading.
- specialists are **project-only**. User-scope specialist discovery is deprecated.

## Deprecated commands

These commands are still recognized for migration guidance but are no longer onboarding paths:

- `specialists setup`
- `specialists install`

Use `specialists init` instead.

## Development

```bash
bun run build
bun test           # bun vitest run (default)
bun run test:node  # node vitest run (subprocess-safe alternative)
specialists help
specialists quickstart
```

`test:node` uses plain `node vitest run` as an alternative to `bun --bun vitest`. Useful for executor/codex subprocess chains that may trigger stall detection during vitest's tinypool worker initialization silence.

## License

MIT
