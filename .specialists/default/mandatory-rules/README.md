# MANDATORY_RULES

Rule sets injected at the end of every specialist prompt at spawn time. Enforces
behaviors the model must follow regardless of the specific task.

## Layout (three tiers)

The loader reads and unions indexes from three paths, in this precedence:

| Tier | Path | Writer | Role |
|------|------|--------|------|
| 1. Source | `config/mandatory-rules/` | specialists repo commits | Canonical source of truth. Ships with the tool. |
| 2. Canonical copy | `.specialists/default/mandatory-rules/` | `sp init --sync-defaults` | Mirror of canonical, placed in every downstream project. |
| 3. Overlay | `.specialists/mandatory-rules/` | you (per-repo) | Repo-specific additions and overrides. Wins on set-id conflict. |

A rule set defined in tier 3 overrides a same-id rule set from tier 2 or 1,
letting a repo tailor or replace canonical rules without editing the source.

## What gets injected

At specialist spawn, the runner resolves sets from:

1. `required_template_sets` — always loaded
2. `default_template_sets` — loaded unless `mandatory_rules.disable_default_globals: true` on the specialist
3. `specialist.mandatory_rules.template_sets` — per-specialist additions
4. `specialist.mandatory_rules.inline_rules` — per-specialist inline rules (no file)

The resulting block is appended to the rendered task prompt as
`## MANDATORY_RULES` with one `### <set-id>` section per set.

## Authoring a rule set

Create `<your-set>.md` in one of the three tiers. File format:

```markdown
---
name: <your-set>
kind: mandatory-rule
rules:
  - id: my-rule-1
    level: required
    text: "Single-line rule text. Use quotes if it contains colons."
  - id: my-rule-2
    level: warn
    text: "Another rule."
    when: "optional guard, e.g. 'node > 20'"
---
```

- **`id`** — stable identifier, shown in the rendered block. Auto-filled from `<set-id>-<n>` if omitted.
- **`level`** — `required`, `error`, `warn`, `info`. Display only; the model treats them as priority hints.
- **`text`** — one-line rule (multi-line supported via YAML `|` block).
- **`when`** — optional conditional context.

**Shorthand**: a file with only a body (no `rules:` frontmatter) is loaded as
a single rule with `level: required` and the body as `text`.

## Wiring a set

### Option 1 — via index.json (applies to all specialists)

Add the set id to the index in the tier you're writing to. Tier-3 example:

```json
// .specialists/mandatory-rules/index.json
{
  "required_template_sets": [],
  "default_template_sets": ["my-repo-rule"]
}
```

Index files are union-merged across tiers; dedup by set id.

### Option 2 — per specialist

Reference the set id in the specialist's JSON:

```json
// config/specialists/<name>.specialist.json
{
  "specialist": {
    "mandatory_rules": {
      "template_sets": ["my-set"],
      "inline_rules": [
        { "id": "xtra-1", "level": "required", "text": "One-off rule inline." }
      ],
      "disable_default_globals": false
    }
  }
}
```

## Keep repo-specific rules out of canonical

Canonical rules (`config/` tier) ship to every downstream project. If a rule
only applies to this repo (e.g. "use bunx here"), put it in
`.specialists/mandatory-rules/` (tier 3). Other repos won't see it.

## Budget

The full injection block is capped at ~2000 tokens (`src/specialist/runner.ts`).
Over-budget: the block is skipped and a warning is logged.

## Debugging

- Loader warnings appear on stderr prefixed `[specialist runner]`.
- The supervisor emits a `mandatory_rules_injection` meta event on every run
  with `sets_loaded`, `rules_count`, `inline_rules_count`, `token_estimate`.
- Inspect any run's injection: `sp ps <job-id>` shows the metadata.
