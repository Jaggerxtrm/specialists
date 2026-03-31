// src/cli/init.ts

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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

Use CLI commands via Bash to run and monitor specialists:

Core specialist commands (CLI-first in pi):
- \`specialists list\`
- \`specialists run <name> --bead <id>\`
- \`specialists run <name> --prompt "..."\`
- \`specialists feed -f\` / \`specialists feed <job-id>\`
- \`specialists result <job-id>\`
- \`specialists resume <job-id> "next task"\` (for keep-alive jobs in waiting)
- \`specialists stop <job-id>\`

For background specialists in pi, prefer the process extension:
- \`process start\`, \`process list\`, \`process output\`, \`process logs\`, \`process kill\`, \`process clear\`
- TUI: \`/ps\`, \`/ps:pin\`, \`/ps:logs\`, \`/ps:kill\`, \`/ps:clear\`, \`/ps:dock\`, \`/ps:settings\`

Canonical tracked flow:
1. Create/claim bead issue
2. Run specialist with \`--bead <id>\` (for long work, launch via \`process start\`)
3. Observe progress (\`process output\` / \`process logs\` or \`specialists feed\`)
4. Read final output (\`specialists result <job-id>\`)
5. Close/update bead with outcome

Add custom specialists to \`.specialists/user/\` to extend defaults.
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
 * Move legacy nested specialist files from .specialists/<scope>/specialists/
 * to the flattened .specialists/<scope>/ layout.
 */
function migrateLegacySpecialists(cwd: string, scope: 'default' | 'user'): void {
  const sourceDir = join(cwd, '.specialists', scope, 'specialists');
  if (!existsSync(sourceDir)) return;

  const targetDir = join(cwd, '.specialists', scope);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const files = readdirSync(sourceDir).filter(f => f.endsWith('.specialist.yaml'));
  if (files.length === 0) return;

  let moved = 0;
  let skipped = 0;

  for (const file of files) {
    const src = join(sourceDir, file);
    const dest = join(targetDir, file);

    if (existsSync(dest)) {
      skipped++;
      continue;
    }

    renameSync(src, dest);
    moved++;
  }

  if (moved > 0) {
    ok(`migrated ${moved} specialist${moved === 1 ? '' : 's'} from .specialists/${scope}/specialists/ to .specialists/${scope}/`);
  }
  if (skipped > 0) {
    skip(`${skipped} legacy specialist${skipped === 1 ? '' : 's'} already exist in .specialists/${scope}/ (not moved)`);
  }
}

/**
 * Copy canonical specialists to .specialists/default/
 */
function copyCanonicalSpecialists(cwd: string): void {
  const sourceDir = resolvePackagePath('specialists');
  
  if (!sourceDir) {
    skip('no canonical specialists found in package');
    return;
  }

  const targetDir = join(cwd, '.specialists', 'default');
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
    ok(`copied ${copied} canonical specialist${copied === 1 ? '' : 's'} to .specialists/default/`);
  }
  if (skipped > 0) {
    skip(`${skipped} specialist${skipped === 1 ? '' : 's'} already exist (not overwritten)`);
  }
}

/**
 * Install hooks to .claude/hooks/ (Claude Code project-local)
 */
function installProjectHooks(cwd: string): void {
  const sourceDir = resolvePackagePath('hooks');
  
  if (!sourceDir) {
    skip('no canonical hooks found in package');
    return;
  }

  const targetDir = join(cwd, '.claude', 'hooks');
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
    ok(`installed ${copied} hook${copied === 1 ? '' : 's'} to .claude/hooks/`);
  }
  if (skipped > 0) {
    skip(`${skipped} hook${skipped === 1 ? '' : 's'} already exist (not overwritten)`);
  }
}

/**
 * Wire hooks in .claude/settings.json
 */
function ensureProjectHookWiring(cwd: string): void {
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

  // Wire hooks with paths to .claude/hooks/
  addHook('UserPromptSubmit', 'node .claude/hooks/specialists-complete.mjs');
  addHook('PostToolUse',      'node .claude/hooks/specialists-complete.mjs');
  addHook('SessionStart',     'node .claude/hooks/specialists-session-start.mjs');

  if (changed) {
    saveJson(settingsPath, settings);
    ok('wired specialists hooks in .claude/settings.json');
  } else {
    skip('.claude/settings.json already has specialists hooks');
  }
}

/**
 * Install skills to .claude/skills/ and .pi/skills/ (project-local for both agents)
 */
function installProjectSkills(cwd: string): void {
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

  // Install to both .claude/skills/ and .pi/skills/
  const targetDirs = [
    join(cwd, '.claude', 'skills'),
    join(cwd, '.pi', 'skills'),
  ];

  let totalCopied = 0;
  let totalSkipped = 0;

  for (const targetDir of targetDirs) {
    // Create target directory
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    for (const skill of skills) {
      const src = join(sourceDir, skill);
      const dest = join(targetDir, skill);
      
      if (existsSync(dest)) {
        totalSkipped++;
      } else {
        cpSync(src, dest, { recursive: true });
        totalCopied++;
      }
    }
  }

  if (totalCopied > 0) {
    ok(`installed ${skills.length} skill${skills.length === 1 ? '' : 's'} to .claude/skills/ and .pi/skills/`);
  }
  if (totalSkipped > 0) {
    skip(`${totalSkipped} skill location${totalSkipped === 1 ? '' : 's'} already exist (not overwritten)`);
  }
}

/**
 * Create .specialists/default/ and .specialists/user/ directories.
 * Safe to call always — creates empty dirs only, never writes YAML.
 */
function createSpecialistsDirs(cwd: string): void {
  const defaultDir = join(cwd, '.specialists', 'default');
  const userDir = join(cwd, '.specialists', 'user');

  let created = 0;
  for (const dir of [defaultDir, userDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created++;
    }
  }

  if (created > 0) {
    ok('created .specialists/default/ and .specialists/user/');
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

export interface InitOptions {
  /** When true, copy canonical specialists to .specialists/default/ and migrate legacy layouts. */
  syncDefaults?: boolean;
}

export async function run(opts: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();

  const inAgentSession =
    !process.stdin.isTTY ||
    !!process.env.SPECIALISTS_TMUX_SESSION ||
    !!process.env.SPECIALISTS_JOB_ID ||
    !!process.env.PI_SESSION_ID ||
    !!process.env.PI_RPC_SOCKET;

  if (inAgentSession) {
    console.error('specialists init requires an interactive terminal. This is a user-only bootstrap command — do not invoke from scripts or agent sessions.');
    process.exit(1);
  }

  console.log(`\n${bold('specialists init')}\n`);

  const { syncDefaults = false } = opts;

  // ── 1. Create .specialists/ structure ─────────────────────────────────────
  if (syncDefaults) {
    migrateLegacySpecialists(cwd, 'default');
    copyCanonicalSpecialists(cwd);
  } else {
    skip('.specialists/default/ not synced (pass --sync-defaults to write canonical specialists)');
  }

  migrateLegacySpecialists(cwd, 'user');
  createSpecialistsDirs(cwd);
  createRuntimeDirs(cwd);

  // ── 2. Update .gitignore (only runtime dirs) ──────────────────────────────
  ensureGitignore(cwd);

  // ── 3. Scaffold AGENTS.md ─────────────────────────────────────────────────
  ensureAgentsMd(cwd);

  // ── 4. Register MCP at project scope ──────────────────────────────────────
  ensureProjectMcp(cwd);

  // ── 5. Install hooks to .claude/hooks/ ────────────────────────────────────
  installProjectHooks(cwd);
  ensureProjectHookWiring(cwd);

  // ── 6. Install skills to .claude/skills/ and .pi/skills/ ──────────────────
  installProjectSkills(cwd);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`\n${bold('Done!')}\n`);
  console.log(`  ${dim('Project-local installation:')}`);
  console.log(`  .claude/hooks/         ${dim('# hooks (Claude Code)')}`);
  console.log(`  .claude/settings.json  ${dim('# hook wiring')}`);
  console.log(`  .claude/skills/        ${dim('# skills (Claude Code)')}`);
  console.log(`  .pi/skills/            ${dim('# skills (pi)')}`);
  console.log('');
  console.log(`  ${dim('.specialists/ structure:')}`);
  console.log(`  .specialists/`);
  console.log(`  ├── default/           ${dim('# canonical specialists (from init --sync-defaults)')}`)
  console.log(`  ├── user/              ${dim('# your custom specialists')}`);
  console.log(`  ├── jobs/              ${dim('# runtime (gitignored)')}`);
  console.log(`  └── ready/             ${dim('# runtime (gitignored)')}`);
  console.log(`\n  ${dim('Next steps:')}`);
  console.log(`  1. Run ${yellow('specialists list')} to see available specialists`);
  console.log(`  2. Add custom specialists to ${yellow('.specialists/user/')}`);
  console.log(`  3. Restart Claude Code or pi to pick up changes\n`);
}