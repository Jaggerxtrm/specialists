// First-run repo discovery for sp console (unitAI-29p39 Wave A;
// depth-2 + worktree-safe descent added in unitAI-fd4pl Wave C).
//
// Scans a fixed set of well-known base dirs up to depth `MAX_SCAN_DEPTH`
// for directories with `.specialists/db/observability.db` OR
// `.specialists/jobs/`. The set of base dirs is hardcoded — the operator
// can override via `console.json.base_dirs` after first run.
//
// Two correctness invariants govern the recursion (Wave C):
//   1. Skip git worktrees BEFORE the marker check. A worktree's
//      `.specialists/db/observability.db` resolves through
//      `git rev-parse --git-common-dir` back to the main repo's DB —
//      `existsSync` would false-positive every worktree as a discoverable
//      repo. Detection is pure stat: `.git` exists and is a FILE (not a
//      directory). Submodules use the same `.git`-as-file shape and are
//      correctly skipped too.
//   2. Stop descent on a marker hit. If `~/projects/mercury` itself
//      carries `.specialists/`, take it and do not recurse into its
//      children — avoids double-counting nested .specialists layouts.
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

// Depth-2 covers the common `~/projects/parent/repo` layout (e.g.
// `~/projects/mercury/infra`) without the cost of unbounded recursion.
// Depth-3+ rare-monorepo cases stay manual — operator can add directly
// from RepoConfigView.
export const MAX_SCAN_DEPTH = 2;

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
    walk(baseDir, 1, seen, repos);
  }

  repos.sort((a, b) => a.name.localeCompare(b.name));
  return { repos, scannedBaseDirs };
}

function walk(
  dir: string,
  depth: number,
  seen: Set<string>,
  repos: ConsoleConfigRepoEntry[],
): void {
  // Worktree-shaped dirs (.git as a file) carry the parent's DB via
  // `git rev-parse --git-common-dir`. Skipping them BEFORE descent or
  // marker checks prevents double-counting and false positives.
  if (isWorktreeDir(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue; // skip dotdirs (.git, .vscode, .worktrees, ...)
    const root = join(dir, entry);
    if (!safeIsDirectory(root)) continue;
    if (isWorktreeDir(root)) continue;
    if (looksLikeSpecialistsRepo(root)) {
      if (!seen.has(root)) {
        seen.add(root);
        repos.push({ name: entry, path: root });
      }
      // Found a real repo here — do NOT descend further. Avoids
      // double-counting nested .specialists in monorepo-like layouts.
      continue;
    }
    if (depth < MAX_SCAN_DEPTH) {
      walk(root, depth + 1, seen, repos);
    }
  }
}

// Detect git worktrees (and submodules — same shape) without spawning git.
// Standard checkouts: `.git/` is a directory.
// Worktrees + submodules: `.git` is a file with `gitdir: <path>` payload.
// Bare repos: no `.git` at all — naturally skipped by the marker check.
function isWorktreeDir(path: string): boolean {
  try {
    const gitPath = join(path, '.git');
    if (!existsSync(gitPath)) return false;
    return !statSync(gitPath).isDirectory();
  } catch {
    return false;
  }
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
