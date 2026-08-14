import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run as runEdit } from './edit.js';
import { formatResolvedConfigReport, loadResolvedConfigReport } from '../specialist/resolution-diagnostics.js';
import { resolveCanonicalAssetDir } from '../specialist/canonical-asset-resolver.js';

const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function usage(): string {
  return [
    'Usage:',
    '  specialists config get <key> [--all] [--name <specialist>]',
    '  specialists config set <key> <value> [--all] [--name <specialist>]',
    '  specialists config show <specialist> [--resolved] [--from-source]',
    '',
    'Deprecated alias of specialists edit:',
    '  specialists edit --all --get <key>',
    '  specialists edit --all --set <key> <value>',
    '  specialists edit <name> --get <key>',
    '  specialists edit <name> --set <key> <value>',
  ].join('\n');
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readPackageVersion(packageJsonPath: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

function isInsideGitWorktree(projectDir: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectDir, encoding: 'utf-8' });
  return result.status === 0 && result.stdout.trim() === 'true';
}

function getGitCommonDir(projectDir: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: projectDir, encoding: 'utf-8' });
  if (result.status !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

function getGitTopLevel(projectDir: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: projectDir, encoding: 'utf-8' });
  if (result.status !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

function getRuntimePackageVersion(): string | undefined {
  const runtimeDir = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = runtimeDir.includes('/dist/')
    ? join(runtimeDir, '..', 'package.json')
    : join(runtimeDir, '..', '..', 'package.json');
  return readPackageVersion(packageJsonPath);
}

function shouldWarnAboutSourceMode(projectDir: string): boolean {
  if (!isInsideGitWorktree(projectDir)) return false;
  const topLevel = getGitTopLevel(projectDir);
  const commonDir = getGitCommonDir(projectDir);
  if (!topLevel || !commonDir || topLevel === commonDir) return false;

  const packageVersion = readPackageVersion(join(projectDir, 'package.json'));
  const runtimeVersion = getRuntimePackageVersion();
  return Boolean(packageVersion && runtimeVersion && packageVersion !== runtimeVersion);
}

function showSourceRuntimeUnavailableError(reason: 'bunx-missing' | 'tsx-missing'): never {
  const detail = reason === 'bunx-missing'
    ? 'bunx missing'
    : 'tsx missing or failed';
  fail(`Unable to run source mode (${detail}). Need bunx + tsx in PATH. Try: bunx tsx src/index.ts config show <specialist> --resolved --from-source`);
}

function buildEditArgv(argv: string[]): string[] {
  const command = argv[0];
  if (command !== 'get' && command !== 'set') {
    fail(usage());
  }

  const key = argv[1];
  if (!key || key.startsWith('--')) {
    fail(`Missing key\n\n${usage()}`);
  }

  const translated: string[] = [];
  let index = 2;

  if (command === 'set') {
    const value = argv[2];
    if (value === undefined || value.startsWith('--')) {
      fail(`Missing value for set\n\n${usage()}`);
    }
    translated.push('--set', key, value);
    index = 3;
  } else {
    translated.push('--get', key);
  }

  let hasName = false;
  let hasAll = false;

  for (let i = index; i < argv.length; i++) {
    const token = argv[i];

    if (token === '--all') {
      translated.push('--all');
      hasAll = true;
      continue;
    }

    if (token === '--name') {
      const name = argv[++i];
      if (!name || name.startsWith('--')) {
        fail('--name requires a specialist name');
      }
      translated.unshift(name);
      hasName = true;
      continue;
    }

    fail(`Unknown option: ${token}\n\n${usage()}`);
  }

  if (!hasName && !hasAll) {
    translated.unshift('--all');
  }

  return translated;
}

async function showResolvedConfig(argv: string[]): Promise<void> {
  const specialistName = argv[0];
  if (!specialistName || specialistName.startsWith('--')) {
    fail(`Missing specialist name\n\n${usage()}`);
  }

  const flags = new Set(argv.slice(1));
  for (const flag of flags) {
    if (flag !== '--resolved' && flag !== '--from-source') {
      fail(`Unknown option: ${flag}\n\n${usage()}`);
    }
  }
  if (!flags.has('--resolved')) {
    fail(`Unknown option: ${argv.slice(1).join(' ')}\n\n${usage()}`);
  }

  const projectDir = process.cwd();
  // Precedence matches session.ts loadSharedToolCatalogIndex: legacy per-project
  // override first, canonical packaged catalog second. loadResolvedConfigReport
  // will surface ENOENT for the resolved path if both are missing.
  const legacyCatalogsPath = join(projectDir, '.specialists', 'catalog', 'index.json');
  let catalogsPath = legacyCatalogsPath;
  if (!existsSync(catalogsPath)) {
    const canonicalDir = resolveCanonicalAssetDir('catalog');
    if (canonicalDir) {
      catalogsPath = join(canonicalDir, 'index.json');
    }
  }

  if (!flags.has('--from-source') && shouldWarnAboutSourceMode(projectDir)) {
    console.error(yellow('⚠ hint: use --from-source for worktree-source resolver review'));
  }

  if (flags.has('--from-source') && !import.meta.url.includes('/src/')) {
    const result = spawnSync('bunx', ['tsx', 'src/index.ts', 'config', 'show', specialistName, '--resolved'], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    if (result.error instanceof Error && 'code' in result.error && (result.error as { code?: string }).code === 'ENOENT') {
      showSourceRuntimeUnavailableError('bunx-missing');
    }

    const stderr = result.stderr?.toString() ?? '';
    const tsxMissing = result.status !== 0 && (stderr.includes('tsx') || stderr.includes('Cannot find module') || stderr.includes('ERR_MODULE_NOT_FOUND'));
    if (tsxMissing) {
      showSourceRuntimeUnavailableError('tsx-missing');
    }

    if (result.status !== 0) {
      process.stderr.write(stderr);
      process.exit(result.status ?? 1);
    }
    process.stdout.write(result.stdout?.toString() ?? '');
    return;
  }

  const report = await loadResolvedConfigReport({ specialistName, projectDir, catalogsPath });
  console.log(formatResolvedConfigReport(report));
}

export async function run(): Promise<void> {
  const originalArgs = process.argv.slice(3);
  const command = originalArgs[0];

  if (command === 'show') {
    await showResolvedConfig(originalArgs.slice(1));
    return;
  }

  const editArgs = buildEditArgv(originalArgs);
  console.error(`${yellow('⚠ DEPRECATED')} specialists config is deprecated. Use ${yellow('specialists edit')} instead.`);

  process.argv = [process.argv[0] ?? 'node', process.argv[1] ?? 'specialists', 'edit', ...editArgs];
  await runEdit();
}
