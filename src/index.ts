#!/usr/bin/env node

/**
 * Specialists MCP Server — entry point
 */

import { SpecialistsServer } from "./server.js";
import { logger } from "./utils/logger.js";

async function main() {
  logger.info("Starting Specialists MCP Server...");
  const server = new SpecialistsServer();
  await server.start();
}

main().catch((error) => {
  logger.error(`Fatal error: ${error}`);
  process.exit(1);
});
