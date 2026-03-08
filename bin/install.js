#!/usr/bin/env node
// OmniSpecialist Installer
// Usage: npx github:Jaggerxtrm/unit.ai-specialists omnispecialist-install

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const CLAUDE_CONFIG = join(HOME, '.claude.json');
const SPECIALISTS_DIR = join(HOME, '.agents', 'specialists');
const GLOBAL_PKG_NAME = '@jaggerxtrm/omnispecialist';
const MCP_NAME = 'omnispecialist';

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

function npmRootGlobal() {
  const r = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('npm root -g failed');
  return r.stdout.trim();
}

function piListModels() {
  const r = spawnSync('pi', ['--list-models'], { encoding: 'utf8' });
  return r.status === 0;
}

// ── MCP registration ──────────────────────────────────────────────────────────
function readConfig() {
  try { return JSON.parse(readFileSync(CLAUDE_CONFIG, 'utf8')); }
  catch { return {}; }
}

function registerMCP(serverPath) {
  const config = readConfig();
  config.mcpServers ??= {};

  if (config.mcpServers[MCP_NAME]) {
    return false; // already present
  }

  config.mcpServers[MCP_NAME] = {
    type: 'stdio',
    command: 'node',
    args: [serverPath],
    env: {},
  };

  writeFileSync(CLAUDE_CONFIG, JSON.stringify(config, null, 2) + '\n');
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n' + bold('  OmniSpecialist — full-stack installer'));

// 1. pi
section('pi  (coding agent runtime)');
if (isInstalled('pi')) {
  skip('pi already installed');
} else {
  info('Installing @mariozechner/pi...');
  npmInstallGlobal('@mariozechner/pi');
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
  info('  Linux:  sudo bash -c "$(curl -fsSL https://github.com/dolthub/dolt/releases/latest/download/install.sh)"');
  info('  macOS:  brew install dolt');
}

// 4. OmniSpecialist MCP (global install from GitHub)
section('OmniSpecialist MCP');
info('Installing from github:Jaggerxtrm/unit.ai-specialists...');
npmInstallGlobal('github:Jaggerxtrm/unit.ai-specialists');

const globalRoot = npmRootGlobal();
const serverPath = join(globalRoot, GLOBAL_PKG_NAME, 'dist', 'index.js');

if (!existsSync(serverPath)) {
  console.error(red(`\n  ✗ Install failed: expected ${serverPath}\n`));
  process.exit(1);
}

const registered = registerMCP(serverPath);
registered
  ? ok(`MCP registered in ~/.claude.json`)
  : skip('MCP already registered');

// 5. Scaffold specialists directory
section('Scaffold');
if (!existsSync(SPECIALISTS_DIR)) {
  mkdirSync(SPECIALISTS_DIR, { recursive: true });
  ok('~/.omnispecialist/specialists/ created');
} else {
  skip('~/.omnispecialist/specialists/ already exists');
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
console.log(`  2. ${bold('Restart Claude Code')} to load the OmniSpecialist MCP`);
console.log(`  3. Verify with ${yellow('pi --list-models')} — at least one provider should be active\n`);
