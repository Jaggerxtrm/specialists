// Regression for the gitboard port (unitAI-ctb4u.19). snapshotHash must be
// stable under property reorder; snapshotDiff must produce the expected
// upsert/tombstone/unchanged split on representative fixtures.

import { describe, expect, it } from 'vitest';
import { snapshotDiff, snapshotHash } from '../../../src/specialist/snapshot-diff.js';

interface Row {
  id: string;
  status: string;
  ctx?: number;
}

describe('snapshotHash', () => {
  it('returns the same hash for two equal snapshots in different array order', () => {
    const a: Row[] = [
      { id: 'r1', status: 'running', ctx: 0.5 },
      { id: 'r2', status: 'waiting', ctx: 0.1 },
    ];
    const b: Row[] = [
      { id: 'r2', status: 'waiting', ctx: 0.1 },
      { id: 'r1', status: 'running', ctx: 0.5 },
    ];
    expect(snapshotHash(a, (r) => r.id)).toBe(snapshotHash(b, (r) => r.id));
  });

  it('is stable across property-order drift inside row objects', () => {
    const a: Row[] = [{ id: 'r1', status: 'running', ctx: 0.5 }];
    const b = [{ ctx: 0.5, status: 'running', id: 'r1' }] as unknown as Row[];
    expect(snapshotHash(a, (r) => r.id)).toBe(snapshotHash(b, (r) => r.id));
  });

  it('differs when a row mutates its status', () => {
    const a: Row[] = [{ id: 'r1', status: 'running' }];
    const b: Row[] = [{ id: 'r1', status: 'done' }];
    expect(snapshotHash(a, (r) => r.id)).not.toBe(snapshotHash(b, (r) => r.id));
  });

  it('differs when a new row is added', () => {
    const a: Row[] = [{ id: 'r1', status: 'running' }];
    const b: Row[] = [{ id: 'r1', status: 'running' }, { id: 'r2', status: 'waiting' }];
    expect(snapshotHash(a, (r) => r.id)).not.toBe(snapshotHash(b, (r) => r.id));
  });

  it('is stable across N invocations of the same input', () => {
    const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({
      id: `r${i.toString().padStart(2, '0')}`,
      status: i % 2 === 0 ? 'running' : 'waiting',
      ctx: i / 25,
    }));
    const baseline = snapshotHash(rows, (r) => r.id);
    for (let k = 0; k < 8; k += 1) {
      expect(snapshotHash(rows, (r) => r.id)).toBe(baseline);
    }
  });

  it('produces a deterministic 64-char hex digest', () => {
    const rows: Row[] = [{ id: 'r1', status: 'running' }];
    const hash = snapshotHash(rows, (r) => r.id);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('snapshotDiff', () => {
  it('classifies new rows as upserts', () => {
    const prev: Row[] = [{ id: 'r1', status: 'running' }];
    const next: Row[] = [{ id: 'r1', status: 'running' }, { id: 'r2', status: 'waiting' }];
    const diff = snapshotDiff(prev, next, (r) => r.id);
    expect(diff.upserts.map((r) => r.id)).toEqual(['r2']);
    expect(diff.tombstones).toEqual([]);
    expect(diff.unchanged_count).toBe(1);
  });

  it('classifies rows missing from next as tombstones', () => {
    const prev: Row[] = [{ id: 'r1', status: 'running' }, { id: 'r2', status: 'waiting' }];
    const next: Row[] = [{ id: 'r2', status: 'waiting' }];
    const diff = snapshotDiff(prev, next, (r) => r.id);
    expect(diff.upserts).toEqual([]);
    expect(diff.tombstones.map((r) => r.id)).toEqual(['r1']);
    expect(diff.unchanged_count).toBe(1);
  });

  it('counts unchanged rows under property-order drift', () => {
    const prev: Row[] = [{ id: 'r1', status: 'running', ctx: 0.5 }];
    const next = [{ ctx: 0.5, status: 'running', id: 'r1' }] as unknown as Row[];
    const diff = snapshotDiff(prev, next, (r) => r.id);
    expect(diff.upserts).toEqual([]);
    expect(diff.tombstones).toEqual([]);
    expect(diff.unchanged_count).toBe(1);
  });

  it('classifies mutated rows as upserts (not tombstones+upserts)', () => {
    const prev: Row[] = [{ id: 'r1', status: 'running' }];
    const next: Row[] = [{ id: 'r1', status: 'done' }];
    const diff = snapshotDiff(prev, next, (r) => r.id);
    expect(diff.upserts.length).toBe(1);
    expect(diff.upserts[0]).toEqual({ id: 'r1', status: 'done' });
    expect(diff.tombstones).toEqual([]);
    expect(diff.unchanged_count).toBe(0);
  });

  it('empty → N produces all upserts', () => {
    const next: Row[] = [
      { id: 'r1', status: 'running' },
      { id: 'r2', status: 'waiting' },
    ];
    const diff = snapshotDiff([] as Row[], next, (r) => r.id);
    expect(diff.upserts.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(diff.tombstones).toEqual([]);
    expect(diff.unchanged_count).toBe(0);
  });

  it('N → empty produces all tombstones', () => {
    const prev: Row[] = [
      { id: 'r1', status: 'running' },
      { id: 'r2', status: 'waiting' },
    ];
    const diff = snapshotDiff(prev, [] as Row[], (r) => r.id);
    expect(diff.upserts).toEqual([]);
    expect(diff.tombstones.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect(diff.unchanged_count).toBe(0);
  });
});
