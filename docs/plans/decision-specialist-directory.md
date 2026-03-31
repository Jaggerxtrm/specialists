# Decision: Project Specialist Directory Structure

**Date:** 2026-03-25
**Status:** Accepted
**Context:** Refactor to consolidate all specialist assets under `.specialists/`

---

## Decision

All specialist-related assets live under `.specialists/` with clear separation:

```
.specialists/
├── default/           # canonical specialist YAMLs (from init)
├── user/              # custom specialist YAMLs
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
1. `.specialists/user/` — user customizations override defaults
2. `.specialists/default/` — canonical specialists
3. legacy nested paths (`.specialists/user/specialists/`, `.specialists/default/specialists/`) for backward compatibility

## Previous Decision (Superseded)

The earlier decision (2026-03-23) to keep `specialists/` at project root has been superseded. All legacy paths have been removed:
- ~~`specialists/`~~ — removed
- ~~`.claude/specialists/`~~ — removed
- ~~`.agent-forge/specialists/`~~ — removed
- ~~`~/.agents/specialists/`~~ — removed (user scope deprecated)