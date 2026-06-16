---
name: setup-specialists
description: >
  First-run setup workflow for a Specialists install. Use when the user says
  "setup specialists", "configure specialists", "change the specialist models",
  "models shipped do not exist on my machine", "set notes_mode globally", "opt
  out of Serena for one specialist", "sp init --global", "sp edit --global", or
  asks how to apply specialist overrides across all repos at once. Verifies
  local Pi models, explains the 3-layer field merge (package canonical →
  ~/.config/specialists/user.json → .specialists/user), bootstraps the global
  user.json via `sp init --global`, applies model + behavior overrides via
  `sp edit --global`, and validates with `sp doctor --specialists`.
version: 2.0
synced_at: 2026-06-16
---

# setup-specialists

KAN-90 shipped the global user-config layer at `~/.config/specialists/user.json`
on 2026-06-13. KAN-91 expanded the allowlist with fallback chains, preset refs,
extension opt-out, byte limits, the `_doc` sentinel, and per-spec `notes_mode` /
`output_file` overrides through 2026-06-15. Use this workflow after installing
`@jaggerxtrm/specialists` in a fresh environment, or whenever you want to set
model and runtime behavior **once for all repos** instead of forking
per-repo specs.

## The 3-layer field merge

Specialist resolution merges top-down:

1. **Package canonical** — `config/specialists/<name>.specialist.json` shipped
   in the npm package. Most fields are concrete defaults; `model` /
   `fallback_model` ship as `null` since KAN-90 part 2 because each operator
   has different providers.
2. **`~/.config/specialists/user.json`** — your global override. Per-spec
   sub-tree containing only the user-environment fields (allowlist below).
   Wins over package canonical.
3. **`.specialists/user/<name>.specialist.json`** — per-repo override. Wins
   over global. Can change any field (including ones blocked from global).

The retired `.specialists/default/<name>.specialist.json` mirror is no longer
walked (commit `31a6421c`). Stale entries surface in `sp doctor --check-drift`
and are pruned by `sp prune-stale-defaults`.

`sp edit <name> …` writes to a repo-local file (forks from package if no
`.specialists/user/<name>.specialist.json` exists yet).
`sp edit --global <name>.<field> <value>` writes to `~/.config/specialists/user.json`.

## When to use `--global` vs per-repo

| Need | Layer |
|---|---|
| Your provider's models, set once for everywhere | `--global` |
| Extension opt-out (e.g. no Serena for transcriber) | `--global` |
| `notes_mode` / `output_file` for chained pipelines | `--global` |
| `thinking_level`, byte limits, fallback chains | `--global` |
| Different model just for this repo | per-repo |
| Override a field NOT allowlisted at the global layer (see below) | per-repo |

## Workflow

### 1) Bootstrap `~/.config/specialists/user.json`

```bash
sp init --global
```

What it does (idempotent — safe to re-run):

- Creates `~/.config/specialists/user.json` if missing.
- For every specialist in the resolved registry, seeds an entry with `null`
  placeholders for the allowed user-environment fields.
- Writes a `_doc` sentinel at the top pointing at
  `~/.config/specialists/overrides-guide.md`.
- (Re)generates `overrides-guide.md` with the full field reference.
- Preserves existing user values — only newly-discovered specialists get fresh
  placeholders on re-run.

Output reports "preserved N existing specialists (user values kept)" when a
file already existed.

### 2) Check your local model fleet

```bash
pi --list-models           # what your pi installation actually exposes
sp doctor --specialists    # which specialists still have null model after merge
```

`sp doctor --specialists` reports e.g. `30/31 specialists have a model
configured` — only `bare` (the template) is expected to remain null after a
full setup.

### 3) Apply global overrides

The reliable form is `--set` with the dot-path:

```bash
sp edit --global --set <name>.<dot.path> <value>
```

The bare positional form (`sp edit --global <name>.field value`) currently
falls through to `$EDITOR` in some environments (open follow-up). Prefer
`--set` in scripts and one-liners.

**Fields the global layer may set** (`OVERRIDE_ALLOWED_*` in
`src/specialist/schema.ts` + `GlobalSpecialistOverrideSchema` in
`src/specialist/global-config.ts`):

| Dot-path | Type | Notes |
|---|---|---|
| `<name>.execution.model` | string | Required for dispatch. Use a real `pi --list-models` id or a `@preset/<name>` ref. |
| `<name>.execution.fallback_model` | string \| null | Legacy singular fallback. |
| `<name>.execution.fallback_models` | string[] \| null | Plural chain (KAN-91 Phase 2). Walked **only on transient failures** (rate limits, network errors, 5xx). Plural wins over singular. |
| `<name>.execution.timeout_ms` | number \| null | Per-spec timeout. |
| `<name>.execution.stall_timeout_ms` | number \| null | Stall-detection threshold. |
| `<name>.execution.thinking_level` | enum \| null | `off \| minimal \| low \| medium \| high \| xhigh`. **Leave `null` to inherit pi's `defaultThinkingLevel` (typically `high`)**. Forcing `off` on Kimi-class models silently produces empty assistant text. |
| `<name>.execution.max_retries` | number \| null | Transient-retry budget. |
| `<name>.execution.prompt_limit_bytes` | number \| null | Script-runner prompt-size guard (~4 MB default). |
| `<name>.execution.stdout_limit_bytes` | number \| null | Script-runner stdout cap (~32 MB default). |
| `<name>.execution.extensions.serena` | bool \| null | `false` to skip Serena MCP injection for this spec (RAM saver on non-LSP roles). |
| `<name>.execution.extensions.gitnexus` | bool \| null | `false` to skip GitNexus MCP injection. |
| `<name>.prompt.system_prompt_mode` | enum \| null | `append` (default for package specs) or `replace`. |
| `<name>.beads_write_notes` | bool \| null | `false` to disable auto-append to input bead notes. |
| `<name>.notes_mode` | enum \| null | `full-trail` (default) or `final-only` — see [Handoff modes](#handoff-modes). |
| `<name>.output_file` | string \| null | Path to write the rendered handoff block. **No env flag required** since `unitAI-f58ma`. |

**Blocked at the global layer** (these MUST be overridden per-repo via
`.specialists/user/<name>.specialist.json` if needed):
`execution.permission_required`, `execution.bare`, `mandatory_rules`,
`capabilities`, `output_schema`, `auto_commit`, `prompt.system`,
`prompt.task_template`, `skills.scripts`.

A blocked field that sneaks in is **applied with a warning** (forward compat,
v1) and surfaced by `sp doctor --specialists` as
`blocked-field overrides present in repo layers`. Fork to a per-repo spec to
clear the warning.

### 4) Preset references (KAN-91 Phase 3)

Instead of hard-coding model ids, point to a named preset:

```bash
sp edit --global --set executor.execution.model @preset/medium
sp edit --global --set executor.execution.fallback_models '["@preset/cheap"]'
```

Built-in presets ship in the package. Show what's available:

```bash
sp edit --list-presets
```

Typical names: `cheap`, `medium`, `power`. Update the preset definition once
and every spec referencing it picks up the new model on next dispatch.

Resolution depth cap = 5 levels; cycles surface a structured error at dispatch.

### 5) Verify and smoke

```bash
sp doctor --specialists                # 30/31 should have model configured
sp config show <name> --resolved        # see merged spec for one specialist
sp list --full                          # human view of the registry
```

Optionally ping each chosen model:

```bash
pi --model <provider>/<model> --print "ping"   # must reply: pong
```

## Handoff modes

`notes_mode` controls how the rendered handoff block lands in the input bead
notes **and** in the spec's `output_file`. Both are fed from a single source
(`turn_summary.text_content`) so there is no divergence.

The supervisor renders markdown-native blocks (no emoji, no dividers):

```
### service-skills-sync · kimi-k2.5 · [turn 12 · WAITING]   ← H3 per-turn
<assistant output verbatim>
_turn 12 · 8413 ms · 4222 to 167 tok · 2026-06-16 02:11 · git fc9168e2_

## service-skills-sync · kimi-k2.5 · [FINAL · DONE]        ← H2 canonical, greppable
<final assistant output verbatim>
_final · 107106 ms · 18269 to 468 tok · 2026-06-16 02:13 · git fc9168e2_
```

| Mode | Bead notes | `output_file` |
|---|---|---|
| `full-trail` (default) | Append every turn's H3 WAITING block + the H2 FINAL block | Append per turn |
| `final-only` | Persist only the H2 FINAL block; intermediate turns are skipped | **Overwritten** with just the FINAL block on each run |

Recipe for a chained non-coding pipeline where the next specialist reads the
previous one's note:

```bash
sp edit --global --set sync-docs.notes_mode final-only
sp edit --global --set sync-docs.output_file ".specialists/sync-docs-result.md"
echo '.specialists/*-result.md' >> .gitignore   # avoid committing the artifact
```

For a human-monitored keep-alive role, leave `notes_mode: null` (= default
`full-trail`) so you see the trail accumulate in `bd show <id>`.

## Common pitfalls

- **`sp edit --global <name>.<dot.path> <value>` falls through to vim in some
  environments**. Use `--set` explicitly: `sp edit --global --set <name>.field value`.
- **`thinking_level: "off"` silently breaks some thinking-class models** —
  Kimi-via-nano-gpt verified emitting empty assistant text (`char_count: 1`)
  after multi-tool runs when forced to `off`. Leave it `null` (inherit pi's
  `defaultThinkingLevel`) unless you have a documented reason.
- **Provider auth missing** — if you assign `anthropic/*` models but Anthropic
  OAuth is not configured in your pi setup, dispatch fails without a
  user-friendly error. Verify with `pi --print --model <…> "ping"` first.
- **Repo override shadowing global** — `.specialists/user/<name>.specialist.json`
  wins over global. If your global model doesn't take effect, run
  `sp config show <name> --resolved` and look for `source: user` rows to find
  the shadowing layer.
- **Stale `.specialists/default/` entries from pre-KAN-90 installs** — the
  loader no longer walks them, but they confuse human readers. Run
  `sp prune-stale-defaults` to clean.

## Reference files

| Path | Role |
|---|---|
| `~/.config/specialists/user.json` | Your global config |
| `~/.config/specialists/overrides-guide.md` | Auto-generated field reference (rewritten by every `sp init --global`) |
| `docs/upgrade-notes/kan-90-global-user-config.md` | KAN-90 design + migration |
| `docs/upgrade-notes/kan-91-expanded-overrides.md` | KAN-91 design + field reference |
| `src/specialist/global-config.ts` | `GlobalSpecialistOverrideSchema` + `mergeGlobalUserConfig` |
| `src/specialist/schema.ts` | `OVERRIDE_ALLOWED_*` constants + per-spec schema |
| `src/specialist/loader.ts` | 3-layer merge implementation |
| `src/cli/init.ts`, `src/cli/edit.ts`, `src/cli/doctor.ts` | CLI surface |

## Report template

```
KAN-91 global setup result:
- ~/.config/specialists/user.json: <created|preserved-and-augmented>
- Specialists with model configured: <N/31>
- Per-spec overrides applied (model): <list>
- Preset refs in use: <list or none>
- notes_mode set globally for: <list or none>
- output_file set globally for: <list or none>
- Extension opt-out (serena/gitnexus): <list per spec>
- Caveats / models that failed pi --list-models check: <list or none>
- Per-repo overrides still in .specialists/user that shadow global: <list or none>
```

## Related skills

- `specialists-creator` — authoring NEW specialists or editing per-spec fields
  not allowlisted at the global layer. The global override layer reuses the
  same per-spec field semantics; see its §"Global User Override Layer
  (KAN-90/91)" section for the dot-path syntax mapping.
- `using-specialists-v3` — orchestration discipline once specialists are
  configured.
