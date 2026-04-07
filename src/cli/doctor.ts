// Health check for specialists installation — like bd doctor.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

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
const SPECIALISTS_DIR = join(CWD, '.specialists');
const HOOKS_DIR = join(SPECIALISTS_DIR, 'default', 'hooks');
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
    const dest = join(HOOKS_DIR, name);
    if (!existsSync(dest)) {
      fail(`${name}  ${red('missing')}`);
      fix('specialists install');
      allPresent = false;
    } else {
      ok(name);
    }
  }

  const settings = loadJson(SETTINGS_FILE);
  if (!settings) {
    warn(`Could not read ${SETTINGS_FILE}`);
    fix('specialists install');
    return false;
  }

  const userPromptSubmit = (settings.UserPromptSubmit as Array<{ hooks?: Array<{ command?: string }> }> | undefined) ?? [];
  const sessionStart = (settings.SessionStart as Array<{ hooks?: Array<{ command?: string }> }> | undefined) ?? [];
  const wiredCommands = new Set(
    [...userPromptSubmit, ...sessionStart]
      .flatMap(entry => (entry.hooks ?? []).map(hook => hook.command ?? '')),
  );

  for (const name of HOOK_NAMES) {
    const expectedRelative = `node .specialists/default/hooks/${name}`;
    if (!wiredCommands.has(expectedRelative)) {
      warn(`${name} not wired in settings.json`);
      fix('specialists install');
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
    fix('specialists install');
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

function checkZombieJobs(): boolean {
  section('Background jobs');
  const jobsDir = join(CWD, '.specialists', 'jobs');
  if (!existsSync(jobsDir)) {
    hint('No .specialists/jobs/ — skipping');
    return true;
  }

  let entries: string[];
  try { entries = readdirSync(jobsDir); } catch { entries = []; }
  if (entries.length === 0) {
    ok('No jobs found');
    return true;
  }

  let zombies = 0;
  let total = 0;
  let running = 0;
  for (const jobId of entries) {
    const statusPath = join(jobsDir, jobId, 'status.json');
    if (!existsSync(statusPath)) continue;
    try {
      const status = JSON.parse(readFileSync(statusPath, 'utf8')) as { status?: string; pid?: number };
      total++;
      if (status.status === 'running' || status.status === 'starting') {
        const pid = status.pid;
        if (pid) {
          let alive = false;
          try { process.kill(pid, 0); alive = true; } catch {}
          if (alive) running++;
          else {
            zombies++;
            warn(`${jobId}  ${yellow('ZOMBIE')}  ${dim(`pid ${pid} not found, status=${status.status}`)}`);
            fix(`Edit .specialists/jobs/${jobId}/status.json  →  set "status": "error"`);
          }
        }
      }
    } catch {}
  }

  if (zombies === 0) {
    const detail = running > 0 ? `, ${running} currently running` : ', none currently running';
    ok(`${total} job${total !== 1 ? 's' : ''} checked${detail}`);
  }
  return zombies === 0;
}

export async function run(): Promise<void> {
  console.log(`\n${bold('specialists doctor')}\n`);
  const piOk = checkPi();
  const spOk = checkSpAlias();
  const bdOk = checkBd();
  const xtOk = checkXt();
  const hooksOk = checkHooks();
  const mcpOk = checkMCP();
  const skillDriftOk = checkSkillDrift();
  const dirsOk = checkRuntimeDirs();
  const jobsOk = checkZombieJobs();

  const allOk = piOk && spOk && bdOk && xtOk && hooksOk && mcpOk && skillDriftOk && dirsOk && jobsOk;
  console.log('');
  if (allOk) {
    console.log(`  ${green('✓')} ${bold('All checks passed')}  — specialists is healthy`);
  } else {
    console.log(`  ${yellow('○')} ${bold('Some checks failed')}  — follow the fix hints above`);
    console.log(`  ${dim('specialists install fixes hook + MCP registration; specialists init --sync-skills fixes skill drift/symlink issues.')}`);
  }
  console.log('');
}
