#!/usr/bin/env node
// OmniSpecialist Installer
// Usage: npx --package=github:Jaggerxtrm/specialists install

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const SPECIALISTS_DIR = join(HOME, '.agents', 'specialists');
const MCP_NAME = 'specialists';
const GITHUB_PKG = 'github:Jaggerxtrm/specialists';

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

function isInstalled(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

// Safe spawn: never passes user input — all args are hardcoded constants
function npmInstallGlobal(pkg) {
  const r = spawnSync('npm', ['install', '-g', pkg], { stdio: 'inherit', encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`npm install -g ${pkg} failed`);
}

function piListModels() {
  const r = spawnSync('pi', ['--list-models'], { encoding: 'utf8' });
  return r.status === 0;
}

// ── MCP registration ──────────────────────────────────────────────────────────
function registerMCP() {
  // Check if already registered
  const check = spawnSync('claude', ['mcp', 'get', MCP_NAME], { encoding: 'utf8' });
  if (check.status === 0) {
    return false; // already present
  }

  // Install globally
  npmInstallGlobal(GITHUB_PKG);

  // Register with Claude
  const r = spawnSync('claude', [
    'mcp', 'add',
    '--scope', 'user',
    MCP_NAME,
    '--',
    MCP_NAME,
  ], { stdio: 'inherit', encoding: 'utf8' });

  if (r.status !== 0) throw new Error('claude mcp add failed');
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n' + bold('  OmniSpecialist — full-stack installer'));

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
  skip('dolt not found — install manually:');
  info("  Linux:  sudo bash -c 'curl -L https://github.com/dolthub/dolt/releases/latest/download/install.sh | bash'");
  info('  macOS:  brew install dolt');
}

// 4. Specialists MCP
section('Specialists MCP');

const registered = registerMCP();
registered
  ? ok(`MCP '${MCP_NAME}' registered at user scope`)
  : skip(`MCP '${MCP_NAME}' already registered`);

// 5. Scaffold specialists directory
section('Scaffold');
if (!existsSync(SPECIALISTS_DIR)) {
  mkdirSync(SPECIALISTS_DIR, { recursive: true });
  ok('~/.agents/specialists/ created');
} else {
  skip('~/.agents/specialists/ already exists');
}

// 6. Health check (pi)
section('Health check');
if (isInstalled('pi')) {
  piListModels()
    ? ok('pi has at least one active provider')
    : skip('No active provider detected — run pi config to set one up');
}

// 7. Done
console.log('\n' + bold(green('  Done!')));
console.log('\n' + bold('  Next steps:'));
console.log(`  1. ${bold('Configure pi providers:')}`);
console.log(`       ${yellow('pi')}         — launch pi once`);
console.log(`       ${yellow('pi config')} — open TUI to enable + map model providers`);
console.log(`     ${dim('(no CLI flags for provider setup — TUI only)')}`);
console.log(`  2. ${bold('Restart Claude Code')} to load the Specialists MCP`);
console.log(`  3. Verify with ${yellow('pi --list-models')} — at least one provider should be active\n`);
