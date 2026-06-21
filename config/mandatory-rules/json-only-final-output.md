---
name: json-only-final-output
kind: mandatory-rule
---
Final answer must be **JSON only**.

Requirements:
- No prose before or after the JSON object.
- No Markdown fences.
- No headings, bullets, or commentary.
- Emit exactly one top-level JSON object.
- Include required top-level keys promised by the specialist contract.
- If work succeeded but some inner detail is uncertain, keep uncertainty inside JSON fields — never escape into prose.
