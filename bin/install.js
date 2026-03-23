#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CWD = process.cwd();
const CLAUDE_DIR = join(CWD, '.claude');
const HOOKS_DIR = join(CLAUDE_DIR, 'hooks');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
const MCP_FILE = join(CWD, '.mcp.json');
const BUNDLED_HOOKS_DIR = new URL('../hooks', import.meta.url).pathname;
const BUNDLED_SPECIALISTS_DIR = new URL('../specialists', import.meta.url).pathname;
const USER_SPECIALISTS_DIR = join(homedir(), '.agents', 'specialists');

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

function section(label) {
  const line = '─'.repeat(Math.max(0, 44 - label.length));
  console.log(`\n${bold(`── ${label} ${line}`)}`);
}

function ok(label) { console.log(`  ${green('✓')} ${label}`); }
function skip(label) { console.log(`  ${yellow('○')} ${label}`); }
function info(label) { console.log(`  ${dim(label)}`); }
function fail(label) { console.log(`  ${red('✗')} ${label}`); }

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });
}

function commandOk(cmd, args = ['--version']) {
  const result = run(cmd, args);
  return result.status === 0 && !result.error;
}

function loadJson(path, fallback) {
  if (!existsSync(path)) return structuredClone(fallback);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function saveJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function sameFileContent(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false;
  return readFileSync(a, 'utf8') === readFileSync(b, 'utf8');
}

const HOOKS = [
  {
    event: 'UserPromptSubmit',
    file: 'specialists-complete.mjs',
    timeout: 5000,
  },
  {
    event: 'SessionStart',
    file: 'specialists-session-start.mjs',
    timeout: 8000,
  },
];

function findHookCommands(settings, event, fileName) {
  const entries = settings?.hooks?.[event];
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) =>
    (entry.hooks ?? [])
      .map((hook) => hook.command)
      .filter((command) => typeof command === 'string' && command.includes(fileName)),
  );
}

function ensureHook(settings, hook) {
  const dest = join(HOOKS_DIR, hook.file);
  const source = join(BUNDLED_HOOKS_DIR, hook.file);
  const existingCommands = findHookCommands(settings, hook.event, hook.file);
  const externalOwner = existingCommands.find((command) => command !== dest);

  if (externalOwner) {
    skip(`${hook.file} already managed externally — deferring`);
    info(`existing command: ${externalOwner}`);
    return false;
  }

  mkdirSync(HOOKS_DIR, { recursive: true });
  const changed = !sameFileContent(source, dest);
  if (changed) {
    copyFileSync(source, dest);
    chmodSync(dest, 0o755);
    ok(`${hook.file} installed in .claude/hooks/`);
  } else {
    skip(`${hook.file} already up to date`);
  }

  settings.hooks ??= {};
  settings.hooks[hook.event] ??= [];
  settings.hooks[hook.event] = settings.hooks[hook.event].filter(
    (entry) => !(entry.hooks ?? []).some((h) => h.command === dest),
  );
  settings.hooks[hook.event].push({
    hooks: [{ type: 'command', command: dest, timeout: hook.timeout }],
  });
  ok(`${hook.file} registered for ${hook.event}`);
  return true;
}

function installBundledSpecialists() {
  if (!existsSync(BUNDLED_SPECIALISTS_DIR)) {
    skip('bundled specialists dir not found — skipping');
    return;
  }
  mkdirSync(USER_SPECIALISTS_DIR, { recursive: true });
  const files = readdirSync(BUNDLED_SPECIALISTS_DIR).filter(f => f.endsWith('.specialist.yaml'));
  for (const file of files) {
    const source = join(BUNDLED_SPECIALISTS_DIR, file);
    const dest = join(USER_SPECIALISTS_DIR, file);
    if (sameFileContent(source, dest)) {
      skip(`${file} already up to date`);
    } else {
      copyFileSync(source, dest);
      ok(`${file} installed in ~/.agents/specialists/`);
    }
  }
}

function ensureMcpRegistration() {
  const mcp = loadJson(MCP_FILE, { mcpServers: {} });
  mcp.mcpServers ??= {};
  const existing = mcp.mcpServers.specialists;
  const desired = { command: 'specialists', args: [] };

  if (
    existing &&
    existing.command === desired.command &&
    Array.isArray(existing.args) &&
    existing.args.length === 0
  ) {
    skip('.mcp.json already registers specialists');
    return;
  }

  mcp.mcpServers.specialists = desired;
  saveJson(MCP_FILE, mcp);
  ok('registered specialists in .mcp.json');
}

console.log(`\n${bold('Specialists installer')}`);
console.log(dim('Project scope: prerequisite check, bundled specialists, hooks, MCP registration'));

section('Prerequisite check');
const prereqs = [
  { name: 'pi', ok: commandOk('pi', ['--version']), required: true, help: 'Install pi first.' },
  { name: 'bd', ok: commandOk('bd', ['--version']), required: true, help: 'Install beads (bd) first.' },
  { name: 'xt', ok: commandOk('xt', ['--version']), required: true, help: 'xtrm-tools is required for hooks and workflow integration.' },
];

let prereqFailed = false;
for (const prereq of prereqs) {
  if (prereq.ok) {
    ok(`${prereq.name} available`);
  } else {
    prereqFailed = prereqFailed || prereq.required;
    fail(`${prereq.name} not found`);
    info(prereq.help);
  }
}

if (prereqFailed) {
  console.log(`\n${red('Install aborted: required prerequisites are missing.')}`);
  process.exit(1);
}

section('Specialists hooks');
mkdirSync(CLAUDE_DIR, { recursive: true });
const settings = loadJson(SETTINGS_FILE, {});
for (const hook of HOOKS) ensureHook(settings, hook);
saveJson(SETTINGS_FILE, settings);
ok(`updated ${SETTINGS_FILE}`);

section('Bundled specialists');
installBundledSpecialists();

section('MCP registration');
ensureMcpRegistration();

console.log(`\n${bold(green('Done!'))}`);
console.log(`  ${dim('Hooks are project-local in .claude/, and MCP is project-local in .mcp.json.')}`);
