import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';


describe('memory-retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('parseMemoriesPayload supports object shape', async () => {
    const mod = await import('../../../src/specialist/memory-retrieval.js');
    const parsed = mod.parseMemoriesPayload('{"k1":"v1","k2":"v2"}');
    expect(parsed).toEqual([
      { key: 'k1', value: 'v1' },
      { key: 'k2', value: 'v2' },
    ]);
  });

  it('parseMemoriesPayload supports array shape', async () => {
    const mod = await import('../../../src/specialist/memory-retrieval.js');
    const parsed = mod.parseMemoriesPayload('[{"key":"k1","value":"v1"},{"key":"k2","value":"v2"}]');
    expect(parsed).toEqual([
      { key: 'k1', value: 'v1' },
      { key: 'k2', value: 'v2' },
    ]);
  });

  it('shouldRefreshCache true on count mismatch and stale age', async () => {
    const mod = await import('../../../src/specialist/memory-retrieval.js');
    const nowMs = 1_000_000;

    expect(mod.shouldRefreshCache({
      nowMs,
      cacheCount: 10,
      cacheLastSyncAtMs: nowMs,
      sourceCount: 9,
    })).toBe(true);

    expect(mod.shouldRefreshCache({
      nowMs,
      cacheCount: 10,
      cacheLastSyncAtMs: nowMs - (2 * 60 * 60 * 1000),
      sourceCount: 10,
    })).toBe(true);
  });

  it('shouldRefreshCache false when cache fresh and counts match', async () => {
    const mod = await import('../../../src/specialist/memory-retrieval.js');
    const nowMs = 1_000_000;

    expect(mod.shouldRefreshCache({
      nowMs,
      cacheCount: 10,
      cacheLastSyncAtMs: nowMs - 1_000,
      sourceCount: 10,
    })).toBe(false);
  });
});
