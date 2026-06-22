# KAN-91 / unitAI-gp7nq — Expanded global overrides

For the current canonical reference, see [`docs/overrides-guide.md`](../overrides-guide.md). This page documents the KAN-91 delta only.

KAN-91 expands the KAN-90 global `user.json` layer from model-only tuning into a per-user environment override surface. The new surface adds user-owned knobs for prompt composition, extension injection, notes/output behavior, prompt/stdout limits, fallback model chains, and `@preset/<name>` references. Specialist identity and safety fields remain blocked.

## Overview

This expansion adds:

- Six allowlisted user-environment fields: `prompt.system_prompt_mode`, `execution.extensions.serena`, `execution.extensions.gitnexus`, `notes_mode`, `output_file`, `execution.prompt_limit_bytes`, and `execution.stdout_limit_bytes`.
- Follow-up fields now also exposed in the live global layer: `execution.interactive` and `stall_detection.waiting_auto_close_ms`.
- Fallback chains via `execution.fallback_models` while keeping legacy `execution.fallback_model`.
- Preset references like `@preset/cheap` for model and fallback entries.
- A top-level `_doc` sentinel in generated `user.json` pointing back to this guide. Keys starting with `_` are metadata, not specialist names.

The examples below are delta snippets to add inside an existing specialist entry from `sp init --global`; they are not complete standalone `user.json` files. Keep the surrounding generated entry shape, including its `execution`, `prompt`, `stall_detection`, `beads_write_notes`, and `skills` keys, and change only the highlighted field.

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

### `execution.extensions.serena`

- Type: `boolean | null`
- Default semantics: `null` inherits the shipped extension setting.
- Example:

```json
{
  "executor": {
    "execution": { "extensions": { "serena": false } }
  }
}
```

Pitfall: extension overrides are per-key overlays. Setting `serena: false` does not change `gitnexus`.

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

Package presets live in `config/presets.json`. Current shipped names are `cheap`, `medium`, and `power`. User-defined preset files and repo-level preset shadowing are not part of KAN-91.

Preset references resolve transitively with depth cap 4. Cycles raise `SpecialistPresetCycleError` with the visited preset list. Unknown names raise `SpecialistPresetNotFoundError` and list known presets. Malformed preset payloads raise `SpecialistPresetTypeError` before the loader writes the resolved value into the merged specialist spec.

Only allowlisted override fields accept preset references. A blocked field such as `prompt.system` cannot smuggle a preset reference through `user.json`.

## Fallback chain semantics

Runtime model order is:

1. Primary `execution.model`.
2. `execution.fallback_models` entries when plural is present.
3. Legacy `execution.fallback_model` only when plural is absent.

Plural wins over singular in the same layer. A plural override in a higher layer replaces the lower layer's singular fallback chain because mixing singular and plural fallbacks across layers is ambiguous.

Each fallback step emits `fallback_step` telemetry with specialist, attempt number, tried model, error class, and whether the step was terminal. Chain walk only happens for transient failures such as rate limits, network errors, timeouts, and 5xx-class provider failures.

## Migration

Existing `~/.config/specialists/user.json` files auto-extend on the next `sp init --global` run. Existing values are preserved. Missing fields are filled with `null` defaults, and `_doc` is added if absent.

Generated files stay strict JSON. `sp init --global` does not write comments; it writes `_doc` as a top-level metadata key instead.

## Complete example (validates against `GlobalUserConfigSchema`)

This is a complete `user.json` shape, not a delta snippet. It keeps every required key from `sp init --global` and exercises `system_prompt_mode`, fallback chains, extension opt-out, and `@preset/<name>` references.

```json
{
  "_doc": "See docs/upgrade-notes/kan-91-expanded-overrides.md for expanded override fields.",
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
        "serena": false,
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
    }
  }
}
```

## Cross-references

- Origin doc: `docs/upgrade-notes/kan-90-global-user-config.md`
- KAN-91 epic: `unitAI-gp7nq`
- Phase 0 override machinery: `unitAI-gp7nq.1`
- Phase 1 user-environment fields: `unitAI-gp7nq.2`
- Phase 2 fallback chains: `unitAI-gp7nq.3`
- Phase 3 preset references: `unitAI-gp7nq.4`
- Follow-up reference-doc update: `unitAI-aav4w`
- Follow-up stale 4-layer wording fix: `unitAI-v4i0j`
