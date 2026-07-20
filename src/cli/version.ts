// src/cli/version.ts

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export interface VersionInfo {
  package: string;
  version: string;
  commit: string | null;
  dirty: boolean | null;
  source: 'npm' | 'local';
  built_at: string | null;
  runtime: {
    // Specialists is Bun-primary; report the Bun version. null when the
    // process happens to run under plain Node (e.g. `node` vs `bun`).
    bun: string | null;
  };
}

function resolvePackage(): { name: string; version: string; root: string } {
  const req = createRequire(import.meta.url);
  const here = dirname(fileURLToPath(import.meta.url));

  // Try bundle path first (dist/ -> package.json), then source path (src/cli/ -> package.json)
  const bundlePkgPath = join(here, '..', 'package.json');
  const sourcePkgPath = join(here, '..', '..', 'package.json');

  if (existsSync(bundlePkgPath)) {
    const pkg = req('../package.json') as { name: string; version: string };
    return { name: pkg.name, version: pkg.version, root: dirname(bundlePkgPath) };
  }
  if (existsSync(sourcePkgPath)) {
    const pkg = req('../../package.json') as { name: string; version: string };
    return { name: pkg.name, version: pkg.version, root: dirname(sourcePkgPath) };
  }
  return { name: '@jaggerxtrm/specialists', version: '0.0.0', root: join(here, '..', '..') };
}

function detectSource(installRoot: string): 'npm' | 'local' {
  return installRoot.split(sep).includes('node_modules') ? 'npm' : 'local';
}

function git(installRoot: string, args: string[]): string | null {
  if (!existsSync(join(installRoot, '.git'))) return null;
  const result = spawnSync('git', args, {
    cwd: installRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

function readGitCommit(installRoot: string): string | null {
  const out = git(installRoot, ['rev-parse', 'HEAD']);
  return out ? out.trim() || null : null;
}

function readGitDirty(installRoot: string): boolean | null {
  const out = git(installRoot, ['status', '--porcelain']);
  return out === null ? null : out.trim().length > 0;
}

function readBuiltAt(installRoot: string): string | null {
  // No build-timestamp file is emitted today; best-effort via the bundle mtime.
  // ponytail: bundle mtime, swap for a build-time define if exact provenance matters.
  const distPath = join(installRoot, 'dist', 'index.js');
  if (!existsSync(distPath)) return null;
  try {
    return new Date(statSync(distPath).mtime).toISOString();
  } catch {
    return null;
  }
}

export function collectVersionInfo(): VersionInfo {
  const pkg = resolvePackage();
  return {
    package: pkg.name,
    version: pkg.version,
    commit: readGitCommit(pkg.root),
    dirty: readGitDirty(pkg.root),
    source: detectSource(pkg.root),
    built_at: readBuiltAt(pkg.root),
    runtime: {
      bun: process.versions.bun ?? null,
    },
  };
}

export async function run(): Promise<void> {
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(collectVersionInfo()) + '\n');
    return;
  }
  const pkg = resolvePackage();
  console.log(`${pkg.name} v${pkg.version}`);
}
