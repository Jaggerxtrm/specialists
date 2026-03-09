#!/usr/bin/env node

/**
 * Specialists MCP Server — entry point
 * Subcommands: install, version, list
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { SpecialistsServer } from "./server.js";
import { logger } from "./utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sub = process.argv[2];

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function run() {
  // ── install ──────────────────────────────────────────────────────────────────
  if (sub === 'install') {
    const installerPath = join(__dirname, '..', 'bin', 'install.js');
    execFileSync(process.execPath, [installerPath], { stdio: 'inherit' });
    return;
  }

  // ── version ──────────────────────────────────────────────────────────────────
  if (sub === 'version') {
    const req = createRequire(import.meta.url);
    const pkg = req('../package.json') as { name: string; version: string };
    console.log(`${pkg.name} v${pkg.version}`);
    return;
  }

  // ── list ─────────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    const { SpecialistLoader } = await import('./specialist/loader.js');
    const loader = new SpecialistLoader();
    const specialists = await loader.list();

    if (specialists.length === 0) {
      console.log('No specialists found.');
      return;
    }

    const nameWidth  = Math.max(...specialists.map(s => s.name.length),  4);
    const modelWidth = Math.max(...specialists.map(s => s.model.length), 5);

    console.log(`\n${bold(`Specialists (${specialists.length})`)}\n`);
    for (const s of specialists) {
      const name  = cyan(s.name.padEnd(nameWidth));
      const model = dim(s.model.padEnd(modelWidth));
      const scope = yellow(`[${s.scope}]`);
      console.log(`  ${name}  ${model}  ${s.description}  ${scope}`);
    }
    console.log();
    return;
  }

  // ── default: MCP server ───────────────────────────────────────────────────────
  logger.info("Starting Specialists MCP Server...");
  const server = new SpecialistsServer();
  await server.start();
}

run().catch((error) => {
  logger.error(`Fatal error: ${error}`);
  process.exit(1);
});
