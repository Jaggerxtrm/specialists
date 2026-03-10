// src/cli/install.ts

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export async function run(): Promise<void> {
  const installerPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..', 'bin', 'install.js'
  );
  execFileSync(process.execPath, [installerPath], { stdio: 'inherit' });
}
