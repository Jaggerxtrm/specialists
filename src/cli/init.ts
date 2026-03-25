// src/cli/init.ts

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;

function ok(msg: string)   { console.log(`  ${green('✓')} ${msg}`); }
function skip(msg: string) { console.log(`  ${yellow('○')} ${msg}`); }

const AGENTS_BLOCK = `
## Specialists

Call \`specialist_init\` at the start of every session to bootstrap context and
see available specialists. Use \`use_specialist\` or \`start_specialist\` to
delegate heavy tasks (code review, bug hunting, deep reasoning) to the right
specialist without user intervention.

Add custom specialists to \`.specialists/user/specialists/\` to extend the defaults.
`.trimStart();

const AGENTS_MARKER = '## Specialists';
const GITIGNORE_ENTRIES = ['.specialists/jobs/', '.specialists/ready/'];
const MCP_FILE = '.mcp.json';
const MCP_SERVER_NAME = 'specialists';
const MCP_SERVER_CONFIG = { command: 'specialists', args: [] };

function loadJson(path: string, fallback: Record<string, unknown>): Record<string, any> {
  if (!existsSync(path)) return structuredClone(fallback);
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, any>;
  } catch {
    return structuredClone(fallback);
  }
}

function saveJson(path: string, value: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

/**
 * Resolve a path relative to this package's installed location.
 * Handles both bundled (dist/index.js) and source (src/cli/init.ts) modes.
 */
function resolvePackagePath(relativePath: string): string | null {
  // All canonical assets now live in config/ directory
  const configPath = `config/${relativePath}`;
  
  // Try from bundled location (dist/index.js -> ../config/relativePath)
  let resolved = fileURLToPath(new URL(`../${configPath}`, import.meta.url));
  if (existsSync(resolved)) return resolved;
  
  // Try from source location (src/cli/init.ts -> ../../config/relativePath)
  resolved = fileURLToPath(new URL(`../../${configPath}`, import.meta.url));
  if (existsSync(resolved)) return resolved;
  
  return null;
}

/**
 * Copy canonical specialists to .specialists/default/specialists/
 */
function copyCanonicalSpecialists(cwd: string): void {
  const sourceDir = resolvePackagePath('specialists');
  
  if (!sourceDir) {
    skip('no canonical specialists found in package');
    return;
  }

  const targetDir = join(cwd, '.specialists', 'default', 'specialists');
  const files = readdirSync(sourceDir).filter(f => f.endsWith('.specialist.yaml'));
  
  if (files.length === 0) {
    skip('no specialist files found in package');
    return;
  }

  // Create target directory
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  let copied = 0;
  let skipped = 0;
  
  for (const file of files) {
    const src = join(sourceDir, file);
    const dest = join(targetDir, file);
    
    if (existsSync(dest)) {
      skipped++;
    } else {
      copyFileSync(src, dest);
      copied++;
    }
  }
  
  if (copied > 0) {
    ok(`copied ${copied} canonical specialist${copied === 1 ? '' : 's'} to .specialists/default/specialists/`);
  }
  if (skipped > 0) {
    skip(`${skipped} specialist${skipped === 1 ? '' : 's'} already exist (not overwritten)`);
  }
}

/**
 * Copy canonical hooks to .specialists/default/hooks/
 */
function copyCanonicalHooks(cwd: string): void {
  const sourceDir = resolvePackagePath('hooks');
  
  if (!sourceDir) {
    skip('no canonical hooks found in package');
    return;
  }

  const targetDir = join(cwd, '.specialists', 'default', 'hooks');
  const hooks = readdirSync(sourceDir).filter(f => f.endsWith('.mjs'));
  
  if (hooks.length === 0) {
    skip('no hook files found in package');
    return;
  }

  // Create target directory
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  let copied = 0;
  let skipped = 0;

  for (const file of hooks) {
    const src = join(sourceDir, file);
    const dest = join(targetDir, file);
    
    if (existsSync(dest)) {
      skipped++;
    } else {
      copyFileSync(src, dest);
      copied++;
    }
  }

  if (copied > 0) {
    ok(`copied ${copied} hook${copied === 1 ? '' : 's'} to .specialists/default/hooks/`);
  }
  if (skipped > 0) {
    skip(`${skipped} hook${skipped === 1 ? '' : 's'} already exist (not overwritten)`);
  }
}

/**
 * Wire hooks in .claude/settings.json
 */
function ensureProjectHooks(cwd: string): void {
  const settingsPath = join(cwd, '.claude', 'settings.json');
  
  // Ensure .claude directory exists
  const settingsDir = join(cwd, '.claude');
  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }

  const settings = loadJson(settingsPath, {});
  let changed = false;

  // Helper to add hook with correct settings.json format (events at top level)
  function addHook(event: string, command: string): void {
    const eventList = (settings as Record<string, any[]>)[event] ?? [];
    (settings as Record<string, any[]>)[event] = eventList;
    
    const alreadyWired = eventList.some((entry: any) =>
      entry?.hooks?.some?.((h: any) => h?.command === command)
    );
    
    if (!alreadyWired) {
      eventList.push({ matcher: '', hooks: [{ type: 'command', command }] });
      changed = true;
    }
  }

  // Wire hooks with paths to .specialists/default/hooks/
  addHook('UserPromptSubmit', 'node .specialists/default/hooks/specialists-complete.mjs');
  addHook('SessionStart',     'node .specialists/default/hooks/specialists-session-start.mjs');

  if (changed) {
    saveJson(settingsPath, settings);
    ok('wired specialists hooks in .claude/settings.json');
  } else {
    skip('.claude/settings.json already has specialists hooks');
  }
}

/**
 * Copy canonical skills to .specialists/default/skills/
 */
function copyCanonicalSkills(cwd: string): void {
  const sourceDir = resolvePackagePath('skills');
  
  if (!sourceDir) {
    skip('no canonical skills found in package');
    return;
  }

  const skills = readdirSync(sourceDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  if (skills.length === 0) {
    skip('no skill directories found in package');
    return;
  }

  const targetDir = join(cwd, '.specialists', 'default', 'skills');
  
  // Create target directory
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  let copied = 0;
  let skipped = 0;

  for (const skill of skills) {
    const src = join(sourceDir, skill);
    const dest = join(targetDir, skill);
    
    if (existsSync(dest)) {
      skipped++;
    } else {
      cpSync(src, dest, { recursive: true });
      copied++;
    }
  }

  if (copied > 0) {
    ok(`copied ${copied} skill${copied === 1 ? '' : 's'} to .specialists/default/skills/`);
  }
  if (skipped > 0) {
    skip(`${skipped} skill${skipped === 1 ? '' : 's'} already exist (not overwritten)`);
  }
}

/**
 * Create user directories for custom specialists, hooks, skills
 */
function createUserDirs(cwd: string): void {
  const userDirs = [
    join(cwd, '.specialists', 'user', 'specialists'),
    join(cwd, '.specialists', 'user', 'hooks'),
    join(cwd, '.specialists', 'user', 'skills'),
  ];

  let created = 0;
  for (const dir of userDirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created++;
    }
  }

  if (created > 0) {
    ok('created .specialists/user/ directories for custom assets');
  }
}

/**
 * Create runtime directories (jobs, ready)
 */
function createRuntimeDirs(cwd: string): void {
  const runtimeDirs = [
    join(cwd, '.specialists', 'jobs'),
    join(cwd, '.specialists', 'ready'),
  ];

  let created = 0;
  for (const dir of runtimeDirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created++;
    }
  }

  if (created > 0) {
    ok('created .specialists/jobs/ and .specialists/ready/');
  }
}

function ensureProjectMcp(cwd: string): void {
  const mcpPath = join(cwd, MCP_FILE);
  const mcp = loadJson(mcpPath, { mcpServers: {} });
  mcp.mcpServers ??= {};

  const existing = mcp.mcpServers[MCP_SERVER_NAME];
  if (
    existing &&
    existing.command === MCP_SERVER_CONFIG.command &&
    Array.isArray(existing.args) &&
    existing.args.length === MCP_SERVER_CONFIG.args.length
  ) {
    skip('.mcp.json already registers specialists');
    return;
  }

  mcp.mcpServers[MCP_SERVER_NAME] = MCP_SERVER_CONFIG;
  saveJson(mcpPath, mcp);
  ok('registered specialists in project .mcp.json');
}

function ensureGitignore(cwd: string): void {
  const gitignorePath = join(cwd, '.gitignore');
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  
  let added = 0;
  const lines = existing.split('\n');
  
  for (const entry of GITIGNORE_ENTRIES) {
    if (!lines.includes(entry)) {
      lines.push(entry);
      added++;
    }
  }
  
  if (added > 0) {
    writeFileSync(gitignorePath, lines.join('\n') + '\n', 'utf-8');
    ok('added .specialists/jobs/ and .specialists/ready/ to .gitignore');
  } else {
    skip('.gitignore already has runtime entries');
  }
}

function ensureAgentsMd(cwd: string): void {
  const agentsPath = join(cwd, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    const existing = readFileSync(agentsPath, 'utf-8');
    if (existing.includes(AGENTS_MARKER)) {
      skip('AGENTS.md already has Specialists section');
    } else {
      writeFileSync(agentsPath, existing.trimEnd() + '\n\n' + AGENTS_BLOCK, 'utf-8');
      ok('appended Specialists section to AGENTS.md');
    }
  } else {
    writeFileSync(agentsPath, AGENTS_BLOCK, 'utf-8');
    ok('created AGENTS.md with Specialists section');
  }
}

export async function run(): Promise<void> {
  const cwd = process.cwd();

  console.log(`\n${bold('specialists init')}\n`);

  // ── 1. Create .specialists/ structure ─────────────────────────────────────
  copyCanonicalSpecialists(cwd);
  copyCanonicalHooks(cwd);
  copyCanonicalSkills(cwd);
  createUserDirs(cwd);
  createRuntimeDirs(cwd);

  // ── 2. Update .gitignore (only runtime dirs) ──────────────────────────────
  ensureGitignore(cwd);

  // ── 3. Scaffold AGENTS.md ─────────────────────────────────────────────────
  ensureAgentsMd(cwd);

  // ── 4. Register MCP at project scope ──────────────────────────────────────
  ensureProjectMcp(cwd);

  // ── 5. Wire hooks in .claude/settings.json ────────────────────────────────
  ensureProjectHooks(cwd);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`\n${bold('Done!')}\n`);
  console.log(`  ${dim('Directory structure:')}`);
  console.log(`  .specialists/`);
  console.log(`  ├── default/      ${dim('# canonical assets (from init)')}`);
  console.log(`  │   ├── specialists/`);
  console.log(`  │   ├── hooks/`);
  console.log(`  │   └── skills/`);
  console.log(`  ├── user/         ${dim('# your custom additions')}`);
  console.log(`  │   ├── specialists/`);
  console.log(`  │   ├── hooks/`);
  console.log(`  │   └── skills/`);
  console.log(`  ├── jobs/         ${dim('# runtime (gitignored)')}`);
  console.log(`  └── ready/        ${dim('# runtime (gitignored)')}`);
  console.log(`\n  ${dim('Next steps:')}`);
  console.log(`  1. Run ${yellow('specialists list')} to see available specialists`);
  console.log(`  2. Add custom specialists to ${yellow('.specialists/user/specialists/')}`);
  console.log(`  3. Restart Claude Code to pick up changes\n`);
}
