import { describe, expect, it } from 'vitest';
import {
  forensicEventToRow,
  formatRenderedRowColumns,
  SPEC_72_LAYOUT,
} from '../../../src/specialist/forensic-renderer.js';
import {
  FORENSIC_SCHEMA_VERSION,
  type ForensicEvent,
  type ForensicSeverity,
} from '../../../src/specialist/forensic-events.js';

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
      chain_id: 'chain:abc',
      chain_root_job_id: 'root123',
    },
    body: { state: 'running', tool_name: 'edit' },
    redaction: { status: 'clean' },
    ...overrides,
  } as ForensicEvent;
}

describe('forensicEventToRow — pure data extraction', () => {
  it('extracts ts/seq/type/actor/severity/payload/jobId/beadId/correlation', () => {
    const row = forensicEventToRow(makeForensicEvent());
    expect(row.ts).toBe(1_700_000_000_000);
    expect(row.seq).toBe(7);
    expect(row.type).toBe('turn.started');
    expect(row.actor).toBe('executor:ab12cd34');
    expect(row.severity).toBe('info');
    expect(row.payload).toContain('state=running');
    expect(row.payload).toContain('tool_name=edit');
    expect(row.jobId).toBe('ab12cd34');
    expect(row.beadId).toBe('unitAI-ctb4u');
    expect(row.correlation?.chain_id).toBe('chain:abc');
    expect(row.correlation?.chain_root_job_id).toBe('root123');
  });

  it('warns on unknown schema version', () => {
    const row = forensicEventToRow(makeForensicEvent({ schema_version: 'xtrm.forensic.v2' as any }));
    expect(row.schemaWarning).toContain('xtrm.forensic.v2');
  });

  it('no schemaWarning for current version', () => {
    const row = forensicEventToRow(makeForensicEvent());
    expect(row.schemaWarning).toBeUndefined();
  });

  it('redacts forbidden Prometheus labels from body — they cannot reach payload', () => {
    const row = forensicEventToRow(makeForensicEvent({
      body: {
        raw_command: 'rm -rf /',
        prompt: 'leak this',
        model_output: 'leak that',
        token: 'sk-supersecret',
        credential: 'should-not-appear',
        tool_name: 'edit',
        state: 'running',
      },
    }));
    expect(row.payload).not.toContain('rm -rf');
    expect(row.payload).not.toContain('leak this');
    expect(row.payload).not.toContain('leak that');
    expect(row.payload).not.toContain('sk-supersecret');
    expect(row.payload).not.toContain('should-not-appear');
    expect(row.payload).toContain('tool_name=edit');
    expect(row.payload).toContain('state=running');
  });

  it('falls back to severity+redaction when no allowed labels remain', () => {
    const row = forensicEventToRow(makeForensicEvent({
      body: { prompt: 'all redacted', raw_command: 'also redacted' },
    }));
    expect(row.payload).toBe('severity=info redaction=clean');
  });

  it('handles every ForensicSeverity', () => {
    const severities: ForensicSeverity[] = ['debug', 'info', 'warn', 'error', 'critical'];
    for (const s of severities) {
      const row = forensicEventToRow(makeForensicEvent({ severity: s }));
      expect(row.severity).toBe(s);
    }
  });

  it('truncates over-long values per maxFieldValueChars', () => {
    const row = forensicEventToRow(
      makeForensicEvent({ body: { tool_name: 'a'.repeat(50), state: 'b'.repeat(50) } }),
      { maxFieldValueChars: 16 },
    );
    expect(row.payload.length).toBeLessThan(120);
    expect(row.payload).toContain('…');
  });

  it('caps payload field count via maxPayloadFields', () => {
    const row = forensicEventToRow(
      makeForensicEvent({
        body: {
          tool_name: 'a',
          state: 'b',
          status: 'c',
          result: 'd',
          mcp_method: 'e',
          mcp_server: 'f',
          error_type: 'g',
        },
      }),
      { maxPayloadFields: 3 },
    );
    expect(row.payload.split(' ').length).toBe(3);
  });

  it('actor falls back when correlation.job_id missing', () => {
    const row = forensicEventToRow(makeForensicEvent({
      correlation: { job_id: undefined as any, participant_id: 'x' } as any,
    }));
    expect(row.actor).toBe('executor:-');
  });
});

describe('formatRenderedRowColumns — spec §7.2 column widths', () => {
  it('seq right-padded to 4', () => {
    const row = forensicEventToRow(makeForensicEvent({ seq: 7 }));
    const cols = formatRenderedRowColumns(row);
    expect(cols.seq).toBe('   7');
  });

  it('type padded to 18 with ellipsis when too long', () => {
    const row = forensicEventToRow(
      makeForensicEvent({ event_family: 'xxxxxxxxxx', event_name: 'yyyyyyyyyyyyy' }),
    );
    const cols = formatRenderedRowColumns(row);
    expect(cols.type.length).toBe(SPEC_72_LAYOUT.typeW);
    expect(cols.type).toContain('…');
  });

  it('actor padded to 24 with ellipsis when too long', () => {
    const row = forensicEventToRow(makeForensicEvent({
      resource: { ...makeForensicEvent().resource, participant_role: 'a'.repeat(30) } as any,
    }));
    const cols = formatRenderedRowColumns(row);
    expect(cols.actor.length).toBe(SPEC_72_LAYOUT.actorW);
    expect(cols.actor).toContain('…');
  });

  it('payload pass-through (no padding/truncation at column level)', () => {
    const row = forensicEventToRow(makeForensicEvent({ body: { tool_name: 'edit' } }));
    const cols = formatRenderedRowColumns(row);
    expect(cols.payload).toContain('tool_name=edit');
  });
});

describe('event family table coverage — every known family produces a row', () => {
  const families = [
    ['lifecycle', 'job_started'],
    ['turn', 'started'],
    ['turn', 'ended'],
    ['mcp', 'tool_invocation'],
    ['token_usage', 'observed'],
    ['error', 'raised'],
    ['custom', 'unknown_event'],
  ] as const;

  for (const [family, name] of families) {
    it(`renders ${family}.${name}`, () => {
      const row = forensicEventToRow(makeForensicEvent({ event_family: family, event_name: name }));
      expect(row.type).toBe(`${family}.${name}`);
      expect(row.payload.length).toBeGreaterThan(0);
    });
  }
});
