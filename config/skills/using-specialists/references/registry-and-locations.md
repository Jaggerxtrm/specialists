# Registry and locations

> Where specialists live, project-specific specialists, the live registry/help surface, adjacent xt commands.
> Loaded on demand from [SKILL.md](../SKILL.md) — not eagerly injected.
> Always-needed policy (rules, gates, escalation, specialist choice) stays in the router; it is not repeated here.

## Specialist File Locations

Specialists live in three layers. Know which layer you are reading or editing:

| Layer | Path | Purpose |
|-------|------|---------|
| Package (shipped) | `config/specialists/*.specialist.json` | Canonical role definitions; versioned with the repo |
| User override | `.specialists/user/*.specialist.json` | Per-project customizations; wins over package layer for same name |
| Default mirror | `.specialists/default/*.specialist.json` | Repo-managed mirror of package defaults; overrides package fallback |

The loader resolves in priority order: user → default-mirror → package. A same-name file in `.specialists/user/` fully replaces the package version for that specialist. When creating or editing a specialist, use `config/specialists/` for shipped roles and `.specialists/user/` for project-specific overrides. Never edit `.specialists/default/` by hand — it is managed by `update-specialists`.

`specialists list --full` shows the resolved set (which layer each specialist comes from) so you always know what will actually run.

### Editing Specialist Fields: `sp edit` Is Required

Direct JSON editing is error-prone and bypasses schema validation. Use `sp edit` for all field changes — it validates dot-paths, handles array append/remove, and writes to the correct layer.

```bash
# Read a field
sp edit executor --get specialist.execution.model

# Set a field (schema-validated)
sp edit executor specialist.execution.model <model-id>

# Set prompt.system or task_template from a file (required for multi-line content)
sp edit executor --set specialist.prompt.system _ --file ./my-system-prompt.txt

# Append or remove tags
sp edit executor --set specialist.metadata.tags review,security --append
sp edit executor --set specialist.metadata.tags old-tag --remove

# Apply a named preset (run sp edit --list-presets for current options)
sp edit executor --preset power
sp edit executor --preset cheap --dry-run   # preview first

# Target a specific scope when name exists in multiple layers
sp edit executor --scope user --set specialist.execution.model <model-id>

# Bulk read across all specialists
sp edit --all --get specialist.execution.model
```

**When `sp edit` is required vs. direct JSON edit:**
- Model, thinking level, timeout, tags, permission, description → always `sp edit`
- `prompt.system` or `task_template` longer than one line → `sp edit --file`
- Structural schema fields (execution flags, output_schema) → `sp edit` with dot-path
- Net-new specialist creation → `specialists-creator` skill, then `sp edit` for tuning
- Bulk cross-specialist reads → `sp edit --all --get <path>`
- Available presets → `sp edit --list-presets` (do not hardcode; varies by install)

## Project-Specific Specialists

Users define their own specialists in `.specialists/user/*.specialist.json` to fit project shape (domain knowledge, language, framework, conventions). These override package defaults and may not match generic role descriptions.

- Always run `specialists list --full` to see the resolved set, including project-specific roles, before choosing.
- Read `sp help` and the specialist's description/tags to confirm fit. Do not assume a name maps to its package-default behavior — a `.specialists/user/` override may have a different prompt, model, or scope.
- Pick the project-specific specialist when its role matches the task shape. Do not fall back to a generic role just because it is more familiar.
- If the task does not match any project-specific role, use the package default and consider whether a new project-specific specialist would help (use `specialists-creator` skill).

## Live Registry And Help

Use live registry for role details, permissions, current models, and skills:

```bash
specialists list --full
```

Use help for command flags and subcommands:

```bash
sp help
sp run --help
sp ps --help
sp feed --help
sp result --help
sp resume --help
sp steer --help
sp stop --help
```

Do not rely on stale remembered flags when help is available. (Omitted: `sp finalize`, `sp merge`, `sp epic` — see rule #9. They exist in the binary but the skill prohibits their use.)

**`sp view <name> --raw` returns the MERGED effective spec** (package canonical + global user overrides + repo user overrides), same layer precedence as the runtime uses, without the missing-model gate. Since specialists PR #178 this is the correct way to inspect what a specialist will actually run as — the old canonical-only reading is gone. If you need the raw package canonical for debugging (rare), read `.specialist.json` from the specialists package on disk.

## Adjacent xt commands

Source: latest xt report + `xt --help`; keep commands here, not full CLI surface.
- `xt report` — session report input for release synthesis; see `/session-close-report`.
- `xt end` — close worktree session: push, PR, merge, cleanup; see `/xt-end`.
- `xt claude` — launch Claude in sandboxed worktree; see `/using-xtrm`. `xt claude --role <name>` has full parity with `xt pi --role` (same flags, same scaffold, same session-name shape).
- `xt pi` — launch pi in sandboxed worktree. `xt pi --role <specialist>` spawns an interactive specialist session (chain-coordinator, pr-reviewer, sre-triage, deploy-monitor); full flag surface + monitoring pattern in `/multiplexing` Pattern 7.
- `xt update` — refresh xtrm-managed files in one repo or many; see `/update-xt`.
- `xt doctor` — diagnose xtrm drift in current project; see `/update-xt`.
- `xt init` — bootstrap xtrm in project; see xtrm-tools docs.
- `xt release prepare/publish` — legacy release path; canonical flow is `/releasing`.
- `bd prime` — refresh beads workflow context; see `CLAUDE.md`.
- `memory-processor` — memory synthesis specialist; see `/documenting`.
- `xt-merge` — defer merge-queue internals to `/xt-merge`.

