import { describe, expect, it } from 'vitest';
import { collectVersionInfo } from '../../../src/cli/version.js';

describe('sp version --json build identity', () => {
  const info = collectVersionInfo();

  it('exposes the Core-mirrored build-identity shape', () => {
    expect(Object.keys(info).sort()).toEqual(
      ['built_at', 'commit', 'dirty', 'package', 'runtime', 'source', 'version'].sort(),
    );
  });

  it('reports the specialists package and a semver version', () => {
    expect(info.package).toBe('@jaggerxtrm/specialists');
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('classifies install source as npm or local', () => {
    expect(['npm', 'local']).toContain(info.source);
  });

  it('reports nullable git provenance with correct types', () => {
    expect(info.commit === null || typeof info.commit === 'string').toBe(true);
    expect(info.dirty === null || typeof info.dirty === 'boolean').toBe(true);
    expect(info.built_at === null || typeof info.built_at === 'string').toBe(true);
  });

  it('is Bun-flavored: runtime.bun is the bun version or null', () => {
    expect(info.runtime).toHaveProperty('bun');
    expect(info.runtime.bun === null || typeof info.runtime.bun === 'string').toBe(true);
  });
});
