import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadBenchmarkSnapshot, PRIMARY_BENCHMARK_URL, SECONDARY_BENCHMARK_URL } from '../../../src/specialist/benchmarks.js';

const NOW = new Date('2026-06-16T00:00:00.000Z');

async function tempCache(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'specialists-benchmarks-'));
}

function writeCache(cacheDir: string, source: 'artificialanalysis' | 'lmarena', fetchedAt: string): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, `${source}.json`), JSON.stringify({
    source,
    source_url: source === 'artificialanalysis' ? PRIMARY_BENCHMARK_URL : SECONDARY_BENCHMARK_URL,
    fetched_at: fetchedAt,
    models: [{ id: `${source}/cached`, provider: source, quality_score: 70, cost_input: 1, cost_output: 2, context_window: 128000, tools_supported: true }],
  }));
}

function okFetch(payload: unknown): typeof fetch {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => payload })) as unknown as typeof fetch;
}

describe('loadBenchmarkSnapshot', () => {
  it('returns fresh cache without fetching', async () => {
    const cacheDir = await tempCache();
    writeCache(cacheDir, 'artificialanalysis', NOW.toISOString());
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const snapshot = await loadBenchmarkSnapshot({ cacheDir, now: NOW, fetchImpl });

    expect(snapshot?.source).toBe('artificialanalysis');
    expect(snapshot?.source_url).toBe(PRIMARY_BENCHMARK_URL);
    expect(snapshot?.models.get('artificialanalysis/cached')?.tools_supported).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches and caches when cache is missing', async () => {
    const cacheDir = await tempCache();
    const fetchImpl = okFetch({ models: [{ id: 'openai/gpt-x', provider: 'openai', score: 88, input_cost: 2, output_cost: 8 }] });

    const snapshot = await loadBenchmarkSnapshot({ cacheDir, now: NOW, fetchImpl });

    expect(snapshot?.models.get('openai/gpt-x')?.quality_score).toBe(88);
    expect(fetchImpl).toHaveBeenCalledWith(PRIMARY_BENCHMARK_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('refreshes stale cache when online', async () => {
    const cacheDir = await tempCache();
    writeCache(cacheDir, 'artificialanalysis', '2026-06-14T23:00:00.000Z');
    const fetchImpl = okFetch([{ id: 'fresh/model', provider: 'fresh', elo: 1200 }]);

    const snapshot = await loadBenchmarkSnapshot({ cacheDir, now: NOW, fetchImpl });

    expect(snapshot?.models.has('fresh/model')).toBe(true);
  });

  it('offline mode forbids refresh and returns stale valid cache', async () => {
    const cacheDir = await tempCache();
    writeCache(cacheDir, 'artificialanalysis', '2026-06-14T23:00:00.000Z');
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const warnings: string[] = [];

    const snapshot = await loadBenchmarkSnapshot({ cacheDir, now: NOW, offline: true, fetchImpl, warn: (warning) => warnings.push(warning.message) });

    expect(snapshot?.models.has('artificialanalysis/cached')).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warnings.some((message) => message.includes('offline mode forbids refresh'))).toBe(true);
  });

  it('rejects snapshots older than max age', async () => {
    const cacheDir = await tempCache();
    writeCache(cacheDir, 'artificialanalysis', '2026-05-01T00:00:00.000Z');
    const warnings: string[] = [];

    const snapshot = await loadBenchmarkSnapshot({ cacheDir, now: NOW, offline: true, warn: (warning) => warnings.push(warning.message) });

    expect(snapshot).toBeNull();
    expect(warnings.some((message) => message.includes('older than 14 days'))).toBe(true);
  });

  it('returns null with non-fatal warnings when both sources fail and no cache exists', async () => {
    const cacheDir = await tempCache();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const warnings: string[] = [];

    const snapshot = await loadBenchmarkSnapshot({ cacheDir, now: NOW, fetchImpl, warn: (warning) => warnings.push(warning.message) });

    expect(snapshot).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(warnings).toHaveLength(2);
  });
});
