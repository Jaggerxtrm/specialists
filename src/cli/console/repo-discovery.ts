// First-run repo discovery for sp console (unitAI-29p39, Wave A).
//
// Scans a fixed set of well-known base dirs one level deep for child
// directories with a `.specialists/db/observability.db` OR
// `.specialists/jobs/`. The set is hardcoded — the operator can override
// via `console.json.base_dirs` after first run.
//
// Pure-ish: only reads fs + env. No process state. Returns the scan
// result + the base dirs actually exercised so the caller can persist
// them and reproduce on rescan.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveObservabilityDbLocation } from '../../specialist/observability-db.js';
import { resolveJobsDir } from '../../specialist/job-root.js';
import type { ConsoleConfigRepoEntry } from './repo-config.js';

// Default first-run base dirs. Probed in order; only existing dirs are
// scanned. Keep this list small + obvious so first-run is cheap.
export const DEFAULT_BASE_DIR_CANDIDATES = [
  '~/dev',
  '~/projects',
  '~/work',
  '~/repos',
  '~/code',
] as const;

// Expand `~/...` to the actual home directory. Other shell expansions
// (`$VAR`, etc) are NOT supported — keep this dumb on purpose.
export function expandHomePath(p: string): string {
  const home = process.env.HOME?.trim() || homedir();
  if (p === '~') return home;
  if (p.startsWith('~/')) return join(home, p.slice(2));
  return p;
}

export interface DiscoveryResult {
  /** Repos discovered. Sorted alphabetically by name. */
  repos: ConsoleConfigRepoEntry[];
  /** Base dirs we actually scanned (existed at scan time). */
  scannedBaseDirs: string[];
}

export function discoverRepos(
  baseDirCandidates: readonly string[] = DEFAULT_BASE_DIR_CANDIDATES,
): DiscoveryResult {
  const seen = new Set<string>(); // dedup by absolute path
  const repos: ConsoleConfigRepoEntry[] = [];
  const scannedBaseDirs: string[] = [];

  for (const candidate of baseDirCandidates) {
    const baseDir = expandHomePath(candidate);
    if (!safeIsDirectory(baseDir)) continue;
    scannedBaseDirs.push(candidate);
    let entries: string[];
    try {
      entries = readdirSync(baseDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue; // skip dotdirs (.git, .vscode, etc)
      const root = join(baseDir, entry);
      if (!safeIsDirectory(root)) continue;
      if (!looksLikeSpecialistsRepo(root)) continue;
      if (seen.has(root)) continue;
      seen.add(root);
      repos.push({ name: entry, path: root });
    }
  }

  repos.sort((a, b) => a.name.localeCompare(b.name));
  return { repos, scannedBaseDirs };
}

function safeIsDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function looksLikeSpecialistsRepo(root: string): boolean {
  // Two markers — observability DB (preferred) or the legacy file-backed
  // jobs dir. Either implies sp has been initialized in this repo.
  try {
    const location = resolveObservabilityDbLocation(root);
    if (existsSync(location.dbPath)) return true;
    const jobsDir = resolveJobsDir(root);
    if (existsSync(jobsDir)) return true;
  } catch {
    return false;
  }
  return false;
}
