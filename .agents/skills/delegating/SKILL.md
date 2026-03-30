---
name: delegating
description: >-
  Proactively delegates tasks to cost-optimized agents before working in main session.
  MUST suggest for: tests, typos, formatting, docs, refactors, code reviews, feature
  implementation, debugging, commit validation. Skips main session token usage by routing
  to GLM (simple/deterministic), Gemini (reasoning/analysis), Qwen (quality/patterns),
  or multi-agent orchestration (review, feature dev, bug hunt). Never suggest for:
  architecture decisions, security-critical code, unknown-cause bugs, performance optimization.
allowed-tools: Bash
---

# Delegating Tasks

Delegate tasks to cost-optimized models (CCS) or multi-agent orchestration workflows (Gemini/Qwen).

## When to Suggest

**Task Pattern → Backend Mapping** (auto-selection logic):

| Task Pattern                  | Backend     | Cost   | Reason                         |
|-------------------------------|-------------|--------|--------------------------------|
| `typo\|test\|doc\|format`     | CCS (GLM)   | LOW    | Simple deterministic           |
| `think\|analyze\|reason`      | CCS (Gemini)| MEDIUM | Requires reasoning             |
| `review.*(code\|security)`    | Orchestration| HIGH   | Multi-agent code review        |
| `implement.*feature`          | Orchestration| HIGH   | Full development workflow      |
| `validate.*commit`            | Orchestration| MEDIUM | Security+Quality validation    |
| `debug\|bug.*unknown`         | Orchestration| HIGH   | Root cause investigation       |

**Never Suggest For:**
- Architecture decisions requiring human judgment
- Security-critical without review
- Performance optimization (needs profiling first)

---

## Interactive Menu

### Step 1: Delegation Choice

Use AskUserQuestion with:
- question: "This task can be delegated. How would you like to proceed?"
- header: "Execution"
- options:
  - "Delegate (Recommended)" — Execute via optimal backend. Saves main session tokens and uses cost-efficient models.
  - "Work in main session" — Execute in current Claude session. Better for tasks requiring discussion or complex context.

**If user selects "Delegate"** → Continue to Step 2
**If user selects "Work in main session"** → Execute task normally (don't delegate)

### Step 2: Backend Selection

Use AskUserQuestion with:
- question: "Which backend should handle this task?"
- header: "Backend"
- options:
  - "Auto-select (Recommended)" — Analyzes task keywords and selects optimal backend/profile automatically.
  - "GLM - Cost-optimized" — Fast model for tests, typos, formatting [LOW COST]
  - "Gemini - Reasoning" — Analysis, thinking, architecture tasks [MEDIUM COST]
  - "Qwen - Quality" — Code quality, pattern detection [MEDIUM COST]
  - "Multi-Agent Orchestration" — Direct Gemini/Qwen collaboration for complex tasks (review, feature dev, debugging) [HIGH COST]

---

## Auto-Selection Logic

**Configuration-Driven:** All pattern matching is defined in [config.yaml](config.yaml), not hardcoded.

### Configuration Structure

The skill reads `config.yaml` to determine:
1. **Available backends** (CCS profiles + Orchestration workflows)
2. **Pattern mappings** (task keywords → backend selection)
3. **Priority order** (Orchestration workflows checked before CCS)
4. **Default fallback** (when no pattern matches)

---

## Orchestration Workflow Selection (Autonomous)

When `backend: 'orchestration'` is selected, **Claude autonomously** chooses the appropriate workflow and orchestrates between `gemini` and `qwen` CLI tools.

### Selection Process

1. **Load config** - Read workflow definitions from `config.yaml`
2. **Match patterns** - Determine which orchestration pattern (collaborative, handshake, troubleshoot) applies.
3. **Execute turn protocol** - Use CLI commands sequentially:
   - `gemini -p "..."`
   - `qwen "..."`
   - `gemini -r latest -p "..."` (to refine)

### Turn Protocols

| Workflow | Protocol |
| :--- | :--- |
| **handshake** | 1 turn: Agent A (Gemini) proposes -> Agent B (Qwen) validates. |
| **collaborative** | 3 turns: Gemini designs -> Qwen critiques -> Gemini refines. |
| **troubleshoot** | 4 turns: Gemini hypothesis -> Qwen verification -> Gemini root cause -> Final synthesis. |

---

## Execution Flow

### For Direct Invocation (`/delegation [task]` or `/delegate [task]`)

1. **Parse override flag** (if present: `--glm`, `--gemini`, `--orchestrate`, etc.)
2. **Auto-select backend** using keyword-based logic.
3. **Route to appropriate backend** (see sections below).
4. **Report results**: Backend, Workflow (if Orchestration), Cost indicator, Duration.

---

### CCS / GLM Execution

CCS wraps the `claude` CLI and **only works with GLM**. It requires a PTY for output and is blocked by the `CLAUDECODE` nested-session guard — always run via tmux:

```bash
tmux new-session -d -s ccs_task "env -u CLAUDECODE ccs glm -p '{task}' > /tmp/ccs_out.txt 2>&1"
sleep 30  # or poll until session exits
cat /tmp/ccs_out.txt
```

**If the task requires file modifications**, add `--dangerously-skip-permissions`:

```bash
tmux new-session -d -s ccs_task "env -u CLAUDECODE ccs glm --dangerously-skip-permissions -p '{task}' > /tmp/ccs_out.txt 2>&1"
```

---

### Gemini CLI Execution

Gemini is a **direct CLI** — no tmux workaround needed:

```bash
gemini -p "task description"
```

**If the task requires file modifications**, add `-y` to auto-approve all tool calls:

```bash
gemini -y -p "task description"
```

---

### Qwen CLI Execution

Qwen is a **direct CLI** — no tmux workaround needed:

```bash
qwen "task description"
```

**If the task requires file modifications**, add `-y` to auto-approve all tool calls:

```bash
qwen -y "task description"
```

---

### Orchestration Execution

Multi-turn sequences use Gemini and Qwen **direct CLIs**. Add `-y` to all turns when modifications are expected:

```bash
gemini -y -p "..."            # Turn 1
qwen -y "..."                 # Turn 2
gemini -y -r latest -p "..."  # Turn 3 (refine)
```

---

## Examples

### Auto-Selection Examples

**CCS Simple:**
- `/delegate add unit tests for UserService` → CCS (GLM)
- `/delegate think about the best database schema` → CCS (Gemini)

**Orchestration Workflows:**
- `/delegate review this code for security issues` → Orchestration (parallel-review)
- `/delegate implement OAuth authentication feature` → Orchestration (feature-design)
- `/delegate debug crash on startup` → Orchestration (bug-hunt)

---

## Notes

### Version 7.0.0 - Direct Orchestration
- **Independent of unitAI**: Now uses direct `gemini` and `qwen` CLI calls.
- **Unified backends**: CCS (cost-optimized) + Direct Orchestration.
- **Config-driven**: All behavior defined in `config.yaml`.
- **Reference**: Uses patterns from [orchestrating-agents](../orchestrating-agents/SKILL.md).
