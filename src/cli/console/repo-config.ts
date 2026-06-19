// Console config persisted at ~/.config/specialists/console.json
// (XDG → config-home → legacy resolution, matching the existing user.json
// in src/specialist/global-config.ts). Holds the list of repos sp console
// surfaces in its tabs row, plus the base dirs that first-run discovery
// scanned (so re-scan can reproduce the result).
//
// Atomic write via tmp+rename (same shape as writeGlobalUserConfig from
// unitAI-ctb4u.17): write payload to sibling tmp file, renameSync over
// dest. POSIX rename within the same fs is atomic so a crash between
// truncate + write can never leave console.json empty.
//
// Filed as unitAI-29p39 (Wave A of the multi-repo discovery feature).
// Wave B (unitAI-hneld) wires this config into an interactive
// RepoConfigView.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { logError } from './log.js';

const CONFIG_FILENAME = 'console.json';
const SPECIALISTS_SUBDIR = 'specialists';
export const CONSOLE_CONFIG_SCHEMA_VERSION = 1;
export const CONSOLE_CONFIG_DOC = './console-config-guide.md';

export type ConsoleConfigSource = 'xdg' | 'config-home' | 'legacy';

export interface ConsoleConfigPath {
  path: string;
  exists: boolean;
  source: ConsoleConfigSource;
}

export interface ConsoleConfigRepoEntry {
  name: string;
  path: string;
}

export interface ConsoleConfig {
  _doc?: string;
  schema_version: number;
  base_dirs: string[];
  repos: ConsoleConfigRepoEntry[];
  auto_discovered_at?: string;
}

// ── Path resolution ────────────────────────────────────────────────────────

export function getConsoleConfigPath(): ConsoleConfigPath {
  const home = process.env.HOME?.trim() || homedir();
  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  if (xdgConfigHome) {
    const xdgPath = join(xdgConfigHome, SPECIALISTS_SUBDIR, CONFIG_FILENAME);
    return { path: xdgPath, exists: existsSync(xdgPath), source: 'xdg' };
  }
  const configHomePath = join(home, '.config', SPECIALISTS_SUBDIR, CONFIG_FILENAME);
  if (existsSync(configHomePath)) {
    return { path: configHomePath, exists: true, source: 'config-home' };
  }
  const legacyPath = join(home, '.specialists', CONFIG_FILENAME);
  if (existsSync(legacyPath)) {
    return { path: legacyPath, exists: true, source: 'legacy' };
  }
  // No existing file — the next write target is config-home (XDG default).
  return { path: configHomePath, exists: false, source: 'config-home' };
}

// ── Read ───────────────────────────────────────────────────────────────────

export function readConsoleConfig(): ConsoleConfig | null {
  const location = getConsoleConfigPath();
  if (!location.exists) return null;
  try {
    const raw = readFileSync(location.path, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ConsoleConfig>;
    return normalizeConfig(parsed);
  } catch (error) {
    logError('ps', 'read_global_config', {
      step: 'console_json',
      errorClass: error instanceof Error ? error.name : 'unknown',
    });
    return null;
  }
}

function normalizeConfig(raw: Partial<ConsoleConfig>): ConsoleConfig | null {
  // Drift-safe shape: missing fields default to empty rather than throw,
  // so a partially-written file from a future schema doesn't kill the TUI.
  // schema_version mismatches surface as a normalized config — caller can
  // migrate later if needed.
  const base_dirs = Array.isArray(raw.base_dirs)
    ? raw.base_dirs.filter((d): d is string => typeof d === 'string')
    : [];
  const repos: ConsoleConfigRepoEntry[] = Array.isArray(raw.repos)
    ? raw.repos.flatMap((r) => {
      if (typeof r !== 'object' || r === null) return [];
      const candidate = r as { name?: unknown; path?: unknown };
      if (typeof candidate.name !== 'string' || typeof candidate.path !== 'string') return [];
      return [{ name: candidate.name, path: candidate.path }];
    })
    : [];
  return {
    _doc: typeof raw._doc === 'string' ? raw._doc : CONSOLE_CONFIG_DOC,
    schema_version: typeof raw.schema_version === 'number' ? raw.schema_version : CONSOLE_CONFIG_SCHEMA_VERSION,
    base_dirs,
    repos,
    auto_discovered_at: typeof raw.auto_discovered_at === 'string' ? raw.auto_discovered_at : undefined,
  };
}

// ── Write (atomic) ─────────────────────────────────────────────────────────

export function writeConsoleConfig(
  config: ConsoleConfig,
  cookie: string = `${process.pid}.${Math.floor(performance.now() * 1000)}`,
): void {
  const location = getConsoleConfigPath();
  const dir = dirname(location.path);
  mkdirSync(dir, { recursive: true });
  const payload = `${JSON.stringify(config, null, 2)}\n`;
  const tmpPath = `${location.path}.tmp.${cookie}`;
  try {
    writeFileSync(tmpPath, payload, 'utf-8');
    renameSync(tmpPath, location.path);
  } catch (renameError) {
    try { rmSync(tmpPath, { force: true }); } catch { /* noop */ }
    logError('ps', 'write_global_config', {
      step: 'console_json',
      errorClass: (renameError as NodeJS.ErrnoException)?.code ?? (renameError instanceof Error ? renameError.name : 'unknown'),
    });
    // Last-resort fallback so the operator can still persist their config.
    writeFileSync(location.path, payload, 'utf-8');
    throw renameError;
  }
}

// ── Template ───────────────────────────────────────────────────────────────

export function buildConsoleConfigTemplate(
  repos: ConsoleConfigRepoEntry[],
  baseDirs: string[],
  nowIso: string,
): ConsoleConfig {
  return {
    _doc: CONSOLE_CONFIG_DOC,
    schema_version: CONSOLE_CONFIG_SCHEMA_VERSION,
    base_dirs: baseDirs,
    repos,
    auto_discovered_at: nowIso,
  };
}

// ── Stale check ────────────────────────────────────────────────────────────

export function isConsoleConfigStale(config: ConsoleConfig, maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): boolean {
  if (!config.auto_discovered_at) return true;
  const when = Date.parse(config.auto_discovered_at);
  if (Number.isNaN(when)) return true;
  return Date.now() - when > maxAgeMs;
}

// ── Disk-existence sanity ──────────────────────────────────────────────────

export function pruneMissingRepos(repos: ConsoleConfigRepoEntry[]): ConsoleConfigRepoEntry[] {
  return repos.filter((r) => {
    try {
      return statSync(r.path).isDirectory();
    } catch {
      return false;
    }
  });
}
