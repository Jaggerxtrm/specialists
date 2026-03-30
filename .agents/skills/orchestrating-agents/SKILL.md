---
name: orchestrating-agents
description: Orchestrates task handoff and "handshaking" between Gemini and Qwen CLI agents. Facilitates specialized reviews, second opinions, and cross-validation of complex logic. Use when a task requires multi-model collaboration, a second LLM perspective, or iterative feedback between terminal agents.
gemini-command: orchestrate
gemini-args:
  - name: workflow
    description: "Orchestration workflow type"
    type: choice
    choices:
      - value: collaborative
        label: "Collaborative Design"
        description: "Multi-turn design session for new features/architecture"
      - value: adversarial
        label: "Adversarial Review"
        description: "Red-team security audit with attack/defense rounds"
      - value: troubleshoot
        label: "Troubleshoot Session"
        description: "Deep debugging with hypothesis testing"
      - value: handshake
        label: "Single Handshake"
        description: "Quick one-turn second opinion"
    default: collaborative
  - name: prompt
    description: "Task description for orchestration"
    type: string
    required: true
gemini-prompt: |
  You are orchestrating a multi-agent collaboration workflow.

  Workflow Type: {{workflow}}
  Task: {{prompt}}

  Steps:
  1. Detect available neighbor agents (gemini, qwen)
  2. Map workflow type to execution pattern:
     - collaborative → Collaborative Design (3 turns)
     - adversarial → Adversarial Review (3 turns)
     - troubleshoot → Troubleshoot Session (4 turns)
     - handshake → Single Handshake (1 turn)
  3. Execute the turn protocol defined in references/workflows.md
  4. Synthesize and present results
---

# Orchestrating Agents

This skill provides a structured workflow for multi-model collaboration between Gemini and Qwen, enabling deep "handshaking" sessions for complex tasks.

## Usage

### Command-Line Invocation (Gemini)
```bash
# With workflow parameter (recommended)
/orchestrate collaborative "Design authentication system with JWT"
/orchestrate adversarial "Review payment processing security"
/orchestrate troubleshoot "Debug production memory leak"
/orchestrate handshake "Quick review of rate limiting logic"

# Without parameter (interactive selection)
/orchestrate "Design authentication system"
```

### Workflow Types

| Workflow | Turns | Use Case |
|----------|-------|----------|
| **collaborative** | 3 | New features, architecture planning, design decisions |
| **adversarial** | 3 | Security audits, vulnerability assessment, red-team review |
| **troubleshoot** | 4 | Complex debugging, production errors, emergency fixes |
| **handshake** | 1 | Quick second opinion, simple validation |

## Interactive Selection (Fallback)

If no workflow type is specified, the agent will prompt for selection:

### For Gemini CLI (`ask_user`)
```typescript
ask_user({
  questions: [{
    question: "This task requires deep collaboration. Which orchestration workflow should we use?",
    header: "Orchestrate",
    options: [
      { label: "Collaborative Design", description: "Agent A proposes -> Agent B critiques -> Agent A refines." },
      { label: "Adversarial Review", description: "Agent A proposes -> Agent B attacks (Red Team) -> Agent A defends." },
      { label: "Troubleshoot Session", description: "Multi-agent hypothesis testing for emergency bugs." },
      { label: "Single Handshake", description: "Standard one-turn second opinion." }
    ]
  }]
});
```

### For Claude Code (`AskUserQuestion`)
```typescript
AskUserQuestion({
  questions: [{
    question: "This task requires deep collaboration. Which orchestration workflow should we use?",
    header: "Orchestrate",
    options: [
      { label: "Collaborative Design", description: "Agent A proposes -> Agent B critiques -> Agent A refines." },
      { label: "Adversarial Review", description: "Agent A proposes -> Agent B attacks (Red Team) -> Agent A defends." },
      { label: "Troubleshoot Session", description: "Multi-agent hypothesis testing for emergency bugs." },
      { label: "Single Handshake", description: "Standard one-turn second opinion." }
    ]
  }]
});
```

## Workflows

### 1. Handshake Protocol (Standard)
| Agent | Initial Command | Follow-up (Resume) |
| :--- | :--- | :--- |
| **Gemini** | `gemini -p "..."` | `gemini -r latest -p "..."` |
| **Qwen** | `qwen "..."` | `qwen -c "..."` |

### 2. Multi-Turn Loops
For complex scenarios, follow the turns defined in [references/workflows.md](references/workflows.md).

```
Loop Progress:
- [ ] Turn 1: Proposal (Agent A)
- [ ] Turn 2: Cross-Examination (Agent B)
- [ ] Turn 3: Final Synthesis (Agent A)
```

## Resources

- **Workflows**: See [references/workflows.md](references/workflows.md) for turn-by-turn logic.
- **Config**: Patterns and priority are defined in [config.yaml](config.yaml).
- **Examples**: See [references/examples.md](references/examples.md) for concrete patterns.
- **Handover**: See [references/handover-protocol.md](references/handover-protocol.md) for command flags.

## Best Practices
- **Concise Context**: Send only relevant snippets, not entire files, to the neighboring agent.
- **Specific Tasks**: Ask for a "Security Audit" or "Refactoring Suggestions" rather than a general review.
- **Fail-Safe**: If a neighboring agent is not found, proceed with a self-review but notify the user.