# KAN-90 / unitAI-1gtou — Upgrading to the global user-config layer

This release moves model selection out of the shipped specialist files and into a
single per-user config file. Before this change every specialist in
`config/specialists/*.specialist.json` shipped with a hard-coded
`execution.model` and `execution.fallback_model`. That was a user-environment
detail (each user has their own provider keys in `pi`), not something the
package should ship.

## What changed

- Every `config/specialists/*.specialist.json` ships with
  `execution.model = null` and `execution.fallback_model = null`.
- The `SpecialistLoader` resolves each specialist via a 4-layer field-merge:

  ```
  package canonical            (base)
    ⇡ ~/.config/specialists/user.json    (your model + per-spec tuning)
    ⇡ .specialists/default/<name>        (repo-managed mirror)
    ⇡ .specialists/user/<name>           (repo authoring layer)
  ```

- If `execution.model` is still `null` after the full merge, the loader throws
  a `SpecialistMissingModelError` pointing you at `sp edit --global`.
- `sp init --global` generates the global user config; `sp edit --global` reads
  / writes individual fields; `sp doctor --specialists` reports coverage and
  flags blocked-field attempts.

## Upgrade procedure

Run this **once** after upgrading:

```bash
# 1. Generate ~/.config/specialists/user.json (or $XDG_CONFIG_HOME/...).
#    Idempotent: it is safe to re-run later.
sp init --global

# 2. Pick a default model for any specialist you actually use:
sp edit --global executor.execution.model         anthropic/claude-sonnet-4-6
sp edit --global executor.execution.fallback_model openai-codex/gpt-5.4-mini
# ... repeat for any specialist you dispatch

# 3. Verify coverage:
sp doctor --specialists
```

The `sp doctor` output will list every specialist that still has no model and
suggest the exact `sp edit --global` command to fix it. Specialists you never
dispatch can be left alone — the missing-model error only fires at dispatch
time, never during `specialists list` or `sp doctor`.

## What you can override (per-specialist) in the global config

Allowed in `~/.config/specialists/user.json`:

- `execution.model`
- `execution.fallback_model`
- `execution.timeout_ms`
- `execution.stall_timeout_ms`
- `execution.thinking_level`
- `execution.max_retries`
- `beads_write_notes`
- `skills.paths` (append + dedup against the base)

Anything else in `user.json` is a blocked field. The loader strips it during
merge and `sp doctor --specialists` surfaces a `STRIPPED` warning:

- `execution.permission_required` — identity field; the package decides what
  tools each role can call.
- `execution.auto_commit`
- `prompt.system`
- `prompt.output_schema`
- `skills.scripts` — pre/post hooks are part of the role contract.
- `mandatory_rules`
- `capabilities`

Repo-level overrides (`.specialists/default/<name>`, `.specialists/user/<name>`)
keep the existing whole-file replacement behaviour: blocked fields are applied
but `sp doctor --specialists` flags them as a `warn`-severity finding so the
divergence is visible.

## Path resolution

The loader checks in this order:

1. `$XDG_CONFIG_HOME/specialists/user.json` (if `XDG_CONFIG_HOME` is set)
2. `~/.config/specialists/user.json`
3. `~/.specialists/user.json` (legacy, read-only fallback)

`sp init --global` always writes to slot 1 or 2 (the XDG-compliant target).

## Why a single file

Earlier sketches considered `~/.specialists/defaults.json` plus per-specialist
sparse files. The single-file shape (`unitAI-o328h`) was picked because:

- One file is the canonical place to look at and edit.
- No drift between defaults and per-specialist overrides.
- `sp init --global` only has to manage one file.
- Removing a specialist from a future release still leaves its block in the
  user's file (with a `removed` notice in `sp init --global` output) so the
  user keeps the history.

## Cross-references

- Jira: [KAN-90](https://xtrmxt.atlassian.net/browse/KAN-90)
- Design decision: bd `unitAI-o328h`
- Implementation epic: bd `unitAI-1gtou`
  - C1 (loader): `unitAI-1gtou.12` (commit `6604c144`)
  - C2 (CLI): `unitAI-1gtou.13` (commit `5f8d725e`)
  - C3 (doctor): `unitAI-1gtou.14` (commit `6b69a6fe`)
  - C4 (config strip + this doc): `unitAI-1gtou.15`
