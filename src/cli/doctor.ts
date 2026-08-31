// Health check for specialists installation — like bd doctor.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { refreshPrDriftForJob } from '../specialist/pr-drift-refresh.js';
import type { PrClassification } from '../specialist/pr-drift-refresh.js';
import { resolveCanonicalAssetDir } from '../specialist/canonical-asset-resolver.js';
import { detectDriftUnderRoot } from '../specialist/drift-detector.js';
import { auditDeadJobs } from '../specialist/dead-job-audit.js';
import { SpecialistLoader } from '../specialist/loader.js';
import { readGlobalUserConfig } from '../specialist/global-config.js';
import { formatVersionCheckNudge, getVersionCheckResult, localVersion, readCachedVersionCheck } from './version-check.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function ok(msg: string) { console.log(`  ${green('✓')} ${msg}`); }
function warn(msg: string) { console.log(`  ${yellow('○')} ${msg}`); }
function fail(msg: string) { console.log(`  ${red('✗')} ${msg}`); }
function fix(msg: string) { console.log(`    ${dim('→ fix:')} ${yellow(msg)}`); }
function hint(msg: string) { console.log(`    ${dim(msg)}`); }

function section(label: string) {
  const line = '─'.repeat(Math.max(0, 38 - label.length));
  console.log(`\n${bold(`── ${label} ${line}`)}`);
}

function sp(bin: string, args: string[]): { ok: boolean; stdout: string } {
  const r = spawnSync(bin, args, { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
  return { ok: r.status === 0 && !r.error, stdout: (r.stdout ?? '').trim() };
}

function isInstalled(bin: string): boolean {
  return spawnSync('which', [bin], { encoding: 'utf8', timeout: 2000 }).status === 0;
}

const CWD = process.cwd();
const SPECIALISTS_DIR = join(CWD, '.specialists');
const USER_SPECIALISTS_DIR = join(SPECIALISTS_DIR, 'user');

// Global install locations — xtrm-tools now vendors these into ~/.xtrm/ instead of per-repo mirrors.
const XTRM_HOME = join(homedir(), '.xtrm');
const GLOBAL_HOOKS_DIR = join(XTRM_HOME, 'hooks', 'specialists');
const GLOBAL_DEFAULT_SKILLS_DIR = join(XTRM_HOME, 'skills', 'default');
const HOOK_NAMES = ['specialists-session-start.mjs'] as const;

type JsonRecord = Record<string, unknown>;

function loadJson(path: string): JsonRecord | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')) as JsonRecord; } catch { return null; }
}

function checkPi(): boolean {
  section('pi  (coding agent runtime)');
  if (!isInstalled('pi')) {
    fail('pi not installed');
    fix('install pi first');
    return false;
  }
  const version = sp('pi', ['--version']);
  const models = sp('pi', ['--list-models']);
  const providers = models.ok
    ? new Set(models.stdout.split('\n').slice(1).map(line => line.split(/\s+/)[0]).filter(Boolean))
    : new Set<string>();
  const vStr = version.ok ? `v${version.stdout}` : 'unknown version';
  if (providers.size === 0) {
    warn(`pi ${vStr} installed but no active providers`);
    fix('pi config   (add at least one API key)');
    return false;
  }
  ok(`pi ${vStr}  —  ${providers.size} provider${providers.size > 1 ? 's' : ''} active  ${dim(`(${[...providers].join(', ')})`)}`);
  return true;
}

function checkSpAlias(): boolean {
  section('sp alias  (specialists shortcut)');
  if (isInstalled('sp')) {
    ok('sp alias installed');
    return true;
  }
  fail('sp alias not found in PATH');
  fix('npm install -g @jaggerxtrm/specialists@latest   (reinstall to create symlink)');
  return false;
}

function checkBd(): boolean {
  section('beads  (issue tracker)');
  if (!isInstalled('bd')) {
    fail('bd not installed');
    fix('install beads (bd) first');
    return false;
  }
  ok(`bd installed  ${dim(sp('bd', ['--version']).stdout || '')}`);
  if (existsSync(join(CWD, '.beads'))) ok('.beads/ present in project');
  else warn('.beads/ not found in project');
  return true;
}

function checkXt(): boolean {
  section('xtrm-tools');
  if (!isInstalled('xt')) {
    fail('xt not installed');
    fix('install xtrm-tools first');
    return false;
  }
  ok(`xt installed  ${dim(sp('xt', ['--version']).stdout || '')}`);
  return true;
}

function checkHooks(): boolean {
  section(`Claude Code hooks  (global ${relative(homedir(), GLOBAL_HOOKS_DIR)})`);
  let allPresent = true;

  for (const name of HOOK_NAMES) {
    const hookPath = join(GLOBAL_HOOKS_DIR, name);
    if (!existsSync(hookPath)) {
      fail(`${hookPath} ${red('missing')}`);
      fix('reinstall xtrm-tools (hooks are vendored globally)');
      allPresent = false;
    } else {
      ok(relative(homedir(), hookPath));
    }
  }

  return allPresent;
}

function checkVersion(): boolean {
  section('Version check');
  const result = getVersionCheckResult();
  if (result) {
    const nudge = formatVersionCheckNudge(result);
    if (!nudge) {
      ok(`specialists v${result.localVersion} is current`);
      return true;
    }

    warn(nudge);
    return false;
  }

  const cached = readCachedVersionCheck();
  if (!cached) {
    warn('cache empty — skipped');
    return true;
  }

  ok(`specialists v${localVersion} is local; ${cached.latest_tag} cached on ${new Date(cached.checked_at_ms).toISOString()}`);
  return true;
}

function hashFile(path: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function collectFileHashes(rootDir: string): Map<string, string> {
  const hashes = new Map<string, string>();
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relPath = relative(rootDir, fullPath);
      hashes.set(relPath, hashFile(fullPath));
    }
  };

  if (existsSync(rootDir)) visit(rootDir);
  return hashes;
}

export function resolvePackageAssetDir(relativePath: string): string | null {
  return resolveCanonicalAssetDir(relativePath) ?? (existsSync(join(CWD, 'config', relativePath)) ? join(CWD, 'config', relativePath) : null);
}

function checkSkillDrift(): boolean {
  section(`Skills — global default pool  (~/${relative(homedir(), GLOBAL_DEFAULT_SKILLS_DIR)})`);

  const canonicalSkillsDir = resolvePackageAssetDir('skills');
  if (!canonicalSkillsDir) {
    fail('package canonical skills source missing');
    fix('restore config/skills/ or install package assets');
    return false;
  }

  if (!existsSync(GLOBAL_DEFAULT_SKILLS_DIR)) {
    fail(`${GLOBAL_DEFAULT_SKILLS_DIR} missing`);
    fix('reinstall xtrm-tools (skills are vendored globally)');
    return false;
  }

  const canonicalHashes = collectFileHashes(canonicalSkillsDir);
  const defaultHashes = collectFileHashes(GLOBAL_DEFAULT_SKILLS_DIR);

  const drifted: string[] = [];
  const missing: string[] = [];
  for (const [relPath, canonicalHash] of canonicalHashes) {
    const globalHash = defaultHashes.get(relPath);
    if (!globalHash) { missing.push(relPath); continue; }
    if (canonicalHash !== globalHash) drifted.push(relPath);
  }

  if (drifted.length === 0 && missing.length === 0) {
    ok(`${relative(CWD, canonicalSkillsDir)} matches global default pool`);
    return true;
  }
  if (drifted.length > 0) {
    fail(`${drifted.length} drifted file${drifted.length === 1 ? '' : 's'} between package and global default pool`);
    hint(`example: ${drifted.slice(0, 3).join(', ')}${drifted.length > 3 ? ', ...' : ''}`);
  }
  if (missing.length > 0) {
    fail(`${missing.length} file${missing.length === 1 ? '' : 's'} missing from global default pool`);
    hint(`example: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', ...' : ''}`);
  }
  fix('reinstall xtrm-tools (skills are vendored globally)');
  return false;
}

function checkUserOverlayDrift(): boolean {
  section('User specialist overlays');
  if (!existsSync(USER_SPECIALISTS_DIR)) {
    ok('no user overlays present');
    return true;
  }
  const overlays = readdirSync(USER_SPECIALISTS_DIR).filter((name) => name.endsWith('.specialist.json'));
  if (overlays.length === 0) {
    ok('no user overlays present');
    return true;
  }
  const packageSpecialistsDir = resolvePackageAssetDir('specialists');
  let allOk = true;
  for (const name of overlays) {
    const userPath = join(USER_SPECIALISTS_DIR, name);
    const defaultPath = packageSpecialistsDir ? join(packageSpecialistsDir, name) : '';
    const userSpec = loadJson(userPath);
    if (!userSpec) {
      warn(`${name}: failed to parse — skipping drift check`);
      continue;
    }
    if (!defaultPath || !existsSync(defaultPath)) {
      ok(`${name}: user-only overlay (no package default to drift from)`);
      continue;
    }
    const defaultSpec = loadJson(defaultPath);
    if (!defaultSpec) {
      warn(`${name}: default failed to parse — skipping drift check`);
      continue;
    }
    const userInner = (userSpec.specialist ?? {}) as JsonRecord;
    const defaultInner = (defaultSpec.specialist ?? {}) as JsonRecord;
    const userRules = ((userInner.mandatory_rules ?? {}) as { template_sets?: unknown }).template_sets;
    const defaultRules = ((defaultInner.mandatory_rules ?? {}) as { template_sets?: unknown }).template_sets;
    const userSets = Array.isArray(userRules) ? userRules : [];
    const defaultSets = Array.isArray(defaultRules) ? defaultRules : [];
    const missingSets = defaultSets.filter((set) => !userSets.includes(set as string));
    if (missingSets.length > 0) {
      warn(`${name}: user overlay shadows default but is missing mandatory_rules.template_sets: [${missingSets.join(', ')}]`);
      hint('user overlay silently disables these rules at runtime; either add them to the overlay or delete the overlay to fall back to default.');
      allOk = false;
    } else {
      ok(`${name}: mandatory_rules in sync with default`);
    }
  }
  return allOk;
}

function checkRuntimeDirs(): boolean {
  section('.specialists/ runtime directories');
  const rootDir = join(CWD, '.specialists');
  const jobsDir = join(rootDir, 'jobs');
  const readyDir = join(rootDir, 'ready');
  let allOk = true;

  if (!existsSync(rootDir)) {
    warn('.specialists/ not found in current project');
    fix('specialists init');
    allOk = false;
  } else {
    ok('.specialists/ present');
    for (const [subDir, label] of [[jobsDir, 'jobs'], [readyDir, 'ready']] as [string, string][]) {
      if (!existsSync(subDir)) {
        warn(`.specialists/${label}/ missing — auto-creating`);
        mkdirSync(subDir, { recursive: true });
        ok(`.specialists/${label}/ created`);
      } else {
        ok(`.specialists/${label}/ present`);
      }
    }
  }
  return allOk;
}

function checkClaudeMdFragments(): boolean {

  section('CLAUDE.md fragments');
  const projectRoot = process.cwd();
  const claudeMd = join(projectRoot, 'CLAUDE.md');
  if (!existsSync(claudeMd)) {
    warn('No CLAUDE.md in project root — skipping fragment check');
    return true;
  }
  if (!isInstalled('xt')) {
    warn('xt not on PATH — skipping fragment drift check');
    hint('install xtrm-tools to enable: xt claude-sync --check');
    return true;
  }
  const result = spawnSync('xt', ['claude-sync', '--check', '--json', '--cwd', projectRoot], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    warn(`xt claude-sync failed to launch: ${result.error.message}`);
    return true;
  }
  let parsed: { managed_sections?: Array<{ name: string; version: string; canonical_version: string | null }>; drift?: Array<{ name: string; kind: string; current_version: string | null; canonical_version: string | null }>; known_fragments?: string[] } | null = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    warn(`xt claude-sync produced unparseable JSON (exit ${result.status})`);
    return true;
  }
  const sections = parsed?.managed_sections ?? [];
  const drift = parsed?.drift ?? [];
  if (sections.length === 0) {
    warn('CLAUDE.md has no XTRM-MANAGED sentinels — fragments not initialized');
    fix('xt claude-sync --add bd-workflow  (and other fragments)');
    return false;
  }
  const driftByName = new Map(drift.map(d => [d.name, d]));
  let allOk = true;
  for (const s of sections) {
    const d = driftByName.get(s.name);
    if (!d) {
      ok(`${s.name.padEnd(20)} current (v${s.version})`);
      continue;
    }
    allOk = false;
    if (d.kind === 'version-mismatch') {
      warn(`${s.name.padEnd(20)} project v${d.current_version}; canonical v${d.canonical_version}`);
      fix('xt claude-sync --apply --accept-overwrite');
    } else if (d.kind === 'body-mismatch') {
      warn(`${s.name.padEnd(20)} body diverges from canonical v${d.canonical_version}`);
      fix('xt claude-sync --apply --accept-overwrite');
    } else if (d.kind === 'unknown-fragment') {
      warn(`${s.name.padEnd(20)} not a known canonical fragment`);
      hint('this CLAUDE.md may have been written by a newer xt; consider updating xtrm-tools');
    }
  }
  return allOk;
}


interface DoctorOptions {
  json: boolean;
  root?: string;
  drift: boolean;
  specialists: boolean;
  pr_drift: boolean;
  reap_dead_jobs: boolean;
  dry_run: boolean;
}

function parseDoctorArgs(argv: readonly string[]): DoctorOptions {
  const opts: DoctorOptions = { json: false, drift: false, specialists: false, pr_drift: false, reap_dead_jobs: false, dry_run: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') { opts.json = true; continue; }
    if (token === '--check-drift' || token === '--drift') { opts.drift = true; continue; }
    if (token === '--specialists' || token === '--check-specialists') { opts.specialists = true; continue; }
    if (token === '--pr-drift') { opts.pr_drift = true; continue; }
    if (token === '--reap-dead-jobs') { opts.reap_dead_jobs = true; continue; }
    if (token === '--dry-run') { opts.dry_run = true; continue; }
    if (token === '--root') { const value = argv[i + 1]; if (!value || value.startsWith('--')) throw new Error('--root requires a value'); opts.root = resolve(value); i += 1; continue; }
    if (token === '--help' || token === '-h') continue;
    throw new Error(`Unknown argument: ${token}`);
  }
  return opts;
}

/**
 * Specialist override-layer health (KAN-90 / unitAI-1gtou.14).
 *
 * Reports:
 *  - resolution of the global user-config path (~/.config/specialists/user.json or XDG)
 *  - per-specialist model coverage after the full 4-layer merge
 *  - blocked-field warnings emitted by the loader during merge
 *
 * Exit semantics:
 *  - returns true (no problems) when no specialist has a missing model AND no
 *    blocked-field strip warning fired.
 *  - a fresh install without any global file is treated as a NOTICE (not a fail):
 *    we tell the user to run `sp init --global`.
 */
async function checkSpecialistOverrides(): Promise<boolean> {
  section('specialist overrides  (KAN-90 global user.json)');
  let loader: SpecialistLoader;
  try {
    loader = new SpecialistLoader();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`could not construct SpecialistLoader: ${msg}`);
    return false;
  }

  const globalLayer = loader.getGlobalLayerPath();
  if (!globalLayer) {
    warn('global user-config path could not be resolved (HOME and XDG_CONFIG_HOME both unset)');
    fix('set HOME or XDG_CONFIG_HOME, then run: sp init --global');
    return false;
  }

  if (globalLayer.exists) {
    ok(`global user config: ${globalLayer.path}  ${dim(`(source: ${globalLayer.source})`)}`);
  } else {
    warn(`global user config NOT present at ${globalLayer.path}  ${dim(`(source: ${globalLayer.source})`)}`);
    fix('sp init --global');
  }

  let summaries: Awaited<ReturnType<SpecialistLoader['list']>>;
  try {
    summaries = await loader.list();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`SpecialistLoader.list() threw: ${msg}`);
    return false;
  }

  // Templates (category:'template') are copy-source specialists that are never
  // dispatched, so a missing model is not a real gap.
  const dispatchable = summaries.filter(s => s.category !== 'template');
  const missing: string[] = [];
  for (const summary of dispatchable) {
    if (!summary.model || summary.model === '') missing.push(summary.name);
  }

  const total = dispatchable.length;
  const present = total - missing.length;

  if (missing.length === 0) {
    ok(`${present}/${total} specialists have a model configured`);
  } else if (!globalLayer.exists) {
    // Fresh-install notice path: no global file yet, so missing models are expected.
    warn(`${present}/${total} specialists have a model configured  ${dim('(global override file not created yet)')}`);
    fix('sp init --global  →  sp edit --global  (set the model for each specialist you use)');
  } else {
    fail(`${present}/${total} specialists have a model configured`);
    hint(`missing: ${missing.join(', ')}`);
    fix(`sp edit --global <name>.execution.model <model-id>   (run once per missing specialist)`);
  }

  // Blocked-field warnings are populated as a side effect of list().
  const warnings = loader.getBlockedFieldWarnings();
  if (warnings.length === 0) {
    ok('no blocked-field overrides detected');
  } else {
    const stripCount = warnings.filter(w => w.severity === 'strip').length;
    const warnCount = warnings.filter(w => w.severity === 'warn').length;
    if (stripCount > 0) {
      fail(`${stripCount} blocked-field overrides STRIPPED from the global layer`);
      for (const w of warnings.filter(w => w.severity === 'strip')) {
        hint(`${w.specialist}: ${w.field} = ${JSON.stringify(w.value)}  ${dim('(source: global, stripped)')}`);
      }
      fix(`remove blocked fields from ${globalLayer.path}`);
    }
    if (warnCount > 0) {
      warn(`${warnCount} blocked-field overrides present in repo layers (v1: applied with warning)`);
      for (const w of warnings.filter(w => w.severity === 'warn')) {
        hint(`${w.specialist}: ${w.field} = ${JSON.stringify(w.value)}  ${dim(`(source: ${w.source})`)}`);
      }
    }
  }

  // Mandatory-rules selection coherence: report the effective specialist-specific
  // template_sets driven by the global layer. `null` inherits the shipped sets,
  // `[]` explicitly clears them, non-empty arrays replace them; index
  // required/default sets always load regardless (see config/mandatory-rules/README.md).
  const selection = (() => {
    if (!globalLayer.exists) return [];
    const globalConfig = readGlobalUserConfig(globalLayer);
    if (!globalConfig) return [];
    const entries: Array<{ name: string; template_sets: string[] | null }> = [];
    for (const [name, override] of Object.entries(globalConfig)) {
      const templateSets = (override as { mandatory_rules?: { template_sets?: unknown } } | undefined)
        ?.mandatory_rules?.template_sets;
      if (templateSets === undefined || templateSets === null) continue;
      entries.push({ name, template_sets: Array.isArray(templateSets) ? templateSets : null });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  })();

  if (selection.length === 0) {
    ok('mandatory-rules selection: no global template_sets overrides (all specialists inherit shipped sets)');
  } else {
    ok(`mandatory-rules selection: ${selection.length} specialist${selection.length === 1 ? '' : 's'} override template_sets globally`);
    for (const entry of selection) {
      hint(`${entry.name}: template_sets = ${JSON.stringify(entry.template_sets)}  ${dim('(null inherits, [] clears specialist-specific sets; index required/default sets always load)')}`);
    }
  }

  // Health = no missing-with-config + no strip warnings. Fresh install (no file) is a notice, not a fail.
  const stripFailures = warnings.filter(w => w.severity === 'strip').length;
  const missingFailures = globalLayer.exists ? missing.length : 0;
  return stripFailures === 0 && missingFailures === 0;
}

function renderDriftTable(root: string, json = false): void {
  const report = detectDriftUnderRoot(root);
  if (json) {
    process.stdout.write(`${JSON.stringify({ drift_findings: report.repos.flatMap((repo) => repo.findings) }, null, 2)}\n`);
    return;
  }
  console.log(`\n${bold('specialists doctor drift')}\n`);
  if (report.summary.findings === 0) {
    ok('No drift found');
    return;
  }
  for (const repo of report.repos) {
    console.log(`Repo: ${repo.root}`);
    for (const finding of repo.findings) {
      const status = finding.status.replaceAll('-', ' ');
      console.log(`  ${finding.kind} ${finding.scope} | ${status} | ${finding.path}`);
      console.log(`    action: ${finding.suggested_action}`);
      console.log(`    cmd: ${finding.suggestion_command}`);
    }
  }
  console.log(`Summary: ${report.summary.findings} findings across ${report.summary.repos} repo${report.summary.repos === 1 ? '' : 's'}`);
}

export function parseVersionTuple(value: string): [number, number, number] | null {
  const normalized = value.trim().replace(/^v/i, '');
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: string, right: string): number {
  const leftTuple = parseVersionTuple(left);
  const rightTuple = parseVersionTuple(right);
  if (!leftTuple || !rightTuple) return 0;

  for (let index = 0; index < 3; index += 1) {
    if (leftTuple[index] > rightTuple[index]) return 1;
    if (leftTuple[index] < rightTuple[index]) return -1;
  }

  return 0;
}

export function setStatusError(statusPath: string): void {
  try {
    const raw = readFileSync(statusPath, 'utf8');
    const status = JSON.parse(raw) as Record<string, unknown>;
    status.status = 'error';
    writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  } catch {
    // best-effort repair for corrupt status files
  }
}

interface CleanupProcessesResult {
  total: number;
  running: number;
  zombies: number;
  updated: number;
  zombieJobIds: string[];
}

function detectJobOutputMode(): 'db-first' | 'file-only' {
  return process.env.SPECIALISTS_JOB_FILE_OUTPUT === 'on' ? 'file-only' : 'db-first';
}

export function cleanupProcesses(jobsDir: string, dryRun: boolean): CleanupProcessesResult {
  const outputMode = detectJobOutputMode();
  const sqliteClient = outputMode === 'db-first' ? createObservabilitySqliteClient() : null;
  if (sqliteClient) {
    const result: CleanupProcessesResult = {
      total: 0,
      running: 0,
      zombies: 0,
      updated: 0,
      zombieJobIds: [] as string[],
    };

    const statuses = sqliteClient.listStatuses();
    for (const status of statuses) {
      if (status.status !== 'running' && status.status !== 'starting') continue;
      // Skip rows whose job_id was written NULL/empty — they can't be actioned by
      // the user (no path to open, no id to name) and rendering them as "undefined"
      // was misleading. The upstream write that produced them is a separate bug.
      if (!status.id) continue;
      result.total += 1;
      // process.kill(pid, 0) THROWS ESRCH when the pid is dead — it does not return false.
      // Mirror the file-path branch below (try/catch → zombie on ESRCH).
      let alive = false;
      if (status.pid) {
        try { process.kill(status.pid, 0); alive = true; } catch { alive = false; }
      }
      if (alive) {
        result.running += 1;
        continue;
      }

      result.zombies += 1;
      result.zombieJobIds.push(status.id);
      if (!dryRun) {
        const updatedStatus = { ...status, status: 'error' as const };
        sqliteClient.upsertStatus(updatedStatus);
        result.updated += 1;
      }
    }

    return result;
  }

  let entries: string[];
  try { entries = readdirSync(jobsDir); } catch { entries = []; }

  const result: CleanupProcessesResult = {
    total: 0,
    running: 0,
    zombies: 0,
    updated: 0,
    zombieJobIds: [],
  };

  for (const jobId of entries) {
    const statusPath = join(jobsDir, jobId, 'status.json');
    if (!existsSync(statusPath)) continue;

    try {
      const status = JSON.parse(readFileSync(statusPath, 'utf8')) as { status?: string; pid?: number };
      result.total += 1;
      if (status.status !== 'running' && status.status !== 'starting') continue;
      if (!status.pid) continue;

      try {
        process.kill(status.pid, 0);
        result.running += 1;
      } catch {
        result.zombies += 1;
        result.zombieJobIds.push(jobId);
        if (!dryRun) {
          setStatusError(statusPath);
          result.updated += 1;
        }
      }
    } catch {
      continue;
    }
  }

  return result;
}

export function renderProcessSummary(result: CleanupProcessesResult, dryRun: boolean): string {
  if (result.zombies === 0) {
    const detail = result.running > 0 ? `, ${result.running} currently running` : ', none currently running';
    return `${result.total} job${result.total !== 1 ? 's' : ''} checked${detail}`;
  }

  const action = dryRun ? 'would be marked error' : 'marked error';
  return `${result.zombies} zombie job${result.zombies === 1 ? '' : 's'} found (${result.updated} ${action})`;
}

function runDoctorOrphans(): void {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    console.log(`\n${bold('specialists doctor orphans')}\n`);
    fail('observability SQLite not available');
    fix('specialists db setup');
    console.log('');
    process.exit(1);
  }

  try {
    const findings = sqliteClient.scanOrphans();
    const byKind = {
      orphan: findings.filter(item => item.kind === 'orphan'),
      stalePointer: findings.filter(item => item.kind === 'stale-pointer'),
      integrity: findings.filter(item => item.kind === 'integrity-violation'),
    };

    console.log(`\n${bold('specialists doctor orphans')}\n`);

    if (findings.length === 0) {
      ok('No orphan/stale/integrity findings');
      console.log('');
      return;
    }

    const renderGroup = (label: string, rows: typeof findings): void => {
      if (rows.length === 0) return;
      console.log(`  ${yellow('○')} ${label}: ${rows.length}`);
      for (const row of rows) {
        console.log(`    - [${row.code}] ${row.message}`);
      }
    };

    renderGroup('orphan', byKind.orphan);
    renderGroup('stale-pointer', byKind.stalePointer);
    renderGroup('integrity-violation', byKind.integrity);
    console.log('');
    process.exit(1);
  } finally {
    sqliteClient.close();
  }
}

function resolveWatchdogMode(): string {
  const fileOutput = String(process.env.SPECIALISTS_JOB_FILE_OUTPUT ?? '').trim().toLowerCase();
  if (fileOutput === 'off') return 'db';
  if (process.execPath.endsWith('/bun')) return 'db';
  return 'file (degraded; Bun unavailable)';
}

function checkZombieJobs(): boolean {
  section('Background jobs');
  hint(`watchdog mode: ${resolveWatchdogMode()}`);
  const jobsDir = join(CWD, '.specialists', 'jobs');
  if (!existsSync(jobsDir)) {
    hint('No .specialists/jobs/ — skipping');
    return true;
  }

  const result = cleanupProcesses(jobsDir, false);

  if (result.total === 0) {
    ok('No jobs found');
    return true;
  }

  for (const jobId of result.zombieJobIds) {
    warn(`${jobId}  ${yellow('ZOMBIE')}  ${dim('pid not found for running job')}`);
    fix(`Edit .specialists/jobs/${jobId}/status.json  →  set "status": "error"`);
  }

  if (result.zombies === 0) {
    ok(renderProcessSummary(result, false));
  }

  return result.zombies === 0;
}

async function runDoctorPrDrift(json: boolean): Promise<void> {
  const client = createObservabilitySqliteClient();
  if (!client) {
    if (json) {
      console.log(JSON.stringify({ jobs: [], error: 'observability sqlite unavailable' }));
    } else {
      console.error('observability sqlite unavailable');
    }
    process.exitCode = 1;
    return;
  }

  try {
    const jobs = client.listJobsNeedingPrDriftRefresh();
    const results: Array<{
      job_id: string;
      classification: PrClassification | 'unknown';
      pr_url: string;
      error_kind?: string;
      duration_ms: number;
    }> = [];

    for (const job of jobs) {
      const startedAt = Date.now();

      // emit structured log: refresh_attempted
      console.error(JSON.stringify({
        component: 'pr_drift' as const,
        event: 'refresh_attempted',
        job_id: job.job_id,
        duration_ms: 0,
        gh_stderr_hash: '',
        branch: job.branch ?? null,
        checked_at_ms: startedAt,
      }));

      const result = await refreshPrDriftForJob({
        jobId: job.job_id,
        prUrl: job.pr_url,
        headSha: job.pr_head_sha ?? undefined,
        client,
      });

      const durationMs = Date.now() - startedAt;
      const classification = result.classification;
      const ghStderrHash = result.error_summary ? result.error_summary.slice(0, 8) : '';

      // emit structured log: refresh_completed or refresh_failed
      const eventOut: Record<string, unknown> = {
        component: 'pr_drift',
        event: result.ok ? 'refresh_completed' : 'refresh_failed',
        job_id: job.job_id,
        duration_ms: durationMs,
        gh_stderr_hash: ghStderrHash,
        pr_classification: classification,
        branch: job.branch ?? null,
        checked_at_ms: startedAt,
      };
      console.error(JSON.stringify(eventOut));

      results.push({
        job_id: job.job_id,
        classification,
        pr_url: job.pr_url,
        ...(result.error_kind ? { error_kind: result.error_kind } : {}),
        duration_ms: durationMs,
      });
    }

    if (json) {
      console.log(JSON.stringify({ jobs: results }, null, 2));
    } else {
      console.log(`\n${bold('specialists doctor --pr-drift')}\n`);
      if (results.length === 0) {
        ok('No PR-linked jobs need drift refresh');
      } else {
        for (const r of results) {
          const icon = r.classification === 'clean' ? green('✓')
            : r.classification === 'needs-rebase' ? yellow('○')
            : r.classification === 'conflicted' ? red('✗')
            : r.classification === 'blocked' ? yellow('■')
            : r.classification === 'stale' ? dim('○')
            : yellow('?');
          const suffix = r.error_kind ? ` ${dim(`(${r.error_kind})`)}` : '';
          console.log(`  ${icon} ${r.job_id}  ${r.classification}${suffix}`);
        }
      }
      console.log('');
    }
  } finally {
    client.close();
  }
}

async function runDoctorReapDeadJobs(opts: DoctorOptions): Promise<void> {
  const client = createObservabilitySqliteClient();
  if (!client) {
    if (opts.json) {
      console.log(JSON.stringify({ dryRun: opts.dry_run, found: [], cancelled: 0, error: 'observability sqlite unavailable' }));
    } else {
      console.error('observability sqlite unavailable');
    }
    process.exitCode = 1;
    return;
  }

  try {
    const result = auditDeadJobs({
      client,
      dryRun: opts.dry_run,
      nowMs: Date.now(),
    });

    for (const finding of result.found) {
      const structuredLog = {
        component: 'dead_job_audit' as const,
        event: 'dead_declared',
        job_id: finding.job_id,
        age_ms: finding.age_ms,
        dry_run: opts.dry_run,
      };
      console.error(JSON.stringify(structuredLog));
    }

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n${bold('specialists doctor --reap-dead-jobs')}\n`);
      if (result.found.length === 0) {
        ok('No dead running/waiting jobs found');
      } else {
        const action = opts.dry_run ? 'Would cancel' : 'Cancelled';
        console.log(`  ${yellow('○')} ${result.found.length} dead job(s) found (${result.cancelled} ${action})`);
        for (const f of result.found) {
          console.log(`    - ${f.job_id} pid=${f.pid} age=${Math.round(f.age_ms / 1000)}s`);
        }
      }
      console.log('');
    }
  } finally {
    client.close();
  }
}

export async function run(argv: readonly string[] = process.argv.slice(3)): Promise<void> {
  const subcommand = argv[0];
  if (subcommand === 'orphans') {
    runDoctorOrphans();
    return;
  }

  const opts = parseDoctorArgs(argv);
  if (opts.drift) {
    renderDriftTable(opts.root ?? process.cwd(), opts.json);
    return;
  }

  if (opts.pr_drift) {
    await runDoctorPrDrift(opts.json);
    return;
  }

  if (opts.specialists) {
    // KAN-90 / unitAI-1gtou.14: focused override-layer health view.
    console.log(`\n${bold('specialists doctor --specialists')}\n`);
    const overridesOk = await checkSpecialistOverrides();
    console.log('');
    process.exitCode = overridesOk ? 0 : 1;
    return;
  }

  if (opts.reap_dead_jobs) {
    await runDoctorReapDeadJobs(opts);
    return;
  }

  if (subcommand && subcommand !== '--help' && subcommand !== '-h' && !subcommand.startsWith('--')) {
    console.error(`Unknown doctor subcommand: '${subcommand}'`);
    process.exit(1);
  }

  console.log(`\n${bold('specialists doctor')}\n`);
  const piOk = checkPi();
  const spOk = checkSpAlias();
  const bdOk = checkBd();
  const xtOk = checkXt();
  const hooksOk = checkHooks();
  const versionOk = checkVersion();
  const skillDriftOk = checkSkillDrift();
  const userOverlayOk = checkUserOverlayDrift();
  const dirsOk = checkRuntimeDirs();
  const jobsOk = checkZombieJobs();
  const fragmentsOk = checkClaudeMdFragments();
  const overridesOk = await checkSpecialistOverrides();

  const allOk = piOk && spOk && bdOk && xtOk && hooksOk && versionOk && skillDriftOk && userOverlayOk && dirsOk && jobsOk && fragmentsOk && overridesOk;
  console.log('');
  if (allOk) {
    console.log(`  ${green('✓')} ${bold('All checks passed')}  — specialists is healthy`);
  } else {
    console.log(`  ${yellow('○')} ${bold('Some checks failed')}  — follow the fix hints above`);
    console.log(`  ${dim('Hooks + default skill pool are vendored globally by xtrm-tools; reinstall if drift or missing files appear.')}`);
  }
  console.log('');
}
