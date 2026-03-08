#!/usr/bin/env node
// OmniSpecialist Installer
// Usage: node <(curl -fsSL https://raw.githubusercontent.com/Jaggerxtrm/unit.ai-specialists/master/bin/install.js)

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME           = homedir();
const INSTALL_DIR    = join(HOME, '.agents', 'omnispecialist');
const SPECIALISTS_DIR = join(HOME, '.agents', 'specialists');
const MCP_NAME       = 'omnispecialist';
const REPO_URL       = 'https://github.com/Jaggerxtrm/unit.ai-specialists.git';

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const dim    = (s) => `\x1b[2m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;

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

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n' + bold('  OmniSpecialist — full-stack installer'));

// 1. pi
section('pi  (coding agent runtime)');
if (isInstalled('pi')) {
  skip('pi already installed');
} else {
  info('Installing @mariozechner/pi...');
  run('npm', ['install', '-g', '@mariozechner/pi']);
  ok('pi installed');
}

// 2. beads
section('beads  (issue tracker)');
if (isInstalled('bd')) {
  skip('bd already installed');
} else {
  info('Installing @beads/bd...');
  run('npm', ['install', '-g', '@beads/bd']);
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

// 4. Clone / update OmniSpecialist
section('OmniSpecialist');
if (existsSync(join(INSTALL_DIR, '.git'))) {
  info(`Updating ${INSTALL_DIR}...`);
  run('git', ['-C', INSTALL_DIR, 'pull', '--ff-only']);
  ok('repo updated');
} else {
  info(`Cloning into ${INSTALL_DIR}...`);
  mkdirSync(join(HOME, '.agents'), { recursive: true });
  run('git', ['clone', REPO_URL, INSTALL_DIR]);
  ok('repo cloned');
}

// 5. Install dependencies — use bun if available (10x faster), else npm
section('Dependencies');
const pm = isInstalled('bun') ? 'bun' : 'npm';
info(`Running ${pm} install...`);
if (pm === 'bun') {
  run('bun', ['install', '--cwd', INSTALL_DIR]);
} else {
  run('npm', ['install', '--prefix', INSTALL_DIR]);
}
ok(`dependencies ready (${pm})`);

// 6. Register MCP — direct node call, no npx overhead on every startup
section('MCP registration');
const serverPath = join(INSTALL_DIR, 'dist', 'index.js');
const existing = spawnSync('claude', ['mcp', 'get', MCP_NAME], { encoding: 'utf8' });
if (existing.status === 0) {
  spawnSync('claude', ['mcp', 'remove', '-s', 'user', MCP_NAME], { encoding: 'utf8' });
}
run('claude', ['mcp', 'add', '--scope', 'user', MCP_NAME, '--', 'node', serverPath]);
ok(`registered → node ${serverPath}`);

// 7. Scaffold specialists directory
section('Scaffold');
if (!existsSync(SPECIALISTS_DIR)) {
  mkdirSync(SPECIALISTS_DIR, { recursive: true });
  ok('~/.agents/specialists/ created');
} else {
  skip('~/.agents/specialists/ already exists');
}

// 8. Done
console.log('\n' + bold(green('  Done!')));
console.log('\n' + bold('  Next steps:'));
console.log(`  1. ${bold('Configure pi:')} run ${yellow('pi')} then ${yellow('pi config')} to enable model providers`);
console.log(`  2. ${bold('Restart Claude Code')} to load the MCP`);
console.log(`  3. ${bold('Update later:')} re-run this script\n`);
