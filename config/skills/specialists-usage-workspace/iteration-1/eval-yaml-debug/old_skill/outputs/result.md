# Debugging: Specialist YAML Not Showing in `specialists list`

## How Discovery Works

`specialists list` uses `SpecialistLoader` which scans these directories in order:

1. `<project-root>/specialists/`
2. `<project-root>/.claude/specialists/`
3. `<project-root>/.agent-forge/specialists/`
4. `~/.agents/specialists/` (user scope)

Only directories that physically exist are scanned. Within each directory, only files ending in `.specialist.yaml` are loaded.

---

## Checklist: Why Your File Is Not Appearing

Work through these checks in order.

### 1. File is in the wrong location

The file must be in one of the scanned directories listed above. The most common location is `<project-root>/specialists/`.

Check:
```bash
ls specialists/*.specialist.yaml
```

If your file is somewhere else (e.g., `./my-specialist.yaml`, `./config/specialists/foo.yaml`), move it:
```bash
mv my-specialist.yaml specialists/my-specialist.yaml
```

### 2. File name does not end in `.specialist.yaml`

The loader filters for the exact suffix `.specialist.yaml`. A file named `foo.yaml` or `foo.specialist.yml` will be silently ignored.

Rename if needed:
```bash
mv specialists/foo.yaml specialists/foo.specialist.yaml
```

### 3. YAML parse or schema validation error (most common cause)

When a file fails to parse or fails Zod schema validation, it is **silently skipped** with a warning printed to stderr only. You will not see it in normal `specialists list` output.

Run this to surface the warning:
```bash
specialists list 2>&1 | grep skipping
```

Or redirect stderr directly:
```bash
specialists list 2>/tmp/spec-errors.txt; cat /tmp/spec-errors.txt
```

#### Required schema fields

Every `.specialist.yaml` must have this top-level structure:

```yaml
specialist:
  metadata:
    name: my-specialist        # kebab-case: lowercase letters, digits, hyphens only
    version: 1.0.0             # semver: X.Y.Z
    description: "..."
    category: "..."

  execution:
    model: anthropic/claude-sonnet-4-6   # required
    # mode defaults to 'auto', timeout_ms defaults to 120000

  prompt:
    task_template: |           # required
      $prompt
```

Common schema violations that cause silent skips:

| Problem | Error message contains |
|---------|----------------------|
| `name` not kebab-case (e.g. `My Specialist`, `mySpecialist`) | `Must be kebab-case` |
| `version` not semver (e.g. `1.0`, `v1.0.0`) | `Must be semver` |
| Missing `execution.model` | `Required` |
| Missing `prompt.task_template` | `Required` |
| Top-level key is not `specialist:` | `Required` |
| YAML syntax error (bad indentation, unquoted special chars) | YAML parse error |

### 4. A duplicate name already exists in a higher-priority scope

The loader uses a "first wins" strategy. If a specialist with the same `metadata.name` already exists in a directory scanned earlier (e.g., `specialists/` before `.claude/specialists/`), the duplicate is silently dropped.

Check for name collisions:
```bash
specialists list --json | grep '"name"'
grep -r "^    name:" specialists/ .claude/specialists/ 2>/dev/null
```

### 5. The `specialists/` directory does not exist yet

If no `.specialist.yaml` files have been added before, the `specialists/` directory may not exist. The loader skips non-existent directories without error.

Fix:
```bash
specialists init    # creates specialists/ and bootstraps the project
```

### 6. Running `specialists list` from the wrong working directory

`SpecialistLoader` resolves project directories relative to `process.cwd()`. If you run `specialists list` from a subdirectory, it will not find files in the project root's `specialists/` folder.

Always run from the project root:
```bash
cd /path/to/your/project
specialists list
```

---

## Quick Diagnostic Commands

```bash
# 1. Show all stderr warnings (skipped files with reasons)
specialists list 2>&1 >/dev/null

# 2. Show full output including errors
specialists list 2>&1

# 3. Verify the file exists with correct suffix
ls -la specialists/*.specialist.yaml

# 4. Validate YAML syntax manually
node -e "require('yaml').parse(require('fs').readFileSync('specialists/my-specialist.yaml','utf8'))"

# 5. Run doctor for broader environment checks
specialists doctor
```

---

## Example: Minimal Valid Specialist YAML

```yaml
specialist:
  metadata:
    name: my-specialist
    version: 1.0.0
    description: "Does something useful."
    category: analysis

  execution:
    model: anthropic/claude-sonnet-4-6

  prompt:
    task_template: |
      $prompt
```

Save as `specialists/my-specialist.specialist.yaml` in your project root, then run `specialists list` — it should appear immediately.
