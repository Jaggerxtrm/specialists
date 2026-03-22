// Health check for specialists installation — like bd doctor.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
const HOOKS_DIR = join(CLAUDE_DIR, 'hooks');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
const MCP_FILE = join(CWD, '.mcp.json');
const HOOK_NAMES = [
  'specialists-complete.mjs',
  'specialists-session-start.mjs',
] as const;

function loadJson(path: string): Record<string, any> | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>; } catch { return null; }
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

  const hooks = (settings.hooks ?? {}) as Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
  const wiredCommands = new Set(
    [
      ...(hooks.UserPromptSubmit ?? []),
      ...(hooks.SessionStart ?? []),
    ].flatMap(entry => (entry.hooks ?? []).map(h => h.command ?? '')),
  );

  for (const name of HOOK_NAMES) {
    const expected = join(HOOKS_DIR, name);
    if (!wiredCommands.has(expected)) {
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
  const spec = mcp?.mcpServers?.specialists;
  if (!spec || spec.command !== 'specialists') {
    fail(`MCP server 'specialists' not registered in .mcp.json`);
    fix('specialists install');
    return false;
  }
  ok(`MCP server 'specialists' registered in ${MCP_FILE}`);
  return true;
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
  const bdOk = checkBd();
  const xtOk = checkXt();
  const hooksOk = checkHooks();
  const mcpOk = checkMCP();
  const dirsOk = checkRuntimeDirs();
  const jobsOk = checkZombieJobs();

  const allOk = piOk && bdOk && xtOk && hooksOk && mcpOk && dirsOk && jobsOk;
  console.log('');
  if (allOk) {
    console.log(`  ${green('✓')} ${bold('All checks passed')}  — specialists is healthy`);
  } else {
    console.log(`  ${yellow('○')} ${bold('Some checks failed')}  — follow the fix hints above`);
    console.log(`  ${dim('specialists install fixes hook + MCP registration; pi, bd, and xt must be installed separately.')}`);
  }
  console.log('');
}
