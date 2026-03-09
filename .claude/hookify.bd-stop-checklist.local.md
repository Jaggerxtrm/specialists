---
name: bd-stop-checklist
enabled: true
event: stop
action: warn
pattern: .*
---

## Before stopping — complete the bd landing checklist

**Issue tracking:**
- Run `bd list --status in_progress` — are any issues still claimed?
- Close finished work: `bd close <id> --reason "Completed"`
- File remaining work: `bd create "..." -t task -p 2`

**Push:**
```bash
git pull --rebase && git push
```

Work is NOT complete until `git push` succeeds and all active issues are resolved or handed off.
