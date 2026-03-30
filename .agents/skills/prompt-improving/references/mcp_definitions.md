# MCP Tool Definitions

## When to Use
When the user wants to define a new tool, function, or API capability.

## Structure
```xml
<tool_definition>
  <description>One-line summary.</description>
  <purpose>Extended explanation.</purpose>
  <parameters>
    <param name="arg1">Type, default, description.</param>
  </parameters>
  <returns>Structure of return value.</returns>
  <constraints>Rules and limits.</constraints>
  <examples>
    <!-- Multishot examples here -->
  </examples>
</tool_definition>
```
