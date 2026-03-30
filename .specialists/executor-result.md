Implemented ✅

### Changes made

- **`src/specialist/schema.ts`**
  - Added YAML option:
    - `beads_write_notes: z.boolean().default(true)`

- **`src/cli/run.ts`**
  - Added CLI flag parsing:
    - `--no-bead-notes`
  - Added `noBeadNotes` to `RunArgs`
  - Updated usage string to include new flag
  - Computes effective note-writing policy:
    - `false` when `--no-bead-notes` is present
    - otherwise from specialist YAML `beads_write_notes` (default `true`)
  - Passes policy through `RunOptions` as `beadsWriteNotes`

- **`src/specialist/runner.ts`**
  - Extended `RunOptions` with:
    - `beadsWriteNotes?: boolean`

- **`src/specialist/supervisor.ts`**
  - Updated note-writing logic:
    - **Owned bead** (`!inputBeadId`): always write notes
    - **External/input bead** (`inputBeadId`): write notes only when `beadsWriteNotes !== false`
  - This applies to both normal external-bead note writes and READ_ONLY append-to-input-bead behavior.

- **`src/index.ts`**
  - Updated `specialists run --help` output to document:
    - `--no-bead-notes`

### Tests updated

- **`tests/unit/specialist/schema.test.ts`**
  - Added coverage for `beads_write_notes` default and override.

- **`tests/unit/cli/run.test.ts`**
  - Added assertions for:
    - default `beadsWriteNotes: true`
    - `--no-bead-notes` forcing `false`
    - YAML `beads_write_notes: false` being respected

- **`tests/unit/specialist/supervisor.test.ts`**
  - Added tests ensuring:
    - external bead notes are skipped when `beadsWriteNotes: false`
    - owned beads still always get notes even when `beadsWriteNotes: false`

### Verification

Ran successfully:
- `bun --bun vitest run tests/unit/specialist/supervisor.test.ts tests/unit/cli/run.test.ts tests/unit/specialist/schema.test.ts`
- `bun run lint`

Also closed bead:
- `unitAI-sdnt`

---
Context: 74% used (approx 31k/42k tokens)