# Analysis Frameworks

## When to Use
When the user wants to perform a deep dive analysis (e.g., "analyze employment data", "review logs").

## Structure
```xml
<analysis_task>
  <requirements>
    <data>Required inputs.</data>
    <format>Input format.</format>
  </requirements>
  <instructions>
    1. Step 1
    2. Step 2
  </instructions>
  <outputs>
    <output_1>Executive Summary</output_1>
    <output_2>Detailed Findings</output_2>
  </outputs>
  <!-- Always include CoT for analysis -->
  <thinking>...</thinking>
</analysis_task>
```
