# OmniSpecialist

**One MCP Server. Many Specialists. Real AI Agents.**

[![npm version](https://img.shields.io/npm/v/@jaggerxtrm/specialists.svg)](https://www.npmjs.com/package/@jaggerxtrm/specialists)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

OmniSpecialist is a **Model Context Protocol (MCP) server** that lets Claude (and other AI agents) discover and run specialist agents — each a full autonomous coding agent powered by [pi](https://github.com/mariozechner/pi), scoped to a specific task.

**Designed for agents, not just users.** Claude can autonomously route heavy tasks (code review, bug hunting, deep reasoning, session init) to the right specialist without user intervention. Specialists run in the background while Claude continues working.

---

## How it works

Specialists are `.specialist.yaml` files that define an autonomous agent: its model, system prompt, task template, and permission tier. OmniSpecialist discovers them across three scopes:

| Scope | Location | Purpose |
|-------|----------|---------|
| **project** | `./specialists/` | Per-project specialists |
| **user** | `~/.agents/specialists/` | Personal specialists |
| **system** | bundled with OmniSpecialist | Built-in defaults |

When a specialist runs, OmniSpecialist spawns a `pi` subprocess with the right model, tools, and system prompt injected. Output streams back in real time via cursor-based polling.

---

## MCP Tools (7)

| Tool | Description |
|------|-------------|
| `list_specialists` | Discover all available specialists across scopes |
| `use_specialist` | Run a specialist synchronously and return the result |
| `start_specialist` | Fire-and-forget: start a specialist job, returns `job_id` |
| `poll_specialist` | Poll a running job; returns delta since last cursor |
| `stop_specialist` | Cancel a running job |
| `run_parallel` | Run multiple specialists concurrently or as a pipeline |
| `specialist_status` | Circuit breaker health + job status |

---

## Built-in Specialists

| Specialist | Model | Purpose |
|-----------|-------|---------|
| `init-session` | Haiku | Analyze git state, recent commits, surface relevant context |
| `codebase-explorer` | Gemini Flash | Architecture analysis, directory structure, patterns |
| `overthinker` | Sonnet | 4-phase deep reasoning: analysis → critique → synthesis → output |
| `parallel-review` | Sonnet | Concurrent code review across multiple focus areas |
| `bug-hunt` | Sonnet | Autonomous bug investigation from symptoms to root cause |
| `feature-design` | Sonnet | Turn feature requests into structured implementation plans |
| `auto-remediation` | Gemini Flash | Apply fixes to identified issues automatically |
| `report-generator` | Haiku | Synthesize data/analysis results into structured markdown |
| `test-runner` | Haiku | Run tests, parse results, surface failures |

---

## Permission Tiers

Specialists declare their required permission level. OmniSpecialist enforces this at spawn time via `pi --tools`:

| Tier | Allowed tools | Use case |
|------|--------------|----------|
| `READ_ONLY` | read, bash (read-only), grep, find, ls | Analysis, exploration |
| `LOW` | + edit, write | Code modifications |
| `MEDIUM` | + git operations | Commits, branching |
| `HIGH` | Full autonomy | External API calls, push |

---

## Installation

### One-line installer (recommended)

Installs all dependencies and registers the MCP automatically:

```bash
npx --package=github:Jaggerxtrm/specialists install
```

This installs: **pi** (`@mariozechner/pi-coding-agent`), **beads** (`@beads/bd`), prints dolt instructions, installs `specialists` globally, registers the MCP at user scope, and scaffolds `~/.agents/specialists/`.

After running, **restart Claude Code** to load the MCP.

---

### Manual installation

**1. pi** — coding agent runtime:
```bash
npm install -g @mariozechner/pi-coding-agent
```
Run `pi` once, then `pi config` to enable your model providers (Anthropic, Google, etc.).

**2. beads** — issue tracker:
```bash
npm install -g @beads/bd
```

**3. dolt** — beads sync backend:
```bash
# Linux
sudo bash -c 'curl -L https://github.com/dolthub/dolt/releases/latest/download/install.sh | bash'
# macOS
brew install dolt
```

**4. specialists + MCP:**
```bash
npm install -g github:Jaggerxtrm/specialists
claude mcp add --scope user specialists -- specialists
```

Then **restart Claude Code**.

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
    updated: "2026-03-07"

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

      Working directory: $cwd

  communication:
    publishes: [result]
```

**Model IDs** use the full provider/model format: `anthropic/claude-sonnet-4-6`, `google-gemini-cli/gemini-3-flash-preview`, `anthropic/claude-haiku-4-5`.

---

## Development

```bash
git clone https://github.com/Jaggerxtrm/specialists.git
cd specialists
bun install
bun run build
bun test
```

- **Build**: `bun build src/index.ts --target=node --outfile=dist/index.js`
- **Test**: `bun --bun vitest run` (40 unit tests)
- **Lint**: `tsc --noEmit`

See [CLAUDE.md](CLAUDE.md) for the full architecture guide and [ROADMAP.md](ROADMAP.md) for planned features.

---

## License

MIT
