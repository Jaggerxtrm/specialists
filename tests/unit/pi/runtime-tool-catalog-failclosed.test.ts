import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { canonicalDirMock, spawnMock } = vi.hoisted(() => ({
  canonicalDirMock: vi.fn<() => string | null>(() => null),
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  execFileSync: vi.fn(),
}));

vi.mock('../../../src/specialist/canonical-asset-resolver.js', () => ({
  resolveCanonicalAssetDir: canonicalDirMock,
}));

import {
  PiAgentSession,
  RUNTIME_TOOL_CATALOG_ERROR_MESSAGE,
  RuntimeToolCatalogResolutionError,
  resolveRuntimeToolContract,
} from '../../../src/pi/session.js';

const roots: string[] = [];

function makeRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function writeCatalog(root: string, value: unknown): void {
  const dir = join(root, '.specialists', 'catalog');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.json'), JSON.stringify(value));
}

const minimalCatalog = {
  precedence_order: ['native'],
  catalogs: [{
    catalog: 'native',
    package: 'specialists',
    version: 'test',
    precedence: 0,
    source_tiers: {
      READ_ONLY: ['read'],
      LOW: ['read'],
      MEDIUM: ['read'],
      HIGH: ['read'],
    },
  }],
};

describe('runtime tool catalog fail-closed boundary', () => {
  beforeEach(() => {
    canonicalDirMock.mockReset();
    canonicalDirMock.mockReturnValue(null);
    spawnMock.mockReset();
  });

  afterEach(() => {
    while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  it('rejects a requested tier when no project or canonical catalog exists', () => {
    const cwd = makeRoot('catalog-missing-');

    expect(() => resolveRuntimeToolContract({ level: 'READ_ONLY', cwd })).toThrow(RuntimeToolCatalogResolutionError);
    expect(() => resolveRuntimeToolContract({ level: 'READ_ONLY', cwd })).toThrow(RUNTIME_TOOL_CATALOG_ERROR_MESSAGE);
    expect(RUNTIME_TOOL_CATALOG_ERROR_MESSAGE).not.toContain(cwd);
    expect(RUNTIME_TOOL_CATALOG_ERROR_MESSAGE).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/u);
    expect(Buffer.byteLength(RUNTIME_TOOL_CATALOG_ERROR_MESSAGE, 'utf8')).toBeLessThanOrEqual(512);
  });

  it('does not fall back when a discovered project catalog is malformed', () => {
    const cwd = makeRoot('catalog-malformed-project-');
    const canonical = makeRoot('catalog-valid-canonical-');
    writeCatalog(cwd, { malformed: true });
    mkdirSync(join(canonical, 'catalog'), { recursive: true });
    writeFileSync(join(canonical, 'catalog', 'index.json'), JSON.stringify(minimalCatalog));
    canonicalDirMock.mockReturnValue(join(canonical, 'catalog'));

    expect(() => resolveRuntimeToolContract({ level: 'READ_ONLY', cwd })).toThrow(RuntimeToolCatalogResolutionError);
    expect(canonicalDirMock).not.toHaveBeenCalled();
  });

  it('rejects an unreadable canonical catalog without exposing its path', () => {
    const cwd = makeRoot('catalog-unreadable-consumer-');
    const canonical = makeRoot('catalog-unreadable-canonical-');
    mkdirSync(join(canonical, 'index.json'));
    canonicalDirMock.mockReturnValue(canonical);

    let failure: unknown;
    try {
      resolveRuntimeToolContract({ level: 'LOW', cwd });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(RuntimeToolCatalogResolutionError);
    expect((failure as Error).message).toBe(RUNTIME_TOOL_CATALOG_ERROR_MESSAGE);
    expect((failure as Error).message).not.toContain(canonical);
  });

  it('rejects invalid requested tiers and catalogs that resolve no tools', () => {
    const invalidTierRoot = makeRoot('catalog-invalid-tier-');
    writeCatalog(invalidTierRoot, minimalCatalog);
    expect(() => resolveRuntimeToolContract({ level: 'ROOT', cwd: invalidTierRoot })).toThrow(RuntimeToolCatalogResolutionError);

    const emptyRoot = makeRoot('catalog-empty-');
    writeCatalog(emptyRoot, { precedence_order: [], catalogs: [] });
    expect(() => resolveRuntimeToolContract({ level: 'READ_ONLY', cwd: emptyRoot })).toThrow(RuntimeToolCatalogResolutionError);
  });

  it('preserves no-tier behavior and exact valid-catalog tool selection', () => {
    const missingRoot = makeRoot('catalog-no-tier-');
    expect(resolveRuntimeToolContract({ cwd: missingRoot })).toBeUndefined();

    const validRoot = makeRoot('catalog-valid-project-');
    writeCatalog(validRoot, minimalCatalog);
    const contract = resolveRuntimeToolContract({ level: 'READ_ONLY', cwd: validRoot });
    expect(contract?.toolsFlag).toBe('read');
    expect(contract?.toolsList).toEqual(['read']);
  });

  it('aborts PiAgentSession.start before spawn when a requested catalog cannot resolve', async () => {
    const cwd = makeRoot('catalog-no-spawn-');
    const session = await PiAgentSession.create({ model: 'gemini', permissionLevel: 'READ_ONLY', cwd });

    await expect(session.start()).rejects.toBeInstanceOf(RuntimeToolCatalogResolutionError);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
