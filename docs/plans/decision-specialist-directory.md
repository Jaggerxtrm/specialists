# Decision: Project Specialist Directory Structure

**Date:** 2026-03-25
**Status:** Accepted
**Context:** Refactor to consolidate all specialist assets under `.specialists/`

---

## Decision

All specialist-related assets live under `.specialists/` with clear separation:

```
.specialists/
├── default/           # canonical assets (from init)
│   ├── specialists/   # 11 bundled specialists
│   ├── hooks/         # 2 bundled hooks
│   └── skills/        # 3 bundled skills
├── user/              # custom additions
│   ├── specialists/
│   ├── hooks/
│   └── skills/
├── jobs/              # runtime (gitignored)
└── ready/             # runtime (gitignored)
```

## Rationale

1. **Single location** — All specialist-related assets in one place
2. **Clear separation** — Default vs user assets clearly distinguished
3. **Version control** — Both default and user assets are tracked in git
4. **Runtime isolation** — Only `jobs/` and `ready/` are gitignored

## Scan Order

The loader scans in order (first wins):
1. `.specialists/user/specialists/` — user customizations override defaults
2. `.specialists/default/specialists/` — canonical specialists

## Previous Decision (Superseded)

The earlier decision (2026-03-23) to keep `specialists/` at project root has been superseded. All legacy paths have been removed:
- ~~`specialists/`~~ — removed
- ~~`.claude/specialists/`~~ — removed
- ~~`.agent-forge/specialists/`~~ — removed
- ~~`~/.agents/specialists/`~~ — removed (user scope deprecated)