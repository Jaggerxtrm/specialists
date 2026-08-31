# MANDATORY_RULES

Rule sets injected at the end of every specialist prompt at spawn time. Enforces
behaviors the model must follow regardless of the specific task.

> **Quick introspection:** `sp list-rules` prints the rule × specialist matrix.
> Filter with `sp list-rules --rule <id>` or `sp list-rules --specialist <name>`,
> machine output via `--json`.

## Layout (four tiers)

The loader reads and unions indexes from four paths, in this precedence:

| Tier | Path | Writer | Role |
|------|------|--------|------|
| 1. User overlay | `.specialists/user/mandatory-rules/` | you (per-repo) | Highest-priority repo-specific additions and overrides. Wins on set-id conflict. |
| 2. Source | `config/mandatory-rules/` | specialists repo commits | Canonical source of truth. Ships with the tool. |
| 3. Canonical copy | `.specialists/default/mandatory-rules/` | `sp init --sync-defaults` | Mirror of canonical, placed in every downstream project. |
| 4. Overlay | `.specialists/mandatory-rules/` | you (per-repo) | Repo-specific additions and overrides. Wins on set-id conflict. |

A rule set defined in tier 4 overrides a same-id rule set from tier 3, 2, or 1,
letting a repo tailor or replace canonical rules without editing the source.

## What gets injected

At specialist spawn, the runner resolves sets from:

1. `required_template_sets` — always loaded
2. `default_template_sets` — always loaded (index-driven policy; `disable_default_globals` does NOT suppress these)
3. `specialist.mandatory_rules.template_sets` — per-specialist additions
4. `specialist.mandatory_rules.inline_rules` — per-specialist inline rules (no file)

The resulting block is appended to the rendered task prompt as
`## MANDATORY_RULES` with one `### <set-id>` section per set.

> **`disable_default_globals` scope:** it suppresses only the inline
> `STATIC_WORKFLOW_RULES_BLOCK` (the `## Beads Workflow Quick Rules` section
> emitted as `workflow-quick-rules`). It does **not** suppress index-driven
> sets — `default_template_sets` loads exactly like `required_template_sets`.
> True user-rules-only runs need `disable_default_globals: true` **and** a
> user overlay index in `.specialists/user/mandatory-rules/index.json` that
> clears required/default sets.

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

### Option 3 — global user override (selection only)

Users of shipped specialists can select the specialist-specific `template_sets`
without forking a repo-local manifest, via `~/.config/specialists/user.json`
(`sp edit --global` / `sp init --global`):

```json
// ~/.config/specialists/user.json
{
  "executor": {
    "mandatory_rules": {
      "template_sets": ["git-workflow-safe", "code-quality-defaults"]
    }
  }
}
```

Contract for the global field (`string[] | null`):

| Value | Effect |
|-------|--------|
| `null` (or absent) | Inherit the specialist's shipped `template_sets` |
| `[]` | Explicitly select **no** specialist-specific sets |
| non-empty array | Replace the shipped specialist-specific sets with this list |

In every case the index-driven policy is untouched: `required_template_sets`
and `default_template_sets` still load exactly as configured in the index
union. The global layer cannot set `inline_rules` or `disable_default_globals`
— those fields are rejected at the global surface and stripped with a warning
if they sneak into `user.json`. Repo-local full manifests (`.specialists/user/`)
retain full authority over all three fields.

## Keep repo-specific rules out of canonical

Canonical rules (`config/` tier) ship to every downstream project. If a rule
only applies to this repo (e.g. "use bunx here"), put it in
`.specialists/mandatory-rules/` (tier 3). Other repos won't see it.

## Budget

The injection block is capped at 2000 estimated tokens (`src/specialist/task-prompt.ts`).
Sections use a stable priority policy:

1. `must_keep`: `workflow-quick-rules`, `required_template_sets`, and specialist inline rules. These sections are never evicted.
2. `important`: `default_template_sets`.
3. `optional`: specialist `template_sets` that are not also required or default sets.

The compiler considers sections in priority order and preserves their original relative order in the final prompt. It evicts a section when adding that section would exceed the budget. If the `must_keep` floor exceeds the budget, prompt construction fails before a model session starts.

## Debugging

- Loader warnings appear on stderr prefixed `[specialist runner]`.
- The supervisor emits a `mandatory_rules_injection` meta event with final-payload section IDs, token estimates, digest, budget, and `full`, `degraded`, or `impossible` outcome data.
- Inspect any run's injection: `sp ps <job-id>` shows the metadata.
