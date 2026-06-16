import { describe, expect, it } from 'vitest';
import { visibleWidth } from '@earendil-works/pi-tui';
import { fitFrame } from '../../../src/cli/console/components.js';
import { buildChronologicalRows, dedupeHumanEvents, formatDateTime } from '../../../src/cli/console/runtime.js';
import { paint, renderJobRow, renderRail, renderStatsLine, visibleLength } from '../../../src/cli/console/theme.js';
import type { ConsoleJob, ProcessSnapshot } from '../../../src/cli/console/types.js';
import type { TimelineEvent } from '../../../src/specialist/timeline-events.js';
import type { ProcessHealthReport } from '../../../src/specialist/process-health.js';

const base = { t: 1, seq: 1 };
const SGR_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(SGR_RE, '');

function makeJob(overrides: Partial<ConsoleJob> = {}): ConsoleJob {
  return {
    id: 'abc12345',
    specialist: 'executor',
    status: 'running',
    started_at_ms: 0,
    elapsed_s: 252,
    context_pct: 41,
    metrics: { turns: 3, tool_calls: 8, token_usage: { total_tokens: 42000 } },
    bead_id: 'unitAI-9b2dn',
    bead_title: 'add npm pack smoke',
    payload_kb: '44.2kb',
    payload_tokens: '12.1kt',
    next_action: 'result',
    ...overrides,
  } as ConsoleJob;
}

function makeSnapshot(): ProcessSnapshot {
  const health: ProcessHealthReport = {
    status: 'OK',
    totalRssBytes: 256 * 1024 * 1024,
    totalCpuPct: 3.5,
    orphanCount: 0,
  } as ProcessHealthReport;
  return {
    generatedAtMs: 0,
    repo: { id: 'r', name: 'specialists', path: '/x' },
    filter: { historyMode: 'default', includeCleaned: false, textFilter: '' },
    rows: [],
    jobs: [],
    totalJobs: 12,
    visibleJobs: 5,
    runningJobs: 2,
    waitingJobs: 1,
    epics: 1,
    nodes: 0,
    worktrees: 2,
    maxContextPct: 41,
    totalTokens: 84000,
    health,
  };
}

describe('console regressions', () => {
  it('pads frames with non-empty fillers so no view emits `^$` lines', () => {
    const frame = fitFrame(['a', 'b'], 10, 4);
    expect(frame).toHaveLength(4);
    expect(frame[0]).toBe('a');
    expect(frame[1]).toBe('b');
    // Empty-line invariant: padding rows must NOT match /^$/.
    expect(frame[2]).not.toBe('');
    expect(frame[3]).not.toBe('');
    for (const line of frame) {
      expect(line).not.toMatch(/^$/);
    }
  });

  it('truncates over-long rows to terminal width', () => {
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
      { ...base, seq: 4, type: 'token_usage', source: 'turn_end', token_usage: { total_tokens: 10 } } as TimelineEvent,
      { ...base, seq: 5, type: 'text', text: 'd' } as TimelineEvent,
    ];

    expect(dedupeHumanEvents('job1', events).map((event) => event.seq)).toEqual([1, 4, 5]);
  });
});

describe('console golden snapshots — job row + rail alignment', () => {
  it('rail aligns column-by-column across depths 0..3 at 160 cols', () => {
    const job = makeJob();
    const rows = [0, 1, 2, 3].map((depth) => strip(renderJobRow(job, 160, depth, false)));
    // After the marker " " (1) and space (1), the rail occupies depth*2 chars,
    // then statusIcon (1), space (1), then column data begins at a predictable offset.
    for (const [depth, row] of rows.entries()) {
      // Row starts with " " (marker) " " (space) then depth*"│ "
      const railPrefix = '  ' + '│ '.repeat(depth);
      expect(row.startsWith(railPrefix)).toBe(true);
    }
  });

  it('80-col job row drops title+next+bead per priority order', () => {
    const job = makeJob();
    const row = strip(renderJobRow(job, 80, 0, false));
    // Bead "unitAI-9b2dn" must not appear at 80 cols
    expect(row).not.toContain('unitAI-9b2dn');
    // But specialist "executor" and status "running" must appear
    expect(row).toContain('executor');
    expect(row).toContain('running');
  });

  it('120-col job row keeps bead but may drop title+next', () => {
    const job = makeJob();
    const row = strip(renderJobRow(job, 120, 0, false));
    expect(row).toContain('unitAI-9b2dn');
  });

  it('160-col job row keeps title', () => {
    const job = makeJob();
    const row = strip(renderJobRow(job, 160, 0, false));
    expect(row).toContain('add npm pack smoke');
  });

  it('StatsLine fits at 80/120/160 single line', () => {
    const snap = makeSnapshot();
    for (const w of [80, 120, 160]) {
      const line = renderStatsLine(snap, w);
      expect(line.includes('\n')).toBe(false);
      expect(visibleLength(line)).toBeLessThanOrEqual(w);
    }
  });

  it('renderRail does not emit connectors at any depth', () => {
    for (const d of [0, 1, 2, 3, 5]) {
      const r = strip(renderRail(d));
      expect(r).not.toMatch(/[├└┌┐]/);
      // depth*2 visible chars
      expect(r.length).toBe(d * 2);
    }
  });

  it('paint() and visibleLength() agree on visible width', () => {
    const text = paint('hello world', 'dim');
    expect(visibleLength(text)).toBe('hello world'.length);
  });
});
