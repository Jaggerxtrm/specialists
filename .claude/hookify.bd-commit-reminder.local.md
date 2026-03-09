---
name: bd-commit-reminder
enabled: true
event: bash
action: warn
pattern: git\s+commit
---

⚠️ **Committing — have you updated your bd issue?**

Before committing, ensure:
- Active issue is updated: `bd update <id> --status in_progress`
- Or closed if done: `bd close <id> --reason "Completed"`
- Check in-progress: `bd list --status in_progress --json`

Link commits to issues by referencing the issue ID in your commit message.
