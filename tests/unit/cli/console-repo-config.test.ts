// Regression for unitAI-29p39 (Wave A): console.json schema + atomic
// write + first-run auto-discovery primitives.

import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildConsoleConfigTemplate,
  CONSOLE_CONFIG_SCHEMA_VERSION,
  getConsoleConfigPath,
  isConsoleConfigStale,
  pruneMissingRepos,
  readConsoleConfig,
  writeConsoleConfig,
  type ConsoleConfig,
} from '../../../src/cli/console/repo-config.js';
import {
  DEFAULT_BASE_DIR_CANDIDATES,
  discoverRepos,
  expandHomePath,
} from '../../../src/cli/console/repo-discovery.js';

describe('console.json — path resolution', () => {
  let savedHome: string | undefined;
  let savedXdg: string | undefined;

  beforeEach(() => {
    savedHome = process.env.HOME;
    savedXdg = process.env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = savedXdg;
  });

  it('resolves to XDG when set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp-console-cfg-xdg-'));
    process.env.XDG_CONFIG_HOME = dir;
    delete process.env.HOME;
    const location = getConsoleConfigPath();
    expect(location.source).toBe('xdg');
    expect(location.path).toBe(join(dir, 'specialists', 'console.json'));
    rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to ~/.config when XDG unset', () => {
    const home = mkdtempSync(join(tmpdir(), 'sp-console-cfg-home-'));
    process.env.HOME = home;
    delete process.env.XDG_CONFIG_HOME;
    const location = getConsoleConfigPath();
    expect(location.source).toBe('config-home');
    expect(location.path).toBe(join(home, '.config', 'specialists', 'console.json'));
    rmSync(home, { recursive: true, force: true });
  });
});

describe('writeConsoleConfig — atomic semantics', () => {
  let dir: string;
  let savedHome: string | undefined;
  let savedXdg: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sp-console-cfg-write-'));
    savedHome = process.env.HOME;
    savedXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = dir;
    delete process.env.HOME;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = savedXdg;
  });

  it('persists the JSON payload with trailing newline', () => {
    const cfg = buildConsoleConfigTemplate(
      [{ name: 'demo', path: '/tmp/demo' }],
      ['~/dev'],
      '2026-06-20T00:00:00Z',
    );
    writeConsoleConfig(cfg, 'test-cookie');
    const location = getConsoleConfigPath();
    expect(location.exists).toBe(true);
    const raw = readFileSync(location.path, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(raw) as ConsoleConfig;
    expect(parsed.repos[0]?.name).toBe('demo');
    expect(parsed.schema_version).toBe(CONSOLE_CONFIG_SCHEMA_VERSION);
  });

  it('overwrites existing file with no .tmp.* leftover', () => {
    const cfg = buildConsoleConfigTemplate([{ name: 'demo', path: '/tmp/demo' }], [], '2026-06-20T00:00:00Z');
    writeConsoleConfig(cfg, 'cookie-1');
    writeConsoleConfig(cfg, 'cookie-2');
    const location = getConsoleConfigPath();
    const parentDir = join(dir, 'specialists');
    const leftovers = readdirSync(parentDir).filter((f) => f.startsWith('console.json.tmp.'));
    expect(leftovers).toEqual([]);
    expect(JSON.parse(readFileSync(location.path, 'utf-8')).repos.length).toBe(1);
  });
});

describe('readConsoleConfig — drift-safe normalization', () => {
  let dir: string;
  let savedHome: string | undefined;
  let savedXdg: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sp-console-cfg-read-'));
    savedHome = process.env.HOME;
    savedXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = dir;
    delete process.env.HOME;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = savedXdg;
  });

  it('returns null when file missing', () => {
    expect(readConsoleConfig()).toBeNull();
  });

  it('drops malformed repo entries instead of throwing', () => {
    const location = getConsoleConfigPath();
    mkdirSync(join(dir, 'specialists'), { recursive: true });
    writeFileSync(location.path, JSON.stringify({
      schema_version: 1,
      base_dirs: ['~/dev', 42, null], // mixed garbage
      repos: [
        { name: 'good', path: '/tmp/good' },
        { name: 'bad-no-path' },
        'not-an-object',
        { path: '/tmp/no-name' },
        null,
      ],
    }), 'utf-8');
    const cfg = readConsoleConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.base_dirs).toEqual(['~/dev']); // numbers + nulls filtered
    expect(cfg!.repos).toEqual([{ name: 'good', path: '/tmp/good' }]);
  });
});

describe('isConsoleConfigStale', () => {
  it('treats missing/invalid auto_discovered_at as stale', () => {
    const baseCfg: ConsoleConfig = { schema_version: 1, base_dirs: [], repos: [] };
    expect(isConsoleConfigStale({ ...baseCfg })).toBe(true);
    expect(isConsoleConfigStale({ ...baseCfg, auto_discovered_at: 'garbage' })).toBe(true);
  });

  it('fresh timestamp is not stale', () => {
    const cfg: ConsoleConfig = {
      schema_version: 1,
      base_dirs: [],
      repos: [],
      auto_discovered_at: new Date().toISOString(),
    };
    expect(isConsoleConfigStale(cfg)).toBe(false);
  });
});

describe('pruneMissingRepos', () => {
  it('keeps entries whose path still exists as a directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp-console-prune-'));
    try {
      const kept = pruneMissingRepos([
        { name: 'real', path: dir },
        { name: 'gone', path: join(dir, 'does-not-exist') },
      ]);
      expect(kept.map((r) => r.name)).toEqual(['real']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('expandHomePath', () => {
  it('expands ~ and ~/foo using $HOME', () => {
    const saved = process.env.HOME;
    process.env.HOME = '/home/test';
    try {
      expect(expandHomePath('~')).toBe('/home/test');
      expect(expandHomePath('~/dev')).toBe('/home/test/dev');
      expect(expandHomePath('/abs/path')).toBe('/abs/path');
      expect(expandHomePath('relative')).toBe('relative');
    } finally {
      if (saved === undefined) delete process.env.HOME; else process.env.HOME = saved;
    }
  });
});

describe('discoverRepos — base dir scan', () => {
  let dir: string;
  let savedHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sp-console-discover-'));
    savedHome = process.env.HOME;
    process.env.HOME = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
  });

  it('discovers child dirs that have .specialists/db/observability.db', () => {
    // Lay out two repos under ~/dev: alpha (with DB), beta (with jobs/),
    // gamma (no marker), plus a dotdir we should skip.
    const devDir = join(dir, 'dev');
    mkdirSync(devDir, { recursive: true });
    for (const repo of ['alpha', 'beta', 'gamma']) mkdirSync(join(devDir, repo));
    mkdirSync(join(devDir, '.hidden')); // dotdir — should be skipped
    mkdirSync(join(devDir, 'alpha', '.specialists', 'db'), { recursive: true });
    writeFileSync(join(devDir, 'alpha', '.specialists', 'db', 'observability.db'), '');
    mkdirSync(join(devDir, 'beta', '.specialists', 'jobs'), { recursive: true });

    const result = discoverRepos(['~/dev']);
    expect(result.scannedBaseDirs).toEqual(['~/dev']);
    expect(result.repos.map((r) => r.name).sort()).toEqual(['alpha', 'beta']);
    expect(result.repos.every((r) => r.path.startsWith(devDir))).toBe(true);
  });

  it('skips missing base dirs without throwing', () => {
    const result = discoverRepos(['~/never-exists', '~/also-never-exists']);
    expect(result.scannedBaseDirs).toEqual([]);
    expect(result.repos).toEqual([]);
  });

  it('default candidates list is non-empty', () => {
    expect(DEFAULT_BASE_DIR_CANDIDATES.length).toBeGreaterThan(0);
    for (const c of DEFAULT_BASE_DIR_CANDIDATES) expect(c.startsWith('~')).toBe(true);
  });
});

describe('listReposWithContext — current-repo selection (unitAI-29p39)', () => {
  let baseDir: string;
  let savedHome: string | undefined;
  let savedXdg: string | undefined;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'sp-console-current-'));
    savedHome = process.env.HOME;
    savedXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = baseDir;
    process.env.XDG_CONFIG_HOME = baseDir;
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = savedXdg;
  });

  it('marks the repo whose path is a prefix of cwd as current', async () => {
    // Set up two fake specialists repos under ~/dev with their own observability DBs.
    const dev = join(baseDir, 'dev');
    mkdirSync(dev, { recursive: true });
    for (const name of ['alpha', 'beta']) {
      mkdirSync(join(dev, name, '.specialists', 'db'), { recursive: true });
      mkdirSync(join(dev, name, '.git'), { recursive: true });
      writeFileSync(join(dev, name, '.specialists', 'db', 'observability.db'), '');
    }
    // The cwd lives inside beta's tree.
    const { createRuntimeClient } = await import('../../../src/cli/console/runtime.js');
    const c = createRuntimeClient(join(dev, 'beta'));
    const { repos } = await c.listReposWithContext!();
    const current = repos.find((r) => r.current);
    expect(current?.name).toBe('beta');
  });

  it('falls back to first repo when cwd is outside all configured paths', async () => {
    const dev = join(baseDir, 'dev');
    mkdirSync(dev, { recursive: true });
    mkdirSync(join(dev, 'alpha', '.specialists', 'db'), { recursive: true });
    writeFileSync(join(dev, 'alpha', '.specialists', 'db', 'observability.db'), '');
    const { createRuntimeClient } = await import('../../../src/cli/console/runtime.js');
    const c = createRuntimeClient(join(baseDir, 'unrelated')) as unknown as { listReposWithContext: () => Promise<{ repos: Array<{ name: string; current?: boolean }>; message?: string }> };
    const { repos } = await c.listReposWithContext();
    if (repos.length > 0) {
      expect(repos[0]!.current).toBe(true);
    }
  });
});

describe('buildConsoleConfigTemplate', () => {
  it('produces a versioned shape with doc sentinel', () => {
    const cfg = buildConsoleConfigTemplate(
      [{ name: 'demo', path: '/tmp/demo' }],
      ['~/dev'],
      '2026-06-20T12:34:56Z',
    );
    expect(cfg.schema_version).toBe(CONSOLE_CONFIG_SCHEMA_VERSION);
    expect(cfg.repos).toEqual([{ name: 'demo', path: '/tmp/demo' }]);
    expect(cfg.base_dirs).toEqual(['~/dev']);
    expect(cfg.auto_discovered_at).toBe('2026-06-20T12:34:56Z');
    expect(cfg._doc).toBeDefined();
  });
});

// Suppress no-unused warning for statSync — keeps `import` shape symmetric
// with the implementation file even if a future test path needs it.
void statSync;
