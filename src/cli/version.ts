// src/cli/version.ts

import { createRequire } from 'node:module';

export async function run(): Promise<void> {
  // Path is relative to the bun bundle output (dist/index.js), not source location
  const req = createRequire(import.meta.url);
  const pkg = req('../package.json') as { name: string; version: string };
  console.log(`${pkg.name} v${pkg.version}`);
}
