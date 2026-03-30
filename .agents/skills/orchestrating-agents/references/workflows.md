# Multi-Turn Orchestration Workflows

These workflows define deep, multi-turn interactions between agents for complex scenarios.

## 1. Collaborative Design (`collaborative-design`)
**Scenario**: Building a new feature or architecting a component.

| Turn | Agent | Action |
| :--- | :--- | :--- |
| **1** | **Primary** | Send requirements and initial constraints to Agent A. |
| **2** | **Agent A** | Propose a high-level design. |
| **3** | **Primary** | Pipe Agent A's proposal to Agent B. |
| **4** | **Agent B** | Critique the design for edge cases and complexity. |
| **5** | **Primary** | Return Agent B's critique to Agent A via `-r latest` (Gemini) or `-c` (Qwen). |
| **6** | **Agent A** | Refine the design to address critiques. |

## 2. Adversarial Review (`adversarial-review`)
**Scenario**: Security audits, "red teaming," or finding hidden flaws.

| Turn | Agent | Action |
| :--- | :--- | :--- |
| **1** | **Primary** | Send the code/logic to Agent A for a "safe" review. |
| **2** | **Agent B** | Act as a "Skeptic/Attacker": "Find 3 ways to break this logic." |
| **3** | **Primary** | Pipe "attacks" to Agent A via `-r latest` (Gemini) or `-c` (Qwen). |
| **4** | **Agent A** | Defend the logic or provide patches for the identified flaws. |

## 3. Troubleshoot Session (`troubleshoot-session`)
**Scenario**: "Getting out of trouble," emergency production errors, or ghost bugs.

| Turn | Agent | Action |
| :--- | :--- | :--- |
| **1** | **Primary** | Provide symptoms to Agent A and ask for 3 hypotheses. |
| **2** | **Agent A** | Propose hypotheses and verification steps. |
| **3** | **Primary** | Ask Agent B to verify Hypothesis #1 using current logs/code. |
| **4** | **Agent B** | Provide verification result (Confirmed/Refuted). |
| **5** | **Primary** | Update Agent A with the findings and ask for the final root cause. |

## Automatic Triggering
The primary agent should suggest these workflows when:
- **Complexity is high**: Changes affecting >3 files or core infrastructure.
- **Risk is high**: Security, authentication, or payment logic.
- **Agent is "stuck"**: When a single-agent approach fails to find a bug.
