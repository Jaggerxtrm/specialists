Implemented ✅ batch specialist config operations via a new `specialists config` subcommand, plus `specialists edit --all`.

### What I changed

#### 1) New CLI: `specialists config`
**File:** `src/cli/config.ts`

Supports:

- `specialists config get <key>`
  - Reads key across all YAMLs in `config/specialists/`
- `specialists config set <key> <value>`
  - Sets key across all YAMLs in `config/specialists/`
- `specialists config set <key> <value> --name <specialist>`
  - Sets key only for one specialist YAML
- `--all` accepted explicitly (default behavior when `--name` is omitted)

Notes:
- Key format is dot-path, e.g. `specialist.execution.stall_timeout_ms`
- Values are YAML-parsed (`180000` → number, `true` → boolean, etc.)
- Preserves YAML structure/comments via `parseDocument()`

---

#### 2) Wire command into entrypoint
**File:** `src/index.ts`

Added:
- `config` subcommand dispatch
- `specialists config --help` text
- Top subcommand list includes `config`

---

#### 3) Top-level help updated
**File:** `src/cli/help.ts`

Added `config` to core commands and examples.

---

#### 4) `specialists edit --all`
**File:** `src/cli/edit.ts`

Added support for:
- `specialists edit --all`

Behavior:
- Opens all `config/specialists/*.specialist.yaml` in `$VISUAL`/`$EDITOR` (fallback `vi`)

---

### Tests added/updated

- **New:** `tests/unit/cli/config.test.ts`
  - get across all
  - set across all
  - set with `--name`
  - invalid args exits 1
- **Updated:** `tests/unit/cli/command-help.test.ts`
  - adds `config --help` coverage
- **Updated:** `tests/unit/cli/help.test.ts`
  - asserts `config` appears in core commands

---

### Validation run

Executed successfully:

- `npm run build`
- `npm run lint`
- `bun --bun vitest run tests/unit/cli/config.test.ts tests/unit/cli/command-help.test.ts tests/unit/cli/help.test.ts tests/unit/cli/edit.test.ts`

All passed.

---
Context: 62% used (approx 38k/61k tokens)