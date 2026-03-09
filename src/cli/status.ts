// src/cli/status.ts

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SpecialistLoader, checkStaleness } from '../specialist/loader.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red    = (s: string) => `\x1b[31m${s}\x1b[0m`;

function ok(msg: string)   { console.log(`  ${green('✓')} ${msg}`); }
function warn(msg: string) { console.log(`  ${yellow('○')} ${msg}`); }
function fail(msg: string) { console.log(`  ${red('✗')} ${msg}`); }
function info(msg: string) { console.log(`  ${dim(msg)}`); }

function section(label: string) {
  const line = '─'.repeat(Math.max(0, 38 - label.length));
  console.log(`\n${bold(`── ${label} ${line}`)}`);
}

function cmd(bin: string, args: string[]): { ok: boolean; stdout: string } {
  const r = spawnSync(bin, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 5000,
  });
  return { ok: r.status === 0 && !r.error, stdout: (r.stdout ?? '').trim() };
}

function isInstalled(bin: string): boolean {
  return spawnSync('which', [bin], { encoding: 'utf8', timeout: 2000 }).status === 0;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  console.log(`\n${bold('specialists status')}\n`);

  // ── 1. Specialists ──────────────────────────────────────────────────────────
  section('Specialists');
  const loader = new SpecialistLoader();
  const all = await loader.list();

  if (all.length === 0) {
    warn(`no specialists found — run ${yellow('specialists init')} to scaffold`);
  } else {
    const byScope = all.reduce<Record<string, number>>((acc, s) => {
      acc[s.scope] = (acc[s.scope] ?? 0) + 1;
      return acc;
    }, {});
    const scopeSummary = Object.entries(byScope)
      .map(([scope, n]) => `${n} ${scope}`)
      .join(', ');
    ok(`${all.length} found  ${dim(`(${scopeSummary})`)}`);

    for (const s of all) {
      const staleness = await checkStaleness(s);
      if (staleness === 'AGED') {
        warn(`${s.name}  ${red('AGED')}  ${dim(s.scope)}`);
      } else if (staleness === 'STALE') {
        warn(`${s.name}  ${yellow('STALE')}  ${dim(s.scope)}`);
      }
    }
  }

  // ── 2. pi ───────────────────────────────────────────────────────────────────
  section('pi  (coding agent runtime)');
  if (!isInstalled('pi')) {
    fail(`pi not installed — run ${yellow('specialists install')}`);
  } else {
    const version = cmd('pi', ['--version']);
    const models  = cmd('pi', ['--list-models']);

    const providers = new Set(
      models.stdout.split('\n')
        .slice(1)
        .map(line => line.split(/\s+/)[0])
        .filter(Boolean)
    );

    const vStr = version.ok ? `v${version.stdout}` : 'unknown version';
    const pStr = providers.size > 0
      ? `${providers.size} provider${providers.size > 1 ? 's' : ''} active  ${dim(`(${[...providers].join(', ')})`)} `
      : yellow('no providers configured — run pi config');

    ok(`${vStr}  —  ${pStr}`);
  }

  // ── 3. beads ────────────────────────────────────────────────────────────────
  section('beads  (issue tracker)');
  if (!isInstalled('bd')) {
    fail(`bd not installed — run ${yellow('specialists install')}`);
  } else {
    const bdVersion = cmd('bd', ['--version']);
    ok(`bd installed${bdVersion.ok ? `  ${dim(bdVersion.stdout)}` : ''}`);
    if (existsSync(join(process.cwd(), '.beads'))) {
      ok('.beads/ present in project');
    } else {
      warn(`.beads/ not found — run ${yellow('bd init')} to enable issue tracking`);
    }
  }

  // ── 4. MCP ──────────────────────────────────────────────────────────────────
  section('MCP');
  const specialistsBin = cmd('which', ['specialists']);
  if (!specialistsBin.ok) {
    fail(`specialists not installed globally — run ${yellow('npm install -g @jaggerxtrm/specialists')}`);
  } else {
    ok(`specialists binary installed  ${dim(specialistsBin.stdout)}`);
    info(`verify registration: claude mcp get specialists`);
    info(`re-register:         specialists install`);
  }

  console.log();
}
