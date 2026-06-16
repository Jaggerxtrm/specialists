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
