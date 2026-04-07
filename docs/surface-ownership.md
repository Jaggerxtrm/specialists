# Surface Ownership: Which Installer Manages What

> Canonical reference for artifact ownership between `specialists init` and `xtrm install`.
> Each installed artifact has exactly one canonical owner. Both tools may read shared files,
> but only the owner creates or updates them.

## Ownership Map

| Artifact | Owner | Mechanism | Notes |
|---|---|---|---|
| `.specialists/default/*.specialist.json` | `specialists init` | Copy from `config/specialists/` | Never overwrite existing |
| `.specialists/user/*.specialist.json` | User | Manual creation | Not managed by any installer |
| `.specialists/jobs/` | Runtime | Auto-created by supervisor | Gitignored |
| `.claude/hooks/*.mjs` | `specialists init` | Copy from `config/hooks/` | specialists-complete, specialists-session-start |
| `.xtrm/hooks/*.mjs` | `xtrm install` | Managed by xtrm-tools | beads gates, quality checks, worktree boundary, statusline, etc. |
| `.xtrm/skills/default/` | `xtrm install` | Symlink to xtrm-tools package | All shared skill SKILL.md files |
| `.xtrm/skills/active/claude/` | `xtrm install` | Symlinks into `../../default/<skill>` | Claude-specific skill activation |
| `.xtrm/skills/active/pi/` | `xtrm install` | Symlinks into `../../default/<skill>` | Pi-specific skill activation |
| `.claude/skills/` | `xtrm install` | Symlink: `.claude/skills/ -> ../.xtrm/skills/active/claude` | Single symlink, xtrm owns the target tree |
| `.pi/skills/` | **split** | Directory with mixed content | See note below |
| `.claude/settings.json` | **both** | Additive merge | See "Shared File Protocol" below |
| `.mcp.json` | `specialists init` | Wires `specialists` MCP server entry | |
| `.gitignore` | `specialists init` | Appends specialists-specific entries | Jobs dir, db files |
| `CLAUDE.md` | `specialists init` | Appends `## Specialists` block | Only if marker absent |
| `config/specialists/` | Source of truth | Checked into specialists repo | Canonical specialist definitions |
| `config/hooks/` | Source of truth | Checked into specialists repo | Canonical hook scripts |
| `config/skills/` | Source of truth | Checked into specialists repo | Specialist-specific skills (using-specialists, specialists-creator) |

## .pi/skills/ — Split Ownership

`.pi/skills/` is currently a **directory** (not a symlink) with mixed content:
- `specialists-creator/` — copied by `specialists init` from `config/skills/`
- `using-specialists/` — copied by `specialists init` from `config/skills/`

This conflicts with the `.claude/skills/` pattern where xtrm owns the symlink tree.
**Resolution needed**: `specialists init` should stop copying skills to `.pi/skills/` and
instead place its skills in `.xtrm/skills/active/pi/` for xtrm to manage (see unitAI-3trs).

## .claude/settings.json — Shared File Protocol

Both installers write to `.claude/settings.json` but in **different sections**:

| Section | Owner | Content |
|---|---|---|
| `hooks.SessionStart` | `xtrm install` | using-xtrm-reminder, beads-compact-restore, quality-check-env, xtrm-session-logger |
| `hooks.PreToolUse` | `xtrm install` | worktree-boundary, beads-edit-gate, beads-commit-gate |
| `hooks.PostToolUse` | `xtrm install` | beads-claim-sync, quality-check (cjs + py), gitnexus, xtrm-tool-logger |
| `hooks.Stop` | `xtrm install` | beads-stop-gate, beads-memory-gate |
| `hooks.PreCompact` | `xtrm install` | beads-compact-save |
| `UserPromptSubmit` (top-level) | `specialists init` | specialists-complete.mjs |
| `SessionStart` (top-level) | `specialists init` | specialists-session-start.mjs |
| `PostToolUse` (top-level) | `specialists init` | specialists-complete.mjs |
| `enabledPlugins` | Claude Code | Plugin state |
| `extraKnownMarketplaces` | Claude Code / user | Marketplace sources |

**Current issue**: specialists init writes hooks as **top-level event keys** (flat format),
while xtrm writes them under the `hooks` object (structured format). Both formats work in
Claude Code, but this creates two parallel hook registries in the same file. Future cleanup
should consolidate into the `hooks` object format.

## Dependency Direction

```
xtrm-tools (foundation)
  └── specialists (depends on xtrm for skills, hooks, beads)
        └── .specialists/default/ (specialist configs, owned by specialists)
        └── .claude/hooks/ (specialist-specific hooks, owned by specialists)
        └── .xtrm/ (skills, hooks, beads — owned by xtrm)
```

`specialists init` should verify xtrm is installed (unitAI-wx6t) and refuse to run without it,
since specialists depends on xtrm for skill delivery, hook infrastructure, and beads tracking.

## Source of Truth Chain

```
config/specialists/*.specialist.json  →  .specialists/default/  (specialists init copies)
config/hooks/*.mjs                    →  .claude/hooks/         (specialists init copies)
config/skills/*/                      →  .xtrm/skills/active/   (should flow through xtrm, not direct copy)
xtrm-tools/.xtrm/skills/default/     →  .xtrm/skills/default/  (xtrm install symlinks)
.xtrm/skills/active/claude/          →  .claude/skills/         (xtrm install symlinks)
.xtrm/skills/active/pi/              →  .pi/skills/             (TODO: not yet wired as symlink)
```
