// Health check for specialists installation — like bd doctor.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';

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
const CLAUDE_DIR = join(CWD, '.claude');
const PI_DIR = join(CWD, '.pi');
const XTRM_SKILLS_DIR = join(CWD, '.xtrm', 'skills');
const XTRM_DEFAULT_SKILLS_DIR = join(XTRM_SKILLS_DIR, 'default');
const XTRM_ACTIVE_SKILLS_DIR = join(XTRM_SKILLS_DIR, 'active');
const ACTIVE_CLAUDE_SKILLS_DIR = join(XTRM_ACTIVE_SKILLS_DIR, 'claude');
const ACTIVE_PI_SKILLS_DIR = join(XTRM_ACTIVE_SKILLS_DIR, 'pi');
const CONFIG_SKILLS_DIR = join(CWD, 'config', 'skills');
const CONFIG_SPECIALISTS_DIR = join(CWD, 'config', 'specialists');
const CONFIG_MANDATORY_RULES_DIR = join(CWD, 'config', 'mandatory-rules');
const CONFIG_NODES_DIR = join(CWD, 'config', 'nodes');
const SPECIALISTS_DIR = join(CWD, '.specialists');
const DEFAULT_SPECIALISTS_DIR = join(SPECIALISTS_DIR, 'default');
const HOOKS_DIR = join(CWD, '.xtrm', 'hooks', 'specialists');
const CLAUDE_HOOKS_DIR = join(CLAUDE_DIR, 'hooks');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
const MCP_FILE = join(CWD, '.mcp.json');
const HOOK_NAMES = [
  'specialists-complete.mjs',
  'specialists-session-start.mjs',
] as const;

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
  section('Claude Code hooks  (2 expected)');
  let allPresent = true;

  for (const name of HOOK_NAMES) {
    const canonicalPath = join(HOOKS_DIR, name);
    if (!existsSync(canonicalPath)) {
      fail(`${relative(CWD, canonicalPath)}  ${red('missing')}`);
      fix('specialists init');
      allPresent = false;
    } else {
      ok(relative(CWD, canonicalPath));
    }

    const claudeHookPath = join(CLAUDE_HOOKS_DIR, name);
    const symlinkState = isSymlinkTo(claudeHookPath, canonicalPath);
    if (symlinkState.ok) {
      ok(`${relative(CWD, claudeHookPath)} -> ${relative(dirname(claudeHookPath), canonicalPath)}`);
      continue;
    }

    allPresent = false;
    const relHookPath = relative(CWD, claudeHookPath);
    if (symlinkState.reason === 'missing') {
      fail(`${relHookPath} missing`);
    } else if (symlinkState.reason === 'not-symlink') {
      fail(`${relHookPath} is not a symlink`);
    } else if (symlinkState.reason === 'wrong-target') {
      fail(`${relHookPath} points to ${symlinkState.target ?? 'unknown target'}`);
    } else {
      fail(`${relHookPath} is broken`);
    }
    fix('specialists init');
  }

  const settings = loadJson(SETTINGS_FILE);
  if (!settings) {
    warn(`Could not read ${SETTINGS_FILE}`);
    fix('specialists init');
    return false;
  }

  // Read from settings.hooks (correct location) and fall back to top-level (legacy buggy location)
  const hooksObj = (settings.hooks ?? {}) as Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
  const hookEntries = Object.values(hooksObj).flat();
  const legacyEntries = Object.entries(settings)
    .filter(([key, value]) => key !== 'hooks' && Array.isArray(value))
    .flatMap(([, value]) => value as Array<{ hooks?: Array<{ command?: string }> }>);
  const wiredCommands = new Set(
    [...hookEntries, ...legacyEntries]
      .flatMap(entry => (entry.hooks ?? []).map(hook => hook.command ?? '')),
  );

  for (const name of HOOK_NAMES) {
    const expectedRelative = `node .claude/hooks/${name}`;
    if (!wiredCommands.has(expectedRelative)) {
      warn(`${name} not wired in settings.json`);
      fix('specialists init');
      allPresent = false;
    }
  }

  if (allPresent) hint(`Hooks wired in ${SETTINGS_FILE}`);
  return allPresent;
}

function checkMCP(): boolean {
  section('MCP registration');
  const mcp = loadJson(MCP_FILE);
  const spec = (mcp?.mcpServers as { specialists?: { command?: string } } | undefined)?.specialists;
  if (!spec || spec.command !== 'specialists') {
    fail(`MCP server 'specialists' not registered in .mcp.json`);
    fix('specialists init');
    return false;
  }
  ok(`MCP server 'specialists' registered in ${MCP_FILE}`);
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

function isSymlinkTo(linkPath: string, expectedTargetPath: string): { ok: boolean; reason?: string; target?: string } {
  if (!existsSync(linkPath)) return { ok: false, reason: 'missing' };

  let stats;
  try {
    stats = lstatSync(linkPath);
  } catch {
    return { ok: false, reason: 'broken' };
  }

  if (!stats.isSymbolicLink()) return { ok: false, reason: 'not-symlink' };

  try {
    const rawTarget = readlinkSync(linkPath);
    const resolvedTarget = resolve(dirname(linkPath), rawTarget);
    const resolvedExpected = resolve(expectedTargetPath);
    if (resolvedTarget !== resolvedExpected) {
      return { ok: false, reason: 'wrong-target', target: rawTarget };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'broken' };
  }
}

function checkSkillDrift(): boolean {
  section('Skill drift  (.xtrm skill sync)');

  if (!existsSync(CONFIG_SKILLS_DIR)) {
    fail('config/skills/ missing');
    fix('restore config/skills/ from git');
    return false;
  }

  if (!existsSync(XTRM_DEFAULT_SKILLS_DIR)) {
    fail('.xtrm/skills/default/ missing');
    fix('specialists init --sync-skills');
    return false;
  }

  const canonicalHashes = collectFileHashes(CONFIG_SKILLS_DIR);
  const defaultHashes = collectFileHashes(XTRM_DEFAULT_SKILLS_DIR);

  const drifted: string[] = [];
  const missingInDefault: string[] = [];
  const extraInDefault: string[] = [];

  for (const [relPath, canonicalHash] of canonicalHashes) {
    const defaultHash = defaultHashes.get(relPath);
    if (!defaultHash) {
      missingInDefault.push(relPath);
      continue;
    }
    if (canonicalHash !== defaultHash) drifted.push(relPath);
  }

  for (const relPath of defaultHashes.keys()) {
    if (!canonicalHashes.has(relPath)) extraInDefault.push(relPath);
  }

  if (drifted.length === 0 && missingInDefault.length === 0 && extraInDefault.length === 0) {
    ok('config/skills/ and .xtrm/skills/default/ are in sync');
  } else {
    if (drifted.length > 0) {
      fail(`${drifted.length} drifted file${drifted.length === 1 ? '' : 's'} between config/skills and .xtrm/skills/default`);
      hint(`example: ${drifted.slice(0, 3).join(', ')}${drifted.length > 3 ? ', ...' : ''}`);
    }
    if (missingInDefault.length > 0) {
      fail(`${missingInDefault.length} file${missingInDefault.length === 1 ? '' : 's'} missing from .xtrm/skills/default`);
      hint(`example: ${missingInDefault.slice(0, 3).join(', ')}${missingInDefault.length > 3 ? ', ...' : ''}`);
    }
    if (extraInDefault.length > 0) {
      warn(`${extraInDefault.length} extra file${extraInDefault.length === 1 ? '' : 's'} found only in .xtrm/skills/default`);
      hint(`example: ${extraInDefault.slice(0, 3).join(', ')}${extraInDefault.length > 3 ? ', ...' : ''}`);
    }
    fix('specialists init --sync-skills');
  }

  let linksOk = true;
  for (const scope of ['claude', 'pi'] as const) {
    const activeRoot = join(XTRM_ACTIVE_SKILLS_DIR, scope);
    if (!existsSync(activeRoot)) {
      fail(`${relative(CWD, activeRoot)}/ missing`);
      fix('specialists init --sync-skills');
      linksOk = false;
      continue;
    }

    const defaultSkills = readdirSync(XTRM_DEFAULT_SKILLS_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    for (const skillName of defaultSkills) {
      const activeLinkPath = join(activeRoot, skillName);
      const expectedTarget = join(XTRM_DEFAULT_SKILLS_DIR, skillName);
      const state = isSymlinkTo(activeLinkPath, expectedTarget);
      if (state.ok) continue;

      linksOk = false;
      const relLink = relative(CWD, activeLinkPath);
      if (state.reason === 'missing') {
        fail(`${relLink} missing`);
      } else if (state.reason === 'not-symlink') {
        fail(`${relLink} is not a symlink`);
      } else if (state.reason === 'wrong-target') {
        fail(`${relLink} points to ${state.target ?? 'unknown target'}`);
      } else {
        fail(`${relLink} is broken`);
      }
      fix('specialists init --sync-skills');
    }
  }

  const skillRootChecks: Array<{ root: string; expected: string }> = [
    { root: join(CLAUDE_DIR, 'skills'), expected: ACTIVE_CLAUDE_SKILLS_DIR },
    { root: join(PI_DIR, 'skills'), expected: ACTIVE_PI_SKILLS_DIR },
  ];

  let rootLinksOk = true;
  for (const check of skillRootChecks) {
    const state = isSymlinkTo(check.root, check.expected);
    if (state.ok) {
      ok(`${relative(CWD, check.root)} -> ${relative(dirname(check.root), check.expected)}`);
      continue;
    }

    rootLinksOk = false;
    const relRoot = relative(CWD, check.root);
    if (state.reason === 'missing') {
      fail(`${relRoot} missing`);
    } else if (state.reason === 'not-symlink') {
      fail(`${relRoot} is not a symlink`);
    } else if (state.reason === 'wrong-target') {
      fail(`${relRoot} points to ${state.target ?? 'unknown target'}`);
    } else {
      fail(`${relRoot} is broken`);
    }
    fix('specialists init --sync-skills');
  }

  return drifted.length === 0 && missingInDefault.length === 0 && linksOk && rootLinksOk;
}


function checkManagedMirror(label: string, sourceDir: string, mirrorDir: string, fixHint: string): boolean {
  if (!existsSync(sourceDir)) {
    warn(`${label} source missing: ${relative(CWD, sourceDir)}`);
    fix(fixHint);
    return false;
  }
  if (!existsSync(mirrorDir)) {
    fail(`${label} mirror missing: ${relative(CWD, mirrorDir)}`);
    fix(fixHint);
    return false;
  }

  const sourceHashes = collectFileHashes(sourceDir);
  const mirrorHashes = collectFileHashes(mirrorDir);
  const drifted = [...sourceHashes.keys()].filter(relPath => mirrorHashes.get(relPath) !== sourceHashes.get(relPath));
  const missing = [...sourceHashes.keys()].filter(relPath => !mirrorHashes.has(relPath));
  const extra = [...mirrorHashes.keys()].filter(relPath => !sourceHashes.has(relPath));

  if (drifted.length === 0 && missing.length === 0 && extra.length === 0) {
    ok(`${label} mirror in sync`);
    return true;
  }

  if (drifted.length > 0) {
    fail(`${label}: ${drifted.length} drifted file${drifted.length === 1 ? '' : 's'}`);
    hint(`example: ${drifted.slice(0, 3).join(', ')}${drifted.length > 3 ? ', ...' : ''}`);
  }
  if (missing.length > 0) {
    fail(`${label}: ${missing.length} missing mirror file${missing.length === 1 ? '' : 's'}`);
    hint(`example: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', ...' : ''}`);
  }
  if (extra.length > 0) {
    warn(`${label}: ${extra.length} extra mirror file${extra.length === 1 ? '' : 's'}`);
    hint(`example: ${extra.slice(0, 3).join(', ')}${extra.length > 3 ? ', ...' : ''}`);
  }
  fix(fixHint);
  return false;
}

function checkManagedAssetMirrors(): boolean {
  section('Managed mirrors  (specialists / mandatory-rules / nodes)');
  const specialistsOk = checkManagedMirror('specialists', CONFIG_SPECIALISTS_DIR, DEFAULT_SPECIALISTS_DIR, 'specialists init --sync-defaults');
  const rulesOk = checkManagedMirror('mandatory-rules', CONFIG_MANDATORY_RULES_DIR, join(DEFAULT_SPECIALISTS_DIR, 'mandatory-rules'), 'specialists init --sync-defaults');
  const nodesOk = checkManagedMirror('nodes', CONFIG_NODES_DIR, join(DEFAULT_SPECIALISTS_DIR, 'nodes'), 'specialists init --sync-defaults');
  return specialistsOk && rulesOk && nodesOk;
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
      result.total += 1;
      if (status.pid && process.kill(status.pid, 0)) {
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

function checkZombieJobs(): boolean {
  section('Background jobs');
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

export async function run(argv: readonly string[] = process.argv.slice(3)): Promise<void> {
  const subcommand = argv[0];
  if (subcommand === 'orphans') {
    runDoctorOrphans();
    return;
  }

  if (subcommand && subcommand !== '--help' && subcommand !== '-h') {
    console.error(`Unknown doctor subcommand: '${subcommand}'`);
    process.exit(1);
  }

  console.log(`\n${bold('specialists doctor')}\n`);
  const piOk = checkPi();
  const spOk = checkSpAlias();
  const bdOk = checkBd();
  const xtOk = checkXt();
  const hooksOk = checkHooks();
  const mcpOk = checkMCP();
  const skillDriftOk = checkSkillDrift();
  const mirrorOk = checkManagedAssetMirrors();
  const dirsOk = checkRuntimeDirs();
  const jobsOk = checkZombieJobs();

  const allOk = piOk && spOk && bdOk && xtOk && hooksOk && mcpOk && skillDriftOk && mirrorOk && dirsOk && jobsOk;
  console.log('');
  if (allOk) {
    console.log(`  ${green('✓')} ${bold('All checks passed')}  — specialists is healthy`);
  } else {
    console.log(`  ${yellow('○')} ${bold('Some checks failed')}  — follow the fix hints above`);
    console.log(`  ${dim('specialists init fixes hook + MCP registration; specialists init --sync-skills fixes skill drift/symlink issues; specialists init --sync-defaults fixes managed mirrors.')}`);
  }
  console.log('');
}
