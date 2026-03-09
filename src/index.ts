#!/usr/bin/env node

/**
 * Specialists MCP Server — entry point
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SpecialistsServer } from "./server.js";
import { logger } from "./utils/logger.js";

// Handle `specialists install` — delegate to the full-stack installer
if (process.argv[2] === 'install') {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const installerPath = join(__dirname, '..', 'bin', 'install.js');
  execFileSync(process.execPath, [installerPath], { stdio: 'inherit' });
  process.exit(0);
}

async function main() {
  logger.info("Starting Specialists MCP Server...");
  const server = new SpecialistsServer();
  await server.start();
}

main().catch((error) => {
  logger.error(`Fatal error: ${error}`);
  process.exit(1);
});
