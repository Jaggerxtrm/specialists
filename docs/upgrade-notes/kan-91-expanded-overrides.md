# KAN-91 expanded overrides

## Preset references

User override fields that are already allowlisted can use `@preset/<name>` as a literal value. Example:

```json
{
  "executor": {
    "execution": {
      "model": "@preset/cheap",
      "fallback_models": ["@preset/cheap", "openai-codex/gpt-5.4"]
    }
  }
}
```

Preset references resolve from package `config/presets.json` only. User-defined preset files and repo-level preset shadowing are not supported in this phase.

Resolution is transitive and capped at depth 4; deeper chains or cycles fail fast because they usually indicate accidental config loops.
