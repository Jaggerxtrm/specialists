// src/cli/init.ts

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
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
`.trimStart();

const AGENTS_MARKER = '## Specialists';
const GITIGNORE_ENTRY = '.specialists/';
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

function copyCanonicalSpecialists(cwd: string): void {
  const canonicalDir = resolvePackagePath('specialists');
  
  if (!canonicalDir) {
    skip('no canonical specialists found in package');
    return;
  }

  const targetDir = join(cwd, 'specialists');
  const files = readdirSync(canonicalDir).filter(f => f.endsWith('.specialist.yaml'));
  
  let copied = 0;
  let skipped = 0;
  
  for (const file of files) {
    const src = join(canonicalDir, file);
    const dest = join(targetDir, file);
    
    if (existsSync(dest)) {
      skipped++;
    } else {
      copyFileSync(src, dest);
      copied++;
    }
  }
  
  if (copied > 0) {
    ok(`copied ${copied} canonical specialist${copied === 1 ? '' : 's'} to specialists/`);
  }
  if (skipped > 0) {
    skip(`${skipped} specialist${skipped === 1 ? '' : 's'} already exist (not overwritten)`);
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

function copyCanonicalHooks(cwd: string): string | null {
  const sourceDir = resolvePackagePath('hooks');
  
  if (!sourceDir) {
    skip('no canonical hooks found in package');
    return null;
  }

  const targetDir = join(cwd, '.claude', 'hooks');
  
  // Count hooks to copy
  const hooks = readdirSync(sourceDir).filter(f => f.endsWith('.mjs'));
  if (hooks.length === 0) {
    skip('no hook files found in package');
    return null;
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
    ok(`copied ${copied} hook${copied === 1 ? '' : 's'} to .claude/hooks/`);
  }
  if (skipped > 0) {
    skip(`${skipped} hook${skipped === 1 ? '' : 's'} already exist (not overwritten)`);
  }

  return targetDir;
}

function ensureProjectHooks(cwd: string): void {
  // First, copy hooks to .claude/hooks/
  const hooksDir = copyCanonicalHooks(cwd);
  if (!hooksDir) return;

  // Now wire them in settings.json
  const settingsPath = join(cwd, '.claude', 'settings.json');
  const settings = loadJson(settingsPath, {});

  let changed = false;

  // Helper to add hook with correct settings.json format (events at top level)
  function addHook(event: string, command: string): void {
    // Get or create the event array (direct on settings, not nested in 'hooks')
    const eventList = (settings as Record<string, any[]>)[event] ?? [];
    (settings as Record<string, any[]>)[event] = eventList;
    
    // Check if already wired
    const alreadyWired = eventList.some((entry: any) =>
      entry?.hooks?.some?.((h: any) => h?.command === command)
    );
    
    if (!alreadyWired) {
      eventList.push({ matcher: '', hooks: [{ type: 'command', command }] });
      changed = true;
    }
  }

  // Wire hooks with relative paths (portable across machines)
  addHook('UserPromptSubmit', 'node .claude/hooks/specialists-complete.mjs');
  addHook('SessionStart',     'node .claude/hooks/specialists-session-start.mjs');

  if (changed) {
    saveJson(settingsPath, settings);
    ok('wired specialists hooks in .claude/settings.json');
  } else {
    skip('.claude/settings.json already has specialists hooks');
  }
}

function copyCanonicalSkills(cwd: string): void {
  const sourceDir = resolvePackagePath('skills');
  
  if (!sourceDir) {
    skip('no canonical skills found in package');
    return;
  }

  // Get skill directories (not files, each skill is a directory with SKILL.md)
  const skills = readdirSync(sourceDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  if (skills.length === 0) {
    skip('no skill directories found in package');
    return;
  }

  // Copy to both locations
  const targets = [
    { path: join(cwd, '.claude', 'skills'), label: '.claude/skills/' },
    { path: join(cwd, '.agents', 'skills'), label: '.agents/skills/' },
  ];

  for (const target of targets) {
    let copied = 0;
    let skipped = 0;

    // Ensure parent directory exists
    const parentDir = join(target.path, '..');
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    for (const skill of skills) {
      const src = join(sourceDir, skill);
      const dest = join(target.path, skill);
      
      if (existsSync(dest)) {
        skipped++;
      } else {
        cpSync(src, dest, { recursive: true });
        copied++;
      }
    }

    if (copied > 0) {
      ok(`copied ${copied} skill${copied === 1 ? '' : 's'} to ${target.label}`);
    }
    if (skipped > 0) {
      skip(`${skipped} skill${skipped === 1 ? '' : 's'} already exist in ${target.label} (not overwritten)`);
    }
  }
}

export async function run(): Promise<void> {
  const cwd = process.cwd();

  console.log(`\n${bold('specialists init')}\n`);

  // ── 1. Create ./specialists/ directory ────────────────────────────────────
  const specialistsDir = join(cwd, 'specialists');
  if (existsSync(specialistsDir)) {
    skip('specialists/ already exists');
  } else {
    mkdirSync(specialistsDir, { recursive: true });
    ok('created specialists/');
  }

  // ── 1b. Copy canonical specialists ────────────────────────────────────────
  copyCanonicalSpecialists(cwd);

  // ── 2. Create .specialists/ runtime directory ─────────────────────────────
  const runtimeDir = join(cwd, '.specialists');
  if (existsSync(runtimeDir)) {
    skip('.specialists/ already exists');
  } else {
    mkdirSync(join(runtimeDir, 'jobs'), { recursive: true });
    mkdirSync(join(runtimeDir, 'ready'), { recursive: true });
    ok('created .specialists/ (jobs/, ready/)');
  }

  // ── 3. Add .specialists/ to .gitignore ────────────────────────────────────
  const gitignorePath = join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, 'utf-8');
    if (existing.includes(GITIGNORE_ENTRY)) {
      skip('.gitignore already has .specialists/ entry');
    } else {
      const separator = existing.endsWith('\n') ? '' : '\n';
      writeFileSync(gitignorePath, existing + separator + GITIGNORE_ENTRY + '\n', 'utf-8');
      ok('added .specialists/ to .gitignore');
    }
  } else {
    writeFileSync(gitignorePath, GITIGNORE_ENTRY + '\n', 'utf-8');
    ok('created .gitignore with .specialists/ entry');
  }

  // ── 4. Scaffold AGENTS.md ─────────────────────────────────────────────────
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

  // ── 5. Register MCP at project scope ──────────────────────────────────────
  ensureProjectMcp(cwd);

  // ── 6. Install hooks into .claude/hooks/ and wire in settings.json ───────
  ensureProjectHooks(cwd);

  // ── 7. Copy canonical skills ─────────────────────────────────────────────
  copyCanonicalSkills(cwd);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`\n${bold('Done!')}\n`);
  console.log(`  ${dim('Next steps:')}`);
  console.log(`  1. Run ${yellow('specialists list')} to see available specialists`);
  console.log(`  2. Add custom specialists to ${yellow('specialists/')} as needed`);
  console.log(`  3. Restart Claude Code to pick up AGENTS.md / .mcp.json / hooks changes\n`);
}
