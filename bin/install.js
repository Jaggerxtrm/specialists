#!/usr/bin/env node
// Specialists Installer
// Usage: npx --package=@jaggerxtrm/specialists install

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME            = homedir();
const SPECIALISTS_DIR = join(HOME, '.agents', 'specialists');
const CWD             = process.cwd();
const CLAUDE_DIR      = join(CWD, '.claude');
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
    'mcp', 'add', '--scope', 'project', MCP_NAME, '--', MCP_NAME,
  ], { stdio: 'inherit', encoding: 'utf8' });
  if (r.status !== 0) throw new Error('claude mcp add failed');
  return true;
}

// ── Hook installation ─────────────────────────────────────────────────────────


const HOOK_ENTRY = {
  matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash',
  hooks: [{ type: 'command', command: HOOK_FILE, timeout: 5000 }],
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
const BEADS_CLOSE_MEMORY_PROMPT_FILE  = join(HOOKS_DIR, 'beads-close-memory-prompt.mjs');
const BEADS_CLOSE_MEMORY_PROMPT_ENTRY = {
  matcher: 'Bash',
  hooks: [{ type: 'command', command: BEADS_CLOSE_MEMORY_PROMPT_FILE, timeout: 10000 }],
};
const SPECIALISTS_COMPLETE_FILE  = join(HOOKS_DIR, 'specialists-complete.mjs');
const SPECIALISTS_COMPLETE_ENTRY = {
  hooks: [{ type: 'command', command: SPECIALISTS_COMPLETE_FILE, timeout: 5000 }],
}
const SPECIALISTS_SESSION_START_FILE  = join(HOOKS_DIR, 'specialists-session-start.mjs');
const SPECIALISTS_SESSION_START_ENTRY = {
  hooks: [{ type: 'command', command: SPECIALISTS_SESSION_START_FILE, timeout: 8000 }],
};
const BUNDLED_SKILLS_DIR = new URL('../skills', import.meta.url).pathname;
const CLAUDE_SKILLS_DIR  = join(CLAUDE_DIR, 'skills');;

function promptYN(question) {
  if (!process.stdin.isTTY) return true; // non-interactive: default yes
  process.stdout.write(`${question} [Y/n]: `);
  const r = spawnSync('/bin/sh', ['-c', 'read ans; printf "%s" "$ans"'], {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  const ans = (r.stdout ?? '').trim().toLowerCase();
  return ans === '' || ans === 'y' || ans === 'yes';
}

function getHookDrift() {
  const pairs = [
    ['specialists-main-guard.mjs',       HOOK_FILE],
    ['beads-edit-gate.mjs',              BEADS_EDIT_GATE_FILE],
    ['beads-commit-gate.mjs',            BEADS_COMMIT_GATE_FILE],
    ['beads-stop-gate.mjs',              BEADS_STOP_GATE_FILE],
    ['beads-close-memory-prompt.mjs',    BEADS_CLOSE_MEMORY_PROMPT_FILE],
    ['specialists-complete.mjs',         SPECIALISTS_COMPLETE_FILE],
    ['specialists-session-start.mjs',    SPECIALISTS_SESSION_START_FILE],
  ];
  return pairs
    .map(([bundled, dest]) => ({
      name: bundled,
      dest,
      missing: !existsSync(dest),
      changed: existsSync(dest) &&
        readFileSync(join(BUNDLED_HOOKS_DIR, bundled), 'utf8') !==
        readFileSync(dest, 'utf8'),
    }))
    .filter(h => h.missing || h.changed);
}


// ── Global conflict detection ─────────────────────────────────────────────────
// Our hook filenames — used to detect if the same hooks are already registered
// in the user's global ~/.claude/settings.json.
const MANAGED_HOOK_NAMES = [
  'specialists-main-guard.mjs',
  'beads-edit-gate.mjs',
  'beads-commit-gate.mjs',
  'beads-stop-gate.mjs',
  'beads-close-memory-prompt.mjs',
  'specialists-complete.mjs',
  'specialists-session-start.mjs',
];

function checkGlobalConflicts() {
  const globalSettings = join(homedir(), '.claude', 'settings.json');
  if (!existsSync(globalSettings)) return;

  let global = {};
  try { global = JSON.parse(readFileSync(globalSettings, 'utf8')); } catch { return; }

  const conflicts = [];
  for (const [event, entries] of Object.entries(global.hooks ?? {})) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      for (const h of entry.hooks ?? []) {
        const cmd = h.command ?? '';
        const match = MANAGED_HOOK_NAMES.find(name => cmd.includes(name));
        if (match) conflicts.push({ event, cmd, name: match });
      }
    }
  }

  if (conflicts.length === 0) return;

  console.log('');
  console.log(yellow('  ⚠  Global hook conflicts detected in ~/.claude/settings.json:'));
  for (const c of conflicts) {
    console.log(yellow(`     ${c.event}: ${c.name}`));
    console.log(dim(`       → ${c.cmd}`));
  }
  console.log(yellow('  Both the global and project-local copies will run.'));
  console.log(yellow('  Remove the global entries if you want only project-local hooks active.'));
  console.log('');
}

function installHook() {
  checkGlobalConflicts();
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
  copyFileSync(join(BUNDLED_HOOKS_DIR, 'beads-close-memory-prompt.mjs'), BEADS_CLOSE_MEMORY_PROMPT_FILE);
  chmodSync(BEADS_CLOSE_MEMORY_PROMPT_FILE, 0o755);
  copyFileSync(join(BUNDLED_HOOKS_DIR, 'specialists-complete.mjs'), SPECIALISTS_COMPLETE_FILE);
  chmodSync(SPECIALISTS_COMPLETE_FILE, 0o755);
  copyFileSync(join(BUNDLED_HOOKS_DIR, 'specialists-session-start.mjs'), SPECIALISTS_SESSION_START_FILE);
  chmodSync(SPECIALISTS_SESSION_START_FILE, 0o755);

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

  // PostToolUse — replace any existing beads-close-memory-prompt entry
  if (!Array.isArray(settings.hooks.PostToolUse)) settings.hooks.PostToolUse = [];
  settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(e =>
    !e.hooks?.some(h => h.command?.includes('beads-close-memory-prompt'))
  );
  settings.hooks.PostToolUse.push(BEADS_CLOSE_MEMORY_PROMPT_ENTRY);

  // Stop — replace any existing beads-stop-gate entry
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];
  settings.hooks.Stop = settings.hooks.Stop.filter(e =>
    !e.hooks?.some(h => h.command?.includes('beads-stop-gate'))
  );
  settings.hooks.Stop.push(BEADS_STOP_GATE_ENTRY);

  // UserPromptSubmit — replace any existing specialists-complete entry
  if (!Array.isArray(settings.hooks.UserPromptSubmit)) settings.hooks.UserPromptSubmit = [];
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(e =>
    !e.hooks?.some(h => h.command?.includes('specialists-complete'))
  );
  settings.hooks.UserPromptSubmit.push(SPECIALISTS_COMPLETE_ENTRY);

  // SessionStart — replace any existing specialists-session-start entry
  if (!Array.isArray(settings.hooks.SessionStart)) settings.hooks.SessionStart = [];
  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(e =>
    !e.hooks?.some(h => h.command?.includes('specialists-session-start'))
  );
  settings.hooks.SessionStart.push(SPECIALISTS_SESSION_START_ENTRY);

  mkdirSync(CLAUDE_DIR, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}


function installSkills() {
  if (!existsSync(BUNDLED_SKILLS_DIR)) return { installed: 0, skipped: 0 };
  mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true });

  let installed = 0;
  let skippedCount = 0;
  let skillNames;
  try {
    skillNames = readdirSync(BUNDLED_SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return { installed: 0, skipped: 0 };
  }

  for (const skillName of skillNames) {
    const srcDir  = join(BUNDLED_SKILLS_DIR, skillName);
    const destDir = join(CLAUDE_SKILLS_DIR, skillName);
    const skillFile     = join(srcDir, 'SKILL.md');
    const destSkillFile = join(destDir, 'SKILL.md');

    if (!existsSync(skillFile)) continue;

    if (existsSync(destSkillFile)) {
      // Check if content matches bundled version
      try {
        if (readFileSync(skillFile, 'utf8') === readFileSync(destSkillFile, 'utf8')) {
          skippedCount++;
          continue;
        }
      } catch { /* fall through to copy */ }
    }

    mkdirSync(destDir, { recursive: true });
    copyFileSync(skillFile, destSkillFile);
    installed++;
  }

  return { installed, skipped: skippedCount };
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
const drift = getHookDrift();
const hooksExist = existsSync(HOOK_FILE);

if (!hooksExist) {
  installHook();
  ok('hooks installed → ~/.claude/hooks/');
} else if (drift.length === 0) {
  skip('hooks up to date');
} else {
  const label = (h) => h.missing ? red('missing') : yellow('updated');
  console.log(`  ${yellow('○')} ${drift.length} of 7 hook(s) have changes:`);
  for (const h of drift) info(`      ${h.name}  ${label(h)}`);
  console.log();
  const confirmed = promptYN('  Update hooks?');
  if (confirmed) {
    installHook();
    ok('hooks updated');
  } else {
    skip('hooks update skipped');
  }
}
info('main-guard: blocks file edits and direct master pushes (enforces PR workflow)');
info('beads-edit-gate: requires in_progress bead before editing files');
info('beads-commit-gate: requires issues closed before git commit');
info('beads-stop-gate: requires issues closed before session end');
info('beads-close-memory-prompt: nudges knowledge capture after bd close');
info('specialists-complete: injects completion banners for background jobs');
info('specialists-session-start: injects context (jobs, specialists, commands) at session start');

// 7. Skills
section('Skills');
const skillResult = installSkills();
if (skillResult.installed > 0) ok(`${skillResult.installed} skill(s) installed → ~/.claude/skills/`);
if (skillResult.skipped > 0)   skip(`${skillResult.skipped} skill(s) already up to date`);
if (skillResult.installed === 0 && skillResult.skipped === 0) skip('No bundled skills found');
info("specialists-usage: teaches agents when/how to use specialists CLI and MCP tools");

// 8. Health check
section('Health check');
if (isInstalled('pi')) {
  const r = spawnSync('pi', ['--list-models'], { encoding: 'utf8' });
  r.status === 0
    ? ok('pi has at least one active provider')
    : skip('No active provider — run pi config to set one up');
}

// 9. Done
console.log('\n' + bold(green('  Done!')));
console.log('\n' + bold('  Next steps:'));
console.log(`  1. ${bold('Configure pi:')} run ${yellow('pi')} then ${yellow('pi config')} to enable model providers`);
console.log(`  2. ${bold('Restart Claude Code')} to load the MCP and hooks`);
console.log(`  3. ${bold('Customise specialists:')} edit files in ${yellow('~/.agents/specialists/')}`);
console.log(`  4. ${bold('Update later:')} re-run this installer (existing specialists preserved)\n`);
