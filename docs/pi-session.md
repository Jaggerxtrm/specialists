---
title: Pi Subprocess Isolation
scope: pi-session
category: reference
version: 1.0.0
updated: 2026-03-25
description: Why specialists spawns Pi with --no-extensions and which extensions are selectively re-enabled.
source_of_truth_for:
  - "src/pi/session.ts"
domain:
  - pi
  - architecture
---

# Pi Subprocess Isolation

> **Alias:** `sp` is a shorter alias for `specialists` — `sp run`, `sp list`, `sp feed` etc. work identically.

Specialists spawns Pi in `--rpc` mode as a subprocess. Every specialist run starts Pi with `--no-extensions` and then selectively re-enables a small allowlist of extensions. This page explains why.

## Why `--no-extensions`

Pi auto-discovers xtrm extensions on startup from `~/.pi/agent/extensions/`. In an interactive session these extensions provide useful workflow enforcement — but in a specialist subprocess they cause silent failures.

The critical case is the **beads** extension. It blocks file edits unless a `claimed:<sessionId>` KV entry exists for the active Pi session ID. The orchestrating Claude session holds the claim; the specialist subprocess has a different, unrelated session ID. Without `--no-extensions`, every file write the specialist attempts silently fails the beads edit gate.

Other extensions (`session-flow`, `xt-end` reminder, UI/UX helpers) are similarly irrelevant or harmful in a headless subprocess context.

## Selective re-enable policy

After disabling all extensions, `src/pi/session.ts` re-enables a small allowlist using `-e <path>`:

| Extension | Loaded in specialist Pi? | Condition | Reason |
|-----------|--------------------------|-----------|--------|
| `beads` | ❌ Never | — | Blocks edits — subprocess session ID has no claim |
| `session-flow` | ❌ Never | — | Stop gate and xt-end reminder are irrelevant in subprocess |
| `quality-gates` | ✅ If installed | `permission_required` ≠ `READ_ONLY` | Lint/typecheck enforcement on specialist edits |
| `service-skills` | ✅ If installed | Always (if installed) | Territory-aware routing is useful in any session |
| All other extensions | ❌ Never | — | UI/UX only; not relevant headlessly |

## How it maps from specialist YAML

The specialist's `execution.permission_required` field controls whether `quality-gates` loads:

```yaml
execution:
  permission_required: READ_ONLY   # → quality-gates NOT loaded (read-only; no edits to lint)
  permission_required: LOW         # → quality-gates loaded if installed
  permission_required: MEDIUM      # → quality-gates loaded if installed
  permission_required: HIGH        # → quality-gates loaded if installed
```

`service-skills` loads regardless of permission level if the extension is installed.

## Code location

`src/pi/session.ts` — `start()` method, around line 118–138:

```typescript
const args = [
  '--mode', 'rpc',
  '--no-extensions',   // disable ALL auto-discovered xtrm Pi extensions
  ...providerArgs,
  '--no-session',
];

// Selectively re-enable useful Pi extensions if installed
const piExtDir = join(homedir(), '.pi', 'agent', 'extensions');
const permLevel = (this.options.permissionLevel ?? '').toUpperCase();
if (permLevel !== 'READ_ONLY') {
  const qgPath = join(piExtDir, 'quality-gates');
  if (existsSync(qgPath)) args.push('-e', qgPath);
}
const ssPath = join(piExtDir, 'service-skills');
if (existsSync(ssPath)) args.push('-e', ssPath);
```

## Installing the selectively-loaded extensions

Specialists does not install these — it only loads them if present. To enable them:

```bash
nextpi install quality-gates
nextpi install service-skills
```

Both live at `~/.pi/agent/extensions/`. Run `specialists status` to see which extensions are active in a running job.

## See also

- [pi-rpc.md](pi-rpc.md) — RPC mode protocol and lifecycle events
- [background-jobs.md](background-jobs.md) — Background job monitoring
