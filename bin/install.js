#!/usr/bin/env node
// Specialists Installer
// Usage: npx --package=@jaggerxtrm/specialists install

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME            = homedir();
const SPECIALISTS_DIR = join(HOME, '.agents', 'specialists');
const CLAUDE_DIR      = join(HOME, '.claude');
const HOOKS_DIR       = join(CLAUDE_DIR, 'hooks');
const SETTINGS_FILE   = join(CLAUDE_DIR, 'settings.json');
const HOOK_FILE       = join(HOOKS_DIR, 'specialists-main-guard.mjs');
const MCP_NAME        = 'specialists';
const GITHUB_PKG      = '@jaggerxtrm/specialists';

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const dim    = (s) => `\x1b[2m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;

function section(label) {
  const line = '─'.repeat(Math.max(0, 40 - label.length));
  console.log(`\n${bold(`── ${label} ${line}`)}`);
}

function ok(label)   { console.log(`  ${green('✓')} ${label}`); }
function skip(label) { console.log(`  ${yellow('○')} ${label}`); }
function info(label) { console.log(`  ${dim(label)}`); }
function fail(label) { console.log(`  ${red('✗')} ${label}`); }

function isInstalled(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function npmInstallGlobal(pkg) {
  const r = spawnSync('npm', ['install', '-g', pkg], { stdio: 'inherit', encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`npm install -g ${pkg} failed`);
}

function installDolt() {
  if (process.platform === 'darwin') {
    info('Installing dolt via brew...');
    const r = spawnSync('brew', ['install', 'dolt'], { stdio: 'inherit', encoding: 'utf8' });
    r.status === 0 ? ok('dolt installed') : fail('brew install dolt failed — install manually: brew install dolt');
  } else {
    info('Installing dolt (requires sudo)...');
    const r = spawnSync(
      'sudo', ['bash', '-c', 'curl -L https://github.com/dolthub/dolt/releases/latest/download/install.sh | bash'],
      { stdio: 'inherit', encoding: 'utf8' }
    );
    if (r.status === 0) {
      ok('dolt installed');
    } else {
      fail('dolt install failed — install manually:');
      info("  sudo bash -c 'curl -L https://github.com/dolthub/dolt/releases/latest/download/install.sh | bash'");
    }
  }
}

function registerMCP() {
  const check = spawnSync('claude', ['mcp', 'get', MCP_NAME], { encoding: 'utf8' });
  if (check.status === 0) return false;

  npmInstallGlobal(GITHUB_PKG);

  const r = spawnSync('claude', [
    'mcp', 'add', '--scope', 'user', MCP_NAME, '--', MCP_NAME,
  ], { stdio: 'inherit', encoding: 'utf8' });
  if (r.status !== 0) throw new Error('claude mcp add failed');
  return true;
}

// ── Hook installation ─────────────────────────────────────────────────────────

const HOOK_SCRIPT = `#!/usr/bin/env node
// specialists — Claude Code PreToolUse hook
// Blocks writes and git commit/push on main/master branch.
// Exit 0: allow  |  Exit 2: block (message shown to user)
//
// Installed by: npx --package=@jaggerxtrm/specialists install

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let branch = '';
try {
  branch = execSync('git branch --show-current', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch {}

if (!branch || (branch !== 'main' && branch !== 'master')) {
  process.exit(0);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const tool = input.tool_name ?? '';
const blockMsg =
  \`⛔ Direct edits on '\${branch}' are not allowed.\\n\` +
  \`Create a feature branch first: git checkout -b feature/<name>\`;

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

if (WRITE_TOOLS.has(tool)) {
  process.stderr.write(blockMsg + '\\n');
  process.exit(2);
}

if (tool === 'Bash') {
  const cmd = input.tool_input?.command ?? '';
  if (/^git (commit|push)/.test(cmd)) {
    process.stderr.write(blockMsg + '\\n');
    process.exit(2);
  }
}

process.exit(0);
`;

const HOOK_ENTRY = {
  matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash',
  hooks: [{ type: 'command', command: HOOK_FILE }],
};

function installHook() {
  // 1. Write hook script
  mkdirSync(HOOKS_DIR, { recursive: true });
  writeFileSync(HOOK_FILE, HOOK_SCRIPT, 'utf8');
  chmodSync(HOOK_FILE, 0o755);

  // 2. Merge into ~/.claude/settings.json
  let settings = {};
  if (existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')); } catch { /* malformed, overwrite */ }
  }

  if (!Array.isArray(settings.hooks?.PreToolUse)) {
    settings.hooks = settings.hooks ?? {};
    settings.hooks.PreToolUse = [];
  }

  // Idempotent: remove any previous specialists-main-guard entry, re-add
  settings.hooks.PreToolUse = settings.hooks.PreToolUse
    .filter(e => !e.hooks?.some(h => h.command?.includes('specialists-main-guard')));
  settings.hooks.PreToolUse.push(HOOK_ENTRY);

  mkdirSync(CLAUDE_DIR, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n' + bold('  Specialists — full-stack installer'));

// 1. pi
section('pi  (coding agent runtime)');
if (isInstalled('pi')) {
  skip('pi already installed');
} else {
  info('Installing @mariozechner/pi-coding-agent...');
  npmInstallGlobal('@mariozechner/pi-coding-agent');
  ok('pi installed');
}

// 2. beads
section('beads  (issue tracker)');
if (isInstalled('bd')) {
  skip('bd already installed');
} else {
  info('Installing @beads/bd...');
  npmInstallGlobal('@beads/bd');
  ok('bd installed');
}

// 3. dolt
section('dolt  (beads sync backend)');
if (isInstalled('dolt')) {
  skip('dolt already installed');
} else {
  installDolt();
}

// 4. Specialists MCP
section('Specialists MCP');
const registered = registerMCP();
registered
  ? ok(`MCP '${MCP_NAME}' registered at user scope`)
  : skip(`MCP '${MCP_NAME}' already registered`);

// 5. Scaffold user specialists directory
section('Scaffold');
if (!existsSync(SPECIALISTS_DIR)) {
  mkdirSync(SPECIALISTS_DIR, { recursive: true });
  ok('~/.agents/specialists/ created');
} else {
  skip('~/.agents/specialists/ already exists');
}

// 6. Claude Code hooks
section('Claude Code hooks');
const hookExisted = existsSync(HOOK_FILE);
installHook();
hookExisted
  ? ok('main-guard hook updated')
  : ok('main-guard hook installed → ~/.claude/hooks/specialists-main-guard.sh');
info('Blocks Edit/Write/git commit/push on main or master branch (JS, no jq needed)');

// 7. Health check
section('Health check');
if (isInstalled('pi')) {
  const r = spawnSync('pi', ['--list-models'], { encoding: 'utf8' });
  r.status === 0
    ? ok('pi has at least one active provider')
    : skip('No active provider — run pi config to set one up');
}

// 8. Done
console.log('\n' + bold(green('  Done!')));
console.log('\n' + bold('  Next steps:'));
console.log(`  1. ${bold('Configure pi:')} run ${yellow('pi')} then ${yellow('pi config')} to enable model providers`);
console.log(`  2. ${bold('Restart Claude Code')} to load the MCP and hooks`);
console.log(`  3. ${bold('Update later:')} re-run this installer\n`);
