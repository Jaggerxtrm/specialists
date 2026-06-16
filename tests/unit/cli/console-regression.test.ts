import { describe, expect, it } from 'vitest';
import { visibleWidth } from '@earendil-works/pi-tui';
import { fitFrame } from '../../../src/cli/console/components.js';
import { buildChronologicalRows, dedupeHumanEvents, formatDateTime } from '../../../src/cli/console/runtime.js';
import type { TimelineEvent } from '../../../src/specialist/timeline-events.js';

const base = { t: 1, seq: 1 };

describe('console regressions', () => {
  it('pads and truncates frames to terminal height so the viewport is stable', () => {
    expect(fitFrame(['a', 'b'], 10, 4)).toEqual(['a', 'b', '', '']);
    const truncated = fitFrame(['abcdef', 'b', 'c'], 3, 2);
    expect(truncated).toHaveLength(2);
    expect(visibleWidth(truncated[0] ?? '')).toBeLessThanOrEqual(3);
  });

  it('sorts history rows newest-first and keeps them flat/chronological', () => {
    const rows = buildChronologicalRows([
      { id: 'old', specialist: 'executor', status: 'done', started_at_ms: 1000 },
      { id: 'new', specialist: 'reviewer', status: 'done', started_at_ms: 3000 },
      { id: 'mid', specialist: 'explorer', status: 'done', started_at_ms: 2000 },
    ]);

    expect(rows.map((row) => row.id)).toEqual(['new', 'mid', 'old']);
    expect(rows.every((row) => row.kind === 'job')).toBe(true);
  });

  it('formats dates for history/detail views', () => {
    expect(formatDateTime(Date.UTC(2026, 5, 1, 11, 2, 3))).toMatch(/^2026-06-01 \d{2}:\d{2}:\d{2}$/);
  });

  it('suppresses repeated human text events like sp feed snapshot mode', () => {
    const events: TimelineEvent[] = [
      { ...base, seq: 1, type: 'text', text: 'a' } as TimelineEvent,
      { ...base, seq: 2, type: 'text', text: 'b' } as TimelineEvent,
      { ...base, seq: 3, type: 'text', text: 'c' } as TimelineEvent,
      { ...base, seq: 4, type: 'token_usage', source: 'usage', token_usage: { total_tokens: 10 } } as TimelineEvent,
      { ...base, seq: 5, type: 'text', text: 'd' } as TimelineEvent,
    ];

    expect(dedupeHumanEvents('job1', events).map((event) => event.seq)).toEqual([1, 4, 5]);
  });
});
