---
name: update-specialists
description: >
  Reconcile a project with current canonical specialists install state.
  Use this skill when a user says "update specialists", "specialists is broken",
  "sp is out of date", "hooks not firing", "skills not loading after update",
  or when drift is detected in installed specialists config, hooks, jobs, DB,
  extensions, or worktree cleanup.
version: 1.3
synced_at: 2026-04-25
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
- repo custom layer: `.specialists/user/*` + `config/nodes/*` + `.specialists/mandatory-rules/*` (rule overlay, wins on set-id conflict; NOT drift — do not overwrite or flag)
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
| specialists DB | Opens cleanly (`.specialists/db/observability.db`) |
| Schema version | Matches runtime expectation (current: v11) |
| `specialist_job_metrics` table | Present at v11+ — holds aggregated per-job metrics |
| WAL / busy timeout settings | Present when runtime uses SQLite |
| Corruption / lock errors | None in `sp doctor` |
| Pre-prune extract | `sp db prune --apply` extracts metrics to `specialist_job_metrics` before deleting events |
| Extract backfill | `sp db extract --all-missing` populates metrics for jobs whose events still exist |
| Historical stats query | `sp db stats [--spec <name>] [--model <glob>] [--since <dur>]` reads the aggregated table |

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

### Mandatory-rules template parity (three-tier)

Loader unions indexes from three paths and probes set files in reverse precedence
(overlay wins on set-id conflict). Full authoring guide:
`config/mandatory-rules/README.md`.

| Check | Expected value |
|-------|----------------|
| `.specialists/default/mandatory-rules/*` | Mirrors canonical package templates after `sp init --sync-defaults` (managed mirror, no hand edits) |
| `.specialists/mandatory-rules/*` | Repo-specific overlay (user-maintained). Present when repo ships its own rules. NOT drift. |
| Template frontmatter | YAML frontmatter present and parseable |
| `specialist.mandatory_rules.template_sets` references | Resolve in order: `.specialists/mandatory-rules/` → `.specialists/default/mandatory-rules/` → `config/mandatory-rules/` |
| Index files (`index.json`) | Any of the three tiers may define `required_template_sets` / `default_template_sets`; loader unions + dedups |
| Prompt injection behavior | Runner appends resolved `MANDATORY_RULES` block at end of prompt; supervisor emits `mandatory_rules_injection` meta event |

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

# 13a. Observability schema + metrics coverage
node -e "const {Database} = require('bun:sqlite'); const p='.specialists/db/observability.db'; const fs=require('fs'); if (!fs.existsSync(p)) { console.log('NO_DB'); process.exit(0); } const db=new Database(p,{readonly:true}); const v=db.query(\"SELECT value FROM schema_meta WHERE key='version'\").get(); const has=db.query(\"SELECT name FROM sqlite_master WHERE type='table' AND name='specialist_job_metrics'\").get(); const jobs=db.query('SELECT COUNT(*) c FROM specialist_jobs').get(); const metrics=has ? db.query('SELECT COUNT(*) c FROM specialist_job_metrics').get() : null; console.log(JSON.stringify({schema_version: v?.value, has_metrics_table: !!has, jobs: jobs.c, metrics_rows: metrics?.c ?? 0, metrics_coverage: metrics ? (metrics.c/jobs.c).toFixed(2) : null}, null, 2));" 2>/dev/null || echo "REQUIRES_BUN_RUNTIME"

# 13. Mandatory-rules template tiers + reference checks (three-tier resolution)
find .specialists/default/mandatory-rules -maxdepth 1 -type f 2>/dev/null || true
find .specialists/mandatory-rules -maxdepth 1 -type f 2>/dev/null || true
node -e "const fs=require('fs'); const path=require('path'); const roots=['.specialists/default/specialists','.specialists/user/specialists']; const missing=[]; for (const root of roots) { if (!fs.existsSync(root)) continue; for (const file of fs.readdirSync(root)) { if (!file.endsWith('.specialist.json')) continue; const spec=JSON.parse(fs.readFileSync(path.join(root,file),'utf8')); const sets=spec.specialist?.mandatory_rules?.template_sets ?? []; for (const set of sets) { const candidates=[path.join('.specialists/mandatory-rules',set+'.md'), path.join('.specialists/default/mandatory-rules',set+'.md'), path.join('config/mandatory-rules',set+'.md')]; if (!candidates.some((p)=>fs.existsSync(p))) missing.push(file+': missing template set '+set); } } } if (missing.length) console.log(missing.join('\n'));"

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
| Schema below v11 (no `specialist_job_metrics`) | Reinstall / upgrade runtime; table is created by initSchema / migrateToV11. No data loss — raw events untouched. |
| Events about to be pruned but never aggregated | `sp db extract --all-missing` BEFORE `sp db prune --apply`. Prune refuses when extract fails (safe by design). |
| Emergency: need to prune but extract is wedged | `sp db prune --apply --skip-extract` — raw events deleted without aggregation. Use only when data loss is acceptable. |
| Historical per-job stats needed | `sp db stats` reads `specialist_job_metrics`. Replaces ad-hoc `status.json` scans. Supports `--format json\|table`. |
| Pi extensions missing | `specialists init --sync-skills` or reinstall extension registration |
| Hook config format stale | `specialists init` |
| Skill symlink / active-skill drift | `specialists init --sync-skills` |
| Installed default skill differs from canonical package copy | `specialists init --sync-skills` unless local customization is intentional |
| Skill frontmatter version / synced_at drift | `specialists init --sync-skills` or refresh packaged skills |
| Mandatory-rules mirror drift (`.specialists/default/mandatory-rules`) | `specialists init --sync-defaults` |
| `.specialists/mandatory-rules/` overlay present | Leave alone — this is repo overlay, NOT drift |
| Missing/invalid `template_sets` references | Check all three tiers first; `sp edit <name> --fork-from <base>` then fix references, or sync defaults if mirror missing, or add set to overlay if intended |
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

### Fix: metrics aggregation missing or stale

Schema v11 introduced `specialist_job_metrics` (aggregated per-job stats). If you see low `metrics_coverage` in the detection output, or want historical stats before running `sp db prune`:

```bash
# Backfill metrics for any job whose events still exist but lack a metrics row.
sp db extract --all-missing

# Inspect specific job metrics.
sp db extract --job <job-id>

# Query aggregates.
sp db stats
sp db stats --spec executor --since 7d --format json
sp db stats --model 'openai-codex/*' --since 30d
```

`sp db prune --apply` automatically extracts for every job whose events will be deleted (unless `--skip-extract`). If extract throws, prune aborts — investigate the failing job instead of bypassing.

Safe order before a retention cleanup:
1. `sp db extract --all-missing` — verify no extract errors.
2. `sp db prune --before 30d --dry-run` — confirm scope.
3. `sp db prune --before 30d --apply` — prune with pre-extract built in.
4. `sp db vacuum` — compact file size.

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
