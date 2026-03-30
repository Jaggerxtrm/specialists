# XML Tags for Clarity & Structure

## Core Principle
Use semantic XML tags to structure information hierarchically. Tags should make sense contextually and improve readability. This is the **default** format for all improved prompts.

## Common Tags
| Tag                | Purpose                    |
| ------------------ | -------------------------- |
| `<description>`    | High-level overview        |
| `<parameters>`     | Input arguments            |
| `<examples>`       | Concrete usage             |
| `<instructions>`   | How to perform task        |
| `<constraints>`    | Limitations & requirements |
| `<thinking>`       | Internal reasoning         |
| `<analysis>`       | Detailed examination       |
| `<recommendation>` | Suggested action           |

## Structure Template
```xml
<root_description>
  <description>One-line summary.</description>
  <parameters>
    <param name="p1">Description.</param>
  </parameters>
  <instructions>Step-by-step guidance.</instructions>
</root_description>
```

## Common Prefill Patterns

### Analysis Tasks
```xml
<analysis>
  <thinking>Let me break down the problem...</thinking>
  <examination>Key aspects to consider...</examination>
  <findings>Based on the analysis...</findings>
  <recommendation>Suggested approach...</recommendation>
</analysis>
```

### Code Generation
```xml
<implementation>
  <approach>High-level strategy...</approach>
  <code>
    // Implementation
  </code>
  <testing>Verification steps...</testing>
</implementation>
```

### Assistant Responses
```xml
<response>
  <summary>Quick answer for context.</summary>
  <detailed_explanation>In-depth reasoning...</detailed_explanation>
  <examples>Concrete cases...</examples>
  <next_steps>What to do next...</next_steps>
</response>
```
