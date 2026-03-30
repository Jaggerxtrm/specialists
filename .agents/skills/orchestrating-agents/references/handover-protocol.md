# Handover Protocol

This protocol defines how to "hand off" a task to another agent for a second opinion or specialized review.

## Headless Execution

To interact with other agents without blocking the current session, use headless commands.

### Gemini
- **Initial Query:** `gemini -p "Your prompt here"`
- **Follow-up (Resume):** `gemini -r latest -p "Your follow-up here"`
  - `-r latest` resumes the most recent session
  - `-r 5` resumes session index 5 (use `gemini --list-sessions` to see available sessions)

### Qwen
- **Initial Query:** `qwen "Your prompt here"`
- **Follow-up (Continue):** `qwen -c "Your follow-up here"`
- **Note:** Qwen uses positional prompts. The `-c` flag automatically resumes the most recent session for the current project.

## Handshaking Strategies

### 1. Standard (2-Phase)
1. **Proposal**: Send initial context and question to the target agent.
2. **Refinement**: Use `-r latest` (Gemini) or `-c` (Qwen) to ask for specific corrections or clarifications.

### 2. Deep (Multi-Turn)
Used for "Design," "Bug Hunt," and "Troubleshoot" workflows.
1. **Agent A (Draft)**: Request an initial solution or hypothesis.
2. **Agent B (Audit)**: Pass Agent A's output to Agent B for critique.
3. **Agent A (Iterate)**: Resume Agent A's session with Agent B's critique using `-r latest` or `-c`.
4. **Final Synthesis**: Ingest the final result using `AgentContext`.
