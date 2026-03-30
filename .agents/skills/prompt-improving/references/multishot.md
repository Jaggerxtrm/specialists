# Multishot Prompting

## When to Use
Use for complex tasks, structured outputs, edge cases, or tool definitions.

## Core Principle
Provide 3-5 diverse, relevant examples to show exactly what is desired.

## Best Practices
1. **Relevance:** Mirror actual use cases.
2. **Diversity:** Include basic, complex, and edge cases.
3. **Structure:** Wrap in `<example>` tags.

## Template
```xml
<examples>
  <example>
    <input>Scenario description</input>
    <output>Expected result</output>
    <explanation>Why this is correct</explanation>
  </example>
</examples>
```
