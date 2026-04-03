import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, sep } from 'node:path';

const OBSERVABILITY_DB_FILENAME = 'observability.db';
const DEFAULT_DB_DIRECTORY_RELATIVE_TO_GIT_ROOT = ['.specialists', 'db'] as const;

export interface ObservabilityDbLocation {
  gitRoot: string;
  dbDirectory: string;
  dbPath: string;
  dbWalPath: string;
  dbShmPath: string;
  source: 'git-root' | 'xdg-data-home';
}

function resolveGitRootFrom(cwd: string): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0) return cwd;

  const gitRoot = result.stdout.trim();
  return gitRoot.length > 0 ? gitRoot : cwd;
}

function resolveDbDirectory(gitRoot: string): { directory: string; source: ObservabilityDbLocation['source'] } {
  const xdgDataHome = process.env.XDG_DATA_HOME?.trim();
  if (xdgDataHome) {
    return { directory: join(xdgDataHome, 'specialists'), source: 'xdg-data-home' };
  }

  return {
    directory: join(gitRoot, ...DEFAULT_DB_DIRECTORY_RELATIVE_TO_GIT_ROOT),
    source: 'git-root',
  };
}

export function resolveObservabilityDbLocation(cwd: string = process.cwd()): ObservabilityDbLocation {
  const gitRoot = resolveGitRootFrom(cwd);
  const resolved = resolveDbDirectory(gitRoot);
  const dbPath = join(resolved.directory, OBSERVABILITY_DB_FILENAME);

  return {
    gitRoot,
    dbDirectory: resolved.directory,
    dbPath,
    dbWalPath: `${dbPath}-wal`,
    dbShmPath: `${dbPath}-shm`,
    source: resolved.source,
  };
}

export function ensureObservabilityDbFile(location: ObservabilityDbLocation): { created: boolean } {
  mkdirSync(location.dbDirectory, { recursive: true });

  const alreadyExists = existsSync(location.dbPath);
  if (!alreadyExists) {
    writeFileSync(location.dbPath, '', { encoding: 'utf-8', flag: 'wx' });
  }

  chmodSync(location.dbPath, 0o644);
  return { created: !alreadyExists };
}

export function ensureGitignoreHasObservabilityDbEntries(gitRoot: string): { changed: boolean } {
  const gitignorePath = join(gitRoot, '.gitignore');
  const requiredEntries = [
    '.specialists/db/*.db',
    '.specialists/db/*.db-wal',
    '.specialists/db/*.db-shm',
  ];

  const existing = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf-8')
    : '';

  const existingLines = new Set(existing.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  const missingEntries = requiredEntries.filter(entry => !existingLines.has(entry));

  if (missingEntries.length === 0) {
    return { changed: false };
  }

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n');
  const prefix = needsLeadingNewline ? '\n' : '';
  const sectionHeader = existing.includes('# Specialists observability database') ? '' : '# Specialists observability database\n';
  const block = `${prefix}${sectionHeader}${missingEntries.join('\n')}\n`;
  writeFileSync(gitignorePath, `${existing}${block}`, 'utf-8');

  return { changed: true };
}

export function isPathInsideJobsDirectory(pathToCheck: string, gitRoot: string): boolean {
  const jobsDirPrefix = `${join(gitRoot, '.specialists', 'jobs')}${sep}`;
  return pathToCheck.startsWith(jobsDirPrefix);
}
