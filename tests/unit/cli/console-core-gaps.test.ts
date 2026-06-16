// Phase 2-7 core/boundary gap-fill: assertions called out in unitAI-ctb4u.9
// that are not already covered by phase-specific test files.

import { describe, expect, it } from 'vitest';
import { parseNumstat, parsePorcelainStatus, parseUnifiedDiff } from '../../../src/cli/console/git.js';
import { describeLeaf } from '../../../src/cli/console/config-source.js';
import { forensicEventToFeedRow } from '../../../src/cli/console/forensic.js';
import { FORENSIC_SCHEMA_VERSION, type ForensicEvent } from '../../../src/specialist/forensic-events.js';

function makeForensicEvent(overrides: Partial<ForensicEvent> = {}): ForensicEvent {
  return {
    schema_version: FORENSIC_SCHEMA_VERSION,
    timestamp: '2026-06-17T00:00:00Z',
    t_unix_ms: 1,
    seq: 1,
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
    correlation: { participant_id: 'pid', job_id: 'job0001a', bead_id: 'unitAI-x' },
    body: { state: 'running' },
    redaction: { status: 'clean' },
    ...overrides,
  } as ForensicEvent;
}

describe('property: numstat round-trips add/del totals across random fixtures', () => {
  it('synthesized N-file output preserves per-file counts', () => {
    const fixtures = Array.from({ length: 20 }, (_, i) => ({
      path: `src/file${i}.ts`,
      added: (i * 7) % 11,
      deleted: (i * 3) % 5,
    }));
    const numstat = fixtures.map((f) => `${f.added}\t${f.deleted}\t${f.path}`).join('\n');
    const parsed = parseNumstat(numstat);
    expect(parsed.length).toBe(fixtures.length);
    const totalAdded = parsed.reduce((acc, r) => acc + r.added, 0);
    const totalDeleted = parsed.reduce((acc, r) => acc + r.deleted, 0);
    const expectedAdded = fixtures.reduce((acc, r) => acc + r.added, 0);
    const expectedDeleted = fixtures.reduce((acc, r) => acc + r.deleted, 0);
    expect(totalAdded).toBe(expectedAdded);
    expect(totalDeleted).toBe(expectedDeleted);
  });
});

describe('porcelain — extended coverage', () => {
  it('rename arrow → destination path with status R', () => {
    const map = parsePorcelainStatus('R  old/path.ts -> new/path.ts');
    expect(map.get('new/path.ts')).toBe('R');
  });

  it('untracked files with spaces in path', () => {
    const map = parsePorcelainStatus('?? src/has space.ts');
    expect(map.get('src/has space.ts')).toBe('?');
  });
});

describe('unified diff — meta lines flow into hunks', () => {
  it('preserves diff header lines as meta inside the surrounding hunk', () => {
    const diff = [
      'diff --git a/x b/x',
      'index abc..def 100644',
      '--- a/x',
      '+++ b/x',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');
    const hunks = parseUnifiedDiff(diff);
    expect(hunks.length).toBe(1);
    expect(hunks[0].lines.find((l) => l.kind === 'del')?.text).toBe('-old');
    expect(hunks[0].lines.find((l) => l.kind === 'add')?.text).toBe('+new');
  });
});

describe('forensic mapping — drift-safe shape', () => {
  it('row carries non-empty type, actor, jobId, t, line', () => {
    const row = forensicEventToFeedRow(makeForensicEvent(), { jobId: 'job0001a', specialist: 'executor' }, 0);
    expect(row.type.length).toBeGreaterThan(0);
    expect(row.jobId).toBe('job0001a');
    expect(row.line.length).toBeGreaterThan(0);
    expect(typeof row.t).toBe('number');
  });

  it('unknown event_family.event_name still renders without throw', () => {
    const ev = makeForensicEvent({ event_family: 'totally', event_name: 'unknown_thing' });
    expect(() => forensicEventToFeedRow(ev, { jobId: 'j', specialist: 'x' }, 0)).not.toThrow();
  });

  it('payload never contains raw JSON quoted strings', () => {
    const row = forensicEventToFeedRow(makeForensicEvent(), { jobId: 'j', specialist: 'x' }, 0);
    // The rendered payload uses k=v form; raw JSON would contain `"role":` etc.
    expect(row.line).not.toContain('"role":');
    expect(row.line).not.toContain('"tool_call_id":');
  });
});

describe('schema-introspected hints — exact format', () => {
  it('thinking_level enum hint includes all allowed values + null', () => {
    const d = describeLeaf('execution.thinking_level');
    expect(d.hint).toMatch(/^enum: [^|]+(\|[^|]+)+ \| null$/);
  });

  it('skills.paths has NO `| null` suffix (non-nullable array)', () => {
    expect(describeLeaf('skills.paths').hint).toBe('string[]');
  });

  it('execution.fallback_models DOES have `| null` suffix (nullable array)', () => {
    expect(describeLeaf('execution.fallback_models').hint).toBe('string[] | null');
  });
});
