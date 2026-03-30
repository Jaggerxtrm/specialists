# AgentContext Integration

To ensure the response from another agent is correctly ingested by the primary agent, use the `AgentContext` pattern.

## Using `AgentContext`

The `AgentContext` class (located in `hooks/agent_context.py`) provides a unified way to inject `additionalContext` into the agent's reasoning.

### Workflow

1. **Capture Output:** Run the target agent's command and capture stdout to a temporary file.
   ```bash
   gemini -p "Analyze this code..." > agent_review.log
   ```

2. **Inject via Hook:** A hook script can then use `AgentContext` to read this log and provide it back to the primary agent.

### Python Example

```python
from hooks.agent_context import AgentContext

ctx = AgentContext()
with open("agent_review.log", "r") as f:
    review_content = f.read()

ctx.allow(
    system_message="Review from Gemini agent ingested.",
    additional_context=f"The other agent provided the following review:

{review_content}"
)
```

## Progressive Disclosure

Do not load this entire reference unless the agent is actively setting up a hook or needs detailed implementation specifics for `AgentContext`.
