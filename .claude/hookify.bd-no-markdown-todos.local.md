---
name: bd-no-markdown-todos
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.md$
  - field: new_text
    operator: regex_match
    pattern: "- \\[ \\]"
---

⚠️ **Markdown TODO detected**

This project uses **bd (beads)** for ALL issue tracking. Do NOT create markdown task lists.

Instead:
```bash
bd create "Task description" -t task -p 2 --json
```

Remove the markdown TODO and create a proper bd issue.
