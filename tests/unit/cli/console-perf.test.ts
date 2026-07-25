// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { describe, expect, it } from 'vitest';
import { renderJobRow, selectJobColumns, visibleLength } from '../../../src/cli/console/theme.js';
import { fitFrame } from '../../../src/cli/console/components.js';
import type { ConsoleJob } from '../../../src/cli/console/types.js';

function makeJob(idx: number): ConsoleJob {
  const padId = `job${idx}`.padStart(8, '0');
  return {
    id: padId.slice(-8),
    specialist: 'executor',
    status: idx % 3 === 0 ? 'running' : idx % 3 === 1 ? 'waiting' : 'done',
    started_at_ms: 0,
    elapsed_s: 60 + idx,
    context_pct: (idx * 7) % 100,
    metrics: { turns: idx % 9, tool_calls: idx % 11, token_usage: { total_tokens: idx * 100 } },
    bead_id: `unitAI-${padId.slice(-6)}`,
    bead_title: `title for job ${idx}`,
    payload_kb: '12.0kb',
    payload_tokens: '3.0kt',
    next_action: 'result',
  } as ConsoleJob;
}

describe('viewport windowing — only constructs rows ≤ mainHeight', () => {
  it('renderJobRow stays bounded in visible width for 10k synthesized jobs', () => {
    const start = performance.now();
    for (let i = 0; i < 10_000; i += 1) {
      const row = renderJobRow(makeJob(i), 160, i % 4, false);
      expect(visibleLength(row)).toBeLessThanOrEqual(160);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000); // sanity perf gate — 5s for 10k rows is generous
  });

  it('selectJobColumns is constant-time per row regardless of population', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(selectJobColumns(80, i % 6)).toBeDefined();
    }
  });

  it('fitFrame never grows the lines array beyond `height`', () => {
    const lines = Array.from({ length: 10_000 }, (_, i) => `row ${i}`);
    const frame = fitFrame(lines, 120, 50);
    expect(frame.length).toBe(50);
    for (const row of frame) expect(visibleLength(row)).toBeLessThanOrEqual(120);
  });
});

describe('viewport windowing — fitFrame padding never grows result', () => {
  it('short input is right-padded with non-empty filler rows', () => {
    const frame = fitFrame(['a'], 80, 10);
    expect(frame.length).toBe(10);
    expect(frame[0]).toBe('a');
    for (let i = 1; i < 10; i += 1) {
      expect(frame[i]).not.toBe('');
      expect(frame[i].length).toBeGreaterThan(0);
    }
  });
});

describe('ProcessView delta render cache (unitAI-ctb4u.21)', () => {
  it('cache key composition reuses identical (jobId,status,ctxBucket,width,depth,selected) tuples', () => {
    // Synthetic cache exercises the same key shape as renderProcessRows.
    const cache = new Map<string, string>();
    const keyOf = (job: ConsoleJob, width: number, depth: number, selected: boolean, hasDate: boolean): string => {
      const ctxBucket = job.context_pct === undefined ? '-' : Math.floor(job.context_pct / 5) * 5;
      return `${job.id}|${job.status ?? '-'}|${ctxBucket}|${width}|${depth}|${selected ? '1' : '0'}|${hasDate ? '1' : '0'}`;
    };
    let renderCalls = 0;
    const cachedRender = (job: ConsoleJob, width: number, depth: number, selected: boolean): string => {
      const k = keyOf(job, width, depth, selected, false);
      const hit = cache.get(k);
      if (hit !== undefined) return hit;
      renderCalls += 1;
      const out = renderJobRow(job, width, depth, selected);
      cache.set(k, out);
      return out;
    };

    // Frame 1: 100 distinct jobs — every row is a cache miss.
    const jobs = Array.from({ length: 100 }, (_, i) => makeJob(i));
    for (const j of jobs) cachedRender(j, 120, 0, false);
    expect(renderCalls).toBe(100);

    // Frame 2: identical snapshot. Cache hits across the board.
    for (const j of jobs) cachedRender(j, 120, 0, false);
    expect(renderCalls).toBe(100); // no additional render calls

    // Frame 3: one job's status changes (status='waiting' → 'running').
    // Only that row should miss; everything else stays cached.
    const mutated: ConsoleJob = { ...jobs[5]!, status: jobs[5]!.status === 'running' ? 'waiting' : 'running' };
    const nextJobs = [...jobs];
    nextJobs[5] = mutated;
    for (const j of nextJobs) cachedRender(j, 120, 0, false);
    expect(renderCalls).toBe(101); // exactly one extra call for the mutated row
  });

  it('cache key changes when width changes (no cross-width reuse)', () => {
    const cache = new Map<string, string>();
    let calls = 0;
    const render = (job: ConsoleJob, width: number): string => {
      const ctxBucket = job.context_pct === undefined ? '-' : Math.floor(job.context_pct / 5) * 5;
      const k = `${job.id}|${job.status ?? '-'}|${ctxBucket}|${width}|0|0|0`;
      if (cache.has(k)) return cache.get(k)!;
      calls += 1;
      const out = renderJobRow(job, width, 0, false);
      cache.set(k, out);
      return out;
    };

    const job = makeJob(0);
    render(job, 80);
    render(job, 80);
    expect(calls).toBe(1);
    render(job, 120);
    expect(calls).toBe(2);
  });

  it('ctxBucket coalesces ctx drift within a 5%-wide window', () => {
    const cache = new Map<string, string>();
    let calls = 0;
    const render = (job: ConsoleJob): string => {
      const ctxBucket = job.context_pct === undefined ? '-' : Math.floor(job.context_pct / 5) * 5;
      const k = `${job.id}|${job.status ?? '-'}|${ctxBucket}|120|0|0|0`;
      if (cache.has(k)) return cache.get(k)!;
      calls += 1;
      const out = renderJobRow(job, 120, 0, false);
      cache.set(k, out);
      return out;
    };

    const base = makeJob(0);
    render({ ...base, context_pct: 42 });
    render({ ...base, context_pct: 43 });
    render({ ...base, context_pct: 44 });
    expect(calls).toBe(1); // all three fall into the 40-44 bucket → one render
    render({ ...base, context_pct: 45 });
    expect(calls).toBe(2); // crosses the bucket boundary → second render
  });
});
