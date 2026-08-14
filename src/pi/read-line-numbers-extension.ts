// Resolves the shipped read-line-numbers Pi extension directory.
// The .mjs body lives at config/pi-extensions/read-line-numbers/ and is
// packaged via package.json `files`. Pi loads the whole directory (`-e <dir>`)
// and picks up the extension via its own package.json `main` / `pi.extensions`.
//
// Path resolution walks a small candidate list so both the bundled build
// (dist/index.js next to config/) and the dev source (src/pi/ two levels
// above config/) resolve without special-casing import.meta.url. Missing
// asset returns null and callers fail open — matching the worktree-boundary
// extension's stderr WARN pattern.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REL = join('config', 'pi-extensions', 'read-line-numbers');

// Candidate roots, in order:
//  - bundled: dist/../config/…              (dist/index.js)
//  - dev:     src/pi/../../config/…          (src/pi/read-line-numbers-extension.ts)
//  - dev-lib: dist/types/pi/../../../config/… (declaration-emit paths)
const CANDIDATES = [
  join(HERE, '..', REL),
  join(HERE, '..', '..', REL),
  join(HERE, '..', '..', '..', REL),
];

let cached: string | null | undefined;

export function getReadLineNumbersExtensionPath(): string | null {
  if (cached !== undefined) return cached;
  for (const candidate of CANDIDATES) {
    if (existsSync(join(candidate, 'index.mjs'))) {
      cached = resolve(candidate);
      return cached;
    }
  }
  cached = null;
  process.stderr.write(
    '[read-line-numbers] WARN: bundled extension not found alongside package. ' +
      'Model-facing read output will not be line-numbered for this session.\n',
  );
  return cached;
}

/** Test-only reset for the module-level cache. */
export function __resetReadLineNumbersExtensionPathCacheForTest(): void {
  cached = undefined;
}
