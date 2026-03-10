#!/usr/bin/env node
// Specialists Installer
// Usage: npx --package=@jaggerxtrm/specialists install

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, chmodSync } from 'node:fs';
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

// Bundled specialists dir — resolved relative to this file (bin/../specialists/)
const BUNDLED_SPECIALISTS_DIR = new URL('../specialists', import.meta.url).pathname;
const BUNDLED_HOOKS_DIR       = new URL('../hooks', import.meta.url).pathname;

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


const BEADS_EDIT_GATE_FILE   = join(HOOKS_DIR, 'beads-edit-gate.mjs');
const BEADS_COMMIT_GATE_FILE = join(HOOKS_DIR, 'beads-commit-gate.mjs');
const BEADS_STOP_GATE_FILE   = join(HOOKS_DIR, 'beads-stop-gate.mjs');

const BEADS_EDIT_GATE_ENTRY = {
  matcher: 'Edit|Write|MultiEdit|NotebookEdit|mcp__serena__replace_symbol_body|mcp__serena__insert_after_symbol|mcp__serena__insert_before_symbol',
  hooks: [{ type: 'command', command: BEADS_EDIT_GATE_FILE, timeout: 10000 }],
};
const BEADS_COMMIT_GATE_ENTRY = {
  matcher: 'Bash',
  hooks: [{ type: 'command', command: BEADS_COMMIT_GATE_FILE, timeout: 10000 }],
};
const BEADS_STOP_GATE_ENTRY = {
  hooks: [{ type: 'command', command: BEADS_STOP_GATE_FILE, timeout: 10000 }],
};

function installHook() {
  mkdirSync(HOOKS_DIR, { recursive: true });

  // Copy hook files from bundled hooks/ directory
  copyFileSync(join(BUNDLED_HOOKS_DIR, 'specialists-main-guard.mjs'), HOOK_FILE);
  chmodSync(HOOK_FILE, 0o755);
  copyFileSync(join(BUNDLED_HOOKS_DIR, 'beads-edit-gate.mjs'), BEADS_EDIT_GATE_FILE);
  chmodSync(BEADS_EDIT_GATE_FILE, 0o755);
  copyFileSync(join(BUNDLED_HOOKS_DIR, 'beads-commit-gate.mjs'), BEADS_COMMIT_GATE_FILE);
  chmodSync(BEADS_COMMIT_GATE_FILE, 0o755);
  copyFileSync(join(BUNDLED_HOOKS_DIR, 'beads-stop-gate.mjs'), BEADS_STOP_GATE_FILE);
  chmodSync(BEADS_STOP_GATE_FILE, 0o755);

  let settings = {};
  if (existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')); } catch {}
  }

  settings.hooks = settings.hooks ?? {};

  // PreToolUse — replace any existing specialists-managed entries
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(e =>
    !e.hooks?.some(h =>
      h.command?.includes('specialists-main-guard') ||
      h.command?.includes('beads-edit-gate') ||
      h.command?.includes('beads-commit-gate')
    )
  );
  settings.hooks.PreToolUse.push(HOOK_ENTRY);
  settings.hooks.PreToolUse.push(BEADS_EDIT_GATE_ENTRY);
  settings.hooks.PreToolUse.push(BEADS_COMMIT_GATE_ENTRY);

  // Stop — replace any existing beads-stop-gate entry
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];
  settings.hooks.Stop = settings.hooks.Stop.filter(e =>
    !e.hooks?.some(h => h.command?.includes('beads-stop-gate'))
  );
  settings.hooks.Stop.push(BEADS_STOP_GATE_ENTRY);

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

// 5. Scaffold + copy built-in specialists
section('Specialists');
mkdirSync(SPECIALISTS_DIR, { recursive: true });

const yamlFiles = existsSync(BUNDLED_SPECIALISTS_DIR)
  ? readdirSync(BUNDLED_SPECIALISTS_DIR).filter(f => f.endsWith('.specialist.yaml'))
  : [];

let installed = 0;
let skipped = 0;
for (const file of yamlFiles) {
  const dest = join(SPECIALISTS_DIR, file);
  if (existsSync(dest)) {
    skipped++;
  } else {
    copyFileSync(join(BUNDLED_SPECIALISTS_DIR, file), dest);
    installed++;
  }
}

if (installed > 0) ok(`${installed} specialist(s) installed → ~/.agents/specialists/`);
if (skipped  > 0) skip(`${skipped} specialist(s) already exist (user-modified, keeping)`);
if (installed === 0 && skipped === 0) skip('No built-in specialists found');
info('Edit any .specialist.yaml in ~/.agents/specialists/ to customise models, prompts, permissions');

// 6. Claude Code hooks
section('Claude Code hooks');
const hookExisted = existsSync(HOOK_FILE);
installHook();
hookExisted
  ? ok('hooks updated (main-guard + beads gates)')
  : ok('hooks installed → ~/.claude/hooks/');
info('main-guard: blocks file edits and direct master pushes (enforces PR workflow)');
info('beads-edit-gate: requires in_progress bead before editing files');
info('beads-commit-gate: requires issues closed before git commit');
info('beads-stop-gate: requires issues closed before session end');

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
console.log(`  3. ${bold('Customise specialists:')} edit files in ${yellow('~/.agents/specialists/')}`);
console.log(`  4. ${bold('Update later:')} re-run this installer (existing specialists preserved)\n`);
