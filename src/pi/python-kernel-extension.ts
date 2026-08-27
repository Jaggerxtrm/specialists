// Resolves the python-kernel Pi extension from the @jaggerxtrm/pi-extensions
// package (global node_modules), mirroring the gitnexus package resolution.
//
// Why the package path and not ~/.pi/agent/extensions:
//   The loose per-user copies under ~/.pi/agent/extensions are not managed and
//   can diverge (the brief forbids touching them). The npm-installed package
//   @jaggerxtrm/pi-extensions is the canonical source — on this machine it is
//   a symlink to the core source checkout, so it is live with v2 (skillbridge,
//   audit seam, QoL). A missing package returns null and callers fail open —
//   the specialist session simply runs without the `python` tool.
//
// Path shape: <global node_modules>/@jaggerxtrm/pi-extensions/extensions/
//   python-kernel/index.ts (pi loads a raw TS entrypoint directly).

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join('@jaggerxtrm', 'pi-extensions');
const EXT_REL = join('extensions', 'python-kernel', 'index.ts');

function resolveGlobalNodeModulesDir(): string | undefined {
  const candidates = [
    process.env.PI_NPM_GLOBAL_DIR,
    process.env.NPM_CONFIG_PREFIX ? join(process.env.NPM_CONFIG_PREFIX, 'lib', 'node_modules') : undefined,
    process.env.npm_config_prefix ? join(process.env.npm_config_prefix, 'lib', 'node_modules') : undefined,
    process.env.NVM_BIN ? join(dirname(process.env.NVM_BIN), 'lib', 'node_modules') : undefined,
    join(homedir(), '.nvm/versions/node', process.version, 'lib', 'node_modules'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate));
}

let cached: string | null | undefined;

export function getPiExtensionsPythonKernelPath(): string | null {
  if (cached !== undefined) return cached;
  const globalDir = resolveGlobalNodeModulesDir();
  if (globalDir) {
    const candidate = join(globalDir, PACKAGE_DIR, EXT_REL);
    if (existsSync(candidate)) {
      cached = resolve(candidate);
      return cached;
    }
  }
  cached = null;
  return cached;
}

/** Alias used by session.ts injection site (kept short for the diff). */
export function resolvePiExtensionsPythonKernelPath(): string | null {
  return getPiExtensionsPythonKernelPath();
}

/** Test-only reset for the module-level cache. */
export function __resetPiExtensionsPythonKernelPathCacheForTest(): void {
  cached = undefined;
}
