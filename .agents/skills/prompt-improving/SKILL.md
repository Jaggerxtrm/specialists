---
name: prompt-improving
description: 'Prompt Improver (Trigger: /prompt-improving "raw prompt"). Applies Claude XML best practices to user prompts before execution. Use when the user specifically invokes /prompt-improving.'
gemini-command: prompt
gemini-prompt: |
  1. Detect context: ANALYSIS (thinking), DEV (examples), or REFACTOR (constraints).
  2. Apply core XML tags (<description>, <parameters>, <instructions>).
  3. Add enhancements (Chain of Thought, Multishot examples) based on context.
  4. Execute ONLY the improved prompt version.
---

# Prompt Improver ( /prompt-improving )

Automatically improves raw prompts using Claude's XML best practices (semantic tags, multishot examples, chain-of-thought) and then executes the improved version.

## When to Use

**Trigger:** User types `/prompt-improving "raw prompt"` or `/prompt-improving <raw prompt>`

## Execution Flow

1.  **Detect Context:**
    *   Scan prompt for task type keywords
    *   **ANALYSIS** (contains: analyze, investigate, research) → needs thinking space
    *   **DEV** (contains: implement, create, build, add) → needs examples
    *   **REFACTOR** (contains: refactor, improve, optimize) → needs constraints

2.  **Apply Core XML:**
    *   Consult [references/xml_core.md](references/xml_core.md)
    *   Wrap the prompt in a semantic root tag (e.g., `<task_name>`)
    *   Use tags like `<description>`, `<parameters>`, `<instructions>` by default

3.  **Add Context-Specific Enhancements:**
    *   **ANALYSIS tasks:**
        *   Consult [references/chain_of_thought.md](references/chain_of_thought.md)
        *   Add `<thinking>` section with prefill
        *   Define structured `<outputs>`
    *   **DEV tasks:**
        *   Consult [references/multishot.md](references/multishot.md)
        *   Add 1-2 `<example>` blocks
    *   **REFACTOR tasks:**
        *   Add `<constraints>` section (preserve behavior, tests must pass)
        *   Add `<current_state>` context if helpful

4.  **Handle Ambiguity:**
    *   If prompt is very vague (<8 words, no specifics)
    *   Use **AskUserQuestion** to clarify:

```typescript
AskUserQuestion({
  questions: [{
    header: "Clarify",
    question: "The prompt is ambiguous. What would you like me to focus on?",
    multiSelect: false,
    options: [
      { label: "Add more detail", description: "I'll provide more context" },
      { label: "Execute as-is", description: "Apply basic XML structure and proceed" },
      { label: "Cancel", description: "Skip prompt improvement" }
    ]
  }]
});
```

5.  **Execute:**
    *   **EXECUTE ONLY THE IMPROVED PROMPT.**
    *   Act as if the user entered the improved XML prompt directly.

## Reference Library

*   **Core XML:** [references/xml_core.md](references/xml_core.md) - Basic XML structure and semantic tags
*   **Multishot:** [references/multishot.md](references/multishot.md) - Adding concrete examples
*   **Chain of Thought:** [references/chain_of_thought.md](references/chain_of_thought.md) - Thinking space for analysis
*   **Tool Definitions:** [references/mcp_definitions.md](references/mcp_definitions.md) - MCP tool structure
*   **Analysis Frameworks:** [references/analysis_commands.md](references/analysis_commands.md) - Structured analysis
