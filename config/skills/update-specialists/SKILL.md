---
name: update-specialists
description: >
  Reconcile a project with current canonical specialists install state.
  Use this skill when a user says "update specialists", "specialists is broken",
  "sp is out of date", "hooks not firing", "skills not loading after update",
  or when drift is detected in installed specialists config, hooks, jobs, DB,
  extensions, or worktree cleanup.
version: 1.0
synced_at: 00000000
---

# update-specialists

Bring specialists install back to canonical state. Detect drift, apply targeted
fixes, then verify with `sp doctor`.

## Canonical State

Check each item explicitly. This is what a healthy specialists-initialized project
looks like.

### Specialists configs

| Check | Expected value |
|-------|----------------|
| `.specialists/default/*.specialist.json` | JSON-first specialist configs present |
| `metadata.name` | Matches filename stem |
| `metadata.version` | Valid semver string |
| `metadata.description` | Present |
| `metadata.category` | Present |
| `execution.model` | Present and pingable |
| `execution.fallback_model` | Present, different provider from primary |
| `execution.permission_required` | Valid enum |
| `skills.paths` | Referenced skill paths resolve correctly |
| `execution.interactive` | Matches intended keep-alive behavior |

### Hooks wiring

| Check | Expected value |
|-------|----------------|
| `.claude/settings.json` | Has hook entries for active events |
| Hook events | At minimum: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop` |
| Hook paths | Point at specialists runtime hook scripts, not stale xtrm-only paths |
| Hook format | Matches project's installed settings format and loads cleanly |

### CLI reachability

| Check | Expected value |
|-------|----------------|
| `sp` command | On PATH and runs |
| `specialists` command | On PATH and runs |
| Version compatibility | `sp doctor` reports matching runtime / install state |
| Command surface | `sp doctor`, `sp init`, `sp clean`, `sp status` available |

### Jobs and runtime dirs

| Check | Expected value |
|-------|----------------|
| `.specialists/jobs/` | Exists |
| `.specialists/ready/` | Exists if used by runtime |
| `.specialists/default/` | Canonical install copy present |
| Orphaned worktrees | None under `.worktrees/` |
| Worktree ownership | No stale entries for deleted jobs |

### SQLite / observability

| Check | Expected value |
|-------|----------------|
| specialists DB | Opens cleanly |
| Schema version | Matches runtime expectation |
| WAL / busy timeout settings | Present when runtime uses SQLite |
| Corruption / lock errors | None in `sp doctor` |

### Pi extensions

| Check | Expected value |
|-------|----------------|
| `quality-gates` | Registered if project uses quality gates |
| `pi-gitnexus` | Registered when GitNexus integration is expected |
| `pi-serena-tools` | Registered when Serena integration is expected |
| Extension paths | Resolve from installed project, not stale workspace copies |

## Detection

Run these in order. Report which checks pass and which drift.

```bash
# 1. Primary health check
sp doctor

# 2. Runtime status
sp status

# 3. Config shape
find .specialists/default -maxdepth 1 -name '*.specialist.json' -print

# 4. Validate specialist JSON files
node -e "const fs=require('fs'); const path=require('path'); const dir='.specialists/default'; for (const file of fs.readdirSync(dir)) { if (!file.endsWith('.specialist.json')) continue; const s=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')); const m=s.metadata||{}; const e=s.execution||{}; const missing=[]; for (const key of ['name','version','description','category']) if (!m[key]) missing.push('metadata.'+key); for (const key of ['model','fallback_model','permission_required']) if (!e[key]) missing.push('execution.'+key); if (missing.length) console.log(file+': MISSING '+missing.join(', ')); if (m.name && m.name !== file.replace(/\.specialist\.json$/, '')) console.log(file+': NAME MISMATCH '+m.name); }"

# 5. Validate referenced skill paths
node -e "const fs=require('fs'); const path=require('path'); const dir='.specialists/default'; for (const file of fs.readdirSync(dir)) { if (!file.endsWith('.specialist.json')) continue; const s=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')); for (const p of (s.skills?.paths ?? [])) { if (!fs.existsSync(p)) console.log(file+': MISSING SKILL PATH '+p); } }"

# 6. Hooks wiring
node -e "const fs=require('fs'); const p='.claude/settings.json'; if (fs.existsSync(p)) { const s=JSON.parse(fs.readFileSync(p,'utf8')); console.log(JSON.stringify(s.hooks ?? s, null, 2)); } else { console.log('MISSING .claude/settings.json'); }"

# 7. Command availability
command -v sp
command -v specialists
specialists init --help | sed -n '1,120p'
sp doctor --json 2>/dev/null || true

# 8. Jobs and worktrees
ls -1 .specialists/jobs 2>/dev/null || true
find .worktrees -maxdepth 2 -mindepth 1 -type d 2>/dev/null || true

# 9. Extension registration
node -e "const fs=require('fs'); const p='.pi/settings.json'; if (fs.existsSync(p)) console.log(JSON.stringify(JSON.parse(fs.readFileSync(p,'utf8')).skills ?? JSON.parse(fs.readFileSync(p,'utf8')).extensions ?? {}, null, 2)); else console.log('MISSING .pi/settings.json')"
```

## Drift -> Fix Mapping

Use targeted fixes first. Escalate to full sync only if needed.

| Drift | Fix |
|-------|-----|
| Specialist JSON missing required fields | `sp edit <name> ...` or regenerate via `specialists init --sync-defaults` |
| Specialist JSON schema mismatch | `specialists init --sync-defaults` |
| Hooks missing or stale | `specialists init` |
| `sp` / `specialists` missing from PATH | Reinstall / re-bootstrap specialists runtime |
| Job dir missing | `specialists init` |
| Orphaned `.worktrees/` entries | `specialists clean` |
| SQLite schema/version mismatch | `sp doctor` first, then `specialists init --sync-defaults` or runtime migration command |
| Pi extensions missing | `specialists init --sync-skills` or reinstall extension registration |
| Hook config format stale | `specialists init` |
| Skill symlink / active-skill drift | `specialists init --sync-skills` |
| Unknown manual drift | Stop, inspect, then apply user-approved fix |

## Remediation

### Fix: Specialist configs drifted

If `sp doctor` or JSON validation shows missing fields, wrong names, or schema
mismatch:

```bash
specialists init --sync-defaults
```

If one specialist needs a small repair and `sp edit` supports it, prefer that over
full sync.

### Fix: Hooks not firing

If hooks are missing, wrong events, or stale script paths:

```bash
specialists init
```

If runtime exposes a narrower hook sync command, prefer it. Use full init only
when hook-only sync is not enough.

### Fix: CLI not reachable

If `sp` or `specialists` is missing or incompatible:

```bash
sp doctor
```

If doctor confirms install drift, reinstall or re-bootstrap specialists runtime.
Do not guess at file edits when command surface itself is broken.

### Fix: Job dirs or worktree GC drift

If jobs exist without owners, worktrees are orphaned, or cleanup state is stale:

```bash
specialists clean
```

Then re-run `sp doctor`.

### Fix: SQLite schema drift

If doctor reports DB version mismatch or recovery issue:

1. Run `sp doctor` and capture exact schema error.
2. Apply runtime migration command if available.
4. If no automated migration exists, flag manual intervention.

### Fix: Pi extensions not registered

If `quality-gates`, `pi-gitnexus`, or `pi-serena-tools` are missing:

```bash
specialists init --sync-skills
```

If project uses different extension packaging, re-run install step that writes
`.pi/settings.json`.

## Verification

After fixes, confirm canonical state restored.

```bash
sp doctor
sp status

command -v sp
command -v specialists

node -e "const fs=require('fs'); const p='.claude/settings.json'; const s=JSON.parse(fs.readFileSync(p,'utf8')); console.log(Boolean(s.hooks || Object.keys(s).length))"
```

Expected outcome:
- `sp doctor` clean
- `sp status` no drift / no repair hints
- `sp` and `specialists` reachable (`sp` is shorthand; `specialists` is canonical)
- specialist JSON files valid
- hooks present on required events
- no orphaned worktrees
- SQLite state healthy

## Manual Intervention

Flag these when automatic fix is unsafe or impossible:

- `sp doctor` reports corrupt DB / unreadable SQLite file
- command surface missing because install itself is broken
- hook scripts absent from repo and cannot be regenerated
- schema mismatch with no available migration path
- worktree cleanup would remove user changes
- extensions required by project are not installed at package level

When manual intervention needed, report:
1. exact drift
2. exact command tried
3. why auto-fix stopped
4. next safe operator action

## User Summary Format

After detection + remediation, answer with compact status:

```text
## specialists update complete

✓ sp doctor clean
✓ specialist configs valid
✓ hooks wired
✓ CLI reachable
✓ jobs/worktrees clean
✓ SQLite healthy
✓ extensions registered

[manual items, if any]
```
