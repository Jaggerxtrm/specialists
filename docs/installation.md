---
title: Installation and Distribution
scope: installation
category: guide
version: 1.0.2
updated: 2026-06-24
synced_at: bf6baf7a
description: Canonical-from-package install model, global user config, user overlays, and managed xtrm assets.
source_of_truth_for:
  - package.json
  - src/specialist/canonical-asset-resolver.ts
  - src/cli/init.ts
  - docs/skills.md
  - docs/hooks.md
domain:
  - installation
  - distribution
---

# Installation and Distribution

## Runtime requirement: Bun

Specialists is Bun-only. Require Bun >= 1.0.0 before installing or running the package.

Verify:

```bash
bun --version
```

Install Bun if missing:

```bash
curl -fsSL https://bun.sh/install | bash
```


Specialists now uses a two-category distribution model. Install or upgrade the npm package to choose the canonical Specialist runtime version; do not copy default files into every repository as the normal path.

## Prerequisites and install order

Specialists uses xtrm-tools as a runtime prerequisite, not a normal npm dependency. Keep it installed separately so `specialists init` can verify `xt` and manage `.xtrm/`.

Ordered install flow:

1. Install Bun.
2. Install xtrm-tools globally: `npm install -g xtrm-tools`
3. Run `xt install`
4. Run `xt init` in this repo
5. Install Specialists: `npm install -g @jaggerxtrm/specialists`
6. Run `sp init --global` if you want machine-level user config
7. Run `sp init`

Category A and bootstrap note:
- `sp list`, `sp doctor --check-drift`, and `sp prune-stale-defaults` are Category A commands.
- They do not require `xt` or `.xtrm/`.

### Naming and prerequisite policy

- Specialists ships as the scoped package `@jaggerxtrm/specialists`. Binaries: `specialists` and `sp` (alias).
- xtrm-tools is a separate published package; the canonical name is `xtrm-tools` and its CLI is `xt`.
- Specialists does NOT declare xtrm-tools as a normal dependency, devDependency, or peerDependency. It is recorded as a runtime prerequisite in the underscore-prefixed `_runtime_prerequisites` field in `package.json` (npm ignores underscore-prefixed top-level fields), and enforced at runtime by `sp init` via `assertXtrmPrerequisites` in `src/cli/init.ts`.
- `sp init --global` sets up machine-level user config. Use it once per operator account when you want shared personal defaults; plain `sp init` stays repo-local.
- Rationale: a normal/peer dependency on xtrm-tools would couple specialists publishes to xtrm-tools version cuts and risk transitive-bin ambiguity. Operators install both packages globally; `xt --version` is the source of truth for xtrm CLI presence.
- Migration: legacy installs that depended on `xtrm-tools` transitively should switch to explicit global install per the ordered flow above.

GitHub CI now includes a package-payload smoke gate that packs the tarball, asserts required runtime assets are present, installs into an isolated prefix, and runs `sp --version`, `sp doctor --check-drift`, `sp prune-stale-defaults --dry-run`, `sp clean --dry-run`, and `sp list --compact` to catch payload regressions before publish.

## Category A: runtime-resolved package assets

Category A assets are read by the `sp` runtime itself:

- specialist definitions from `config/specialists/`
- mandatory rules from `config/mandatory-rules/`
- tool catalog files from `config/catalog/` / `.specialists/catalog/` override
- node configs

The loader resolves them live from the installed package when a repo has no intentional override. Precedence is:

```text
.specialists/user/ > .specialists/default/ > config/<kind>/ > package canonical > legacy
```

For new repositories this means no default snapshot is required. Pin the canonical runtime version with `package.json` / lockfile by depending on the desired `@jaggerxtrm/specialists` version; global installs only choose which package version is active on the machine. Put custom project definitions in `.specialists/user/`; they intentionally outrank package canonical assets.

`sp init --sync-defaults` is deprecated. It still works as a compatibility alias, but it prints a loud warning because it creates drift debt.

`.specialists/default/` stays empty by default. Populate it only when you intentionally pin a specialist, mandatory rule, or node config for repo-local override.

Use `sp pin <id>` for intentional pins when available; otherwise copy the specific asset into `.specialists/default/` only for an operator-approved override.

## Category B: filesystem-bound xtrm-managed assets

Category B assets must exist on disk because external tools read them directly:

- skills under `.xtrm/skills/default/` and the active `.claude/skills` / `.pi/skills` surfaces
- hooks under `.xtrm/hooks/default/` and `.claude/settings.json` hook wiring

xtrm-tools owns these snapshots. Check drift with:

```bash
xt doctor --cwd <repo-or-root> --json
```

Refresh one repo or many with:

```bash
xt update --repo <repo> --apply
xt update --root <projects-root> --apply
```

Omit `--apply` for a dry run. See [skills.md](skills.md), [hooks.md](hooks.md), and the `update-specialists` skill for the operator-facing flow.

## Pin a specialist version

If you need to keep one specialist pinned in a repo, copy it into the user layer before pruning defaults:

```bash
cp .specialists/default/<name>.specialist.json .specialists/user/
sp prune-stale-defaults
```

User overlays stay untouched by prune.

## Migrating existing repositories

1. Upgrade the `@jaggerxtrm/specialists` package version you want to run.
2. Run `sp doctor --check-drift` to find stale Category A snapshots in `.specialists/default/`.
3. Run `sp prune-stale-defaults` to remove stale default mirrors. Add `--keep-diverged` if you want to preserve intentional pins.
4. Run `xt doctor --cwd <repo> --json` for Category B drift.
5. Run `xt update --repo <repo> --apply` or `xt update --root <projects-root> --apply` after operator confirmation.

Do not move user-authored specialists, skills, or hooks into default mirrors. User-owned layers are custom policy, not drift.

## See also

- [authoring.md](authoring.md)
- [manifest.md](manifest.md)
- [skills.md](skills.md) — xtrm-managed skill install and update flow
- [hooks.md](hooks.md)
- [cli-reference.md](cli-reference.md)
