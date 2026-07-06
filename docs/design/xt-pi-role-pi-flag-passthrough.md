# `xt pi --role` ↔ `pi` runtime flag passthrough

**Context:** `xt pi --role <name>` (xtrm-tools/core PR #362, branch
`feature/xtrm-yd1p1-pi-role-launcher`) launches a `pi` interactive session in
a worktree. The current implementation forwards **zero flags** to the pi
subprocess (`cli/src/utils/worktree-session.ts:373`):

```ts
const runtimeCmd = runtime === 'claude' ? 'claude' : 'pi';
const runtimeArgs = runtime === 'claude' ? ['--dangerously-skip-permissions'] : [];
const launchResult = spawnSync(runtimeCmd, runtimeArgs, { cwd: worktreePath, stdio: 'inherit' });
```

xt pi's own flags today: `[name]`, `--role <name>`, `--bead <id>`, `--no-attach`.
Everything `pi` accepts (`pi --help`) is currently unreachable through xt.

This doc rules pi's ~30 CLI flags **passthrough / xt-owned / skip** for `xt pi --role`.

Coordinated with xt-design.3, epic `xtmux-2i5`.

## Recommended shape

**Adopt the `--` passthrough convention.** Anything after `--` on the `xt pi`
command line is forwarded verbatim as pi argv:

```bash
xt pi --role chain-coordinator --bead unitAI-2i5 -- --thinking high --no-extensions -e ./local-ext.js
```

Rationale: pi's flag surface is large, changes independently, and includes
extension-registered flags xt can't enumerate ahead of time (`--gitnexus-cmd`,
`--mcp-config`, `--plan`, …). Enumerating each is a maintenance treadmill.
The `--` convention gives full parity with one code change, zero drift.

Individual xt flags (below) are reserved for pi flags xt itself needs to
*read or override* — e.g. session naming, which xt derives from the branch.

## Passthrough table

Legend:
- **passthrough** — forward as-is after `--` (no xt interpretation)
- **xt-owned** — xt sets or overrides these; user cannot pass them
- **surface** — worth a first-class xt flag (short-form convenience or
  interpretation needed before pi launches)
- **skip** — not meaningful under `xt pi --role`

### Runtime shape

| pi flag | Verdict | Rationale |
|---|---|---|
| `--provider <name>` | passthrough | Runtime shape. `pi --model provider/id` also handles this, but explicit form works. |
| `--model <pattern>` | **surface** as `--model` | High-value parity flag. Also match `sp run --model`. Support `:thinking` shorthand pi already parses. |
| `--api-key <key>` | passthrough | Rare; env vars usually suffice. Don't surface (secret on cmdline). |
| `--thinking <level>` | **surface** as `--thinking` | Runtime shape and highest-frequency override. Match pi's levels: off/minimal/low/medium/high/xhigh. |
| `--models <patterns>` | passthrough | Ctrl+P cycling config. Not critical to surface. |

### Session lifecycle

| pi flag | Verdict | Rationale |
|---|---|---|
| `--continue, -c` | passthrough | Meaningful when re-entering an existing xt worktree; user knows the intent. |
| `--resume, -r` | passthrough | Same. |
| `--session <path\|id>` | passthrough | Advanced use. Passthrough sufficient. |
| `--session-id <id>` | passthrough | Same. |
| `--fork <path\|id>` | passthrough | Same. |
| `--session-dir <dir>` | **xt-owned** | xt sets `PI_CODING_AGENT_SESSION_DIR` (or equivalent) to a worktree-scoped path if desired. Don't let users override — breaks session locality. |
| `--no-session` | passthrough | Ephemeral run inside a persistent worktree is a valid user choice. |
| `--name, -n <name>` | **xt-owned** | xt derives the display name from `[name]` positional / branch slug. Overriding here fragments observability. |

### Tools / extensions / skills

| pi flag | Verdict | Rationale |
|---|---|---|
| `--no-tools, -nt` | passthrough | Read-only mode; user choice. |
| `--no-builtin-tools, -nbt` | passthrough | Same. |
| `--tools, -t <list>` | passthrough | Allowlist. Same. |
| `--exclude-tools, -xt <list>` | passthrough | Denylist. Same. |
| `--extension, -e <path>` | passthrough | Load explicit extension file. Multi-use. Passthrough. |
| `--no-extensions, -ne` | passthrough | Disable discovery. Passthrough. |
| `--skill <path>` | passthrough | Same as `-e` for skills. |
| `--no-skills, -ns` | passthrough | Same. |
| `--prompt-template <path>` | passthrough | Same. |
| `--no-prompt-templates, -np` | passthrough | Same. |
| `--theme <path>` | passthrough | Cosmetic. |
| `--no-themes` | passthrough | Same. |
| `--no-context-files, -nc` | passthrough | Disable AGENTS.md/CLAUDE.md load. Legitimate override. |

### System prompt

| pi flag | Verdict | Rationale |
|---|---|---|
| `--system-prompt <text>` | **xt-owned when `--role` set** | The role's `specialist.prompt.system` is already the system prompt (see `resolveRole` in worktree-session.ts). Passing this again would clobber the role. Reject with an error when `--role` is present; passthrough when it isn't. |
| `--append-system-prompt <text>` | passthrough | Additive, not clobbering. Safe alongside `--role`. Multi-use. |

### Startup / mode

| pi flag | Verdict | Rationale |
|---|---|---|
| `--mode <mode>` | passthrough | text/json/rpc — user knows intent. |
| `--print, -p` | **skip / warn** | Non-interactive mode contradicts `xt pi`'s interactive-tmux design. Warn and refuse (use `sp run` for one-shot). |
| `--approve, -a` | passthrough | Trust project files this run. |
| `--no-approve, -na` | passthrough | Same. |
| `--offline` | passthrough | `PI_OFFLINE=1` alternative. |
| `--verbose` | passthrough | Debug aid. |

### Introspection / one-shot commands

| pi flag | Verdict | Rationale |
|---|---|---|
| `--list-models [search]` | **skip** | Not a session — no worktree needed. User runs `pi --list-models` directly. |
| `--export <file>` | **skip** | One-shot session-to-HTML. Not an xt workflow. |
| `--help, -h` | **skip** | xt owns its own `--help`. |
| `--version, -v` | **skip** | Use `xt pi status` (already exists per pi.ts). |

### Subcommands (`pi install`, `pi update`, `pi list`, `pi config`)

| Subcommand | Verdict | Rationale |
|---|---|---|
| `pi install / remove / uninstall / update / list / config` | **skip** | Not launch flows. User runs `pi <cmd>` directly outside a worktree. |

### Extension-registered flags

| Flag | Verdict | Rationale |
|---|---|---|
| `--gitnexus-cmd <value>` | passthrough | Registered by extension. Cannot enumerate ahead of time. |
| `--mcp-config <value>` | passthrough | Same. |
| Any future extension flag | passthrough | Same. Justifies the `--` convention as primary path. |

## Summary

**Primary path — do this first:**
Implement `--` passthrough in `launchWorktreeSession`. Every flag pi supports
(current or future, first-party or extension-registered) becomes reachable
with zero per-flag maintenance.

**Surface as first-class xt flags** (short-form convenience for the two most
common overrides):
- `--model <pattern>` — passes to pi as `--model`
- `--thinking <level>` — passes to pi as `--thinking`

**xt-owned (reject or override user attempts):**
- `--session-dir` — xt controls session locality
- `--name` — xt derives from branch slug
- `--system-prompt` — clobbers `--role`'s specialist prompt when both set (error)

**Skip / warn:**
- `--print, -p` — non-interactive contradicts xt pi's design
- `--list-models`, `--export`, `--help`, `--version`, subcommands — not launch flows

**Everything else** — passthrough via `--`.

## Implementation sketch (~10 lines)

```ts
// worktree-session.ts, near line 373
const passthroughIdx = process.argv.indexOf('--');
const passthroughArgs = passthroughIdx >= 0 ? process.argv.slice(passthroughIdx + 1) : [];

// commander already strips xt-owned flags; combine with surfaced overrides
const piArgs: string[] = [];
if (opts.model) piArgs.push('--model', opts.model);
if (opts.thinking) piArgs.push('--thinking', opts.thinking);
piArgs.push(...passthroughArgs);

// Guard: reject conflicts before spawn
if (roleName && passthroughArgs.includes('--system-prompt')) {
    console.error(kleur.red('\n  ✗ --system-prompt conflicts with --role (role owns the system prompt). Use --append-system-prompt instead.\n'));
    process.exit(1);
}

const runtimeArgs = runtime === 'claude' ? ['--dangerously-skip-permissions'] : piArgs;
```

Decision doc only — no implementation in this PR.
