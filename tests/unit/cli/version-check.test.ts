import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_CWD = process.cwd();

function resetVersionCheckEnv(): void {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SPECIALISTS_JOB_ID;
  delete process.env.PI_SESSION_ID;
  delete process.env.SPECIALISTS_OFFLINE;
}

function setupTty(): void {
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
}

function setupNonTty(): void {
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
}

async function loadModule() {
  return import('../../../src/cli/version-check.js');
}

describe('version-check CLI', () => {
  let tempDir = '';

  beforeEach(() => {
    resetVersionCheckEnv();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.chdir(ORIGINAL_CWD);
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('resolves package version from bundled and source layouts without throwing', async () => {
    const { readBundledPackageVersion } = await loadModule();

    const bundledRequire = vi.fn((specifier: string) => {
      if (specifier === '../package.json') return { version: '3.13.0' };
      throw new Error(`missing ${specifier}`);
    });
    expect(readBundledPackageVersion(bundledRequire)).toBe('3.13.0');

    const sourceRequire = vi.fn((specifier: string) => {
      if (specifier === '../../package.json') return { version: '3.12.0' };
      throw new Error(`missing ${specifier}`);
    });
    expect(readBundledPackageVersion(sourceRequire)).toBe('3.12.0');

    const missingRequire = vi.fn(() => {
      throw new Error('missing package.json');
    });
    expect(readBundledPackageVersion(missingRequire)).toBe('0.0.0');
  });

  it('skips when not tty', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'version-check-'));
    process.chdir(tempDir);
    setupNonTty();

    const { shouldRunVersionCheck } = await loadModule();
    expect(shouldRunVersionCheck()).toBe(false);
  });

  it('skips when offline or in specialist sandbox', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'version-check-'));
    process.chdir(tempDir);
    setupTty();

    process.env.SPECIALISTS_OFFLINE = '1';
    let mod = await loadModule();
    expect(mod.shouldRunVersionCheck()).toBe(false);

    delete process.env.SPECIALISTS_OFFLINE;
    process.env.SPECIALISTS_JOB_ID = 'job-1';
    mod = await loadModule();
    expect(mod.shouldRunVersionCheck()).toBe(false);

    delete process.env.SPECIALISTS_JOB_ID;
    process.env.PI_SESSION_ID = 'session-1';
    mod = await loadModule();
    expect(mod.shouldRunVersionCheck()).toBe(false);
  });

  it('reads cache when fresh', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'version-check-'));
    process.chdir(tempDir);
    setupTty();

    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      const cache = {
        checked_at_ms: Date.now(),
        latest_tag: 'v3.11.0',
        notified_for_tag: '',
      };
      return {
        ...actual,
        existsSync: (path: string) => path.endsWith('version-check.json'),
        readFileSync: () => JSON.stringify(cache),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
      };
    });
    const spawnSync = vi.fn();
    vi.doMock('node:child_process', () => ({ spawnSync }));

    const { getVersionCheckResult } = await loadModule();
    const result = getVersionCheckResult();

    expect(result?.latestTag).toBe('v3.11.0');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns null on spawn timeout error without throwing', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'version-check-'));
    process.chdir(tempDir);
    setupTty();

    vi.doMock('node:child_process', () => ({
      spawnSync: vi.fn(() => ({ error: new Error('timeout'), status: null })),
    }));
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      return {
        ...actual,
        existsSync: vi.fn(() => false),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
      };
    });

    const { getVersionCheckResult } = await loadModule();
    expect(getVersionCheckResult()).toBeNull();
  });

  it('formats list alert only for newer release', async () => {
    const { formatListVersionAlert } = await loadModule();

    expect(formatListVersionAlert({
      latestTag: 'v3.14.0',
      localVersion: '3.13.0',
      cache: { checked_at_ms: 0, latest_tag: 'v3.14.0', notified_for_tag: '' },
    })).toBe('new version 3.14.0 available, run npm i -g @jaggerxtrm/specialists@3.14.0');

    expect(formatListVersionAlert({
      latestTag: 'v3.13.0',
      localVersion: '3.13.0',
      cache: { checked_at_ms: 0, latest_tag: 'v3.13.0', notified_for_tag: '' },
    })).toBeNull();

    expect(formatListVersionAlert({
      latestTag: 'v3.12.9',
      localVersion: '3.13.0',
      cache: { checked_at_ms: 0, latest_tag: 'v3.12.9', notified_for_tag: '' },
    })).toBeNull();
  });

  // Remote tag is deliberately far above any releasable local version: pinning a real
  // version here rots the moment package.json passes it, which is how this file was
  // quarantined (local 3.21.1 > pinned 3.14.0 → no nudge).
  it('parses remote tags, caches result, and nudges on newer release', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'version-check-'));
    process.chdir(tempDir);
    setupTty();

    const writes: Array<{ path: string; payload: string }> = [];
    const spawnSync = vi.fn(() => ({
      status: 0,
      error: null,
      stdout: [
        'abc\trefs/tags/v3.9.0',
        'def\trefs/tags/v3.10.1',
        'ghi\trefs/tags/v999.0.0',
      ].join('\n'),
    }));

    vi.doMock('node:child_process', () => ({ spawnSync }));
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      return {
        ...actual,
        existsSync: vi.fn((path: string) => path.endsWith('version-check.json')),
        readFileSync: vi.fn(() => '{"checked_at_ms":0,"latest_tag":"v0.0.0","notified_for_tag":""}'),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn((path: string, payload: string) => writes.push({ path, payload })),
      };
    });

    const { formatListVersionAlert, formatVersionCheckNudge, getVersionCheckResult, markVersionCheckNotified } = await loadModule();
    const result = getVersionCheckResult();

    expect(result?.latestTag).toBe('v999.0.0');
    expect(formatVersionCheckNudge(result!)).toBe(`specialists v${result!.localVersion} is local; v999.0.0 published — consider /update-specialists before substantial work.`);
    expect(formatListVersionAlert(result!)).toBe('new version 999.0.0 available, run npm i -g @jaggerxtrm/specialists@999.0.0');
    expect(writes.length).toBeGreaterThan(0);

    markVersionCheckNotified(result!);
    expect(writes.at(-1)?.payload).toContain('"notified_for_tag": "v999.0.0"');
  });
});
