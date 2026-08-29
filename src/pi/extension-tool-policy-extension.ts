// Resolves the shipped Specialists-owned extension tool policy directory
// (unitAI-34pyf). The .mjs body lives at config/pi-extensions/extension-tool-policy/
// and the resolver follows the same candidate walk as read-line-numbers so both
// the bundled build (dist/) and dev source (src/pi/) resolve.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REL = join('config', 'pi-extensions', 'extension-tool-policy');

const CANDIDATES = [
  join(HERE, '..', REL),
  join(HERE, '..', '..', REL),
  join(HERE, '..', '..', '..', REL),
];

let cached: string | null | undefined;

export function getExtensionToolPolicyExtensionPath(): string | null {
  if (cached !== undefined) return cached;
  for (const candidate of CANDIDATES) {
    if (existsSync(join(candidate, 'index.mjs'))) {
      cached = resolve(candidate);
      return cached;
    }
  }
  cached = null;
  process.stderr.write(
    '[xtrm-tool-policy] WARN: bundled policy extension not found alongside package. ' +
      'Enabled extension sources will load without the tool-policy gate.\n',
  );
  return cached;
}

/** Environment channel carrying the tier's granted native allowlist to the
 *  policy extension. Bounded, comma-separated native tool names. */
export const NATIVE_TOOLS_ENV_KEY = 'PI_SPECIALIST_ALLOWED_NATIVE_TOOLS';

/** Test-only reset for the module-level cache. */
export function __resetExtensionToolPolicyExtensionPathCacheForTest(): void {
  cached = undefined;
}