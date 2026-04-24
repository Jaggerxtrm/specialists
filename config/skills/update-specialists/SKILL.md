---
name: update-specialists
description: >
  Reconcile a project with current canonical specialists install state.
  Use this skill when a user says "update specialists", "specialists is broken",
  "sp is out of date", "hooks not firing", "skills not loading after update",
  or when drift is detected in installed specialists config, hooks, jobs, DB,
  extensions, or worktree cleanup.
version: 1.1
synced_at: 00000000
---

# update-specialists

Bring specialists install back to canonical state. Detect drift, apply targeted
fixes, then verify with `sp doctor`. Treat canonical state as both:
1. healthy repo wiring and runtime behavior, and
2. parity with currently installed `@jaggerxtrm/specialists` package version
   when package-level comparison is available.

Ownership contract during repair:
- upstream source: package `config/*` (read-only for repo operators)
- managed mirror: `.specialists/default/*` (refresh via `sp init --sync-defaults`; sync scope = specialists + mandatory-rules + nodes; no hand edits)
- repo custom layer: `.specialists/user/*` + `config/nodes/*`
- runtime/generated: `.specialists/{jobs,ready,db}`

Isolation rule: backlog-clean surfaces out of scope for this skill.

## Canonical State

Check each item explicitly. This is what a healthy specialists-initialized project
looks like.

### Package + runtime parity

| Check | Expected value |
|-------|----------------|
| Installed `@jaggerxtrm/specialists` package version | Matches intended runtime version for repo install |
| `sp --version` / `specialists --version` | Matches installed package version or same release line |
| Installed package root | Resolvable from Node / npm environment |
| Canonical package defaults | Available from installed package for direct diffing |
| Repo install vs package install | No unexpected drift in canonical files unless intentionally customized |

### Specialists configs

| Check | Expected value |
|-------|----------------|
| `.specialists/default/*.specialist.json` | JSON-first specialist configs present |
| `metadata.name` | Matches filename stem |
| `metadata.version` | Valid semver string and consistent with canonical shipped copy when comparing like-for-like |
| `metadata.description` | Present |
| `metadata.category` | Present |
| `execution.model` | Present and pingable |
| `execution.fallback_model` | Present, different provider from primary |
| `execution.permission_required` | Valid enum |
| `skills.paths` | Referenced skill paths resolve correctly |
| `execution.interactive` | Matches intended keep-alive behavior |
| Installed default specialist copy | Matches canonical package copy unless intentionally customized |

### Hooks wiring

| Check | Expected value |
|-------|----------------|
| `.claude/settings.json` | Has hook entries for active events |
| Hook events | At minimum: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop` |
| Hook paths | Point at specialists runtime hook scripts, not stale xtrm-only paths |
| Hook format | Matches project's installed settings format and loads cleanly |
| Installed hook scripts | Match canonical package hook files unless intentionally customized |

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

### Skills + extensions parity

| Check | Expected value |
|-------|----------------|
| `.xtrm/skills/default/` | Matches canonical package skill set for installed version |
| Active skill links / copies | Resolve to expected default or active targets |
| Skill frontmatter `version` / `synced_at` | Present and reasonable for shipped skills |
| `quality-gates` | Registered if project uses quality gates |
| `pi-gitnexus` | Registered when GitNexus integration is expected |
| `pi-serena-tools` | Registered when Serena integration is expected |
| Extension paths | Resolve from installed project, not stale workspace copies |

### Mandatory-rules template parity

| Check | Expected value |
|-------|----------------|
| `.specialists/default/mandatory-rules/*` | Mirrors canonical package templates after `sp init --sync-defaults` |
| Template frontmatter | YAML frontmatter present and parseable |
| `specialist.mandatory_rules.template_sets` references | Point to existing template ids/files |
| Prompt injection behavior | Runner appends resolved template content at end of prompt |

## Detection

Run these in order. Report which checks pass and which drift.

```bash
# 1. Primary health check
sp doctor

# 2. Runtime status
sp status

# 3. Installed package + CLI version parity
npm ls @jaggerxtrm/specialists --depth=0 2>/dev/null || true
node -e "try { const pkg=require(require.resolve('@jaggerxtrm/specialists/package.json')); console.log(JSON.stringify({installed_package_version: pkg.version}, null, 2)); } catch (err) { console.log('PACKAGE_NOT_RESOLVABLE'); }"
sp --version 2>/dev/null || true
specialists --version 2>/dev/null || true

# 4. Resolve canonical package root for direct drift diff
node -e "try { const path=require('path'); const pkgPath=require.resolve('@jaggerxtrm/specialists/package.json'); console.log(path.dirname(pkgPath)); } catch (err) { console.log('PACKAGE_ROOT_UNAVAILABLE'); }"

# 5. Config shape
find .specialists/default -maxdepth 1 -name '*.specialist.json' -print

# 6. Validate specialist JSON files
node -e "const fs=require('fs'); const path=require('path'); const dir='.specialists/default'; for (const file of fs.readdirSync(dir)) { if (!file.endsWith('.specialist.json')) continue; const s=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')); const m=s.metadata||{}; const e=s.execution||{}; const missing=[]; for (const key of ['name','version','description','category']) if (!m[key]) missing.push('metadata.'+key); for (const key of ['model','fallback_model','permission_required']) if (!e[key]) missing.push('execution.'+key); if (missing.length) console.log(file+': MISSING '+missing.join(', ')); if (m.name && m.name !== file.replace(/\.specialist\.json$/, '')) console.log(file+': NAME MISMATCH '+m.name); }"

# 7. Validate referenced skill paths
node -e "const fs=require('fs'); const path=require('path'); const dir='.specialists/default'; for (const file of fs.readdirSync(dir)) { if (!file.endsWith('.specialist.json')) continue; const s=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')); for (const p of (s.skills?.paths ?? [])) { if (!fs.existsSync(p)) console.log(file+': MISSING SKILL PATH '+p); } }"

# 8. Compare repo defaults against installed package defaults (if package root resolvable)
PKG_ROOT="$(node -e "try { const path=require('path'); process.stdout.write(path.dirname(require.resolve('@jaggerxtrm/specialists/package.json'))); } catch (err) {}")"
if [ -n "$PKG_ROOT" ]; then
  diff -rq .specialists/default "$PKG_ROOT/config/specialists" || true
  diff -rq .xtrm/skills/default "$PKG_ROOT/config/skills" || true
  diff -rq .claude/hooks "$PKG_ROOT/config/hooks" || true
else
  echo PACKAGE_COMPARE_UNAVAILABLE
fi

# 9. Hooks wiring
node -e "const fs=require('fs'); const p='.claude/settings.json'; if (fs.existsSync(p)) { const s=JSON.parse(fs.readFileSync(p,'utf8')); console.log(JSON.stringify(s.hooks ?? s, null, 2)); } else { console.log('MISSING .claude/settings.json'); }"

# 10. Command availability
command -v sp
command -v specialists
specialists init --help | sed -n '1,120p'
specialists edit --help | sed -n '1,120p' | grep -E -- '--fork-from|fork-from' || true
sp doctor --json 2>/dev/null || true

# 11. Jobs and worktrees
ls -1 .specialists/jobs 2>/dev/null || true
find .worktrees -maxdepth 2 -mindepth 1 -type d 2>/dev/null || true

# 12. Extension registration
node -e "const fs=require('fs'); const p='.pi/settings.json'; if (fs.existsSync(p)) console.log(JSON.stringify(JSON.parse(fs.readFileSync(p,'utf8')).skills ?? JSON.parse(fs.readFileSync(p,'utf8')).extensions ?? {}, null, 2)); else console.log('MISSING .pi/settings.json')"

# 13. Mandatory-rules template mirror + reference checks
find .specialists/default/mandatory-rules -maxdepth 1 -type f 2>/dev/null || true
node -e "const fs=require('fs'); const path=require('path'); const roots=['.specialists/default/specialists','.specialists/user/specialists']; const missing=[]; for (const root of roots) { if (!fs.existsSync(root)) continue; for (const file of fs.readdirSync(root)) { if (!file.endsWith('.specialist.json')) continue; const spec=JSON.parse(fs.readFileSync(path.join(root,file),'utf8')); const sets=spec.specialist?.mandatory_rules?.template_sets ?? []; for (const set of sets) { const candidates=[path.join('.specialists/default/mandatory-rules',set+'.md'), path.join('config/mandatory-rules',set+'.md')]; if (!candidates.some((p)=>fs.existsSync(p))) missing.push(file+': missing template set '+set); } } } if (missing.length) console.log(missing.join('\n'));"

# 14. Shipped skill frontmatter parity
node -e "const fs=require('fs'); const path=require('path'); const dir='.xtrm/skills/default'; if (!fs.existsSync(dir)) process.exit(0); for (const name of fs.readdirSync(dir)) { const p=path.join(dir,name,'SKILL.md'); if (!fs.existsSync(p)) continue; const head=fs.readFileSync(p,'utf8').split('---')[1] || ''; const version=(head.match(/version:\s*([^\n]+)/)||[])[1]; const synced=(head.match(/synced_at:\s*([^\n]+)/)||[])[1]; console.log(name+': version='+(version||'missing')+' synced_at='+(synced||'missing')); }"
```

## Drift -> Fix Mapping

Use targeted fixes first. Escalate to full sync only if needed.

| Drift | Fix |
|-------|-----|
| Installed package version mismatch | reinstall / upgrade `@jaggerxtrm/specialists`, then re-run checks |
| CLI version mismatch vs package | reinstall runtime so `sp` / `specialists` align with installed package |
| Specialist JSON missing required fields | `sp edit <name> ...` or regenerate via `specialists init --sync-defaults` |
| Need user-layer override from default/package specialist | `sp edit <name> --fork-from <base>` to materialize editable copy in `.specialists/user/` |
| Specialist JSON schema mismatch | `specialists init --sync-defaults` (refreshes specialists + mandatory-rules + nodes) |
| Installed specialist default differs from canonical package copy | `specialists init --sync-defaults` unless local customization is intentional |
| Hooks missing or stale | `specialists init` |
| Installed hook file differs from canonical package copy | `specialists init` unless local customization is intentional |
| `sp` / `specialists` missing from PATH | Reinstall / re-bootstrap specialists runtime |
| Job dir missing | `specialists init` |
| Orphaned `.worktrees/` entries | `specialists clean` |
| SQLite schema/version mismatch | `sp doctor` first, then `specialists init --sync-defaults` or runtime migration command |
| Pi extensions missing | `specialists init --sync-skills` or reinstall extension registration |
| Hook config format stale | `specialists init` |
| Skill symlink / active-skill drift | `specialists init --sync-skills` |
| Installed default skill differs from canonical package copy | `specialists init --sync-skills` unless local customization is intentional |
| Skill frontmatter version / synced_at drift | `specialists init --sync-skills` or refresh packaged skills |
| Mandatory-rules mirror drift (`.specialists/default/mandatory-rules`) | `specialists init --sync-defaults` |
| Missing/invalid `template_sets` references | `sp edit <name> --fork-from <base>` then fix references, or sync defaults if mirror missing |
| Unknown manual drift | Stop, inspect, then apply user-approved fix |

## Remediation

### Fix: Package/runtime version drift

If installed npm package version, CLI version, or package root parity checks disagree:

```bash
npm ls @jaggerxtrm/specialists --depth=0
specialists --version
sp --version
```

If versions do not align, reinstall or upgrade the package first. After runtime
version is correct, re-run `specialists init` / sync commands to repair repo drift.

### Fix: Specialist configs drifted

If `sp doctor`, JSON validation, or direct diff against package canonical defaults
shows missing fields, wrong names, or schema mismatch:

```bash
specialists init --sync-defaults
```

`--sync-defaults` refreshes specialists + mandatory-rules + nodes mirrors.

If one specialist needs a small repair and `sp edit` supports it, prefer that over
full sync. If target specialist lives in default/package layer, fork first:

```bash
sp edit <name> --fork-from <base>
```

### Fix: Hooks not firing

If hooks are missing, wrong events, stale script paths, or hook files differ from
installed package canonical copies:

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
3. If no automated migration exists, flag manual intervention.

### Fix: Skills/defaults differ from shipped package copy

If diff against the installed package shows `.specialists/default/`,
`.xtrm/skills/default/`, or `.claude/hooks/` drift from shipped canonical files:

- If drift is intentional project customization, report it and do not overwrite silently.
- If drift is unintentional, use the narrowest sync that fixes the affected area:

```bash
specialists init --sync-defaults
specialists init --sync-skills
specialists init
```

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
npm ls @jaggerxtrm/specialists --depth=0 2>/dev/null || true
specialists --version 2>/dev/null || true
sp --version 2>/dev/null || true

node -e "const fs=require('fs'); const p='.claude/settings.json'; const s=JSON.parse(fs.readFileSync(p,'utf8')); console.log(Boolean(s.hooks || Object.keys(s).length))"
```

Expected outcome:
- `sp doctor` clean
- `sp status` no drift / no repair hints
- `sp` and `specialists` reachable (`sp` is shorthand; `specialists` is canonical)
- installed package / CLI versions aligned
- specialist JSON files valid
- repo defaults match installed package defaults (or intentional custom drift acknowledged)
- hooks present on required events and canonical hook files match installed package copy
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
- package root is unavailable, so package-vs-installed diff cannot be computed
- repo intentionally diverges from canonical package copies and user must preserve customizations

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
✓ package / CLI versions aligned
✓ specialist configs valid
✓ hooks wired
✓ canonical package parity checked
✓ jobs/worktrees clean
✓ SQLite healthy
✓ extensions registered

[manual items, if any]
```
