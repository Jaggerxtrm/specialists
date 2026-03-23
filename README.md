# Specialists

**One MCP Server. Many Specialists. Real AI Agents.**

[![npm version](https://img.shields.io/npm/v/@jaggerxtrm/specialists.svg)](https://www.npmjs.com/package/@jaggerxtrm/specialists)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

**Specialists** is a versatile framework for running specialist agents in a way that is powerful, composable, and still straightforward to control. It can be used directly by a human operator, by coding agents through MCP, inside autonomous multi-agent and coordination systems, or from scripts and CI/CD pipelines that need deterministic execution surfaces and machine-readable outputs.

At its core, Specialists combines a **Model Context Protocol (MCP) server** with a **CLI execution plane**. A specialist is a reusable unit of behavior with its own model choice, tools, system prompt, task prompt, runtime policy, and output contract. That makes the framework suitable both for interactive delegation and for disciplined automation.

Specialists is designed to work especially well with the **xt/xtrm architecture**: xt provides worktree-based execution and session isolation, while Specialists provides the specialist runtime, orchestration surface, and observability layer. Together they support everything from one-off deep-reasoning runs to structured autonomous workflows.

For tracking and standardized communication, Specialists integrates with **beads** by **Steven Yegge**. Beads acts as the workflow layer for issue tracking, ownership, dependency modeling, and durable context handoff. A specialist can run from a normal prompt, from a richer system+task prompt setup, or directly from an **issue/bead ID as the prompt source**, with dependency chains pulled in as contextual input.

The framework also supports specialist-local skills, centralized memory, and context enrichment patterns that make agents more useful over time instead of more chaotic. In practice, that means you can control behavior very precisely — model, permissions, prompts, dependency context, tracking, memory, background execution, result retrieval — without turning the system into a pile of custom glue.

In v3, specialists run as **background CLI processes** with file-backed state, compact observability, and completion notifications instead of polling loops. The result is a universal specialist layer that can sit inside user workflows, agent workflows, autonomous coordination loops, and production automation without changing the mental model each time.

---

## How it works

```
┌──────────────────────────────────────────────┐
│                 Claude Code                  │
│                                              │
│  MCP (control plane)   CLI (execution plane) │
│  ─────────────────────  ──────────────────── │
│  specialist_init        specialists run \    │
│  list_specialists         <name> --background│
│  use_specialist         specialists result \ │
│  specialist_status        <id>               │
└──────────────────────────────────────────────┘
              ↓ file-based job state
     .specialists/jobs/<id>/
       status.json   result.txt   events.jsonl
```

Specialists are `.specialist.yaml` files discovered at **project scope**:

| Scope | Location | Purpose |
|-------|----------|---------|
| **project** | `./specialists/` | Per-project specialists checked into the repo and aligned with that project's workflow |
| **project-local extensions** | `./.claude/specialists/` | Optional project-local specialist definitions that live alongside Claude project config |

When a specialist runs, the server spawns a `pi` subprocess with the right model, tools, and system prompt injected. For background jobs, a **Supervisor** writes job state to disk — status, events, and final output — so Claude gets a one-shot notification on completion instead of polling.

---

## Background Jobs (v3)

The primary workflow for long-running specialists:

```bash
# Start in background — returns immediately
specialists run overthinker --prompt "Refactor strategy?" --background
# → Job started: a1b2c3

# Check progress
specialists status
# → Active Jobs
#   a1b2c3  overthinker  running  1m12s  tool: bash

# Stream events live
specialists feed --job a1b2c3 --follow

# Global feed: all jobs in one timeline
specialists feed -f

# Filtered timeline
specialists feed --specialist bug-hunt --since 5m --limit 50

# JSON output for scripts
specialists feed --json

# Get result when done
specialists result a1b2c3

# Cancel
specialists stop a1b2c3
```

When a background job completes, Claude's next prompt automatically receives a banner:

```
[Specialist 'overthinker' completed (job a1b2c3, 87s). Run: specialists result a1b2c3]
```

Job files live in `.specialists/jobs/<id>/` (gitignored by `specialists init`):

| File | Contents |
|------|---------|
| `status.json` | id, specialist, status, model, backend, pid, elapsed_s, bead_id, error |
| `events.jsonl` | thinking\_start, toolcall\_start, tool\_execution\_end, agent\_end |
| `result.txt` | Final assistant output |

---

## MCP Tools (8)

| Tool | Description |
|------|-------------|
| `specialist_init` | Session bootstrap: init beads if needed, return available specialists |
| `list_specialists` | Discover all available specialists across scopes |
| `use_specialist` | Run a specialist synchronously and return the result |
| `specialist_status` | Circuit breaker health + background job summary |
| `start_specialist` | *(deprecated v3)* Async job via in-memory registry — use CLI instead |
| `poll_specialist` | *(deprecated v3)* Poll in-memory job — use CLI instead |
| `stop_specialist` | *(deprecated v3)* Kill in-memory job — use `specialists stop <id>` |
| `run_parallel` | *(deprecated v3)* Concurrent in-memory jobs — use CLI `--background` |

For production use: `use_specialist` for short synchronous tasks, CLI `--background` for anything that takes more than a few seconds.

See [docs/mcp-servers.md](docs/mcp-servers.md) for registration details.

---

## Built-in Specialists

| Specialist | Model | Purpose |
|-----------|-------|---------|
| `init-session` | Haiku | Analyse git state, recent commits, surface relevant context |
| `codebase-explorer` | Gemini Flash | Architecture analysis, directory structure, patterns |
| `overthinker` | Sonnet | 4-phase deep reasoning: analysis → critique → synthesis → output |
| `parallel-review` | Sonnet | Concurrent code review across multiple focus areas |
| `bug-hunt` | Sonnet | Autonomous bug investigation from symptoms to root cause |
| `feature-design` | Sonnet | Turn feature requests into structured implementation plans |
| `auto-remediation` | Gemini Flash | Apply fixes to identified issues automatically |
| `report-generator` | Haiku | Synthesise data/analysis results into structured markdown |
| `test-runner` | Haiku | Run tests, parse results, surface failures |
| `xt-merge` | Sonnet | FIFO PR merge queue — merges oldest `xt/` PR, rebases remaining branches |

---

## Permission Tiers

| Tier | pi tools | Use case |
|------|---------|----------|
| `READ_ONLY` | read, bash, grep, find, ls | Analysis, exploration |
| `LOW` | read, bash, edit, write, grep, find, ls | Code modifications |
| `MEDIUM` | read, bash, edit, write, grep, find, ls | Code modifications + git |
| `HIGH` | read, bash, edit, write, grep, find, ls | Full autonomy |

Permission is enforced at spawn time via `pi --tools`, not just in the system prompt.

---

## Beads Integration

Specialists with write permissions automatically create a [beads](https://github.com/beads/bd) issue and close it on completion. Control this per-specialist:

```yaml
beads_integration: auto    # default — create for LOW/MEDIUM/HIGH
beads_integration: always  # always create
beads_integration: never   # never create
```

The `bead_id` is written to `status.json` so you can link issues for follow-up.

---

## xtrm Worktree Integration

Specialists are designed to run inside [xtrm](https://github.com/Jaggerxtrm/xtrm-tools) worktree sessions. Each `xt claude` or `xt pi` session gets an isolated git branch with a shared beads database — the right environment for spawning background specialists.

### Session lifecycle

```bash
# 1. Start a Claude session in a sandboxed worktree
xt claude

# 2. Claude spawns specialists as background jobs — no interruption to main session
specialists run bug-hunt --prompt "Investigate the auth regression" --background

# 3. Session closes unexpectedly? Re-attach and resume where you left off
xt attach          # most recent worktree — resumes with --continue
xt attach ab3k     # specific worktree by slug

# 4. Inspect available worktrees with runtime, last activity, and resume hint
xt worktree list

# 5. Close the session cleanly
xt end             # rebase, push, PR, cleanup
```

### Re-attaching after unexpected close

`xt attach` reads `.session-meta.json` written at worktree creation to know which runtime was used (Claude or Pi), then launches it with `--continue` / `-c` to resume the previous conversation. Any background specialists that completed while the session was closed will surface their banners on the next prompt.

When multiple worktrees exist, `xt attach` shows an interactive picker:

```
? Select worktree to attach
❯ xt/ab3k [claude]  —  3/23/2026, 14:22:01  "fix: auth token expiry"
  xt/pq7r [pi]      —  3/23/2026, 11:05:33  "feat: add rate limiting"
```

### xt-merge specialist

After a session closes and a PR is open, use the `xt-merge` specialist to drain the PR queue:

```bash
specialists run xt-merge
```

This merges the oldest `xt/` PR with `--rebase --delete-branch`, then rebases all remaining `xt/` branches onto the new main — maintaining linear history automatically.

### Worktree commands reference

| Command | Description |
|---------|-------------|
| `xt claude [name]` | New Claude session in a sandboxed `xt/<name>` worktree |
| `xt pi [name]` | New Pi session in a sandboxed `xt/<name>` worktree |
| `xt attach [slug]` | Re-enter an existing worktree and resume the session |
| `xt worktree list` | List worktrees with runtime, last activity, last commit, resume hint |
| `xt worktree clean` | Remove worktrees merged into main |
| `xt end` | Close session: rebase, push, PR, cleanup |

---

## Installation

### Recommended

```bash
npm install -g @jaggerxtrm/specialists
specialists install
```

Installs: **pi** (`@mariozechner/pi-coding-agent`), **beads** (`@beads/bd`), **dolt**, registers the `specialists` MCP at user scope, scaffolds `~/.agents/specialists/`, copies built-in specialists, and installs 7 Claude Code hooks for workflow enforcement.

**Hooks installed:** main-guard, beads-edit-gate, beads-commit-gate, beads-stop-gate, specialists-complete, specialists-session-start, beads-close-memory-prompt. See [docs/hooks.md](docs/hooks.md) for full reference.

After running, **restart Claude Code** to load the MCP. Re-run `specialists install` at any time to update or repair.

### One-time (no global install)

```bash
npx --package=@jaggerxtrm/specialists install
```

---

## Writing a Specialist

Create a `.yaml` file in `./specialists/` (project scope) or `~/.agents/specialists/` (user scope):

```yaml
specialist:
  metadata:
    name: my-specialist
    version: 1.0.0
    description: "What this specialist does."
    category: analysis
    tags: [analysis, example]
    updated: "2026-03-11"

  execution:
    mode: tool
    model: anthropic/claude-haiku-4-5
    fallback_model: google-gemini-cli/gemini-3-flash-preview
    timeout_ms: 120000
    response_format: markdown
    permission_required: READ_ONLY

  prompt:
    system: |
      You are a specialist that does X.
      Produce a structured markdown report.

    task_template: |
      $prompt

    # Inject a single skill file into the system prompt
    skill_inherit: ~/.agents/skills/my-domain-knowledge.md

  communication:
    output_to: .specialists/my-specialist-result.md   # optional file sink

  skills:
    # Run scripts before/after the specialist
    scripts:
      - path: ./scripts/health-check.sh
        phase: pre            # runs before the task prompt
        inject_output: true   # output available as $pre_script_output
      - path: ./scripts/cleanup.sh
        phase: post

    # Inject multiple skill/context files into the system prompt (v3)
    paths:
      - ~/skills/domain-context.md
      - ./specialists/shared/conventions.md
```

**Model IDs** use the full provider/model format: `anthropic/claude-sonnet-4-6`, `google-gemini-cli/gemini-3-flash-preview`, `anthropic/claude-haiku-4-5`.

---

## CLI

| Command | Description |
|---------|-------------|
| `specialists install` | Full-stack installer: pi, beads, dolt, MCP, hooks |
| `specialists init` | Scaffold `./specialists/`, `.specialists/`, update `.gitignore`, inject `AGENTS.md` block |
| `specialists list` | List discovered specialists with model, description, scope |
| `specialists models` | List models available on pi with capability flags |
| `specialists edit <name> --<field> <value>` | Edit a specialist field in-place |
| `specialists run <name>` | Run a specialist (foreground by default) |
| `specialists run <name> --background` | Start as background job, print job ID |
| `specialists result <id>` | Print result of a completed background job |
| `specialists feed [options]` | Unified timeline: `--job`, `--specialist`, `--since`, `--limit`, `--follow`, `--json` |
| `specialists stop <id>` | Send SIGTERM to a running background job |
| `specialists status` | System health + active background jobs |
| `specialists version` | Print installed version |
| `specialists help` | Show command reference |

### specialists run

```bash
# Foreground — streams output to stdout
specialists run init-session --prompt "What changed recently?"

# Background — returns job ID immediately
specialists run overthinker --prompt "Refactor?" --background

# Background with model override, no beads
specialists run bug-hunt --prompt "TypeError in auth" --background \
  --model anthropic/claude-sonnet-4-6 --no-beads

# Pipe from stdin
echo "Analyse the architecture" | specialists run codebase-explorer
```

### specialists status

```
specialists status

── Specialists ───────────────────────────
  ✓ 9 found  (9 project)

── pi  (coding agent runtime) ────────────
  ✓ v0.57.1  —  4 providers active  (anthropic, google-gemini-cli, qwen, zai)

── beads  (issue tracker) ────────────────
  ✓ bd installed  v0.59.0
  ✓ .beads/ present in project

── MCP ───────────────────────────────────
  ✓ specialists binary installed  /usr/local/bin/specialists

── Active Jobs ───────────────────────────
  a1b2c3  overthinker           running   1m12s  tool: bash
  g7h8i9  init-session          done      0m08s
```

---

## Development

```bash
git clone https://github.com/Jaggerxtrm/specialists.git
cd specialists
bun install
bun run build    # bun build src/index.ts --target=node --outfile=dist/index.js
bun test         # bun --bun vitest run
```

See [CLAUDE.md](CLAUDE.md) for the full architecture guide.

---

## License

MIT
