#!/usr/bin/env node
// OmniSpecialist Installer
// Usage: npx --package=github:Jaggerxtrm/specialists install

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME            = homedir();
const SPECIALISTS_DIR = join(HOME, '.agents', 'specialists');
const MCP_NAME        = 'specialists';
const GITHUB_PKG      = 'github:Jaggerxtrm/specialists';

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

  const r = spawnSync('claude', [
    'mcp', 'add', '--scope', 'user', MCP_NAME,
    '--',
    'npx', '--yes', '--prefer-offline',
    `--package=${GITHUB_PKG}`,
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

// 6. Health check
section('Health check');
if (isInstalled('pi')) {
  const r = spawnSync('pi', ['--list-models'], { encoding: 'utf8' });
  r.status === 0
    ? ok('pi has at least one active provider')
    : skip('No active provider — run pi config to set one up');
}

// 7. Done
console.log('\n' + bold(green('  Done!')));
console.log('\n' + bold('  Next steps:'));
console.log(`  1. ${bold('Configure pi:')} run ${yellow('pi')} then ${yellow('pi config')} to enable model providers`);
console.log(`  2. ${bold('Restart Claude Code')} to load the MCP`);
console.log(`  3. ${bold('Update later:')} re-run this installer\n`);
