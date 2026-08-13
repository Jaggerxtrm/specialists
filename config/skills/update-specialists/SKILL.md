---
name: update-specialists
description: >
  Reconcile specialists runtime drift and xtrm-managed asset drift across one repo or many.
  Use this skill when user says "update specialists", "specialists is out of date",
  "xtrm drift", "skills not updating", "assets out of date", or when operator needs
  guided refresh of specialists/xtrm state.
version: 2.1
synced_at: 2026-05-05
disable-model-invocation: true
---

# update-specialists

Interactive operator workflow for the two distribution tracks:

- **Category A — specialists runtime / npm-live assets**
  - specialist definitions
  - mandatory rules
  - tool catalogs
  - node configs
  - resolved by `sp` from the installed `@jaggerxtrm/specialists` package unless a repo intentionally overrides them
- **Category B — xtrm-managed filesystem assets**
  - skills under `.xtrm/skills/default/`
  - hooks under `.xtrm/hooks/default/`
  - active `.claude/skills`, `.pi/skills`, hook settings, and related registry-managed files
  - refreshed by `xt update`

Do not collapse these flows. Category A is specialists-owned and uses `sp` commands. Category B is xtrm-owned and uses `xt` commands.

No automatic destructive execution. Always summarize first and ask before applying refresh/prune actions.

## Quick Decision Tree

1. User says **specialist configs/rules/catalog/node behavior is stale** → run Category A flow.
2. User says **skills/hooks/Claude/Pi active files are stale** → run Category B flow.
3. User says **update specialists** with no detail → run both diagnostics, then present a combined plan.
4. User is in many repos → use root discovery and group results by repo.
5. `xt` missing → Category A can still run; Category B falls back to install/update guidance.
6. `sp` missing → tell user to install/upgrade `@jaggerxtrm/specialists`; do not claim runtime drift is fixed.

## Category A — Specialists Runtime / npm-live Flow

### A1) Verify package and command surface

Run in the target repo:

```bash
sp --version
sp doctor
sp doctor --check-drift
```

Use `specialists` instead of `sp` if the alias is unavailable.

Category A canonical source is the installed `@jaggerxtrm/specialists` npm package. To update it, upgrade/pin the package version:

```bash
npm install -g @jaggerxtrm/specialists@latest
# or project-local/package-managed pin, depending on repo policy
npm install -D @jaggerxtrm/specialists@<version>
```

Report the installed version and whether the repo is intentionally pinned.

### A2) Interpret `sp doctor --check-drift`

This checks stale `.specialists/default/` snapshots against package-canonical assets.

Typical statuses:

| Finding | Meaning | Action |
|---|---|---|
| redundant / byte-identical default | Local default snapshot duplicates package canonical | Safe to prune after review |
| diverged default | Local default differs from package canonical | Treat as intentional until operator confirms migration |
| missing package canonical | Installed package or registry is incomplete/stale | Upgrade/reinstall specialists package |
| user overlay | `.specialists/user/` custom asset | Preserve; never overwrite automatically |

### A3) Prune redundant Category A snapshots

Dry-run first:

```bash
sp prune-stale-defaults --dry-run
sp prune-stale-defaults --root <repo>
```

Only after operator confirmation, prune redundant defaults:

```bash
sp prune-stale-defaults --root <repo>
```

Rules:
- Never prune `.specialists/user/`.
- Never overwrite or delete diverged defaults without explicit operator approval.
- If a diverged default should become a customization, move/keep it as user-owned policy and document why.
- If the repo deliberately pins old behavior, leave `.specialists/default/` in place and record the pinned specialists version.

### A4) Validate runtime resolution

For specialist definitions and tool policy:

```bash
sp list --full
sp config show <specialist> --resolved
```

For mandatory rules/skills references in custom specialists, verify resolution from package canonical or project override:

```bash
sp config show <specialist> --resolved --from-source
```

Use `--from-source` only in a specialists source/worktree context where installed dist may lag local source.

## Category B — xtrm-managed Filesystem Asset Flow

### B1) Discover projects root

Ask for root if user did not name one.

Default order:
1. explicit user root,
2. `~/dev`,
3. git-discovered repo root / workspace root,
4. current directory as last fallback.

If multiple candidate roots exist, ask which one to use.

### B2) Run xtrm doctor

Use:

```bash
xt doctor --cwd <root> --json
```

If `xt` is unavailable, stop Category B and use fallback guidance below. Do not invent xtrm bulk commands.

### B3) Summarize Category B drift

Render a clean table grouped by repo:

| repo | status | drift | missing | mismatched | suggested action |
|---|---|---:|---:|---:|---|

Keep focus on operator action, not internal diagnostics.

### B4) Ask for confirmation

Offer three paths:
- dry-run only,
- refresh specific repos,
- refresh all repos.

If user names one repo, keep flow narrow and confirm only that repo.

### B5) Apply xtrm refresh

Dry-run:

```bash
xt update --root <root>
xt update --repo <repo>
```

Apply:

```bash
xt update --apply --root <root>
xt update --apply --repo <repo>
```

### B6) Re-run doctor

Run the same doctor command again after update:

```bash
xt doctor --cwd <root> --json
```

Confirm clean state or reduced-to-intentional drift.

## Combined Multi-repo Flow

When the operator asks broadly to "update specialists" across repos:

1. Choose projects root.
2. For each repo with specialists state:
   - run/record Category A status: `sp --version`, `sp doctor --check-drift` if available.
3. For each repo with `.xtrm/registry.json`:
   - run/record Category B status: `xt doctor --cwd <repo> --json`.
4. Present one combined table:

| repo | specialists pkg | Category A status | Category B status | recommended action |
|---|---|---|---|---|

Recommended action examples:
- upgrade `@jaggerxtrm/specialists`, then re-run `sp doctor --check-drift`,
- prune redundant `.specialists/default/` snapshots,
- preserve `.specialists/user/` customization,
- run `xt update --repo <repo> --apply`,
- no action.

## Fallbacks

### `sp` missing

Say Category A cannot be verified until specialists is installed:

```bash
npm install -g @jaggerxtrm/specialists@latest
```

If project policy uses local dev dependency, recommend the project-local package manager command instead.

### `xt` missing

Category A can still be checked with `sp`. For Category B, tell user:

```bash
npm install -g xtrm-tools@latest
xt install
xt doctor --cwd <repo> --json
```

Do not claim skills/hooks are synced without `xt` or a valid `.xtrm/registry.json`.

### `.xtrm/registry.json` missing

Report that xtrm-managed assets cannot be drift-checked in that repo until registry scaffold exists. Suggested action:

```bash
xt install
```

or pull a repo revision that tracks `.xtrm/registry.json`.

## Safety Rules

- Preserve `.specialists/user/` and any user-authored skill/hook layer.
- Treat `.specialists/default/` as compatibility/pinning surface, not normal fresh-repo state.
- Treat `.xtrm/skills/default/` and `.xtrm/hooks/default/` as managed output; do not hand-edit as the repair path.
- Prefer dry-run first when more than one repo will change.
- Keep Category A and Category B results separate in the final report.

## Output Shape

Use this order:
1. root/repo chosen,
2. specialists package version and Category A summary,
3. xtrm Category B summary,
4. combined drift table,
5. proposed actions,
6. explicit confirmation request,
7. commands run,
8. post-action verification,
9. residual manual work.

## Example Operator Loop

```text
Root: ~/dev

repo       sp version  Category A                  Category B              action
repo-a     3.13.0      redundant defaults: 4        skills drift: 2         prune A + xt update
repo-b     3.12.0      package behind latest        in-sync                 upgrade sp only
repo-c     3.13.0      user overlay only            hooks drift: 1          preserve user + xt update

Apply which actions? dry-run / selected repos / all
```

## Verification Checklist

After work:
- `sp doctor --check-drift` clean or reduced to intentional pins/overrides,
- `sp prune-stale-defaults --dry-run` shows no redundant defaults unless intentionally retained,
- `sp list --full` and selected `sp config show <name> --resolved` reflect package-live runtime,
- `xt doctor --cwd <root> --json` clean or reduced to intentional custom drift,
- single-repo case stays single-repo,
- missing-tool paths fall back cleanly.
