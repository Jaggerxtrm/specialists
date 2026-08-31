# Global user overrides guide

This guide is the canonical reference for `~/.config/specialists/user.json`, created by `sp init --global`. The global user layer lets each user tune environment-specific fields without forking shipped specialists. Specialist identity and safety fields remain blocked.

## Overview

The global override surface includes:

- KAN-91 allowlisted user-environment fields: `prompt.system_prompt_mode`, `execution.extensions`, `notes_mode`, `output_file`, `execution.prompt_limit_bytes`, and `execution.stdout_limit_bytes`. `execution.extensions.gitnexus` remains opt-out, arbitrary trusted source-string keys are allowed, and retired `execution.extensions.serena` remains accepted only for legacy files and is ignored.
- Additional runtime-default knobs: `execution.interactive` (default keep-alive behavior) and `stall_detection.waiting_auto_close_ms` (opt-in waiting auto-close threshold).
- Fallback chains via `execution.fallback_models` while keeping legacy `execution.fallback_model`.
- Preset references like `@preset/cheap` for model and fallback entries.
- A top-level `_doc` sentinel in generated `user.json` pointing back to this guide. Keys starting with `_` are metadata, not specialist names.

The examples below are delta snippets to add inside an existing specialist entry from `sp init --global`; they are not complete standalone `user.json` files. Keep the surrounding generated entry shape, including its `execution`, `prompt`, `stall_detection`, `beads_write_notes`, `skills`, and `mandatory_rules` keys, and change only the highlighted field.

## Per-field reference

### `prompt.system_prompt_mode`

- Type: `"append" | "replace" | null`
- Default semantics: `null` inherits the shipped specialist value, normally `append`.
- Example:

```json
{
  "executor": {
    "prompt": { "system_prompt_mode": "replace" }
  }
}
```

Pitfall: this controls composition mode only. It does not let `user.json` replace `prompt.system`; prompt content remains blocked.

### `execution.interactive`

- Type: `boolean | null`
- Default semantics: `null` inherits the merged specialist default. This is the default keep-alive/resume behavior when the operator does **not** pass `--keep-alive` or `--no-keep-alive`.
- Example:

```json
{
  "reviewer": {
    "execution": { "interactive": false }
  }
}
```

Pitfall: CLI flags still win. Effective precedence is `--no-keep-alive` > `--keep-alive` > merged `execution.interactive`.

### `execution.extensions.serena`

- Status: deprecated and ignored.
- Compatibility: existing `boolean | null` values remain valid so upgrades do not reject older `user.json` files.
- New configuration: omit this key. `sp init --global` no longer emits it.
- Legacy example:

```json
{
  "executor": {
    "execution": { "extensions": { "serena": false } }
  }
}
```

The value has no runtime effect. Specialists no longer probes, loads, or starts Serena.

### `execution.extensions`

- Type: `Record<string, boolean | null> | null`
- Trust boundary: keys are executable extension sources. Set them only from reviewed config files, never prompts or untrusted payloads.
- Merge semantics: package/global/repo layers merge per key; siblings are preserved.
- Runtime semantics:
  - `gitnexus: false` disables default GitNexus injection.
  - `serena` is deprecated and ignored.
  - any other key with value `true` is forwarded to Pi as `-e <key>` in insertion order.
  - `false` or `null` skips that source.
  - remote `npm:`, `git:`, and `http(s):` sources disable `--offline` for that run.
- Example:

```json
{
  "service-knowledge-sync": {
    "execution": {
      "extensions": {
        "gitnexus": false,
        "npm:@jaggerxtrm/pi-service-knowledge": true
      }
    }
  }
}
```

### `execution.extensions.gitnexus`

- Type: `boolean | null`
- Default semantics: `null` inherits the shipped extension setting.
- Example:

```json
{
  "executor": {
    "execution": { "extensions": { "gitnexus": false } }
  }
}
```

Pitfall: disabling GitNexus removes graph tooling from that specialist run. Use only when project indexing is unavailable or too expensive.

### `stall_detection.waiting_auto_close_ms`

- Type: `number | null`
- Default semantics: `null` inherits or disables the behavior. `0` also means disabled.
- Example:

```json
{
  "reviewer": {
    "stall_detection": { "waiting_auto_close_ms": 3600000 }
  }
}
```

Pitfall: this is **opt-in** and applies only after a specialist is already in `waiting`. The runtime attempts graceful close first; forced termination is fallback-only if the session refuses to exit.

### `notes_mode`

- Type: `"full-trail" | "final-only" | null`
- Default semantics: `null` inherits the specialist default. `full-trail` appends turn handoffs; `final-only` keeps final handoff only.
- Example:

```json
{
  "researcher": {
    "notes_mode": "final-only"
  }
}
```

Pitfall: `final-only` is quieter but removes intermediate turn notes from bead history.

### `output_file`

- Type: `string | null`
- Default semantics: `null` inherits the specialist default or no file mirror.
- Example:

```json
{
  "researcher": {
    "output_file": "./.specialists/researcher-result.md"
  }
}
```

Pitfall: paths are not expanded by the loader. `~/result.md` stays literal and is not converted to your home directory.

### `execution.prompt_limit_bytes`

- Type: `number | null`
- Default semantics: `null` inherits the shipped prompt input limit.
- Example:

```json
{
  "executor": {
    "execution": { "prompt_limit_bytes": 8388608 }
  }
}
```

Pitfall: raising this limit can increase token spend or provider rejection risk.

### `execution.stdout_limit_bytes`

- Type: `number | null`
- Default semantics: `null` inherits the shipped stdout capture limit.
- Example:

```json
{
  "executor": {
    "execution": { "stdout_limit_bytes": 67108864 }
  }
}
```

Pitfall: raising this limit can produce very large logs and result files.

### `mandatory_rules.template_sets`

- Type: `string[] | null` (kebab-case set ids)
- Default semantics: `null` inherits the shipped specialist's `template_sets`. `[]` explicitly selects **no** specialist-specific sets. A non-empty array replaces the shipped list.
- Unaffected: index policy (`required_template_sets` / `default_template_sets` from `config/mandatory-rules/index.json` and its overlays) always loads exactly as configured — this field selects only the specialist-specific `template_sets` appended after it.
- Example:

```json
{
  "executor": {
    "mandatory_rules": {
      "template_sets": ["git-workflow-safe", "code-quality-defaults"]
    }
  }
}
```

- To clear the specialist-specific sets explicitly, set `template_sets: []`; the index-driven required/default sets still load.
- Pitfall: `mandatory_rules.inline_rules` and `mandatory_rules.disable_default_globals` are **not** settable here. They are blocked fields: a `user.json` that tries to set them fails validation and is stripped with a `BlockedFieldWarning` at merge time. Repo overlay manifests (`.specialists/user/<name>.specialist.json`) use the **same allowlist** — they cannot propagate a change to these fields either (they warn and are ignored, even for a verbatim fork of the manifest). They are configurable only in the package-canonical manifest (`config/specialists/<name>.specialist.json`). Index `required/default_template_sets` policy is configured through `config/mandatory-rules/index.json` and its overlays, never through any specialist override.

### `execution.fallback_model`

- Type: `string | null`
- Default semantics: legacy single fallback. `null` means no singular fallback from this layer.
- Example:

```json
{
  "executor": {
    "execution": { "fallback_model": "openai-codex/gpt-5.4-mini" }
  }
}
```

Pitfall: if `fallback_models` is also set, plural wins.

### `execution.fallback_models`

- Type: `string[] | null`
- Default semantics: `null` inherits lower layers. Array values replace the singular fallback chain for that layer.
- Example:

```json
{
  "executor": {
    "execution": {
      "fallback_models": [
        "openai-codex/gpt-5.4-mini",
        "nano-gpt/moonshotai/kimi-k2.5"
      ]
    }
  }
}
```

Pitfall: fallback walk is transient-failure-only. Auth failures, prompt rejections, and other logical failures do not advance to the next provider.

## Preset reference syntax

Write a preset reference as an exact string inside the existing generated specialist entry:

```json
{
  "executor": {
    "execution": {
      "model": "@preset/cheap",
      "fallback_models": ["@preset/medium", "openai-codex/gpt-5.4-mini"]
    }
  }
}
```

Package presets live in `config/presets.json`. Current shipped names are `cheap`, `medium`, and `power`. User-defined preset files and repo-level preset shadowing are not part of this global override surface.

Preset references resolve transitively with depth cap 4. Cycles raise `SpecialistPresetCycleError` with the visited preset list. Unknown names raise `SpecialistPresetNotFoundError` and list known presets. Malformed preset payloads raise `SpecialistPresetTypeError` before the loader writes the resolved value into the merged specialist spec.

Only allowlisted override fields accept preset references. A blocked field such as `prompt.system` cannot smuggle a preset reference through `user.json`.

## Fallback chain semantics

Runtime model order is:

1. Primary `execution.model`.
2. `execution.fallback_models` entries when plural is present.
3. Legacy `execution.fallback_model` only when plural is absent.

Plural wins over singular in the same layer. A plural override in a higher layer replaces the lower layer's singular fallback chain because mixing singular and plural fallbacks across layers is ambiguous.

Each fallback step emits `fallback_step` telemetry with specialist, attempt number, tried model, error class, and whether the step was terminal. Chain walk only happens for transient failures such as rate limits, network errors, timeouts, and 5xx-class provider failures.

## `auto_commit` is fork-only by design

`auto_commit` is intentionally blocked from `user.json`. The package default is `checkpoint_on_waiting` for `executor` and `debugger`, which checkpoints work before these long-running specialists enter `waiting`. Silent loss is the failure mode this default prevents: a specialist can produce useful edits, pause for review, then be resumed or terminated before manual staging captures the work.

Change `auto_commit` only by forking the specialist into `.specialists/user/<name>.specialist.json` and editing that fork:

```bash
mkdir -p .specialists/user
cp config/specialists/executor.specialist.json .specialists/user/executor.specialist.json
# edit .specialists/user/executor.specialist.json and set auto_commit intentionally
```

Repo/user forks are explicit because `auto_commit` changes repository-write behavior for everyone using that fork.

## Initialization and strict JSON

Existing `~/.config/specialists/user.json` files auto-extend on the next `sp init --global` run. Existing values are preserved. Missing fields are filled with `null` defaults, and `_doc` points at `./overrides-guide.md`.

Generated files stay strict JSON. `sp init --global` does not write comments; it writes `_doc` as a top-level metadata key and writes this guide as `overrides-guide.md` next to `user.json`.

## Complete example (validates against `GlobalUserConfigSchema`)

This is a complete `user.json` shape, not a delta snippet. It keeps every required key from `sp init --global` and exercises `system_prompt_mode`, fallback chains, extension opt-out, and `@preset/<name>` references.

```json
{
  "_doc": "./overrides-guide.md",
  "executor": {
    "execution": {
      "model": "@preset/cheap",
      "fallback_model": null,
      "fallback_models": [
        "@preset/medium",
        "openai-codex/gpt-5.4-mini"
      ],
      "timeout_ms": null,
      "stall_timeout_ms": null,
      "interactive": true,
      "thinking_level": null,
      "max_retries": null,
      "prompt_limit_bytes": 8388608,
      "stdout_limit_bytes": null,
      "extensions": {
        "gitnexus": null
      }
    },
    "prompt": {
      "system_prompt_mode": "replace"
    },
    "stall_detection": {
      "waiting_auto_close_ms": 3600000
    },
    "beads_write_notes": null,
    "notes_mode": "final-only",
    "output_file": null,
    "skills": {
      "paths": []
    },
    "mandatory_rules": {
      "template_sets": ["git-workflow-safe", "per-turn-handoff-schema"]
    }
  }
}
```

## Cross-references

- Historical KAN-91 delta: `docs/upgrade-notes/kan-91-expanded-overrides.md`
- Origin doc: `docs/upgrade-notes/kan-90-global-user-config.md`
- KAN-91 epic: `unitAI-gp7nq`
- Phase 0 override machinery: `unitAI-gp7nq.1`
- Phase 1 user-environment fields: `unitAI-gp7nq.2`
- Phase 2 fallback chains: `unitAI-gp7nq.3`
- Phase 3 preset references: `unitAI-gp7nq.4`
- Follow-up reference-doc update: `unitAI-aav4w`
- Follow-up stale 4-layer wording fix: `unitAI-v4i0j`
