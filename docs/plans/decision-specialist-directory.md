# Decision: Project Specialist Directory Naming

**Date:** 2026-03-23
**Status:** Accepted
**Context:** Epic `unitAI-y7v` task `.6`

---

## Context

The project currently uses `specialists/` as the project YAML directory while the CLI binary is also named `specialists`. The epic identified this as a potential source of confusion and requested an explicit decision.

### Current Scan Paths

Project scope (searched in order):
1. `<project>/specialists/` — primary project location
2. `<project>/.claude/specialists/` — Claude-specific project location
3. `<project>/.agent-forge/specialists/` — legacy/alternative location

User scope:
- `~/.agents/specialists/` — user-level specialists

Runtime data (gitignored):
- `<project>/.specialists/` — contains `jobs/`, `ready/`

---

## Decision

**Keep `specialists/` as the project specialist definition directory.**

Rationale:
1. **Convention** — Project-level config directories like `docs/`, `tests/`, `scripts/` are visible and conventional. `specialists/` follows this pattern.
2. **Visibility** — Users can see their specialist definitions without hidden directories.
3. **No migration** — Existing projects continue to work without changes.
4. **Minor confusion** — The CLI binary name vs. directory name overlap causes at most mild confusion, not practical problems.
5. **Clear documentation** — The confusion can be resolved with clear docs: "Put `.specialist.yaml` files in `specialists/` in your project root."

---

## Alternatives Considered

### `.claude/specialists/`
- Pros: Aligns with Claude ecosystem, already in scan paths
- Cons: Hidden directory, less visible, requires migration

### `.specialists/yaml/`
- Pros: Hidden directory for definitions
- Cons: `.specialists/` is already runtime data, complex migration

### `agents/`
- Pros: Distinct from CLI name
- Cons: Conflicts with `~/.agents/` user scope, migration needed

---

## Compatibility

- **No breaking changes** — Existing projects with `specialists/` continue to work.
- **No migration required** — Documentation can immediately point to `specialists/`.
- **Scan paths unchanged** — All existing paths remain valid.

---

## Documentation Impact

Update all help/docs to consistently say:

```
Project specialists live in specialists/ in your project root.
Add .specialist.yaml files there and run `specialists list` to discover them.
```

Files to verify:
- `src/cli/help.ts`
- `src/cli/quickstart.ts`
- `src/cli/init.ts`
- `README.md`

---

## Outcome

`specialists/` is the canonical project specialist definition directory. Document it clearly. No migration.

---

## Addendum: User Scope Deprecated (2026-03-23)

**Decision:** Specialists are project-only. User scope (`~/.agents/specialists/`) is deprecated.

**Rationale:**
1. Single source of truth — no "which one wins?" confusion
2. Aligns with project-scoped MCP registration, beads tracking, workflow injection
3. Explicit dependencies — specialist lives with project, versioned with code
4. Simpler mental model — `specialists init` creates everything you need

**Changes:**
- `src/specialist/loader.ts` — removed user scope scanning
- `src/cli/list.ts` — removed `--scope` flag
- Docs updated to teach project-only model

**Migration for users:**
- Copy any specialists from `~/.agents/specialists/` to each project's `specialists/` directory