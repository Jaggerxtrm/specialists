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


const BEADS_EDIT_GATE_FILE   = join(HOOKS_DIR, 'beads-edit-gate.mjs');
const BEADS_COMMIT_GATE_FILE = join(HOOKS_DIR, 'beads-commit-gate.mjs');
const BEADS_STOP_GATE_FILE   = join(HOOKS_DIR, 'beads-stop-gate.mjs');

const BEADS_EDIT_GATE_SCRIPT = `#!/usr/bin/env node
// beads-edit-gate — Claude Code PreToolUse hook
// Blocks file edits when no beads issue is in_progress.
// Only active in projects with a .beads/ directory.
// Exit 0: allow  |  Exit 2: block (stderr shown to Claude)
//
// Installed by: npx --package=@jaggerxtrm/specialists install

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!existsSync(join(cwd, '.beads'))) process.exit(0);

let inProgress = 0;
try {
  const output = execSync('bd list --status=in_progress', {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 8000,
  });
  inProgress = (output.match(/in_progress/g) ?? []).length;
} catch {
  process.exit(0);
}

if (inProgress === 0) {
  process.stderr.write(
    '\\u{1F6AB} BEADS GATE: No in_progress issue tracked.\\n' +
    'You MUST create and claim a beads issue BEFORE editing any file:\\n\\n' +
    '  bd create --title="<task summary>" --type=task --priority=2\\n' +
    '  bd update <id> --status=in_progress\\n\\n' +
    'No exceptions. Momentum is not an excuse.\\n'
  );
  process.exit(2);
}

process.exit(0);
`;

const BEADS_COMMIT_GATE_SCRIPT = `#!/usr/bin/env node
// beads-commit-gate — Claude Code PreToolUse hook
// Blocks \`git commit\` when in_progress beads issues still exist.
// Forces: close issues first, THEN commit.
// Exit 0: allow  |  Exit 2: block (stderr shown to Claude)
//
// Installed by: npx --package=@jaggerxtrm/specialists install

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const tool = input.tool_name ?? '';
if (tool !== 'Bash') process.exit(0);

const cmd = input.tool_input?.command ?? '';
if (!/\\bgit\\s+commit\\b/.test(cmd)) process.exit(0);

const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!existsSync(join(cwd, '.beads'))) process.exit(0);

let inProgress = 0;
let summary = '';
try {
  const output = execSync('bd list --status=in_progress', {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 8000,
  });
  inProgress = (output.match(/in_progress/g) ?? []).length;
  summary = output.trim();
} catch {
  process.exit(0);
}

if (inProgress > 0) {
  process.stderr.write(
    '\\u{1F6AB} BEADS GATE: Cannot commit with open in_progress issues.\\n' +
    'Close them first, THEN commit:\\n\\n' +
    '  bd close <id1> <id2> ...\\n' +
    '  git add <files> && git commit -m "..."\\n\\n' +
    \`Open issues:\\n\${summary}\\n\`
  );
  process.exit(2);
}

process.exit(0);
`;

const BEADS_STOP_GATE_SCRIPT = `#!/usr/bin/env node
// beads-stop-gate — Claude Code Stop hook
// Blocks the agent from stopping when in_progress beads issues remain.
// Forces the session close protocol before declaring done.
// Exit 0: allow stop  |  Exit 2: block stop (stderr shown to Claude)
//
// Installed by: npx --package=@jaggerxtrm/specialists install

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!existsSync(join(cwd, '.beads'))) process.exit(0);

let inProgress = 0;
let summary = '';
try {
  const output = execSync('bd list --status=in_progress', {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 8000,
  });
  inProgress = (output.match(/in_progress/g) ?? []).length;
  summary = output.trim();
} catch {
  process.exit(0);
}

if (inProgress > 0) {
  process.stderr.write(
    '\\u{1F6AB} BEADS STOP GATE: Cannot stop with unresolved in_progress issues.\\n' +
    'Complete the session close protocol:\\n\\n' +
    '  bd close <id1> <id2> ...\\n' +
    '  git add <files> && git commit -m "..."\\n' +
    '  git push\\n\\n' +
    \`Open issues:\\n\${summary}\\n\`
  );
  process.exit(2);
}

process.exit(0);
`;

const BEADS_EDIT_GATE_ENTRY = {
  matcher: 'Edit|Write|MultiEdit|NotebookEdit|mcp__serena__replace_symbol_body|mcp__serena__insert_after_symbol|mcp__serena__insert_before_symbol',
  hooks: [{ type: 'command', command: BEADS_EDIT_GATE_FILE, timeout: 10 }],
};
const BEADS_COMMIT_GATE_ENTRY = {
  matcher: 'Bash',
  hooks: [{ type: 'command', command: BEADS_COMMIT_GATE_FILE, timeout: 10 }],
};
const BEADS_STOP_GATE_ENTRY = {
  hooks: [{ type: 'command', command: BEADS_STOP_GATE_FILE, timeout: 10 }],
};

function installHook() {
  mkdirSync(HOOKS_DIR, { recursive: true });

  // Write all hook files
  writeFileSync(HOOK_FILE, HOOK_SCRIPT, 'utf8');
  chmodSync(HOOK_FILE, 0o755);
  writeFileSync(BEADS_EDIT_GATE_FILE, BEADS_EDIT_GATE_SCRIPT, 'utf8');
  chmodSync(BEADS_EDIT_GATE_FILE, 0o755);
  writeFileSync(BEADS_COMMIT_GATE_FILE, BEADS_COMMIT_GATE_SCRIPT, 'utf8');
  chmodSync(BEADS_COMMIT_GATE_FILE, 0o755);
  writeFileSync(BEADS_STOP_GATE_FILE, BEADS_STOP_GATE_SCRIPT, 'utf8');
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
info('main-guard: blocks Edit/Write/git commit/push on main or master branch');
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
