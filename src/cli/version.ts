// src/cli/version.ts

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

export async function run(): Promise<void> {
  const req = createRequire(import.meta.url);
  const here = dirname(fileURLToPath(import.meta.url));

  // Try bundle path first (dist/ -> package.json), then source path (src/cli/ -> package.json)
  const bundlePkgPath = join(here, '..', 'package.json');
  const sourcePkgPath = join(here, '..', '..', 'package.json');

  let pkg: { name: string; version: string };
  if (existsSync(bundlePkgPath)) {
    pkg = req('../package.json');
  } else if (existsSync(sourcePkgPath)) {
    pkg = req('../../package.json');
  } else {
    console.error('Cannot find package.json');
    process.exit(1);
  }

  console.log(`${pkg.name} v${pkg.version}`);
}