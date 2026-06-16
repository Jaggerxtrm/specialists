import { describe, expect, it } from 'vitest';
import { initialConsoleState, reduceConsoleState } from '../../../src/cli/console/view-model.js';
import { forensicEventToFeedRow, FORENSIC_LAYOUT } from '../../../src/cli/console/forensic.js';
import { renderKeyBar } from '../../../src/cli/console/theme.js';
import {
  FORENSIC_SCHEMA_VERSION,
  type ForensicEvent,
} from '../../../src/specialist/forensic-events.js';

const SGR_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(SGR_RE, '');

function makeForensicEvent(overrides: Partial<ForensicEvent> = {}): ForensicEvent {
  return {
    schema_version: FORENSIC_SCHEMA_VERSION,
    timestamp: '2026-06-17T00:00:00Z',
    t_unix_ms: 1_700_000_000_000,
    seq: 7,
    severity: 'info',
    event_family: 'turn',
    event_name: 'started',
    event_version: 1,
    resource: {
      service_namespace: 'xtrm',
      service_name: 'specialists',
      service_component: 'runtime',
      deployment_environment: 'local',
      repo: 'specialists',
      participant_kind: 'specialist',
      participant_role: 'executor',
    },
    correlation: {
      participant_id: 'specialist:executor#xyz',
      job_id: 'ab12cd34',
      bead_id: 'unitAI-ctb4u',
    },
    body: { state: 'running', tool_name: 'edit' },
    redaction: { status: 'clean' },
    ...overrides,
  } as ForensicEvent;
}

describe('FeedSource default + toggle (D4 RESOLVED: forensic default)', () => {
  it('initial state has feedSource=forensic', () => {
    const state = initialConsoleState();
    expect(state.feedSource).toBe('forensic');
  });

  it('toggleFeedSource flips forensic→sp_feed and clears buffer + scroll', () => {
    let state = initialConsoleState();
    // Seed the buffer with prior rows so we can prove they are cleared.
    state = reduceConsoleState(state, {
      type: 'feedLoaded',
      rows: [{ jobId: 'a', specialist: 'x', t: 1, type: 'x', line: 'x' }],
      totalRows: 1,
      viewportRows: 10,
    });
    state = { ...state, scroll: 5 };
    state = reduceConsoleState(state, { type: 'toggleFeedSource' });
    expect(state.feedSource).toBe('sp_feed');
    expect(state.feedRows).toEqual([]);
    expect(state.scroll).toBe(0);
  });

  it('toggling twice returns to forensic', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'toggleFeedSource' });
    expect(state.feedSource).toBe('sp_feed');
    state = reduceConsoleState(state, { type: 'toggleFeedSource' });
    expect(state.feedSource).toBe('forensic');
  });
});

describe('forensicEventToFeedRow — spec §7.2 layout', () => {
  it('emits seq(4R) type(18L) actor(24L) payload(free)', () => {
    const ev = makeForensicEvent();
    const row = forensicEventToFeedRow(ev, { jobId: 'ab12cd34', specialist: 'executor' }, 0);
    const visible = strip(row.line);
    // seq right-padded to 4
    expect(visible.slice(0, FORENSIC_LAYOUT.SEQ_W)).toBe('   7');
    // type begins after seq + space
    const typeStart = FORENSIC_LAYOUT.SEQ_W + 1;
    expect(visible.slice(typeStart, typeStart + FORENSIC_LAYOUT.TYPE_W).trimEnd()).toBe('turn.started');
    // actor column has participant role + : + 8-char job slice
    const actorStart = typeStart + FORENSIC_LAYOUT.TYPE_W + 1;
    const actor = visible.slice(actorStart, actorStart + FORENSIC_LAYOUT.ACTOR_W);
    expect(actor).toContain('executor:ab12cd34');
  });

  it('payload column never contains forbidden labels', () => {
    const ev = makeForensicEvent({
      body: {
        raw_command: 'rm -rf /',
        prompt: 'leak this',
        model_output: 'leak that',
        tool_name: 'edit',
        state: 'running',
      },
    });
    const row = forensicEventToFeedRow(ev, { jobId: 'ab12cd34', specialist: 'executor' }, 0);
    const visible = strip(row.line);
    expect(visible).not.toContain('rm -rf');
    expect(visible).not.toContain('leak this');
    expect(visible).not.toContain('leak that');
    expect(visible).toContain('tool_name=edit');
    expect(visible).toContain('state=running');
  });

  it('truncates over-long type to 18 with ellipsis', () => {
    const ev = makeForensicEvent({ event_family: 'aaaaaaaaaa', event_name: 'bbbbbbbbbbbbbb' });
    const row = forensicEventToFeedRow(ev, { jobId: 'ab12cd34', specialist: 'executor' }, 0);
    const visible = strip(row.line);
    const typeStart = FORENSIC_LAYOUT.SEQ_W + 1;
    const typeCol = visible.slice(typeStart, typeStart + FORENSIC_LAYOUT.TYPE_W);
    expect(typeCol.length).toBe(FORENSIC_LAYOUT.TYPE_W);
    expect(typeCol).toContain('…');
  });

  it('falls back to severity/redaction when body yields no allowed labels', () => {
    const ev = makeForensicEvent({ body: { prompt: 'redacted', raw_command: 'redacted' } });
    const row = forensicEventToFeedRow(ev, { jobId: 'ab12cd34', specialist: 'executor' }, 0);
    const visible = strip(row.line);
    expect(visible).toContain('severity=info');
    expect(visible).toContain('redaction=clean');
  });

  it('uses displaySeq fallback when forensic.seq missing', () => {
    const ev = makeForensicEvent({ seq: undefined });
    const row = forensicEventToFeedRow(ev, { jobId: 'ab12cd34', specialist: 'executor' }, 42);
    expect(strip(row.line).slice(0, FORENSIC_LAYOUT.SEQ_W)).toBe('  42');
  });
});

describe('KeyBar advertises t legacy in forensic mode (D4 RESOLVED)', () => {
  it('feed view + forensic → "t legacy"', () => {
    const bar = strip(renderKeyBar('feed', false, 200, 'forensic'));
    expect(bar).toContain('t legacy');
    expect(bar).not.toContain('t forensic');
  });

  it('feed view + sp_feed → "t forensic"', () => {
    const bar = strip(renderKeyBar('feed', false, 200, 'sp_feed'));
    expect(bar).toContain('t forensic');
    expect(bar).not.toContain('t legacy');
  });

  it('ps view never advertises t', () => {
    const bar = strip(renderKeyBar('ps', false, 200));
    expect(bar).not.toContain('t legacy');
    expect(bar).not.toContain('t forensic');
  });
});
