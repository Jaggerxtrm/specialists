#!/usr/bin/env node

/**
 * Specialists MCP Server — entry point
 * Subcommands: install, version, list, init, edit, run, status, help
 */

import { SpecialistsServer } from "./server.js";
import { logger } from "./utils/logger.js";

const sub = process.argv[2];

async function run() {
  if (sub === 'install') {
    const { run: handler } = await import('./cli/install.js');
    return handler();
  }

  if (sub === 'version' || sub === '--version' || sub === '-v') {
    const { run: handler } = await import('./cli/version.js');
    return handler();
  }

  if (sub === 'list') {
    const { run: handler } = await import('./cli/list.js');
    return handler();
  }

  if (sub === 'models') {
    const { run: handler } = await import('./cli/models.js');
    return handler();
  }

  if (sub === 'init') {
    const { run: handler } = await import('./cli/init.js');
    return handler();
  }

  if (sub === 'edit') {
    const { run: handler } = await import('./cli/edit.js');
    return handler();
  }

  if (sub === 'run') {
    const { run: handler } = await import('./cli/run.js');
    return handler();
  }

  if (sub === 'status') {
    const { run: handler } = await import('./cli/status.js');
    return handler();
  }

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    const { run: handler } = await import('./cli/help.js');
    return handler();
  }

  // Unknown subcommand — error instead of silently starting the MCP server
  if (sub) {
    console.error(`Unknown command: '${sub}'\nRun 'specialists help' to see available commands.`);
    process.exit(1);
  }

  // No subcommand: MCP server mode
  logger.info("Starting Specialists MCP Server...");
  const server = new SpecialistsServer();
  await server.start();
}

run().catch((error) => {
  logger.error(`Fatal error: ${error}`);
  process.exit(1);
});
