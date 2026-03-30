# Handshake Examples

These examples demonstrate the correct syntax and flow for orchestrating handshakes between agents.

## Example 1: Code Review Handshake (Qwen)

**Phase 1: Initial Proposal**
```bash
qwen "Review the security of this session handling logic: $(cat lib/auth.js)" > review_proposal.txt
```

**Phase 2: Refinement (Handshake)**
```bash
qwen -c "The previous review mentioned a potential race condition. Can you provide a specific code fix for that?" > review_fix.txt
```

## Example 2: Architecture Discussion (Gemini)

**Phase 1: Initial Proposal**
```bash
gemini -p "Analyze the dependency graph for our new 'orchestrating-agents' skill." > arch_proposal.txt
```

**Phase 2: Refinement (Handshake)**
```bash
gemini --resume latest -p "Now, suggest how we could integrate this with the 'delegating' skill without creating a circular dependency." > arch_refinement.txt
```

## Example 3: Integration via AgentContext

**Ingestion Workflow**
```python
from hooks.agent_context import AgentContext

ctx = AgentContext()
with open("review_fix.txt", "r") as f:
    content = f.read()

ctx.allow(
    system_message="Qwen's suggested fix ingested.",
    additional_context=f"Qwen provided this specific fix:

{content}"
)
```
