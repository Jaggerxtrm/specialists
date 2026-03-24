# Debugging a Specialist YAML That Doesn't Appear in `specialists list`

When a specialist YAML file you added doesn't show up in `specialists list`, work through these checks in order.

---

## 1. Verify the file is in a scanned directory

The loader scans exactly these directories (in priority order):

```
<project-root>/specialists/
<project-root>/.claude/specialists/
<project-root>/.agent-forge/specialists/
~/.agents/specialists/          (user scope)
```

Only directories that exist on disk are scanned. If your file is anywhere else — for example in `./agent-specs/` or `./config/specialists/` — it will never be found.

**Fix**: Move the file into `<project-root>/specialists/`.

---

## 2. Verify the filename ends with `.specialist.yaml`

The loader filters for files ending in exactly `.specialist.yaml`. Common mistakes:

- `my-agent.yaml` — missing `.specialist` infix
- `my-agent.specialist.yml` — wrong extension (`.yml` not `.yaml`)
- `my-agent.Specialist.yaml` — wrong casing

**Fix**: Rename to `<name>.specialist.yaml`.

---

## 3. Check stderr for a parse/validation error

When a YAML file fails to parse, the loader silently skips it and writes a warning to stderr:

```
[specialists] skipping /path/to/file.specialist.yaml: <reason>
```

Run list and capture stderr explicitly:

```bash
specialists list 2>&1 | grep -i skipping
```

If your file appears there, the reason shown is the validation error to fix.

---

## 4. Validate required fields and their formats

The schema enforces strict rules. Every specialist YAML must have:

| Field | Requirement |
|---|---|
| `specialist.metadata.name` | **kebab-case** (`^[a-z][a-z0-9-]*$`) — no uppercase, no underscores |
| `specialist.metadata.version` | **semver** (`1.0.0` format — three numeric parts) |
| `specialist.metadata.description` | non-empty string |
| `specialist.metadata.category` | non-empty string |
| `specialist.execution.model` | non-empty string |
| `specialist.execution.mode` | one of `tool`, `skill`, `auto` |
| `specialist.execution.permission_required` | one of `READ_ONLY`, `LOW`, `MEDIUM`, `HIGH` |
| `specialist.prompt.task_template` | non-empty string |

Common errors that cause silent skipping:

- `name: My_Agent` — fails kebab-case (`_` and uppercase not allowed)
- `version: "1.0"` — fails semver (needs three parts: `1.0.0`)
- Missing `execution.model` entirely
- Missing `prompt.task_template` entirely
- Top-level key is not `specialist:` (e.g. accidentally used `agent:`)

---

## 5. Validate your YAML syntax independently

A YAML parse error (bad indentation, unquoted special characters, etc.) will also cause the file to be skipped. Validate with:

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('specialists/my-agent.specialist.yaml'))" && echo OK
# or
npx js-yaml specialists/my-agent.specialist.yaml
```

---

## 6. Check for a name collision

If a specialist with the same `metadata.name` already exists in a higher-priority directory, the loader's deduplication (`seen` set, first-wins) will drop your file silently. Project-scope entries win over user-scope.

```bash
specialists list --json | python3 -c "import sys,json; [print(s['name'], s['filePath']) for s in json.load(sys.stdin)]"
```

If the name appears but points to a different file, rename your specialist.

---

## 7. Run `specialists doctor`

```bash
specialists doctor
```

This runs deeper checks — hook wiring, MCP registration, zombie jobs, and pi agent availability — and prints fix hints. It is the recommended first step for any unexplained `specialists` issue.

---

## 8. Minimal working example

If unsure what a valid file looks like, create `specialists/debug-test.specialist.yaml` with this minimal content and confirm it appears in `specialists list`:

```yaml
specialist:
  metadata:
    name: debug-test
    version: 1.0.0
    description: Minimal test specialist
    category: debug

  execution:
    mode: auto
    model: anthropic/claude-haiku-4-5
    permission_required: READ_ONLY

  prompt:
    task_template: |
      $prompt
```

Then incrementally add fields from your actual YAML until it breaks — that isolates the bad field.

---

## Summary checklist

- [ ] File is inside `specialists/`, `.claude/specialists/`, or `.agent-forge/specialists/` at the project root
- [ ] Filename ends in `.specialist.yaml`
- [ ] `specialists list 2>&1 | grep skipping` shows no entry for this file
- [ ] `metadata.name` is kebab-case (lowercase letters, digits, hyphens only)
- [ ] `metadata.version` is semver (`X.Y.Z`)
- [ ] `execution.model` is present
- [ ] `prompt.task_template` is present
- [ ] YAML syntax is valid (no indentation errors)
- [ ] No other specialist already uses the same `name`
- [ ] `specialists doctor` reports no blocking errors
