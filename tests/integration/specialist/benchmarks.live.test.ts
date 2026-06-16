import { describe, expect, it } from 'vitest';
import { loadBenchmarkSnapshot } from '../../../src/specialist/benchmarks.js';
import { runAgenticFollowthroughProbe } from '../../../src/specialist/model-probes.js';

const liveDescribe = process.env.SPECIALISTS_LIVE_SMOKE === '1' ? describe : describe.skip;

liveDescribe('benchmark live smoke', () => {
  it('fetches a real benchmark snapshot', async () => {
    const snapshot = await loadBenchmarkSnapshot({ cacheDir: '/tmp/specialists-live-benchmarks' });

    expect(snapshot?.source_url).toMatch(/^https:\/\//);
    expect(snapshot?.fetched_at).toBeTruthy();
    expect(snapshot?.models.size).toBeGreaterThan(0);
  }, 20_000);

  it('runs one real agentic followthrough probe', async () => {
    const result = await runAgenticFollowthroughProbe(process.env.SPECIALISTS_LIVE_MODEL ?? 'stub', process.env.SPECIALISTS_LIVE_SPEC ?? 'executor', {
      cacheDir: '/tmp/specialists-live-probes',
      timeoutMs: 300_000,
    });

    expect(['PASS', 'PARTIAL', 'FAIL']).toContain(result.verdict);
    expect(result.transcript_path).toContain('/tmp/specialists-live-probes');
  }, 310_000);
});
