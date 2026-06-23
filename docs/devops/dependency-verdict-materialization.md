# Dependency verdict materialization

`node scripts/materialize-dependency-verdict.mjs --input <verdict.json>` converts a dependency verdict JSON into a substrate issue plan.

## Defaults

- Dry-run is the default.
- `--apply` is required before any `bd` issue is created.
- Input must include a verdict, a source dependency-update bead id, and `case_json_path` evidence.

## Mapping

| Verdict | Materialized class | Issue type | Priority | Linking |
|---|---|---:|---:|---|
| `PASS_WITH_NOTES` | `class:advisor` | `decision` | P3 | `discovered-from:<source>` |
| `COOLDOWN` | `class:followup` | `task` | P3 | `discovered-from:<source>` |
| `NEEDS_CHANGES` | `class:followup` | `task` | P2 | `discovered-from:<source>` |
| `BLOCKED` | `class:gate` | `task` | P1 | `discovered-from:<source>` plus `gate --blocks <source>` |
| `SECURITY_FORCED` | `class:gate` | `task` | P0 | `discovered-from:<source>` plus `gate --blocks <source>` |

## Edge conventions

- Follow-ups use `discovered-from`, never `blocks`.
- Validation issues use `validates` when the verdict JSON supplies `validation_issue_ids`.
- Gate issues are the only materialized issues that add a blocking edge back to the source dependency-update bead.
- Advisor issues are non-blocking provenance artifacts; they still keep `discovered-from` so the dependency update remains the source context.

## Evidence refs

The materialized description always includes:

- `case_json_path`
- `upgrade_dossier_ref` when present
- `pr_comment_ref` when present
- `external_ref` when present

## Example

```bash
node scripts/materialize-dependency-verdict.mjs \
  --input /tmp/dependency-verdict.json

node scripts/materialize-dependency-verdict.mjs \
  --input /tmp/dependency-verdict.json \
  --apply
```
