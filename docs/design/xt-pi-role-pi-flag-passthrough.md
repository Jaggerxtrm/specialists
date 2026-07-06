# `xt pi --role` ↔ `sp run` flag parity

**Context:** `xt pi --role <name>` (xtrm-tools/core PR #362, branch
`feature/xtrm-yd1p1-pi-role-launcher`) is the interactive equivalent of
`sp run <specialist>`. It currently accepts three flags:

- `[name]` — positional session name (also branch suffix)
- `--role <name>` — resolve specialist via `sp view <name> --raw`
- `--bead <id>` — attach to `@agent_bead` tmux pane option; appended to session slug
- `--no-attach` — create detached, print `session_name:pane_id`

This doc catalogs every `sp run` flag (`sp run --help`) and rules each one
**adopt / adapt / skip** for `xt pi --role`, so the next parity pass has a
single reference to work from.

Coordinated with xt-design.3, epic `xtmux-2i5`.

## Decision heuristic

- **Adopt** — shapes the specialist's *runtime* independent of managed-job
  semantics (model, context-depth, prompt seed).
- **Adapt** — shape depends on a managed-run concept that needs reinterpretation
  for an interactive tmux session (bead-notes, epic metadata).
- **Skip** — meaningful only under managed-job orchestration (queue slots,
  stale-base gate, worktree provisioning that pi already owns).

## Decision table

| `sp run` flag | Verdict | Rationale |
|---|---|---|
| `--bead <id>` | ✓ **already adopted** | Sets `@agent_bead` pane option; slug suffix. No work needed. |
| `--prompt <text>` | **adapt** | Interactive pi has no "prompt to consume" step. Best path: write the text to `@agent_task_prompt` (or reuse `@agent_task`) and let the pi extension read it as the first-turn seed on session attach. Adopt once the extension exposes a seed hook. |
| `--context-depth <n>` | **adopt** | Runtime shape. Passthrough to the pi extension's `bd show --depth` invocation when it resolves `--bead` context. Cheap. Default 3, matching sp. |
| `--no-beads` | **skip** | `sp run` uses this to suppress *auto-creating* a tracking bead. `xt pi --role` never creates one — bead is user-supplied via `--bead` or none. Flag has no target. |
| `--no-bead-notes` | **adapt** | Pi extension auto-appends per-turn notes to `--bead`. Provide `--no-bead-notes` as an env/pane-option signal (e.g. `@agent_bead_notes=off`) once the extension surfaces the hook. Same semantics as sp, different plumbing. |
| `--model <model>` | **adopt** | Runtime shape and highest-value parity flag. Pi already reads `~/.pi/agent/models.json`; passthrough would set the model for this session only (via pane env or pi launch arg). Requires pi CLI to accept a per-launch override — verify before adopting; adapt if not. |
| `--keep-alive` | **skip** | Redundant. An interactive tmux session is inherently keep-alive; it doesn't die on idle. `sp run --keep-alive` exists to hold a managed job's worktree open — pi's worktree is held open by the session itself. |
| `--worktree` | **skip** | `xt pi` *always* provisions a worktree via `launchWorktreeSession` (see `cli/src/utils/worktree-session.ts`). Behavior is implicit; the flag would be a no-op. |
| `--job <id>` | **skip** | No managed-job registry for interactive sessions. Reuse an existing pi session by name (`tmux attach -t <session>`) or relaunch with the same positional `<name>` — that's the interactive equivalent. |
| `--epic <id>` | **adapt** | Bead epic membership isn't operationally load-bearing for a single interactive session, but is useful for chain-coordinator patterns (a coordinator persona needs to know which epic it owns). Cheap adapt: set `@agent_epic` pane option. |
| `--force-job` | **skip** | Concurrency guard is managed-only — no queue in interactive mode. |
| `--base-sha <sha>` | **skip** | Stale-base precondition (specialists-05q.3) is a managed-run gate that refuses execution when the base drifted. Interactive users judge freshness themselves. |
| `--base-ref <branch>` | **skip** | Same. |
| `--accept-stale-base` | **skip** | Same. |
| `--reason <text>` | **skip** | Only meaningful paired with `--accept-stale-base`. |
| `--force-stale-base` | **skip** | Deprecated upstream. Do not carry deprecated flags into new surfaces. |

## Not in `sp run --help` — worth calling out

The packet also lists `--thinking` and `--parent` as candidates. Neither is a
`sp run` CLI flag today; both are specialist config fields (`thinking_level`)
or inferred from bead ancestry (parent). Follow-ups:

| Flag | Status | Recommendation |
|---|---|---|
| `--thinking <low\|medium\|high>` | Not on `sp run` | Nice-to-have on `xt pi --role` for per-session override, but this is *pi feature parity*, not `sp run` parity. Track separately if wanted. |
| `--parent <id>` | Not on `sp run` | Bead parent already resolves from `bd show <bead>.parent`. Explicit override rarely needed. Skip. |

## Summary

Adopt (net-new on `xt pi --role`):
- `--context-depth <n>`
- `--model <model>` (subject to pi launch-arg support)

Adapt (needs pi-extension coordination):
- `--prompt <text>` — first-turn seed via pane metadata
- `--no-bead-notes` — pane option gating auto-notes
- `--epic <id>` — pane option `@agent_epic`

Skip (managed-only or already implicit):
- `--no-beads`, `--keep-alive`, `--worktree`, `--job`, `--force-job`,
  `--base-sha`, `--base-ref`, `--accept-stale-base`, `--reason`,
  `--force-stale-base`

Net additions if fully adopted: **2 pass-through flags + 3 pane-metadata
flags**. No implementation in this PR — decision doc only.
