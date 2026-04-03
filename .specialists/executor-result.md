Implemented ✅

### Changes made

#### 1) Added richer fields to `specialists list` data model + JSON output
Updated `src/specialist/loader.ts` (`SpecialistSummary`) to include:

- `permission_required`
- `interactive`
- `thinking_level`
- `skills` (from `skills.paths`)
- `scripts` (from `skills.scripts`)
- `version` was already present and remains

These now flow through `specialists list --json` with schema-parity naming.

---

#### 2) Updated human-readable `specialists list` output
Updated `src/cli/list.ts` to render:

- permission badge: `[READ_ONLY] | [LOW] | [MEDIUM] | [HIGH]`
- interactive flag: `[interactive]` or `[non-interactive]`
- version line: `version: x.y.z`
- optional thinking level: `thinking: <level>`
- `skills:` block listing each `skills.paths` entry
- `scripts:` block listing each script in requested style:
  - `- run: <cmd-or-path>   phase: <pre|post>   inject_output: true` (shown when true)

Also ensured no tags/category were added to human output.

---

#### 3) Updated `sp/specialists list --help` style
Updated list help in `src/index.ts` to include:

- **Examples** section
- **More help** section

matching the broader CLI help style convention.

---

### Validation run

- `bun test tests/unit/cli/list.test.ts tests/integration/cli/attach.integration.test.ts` ✅
- `bun run lint` (`tsc --noEmit`) ✅

---

Also closed bead:

- `bd close unitAI-ebkf --reason="Implemented richer specialists list output (permission, interactive, version, thinking_level, skills, scripts) and updated list help format."`