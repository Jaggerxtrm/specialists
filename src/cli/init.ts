// src/cli/init.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`\n${bold('Done!')}\n`);
  console.log(`  ${dim('Next steps:')}`);
  console.log(`  1. Add your specialists to ${yellow('specialists/')}`);
  console.log(`  2. Run ${yellow('specialists list')} to verify they are discovered`);
  console.log(`  3. Restart Claude Code to pick up AGENTS.md changes\n`);
}
