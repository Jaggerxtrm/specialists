import { describe, expect, it } from 'vitest';
import {
  aggregateContextHealth,
  aggregateDistinctContainers,
  aggregateLiveSnapshot,
  aggregateStatusCounts,
  aggregateTokens,
} from '../../../src/specialist/live-aggregates.js';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

function makeStatus(overrides: Partial<SupervisorStatus> = {}): SupervisorStatus {
  return {
    id: 'a',
    specialist: 'executor',
    status: 'running',
    started_at_ms: 0,
    ...overrides,
  } as SupervisorStatus;
}

describe('aggregateStatusCounts — exhaustive coverage', () => {
  it('starts at zero for empty input', () => {
    const counts = aggregateStatusCounts([]);
    for (const v of Object.values(counts)) expect(v).toBe(0);
  });

  it('counts each status into its own bucket', () => {
    const counts = aggregateStatusCounts([
      makeStatus({ id: '1', status: 'starting' }),
      makeStatus({ id: '2', status: 'running' }),
      makeStatus({ id: '3', status: 'running' }),
      makeStatus({ id: '4', status: 'waiting' }),
      makeStatus({ id: '5', status: 'done' }),
      makeStatus({ id: '6', status: 'error' }),
      makeStatus({ id: '7', status: 'cancelled' }),
    ]);
    expect(counts.starting).toBe(1);
    expect(counts.running).toBe(2);
    expect(counts.waiting).toBe(1);
    expect(counts.done).toBe(1);
    expect(counts.error).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.dead).toBe(0);
  });

  it('isDead callback routes a job into the dead bucket regardless of status', () => {
    const counts = aggregateStatusCounts(
      [
        makeStatus({ id: 'r', status: 'running' }),
        makeStatus({ id: 'z', status: 'running' }),
      ],
      { isDead: (s) => s.id === 'z' },
    );
    expect(counts.running).toBe(1);
    expect(counts.dead).toBe(1);
  });

  it('property: sum of counts equals input length', () => {
    const statuses = [
      makeStatus({ id: 'a', status: 'running' }),
      makeStatus({ id: 'b', status: 'waiting' }),
      makeStatus({ id: 'c', status: 'done' }),
      makeStatus({ id: 'd', status: 'error' }),
      makeStatus({ id: 'e', status: 'cancelled' }),
    ];
    const counts = aggregateStatusCounts(statuses);
    const sum = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(statuses.length);
  });
});

describe('aggregateDistinctContainers', () => {
  it('returns zeros for empty input', () => {
    const out = aggregateDistinctContainers([]);
    expect(out).toEqual({ epics: 0, nodes: 0, worktrees: 0, chains: 0 });
  });

  it('dedupes by epic_id / node_id / worktree / chain_id', () => {
    const out = aggregateDistinctContainers([
      makeStatus({ id: '1', epic_id: 'e1', node_id: 'n1', worktree_owner_job_id: 'w1', chain_id: 'c1' }),
      makeStatus({ id: '2', epic_id: 'e1', node_id: 'n2', worktree_owner_job_id: 'w1', chain_id: 'c1' }),
      makeStatus({ id: '3', epic_id: 'e2', worktree_path: '/x' }),
    ]);
    expect(out.epics).toBe(2);
    expect(out.nodes).toBe(2);
    expect(out.worktrees).toBe(2); // {w1, /x}
    expect(out.chains).toBe(1);
  });

  it('falls back to worktree_path when worktree_owner_job_id missing', () => {
    const out = aggregateDistinctContainers([
      makeStatus({ id: '1', worktree_path: '/foo' }),
    ]);
    expect(out.worktrees).toBe(1);
  });
});

describe('aggregateContextHealth', () => {
  it('handles empty input', () => {
    const out = aggregateContextHealth([]);
    expect(out.ctxMaxPct).toBeUndefined();
    expect(out.ctxAvgPct).toBeUndefined();
    expect(out.nearThresholdCount).toBe(0);
    expect(out.criticalCount).toBe(0);
  });

  it('reports max and threshold counts (≥80 near, ≥95 critical)', () => {
    const out = aggregateContextHealth([
      makeStatus({ id: '1', context_pct: 30 }),
      makeStatus({ id: '2', context_pct: 80 }),
      makeStatus({ id: '3', context_pct: 85 }),
      makeStatus({ id: '4', context_pct: 95 }),
      makeStatus({ id: '5', context_pct: 100 }),
    ]);
    expect(out.ctxMaxPct).toBe(100);
    expect(out.nearThresholdCount).toBe(4);
    expect(out.criticalCount).toBe(2);
    expect(out.ctxAvgPct).toBeCloseTo(78, 0);
  });

  it('ignores non-numeric context_pct', () => {
    const out = aggregateContextHealth([
      makeStatus({ id: '1', context_pct: undefined }),
      makeStatus({ id: '2', context_pct: NaN }),
    ]);
    expect(out.ctxMaxPct).toBeUndefined();
  });
});

describe('aggregateTokens', () => {
  it('returns zeros for empty / missing usage', () => {
    expect(aggregateTokens([])).toEqual({ totalTokens: 0, promptTokens: 0, completionTokens: 0 });
    expect(aggregateTokens([makeStatus({ id: 'x', metrics: undefined } as any)])).toEqual({
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
    });
  });

  it('sums totals across jobs', () => {
    const out = aggregateTokens([
      makeStatus({ metrics: { token_usage: { total_tokens: 100, input_tokens: 60, output_tokens: 40 } } } as any),
      makeStatus({ metrics: { token_usage: { total_tokens: 250, input_tokens: 200, output_tokens: 50 } } } as any),
    ]);
    expect(out.totalTokens).toBe(350);
    expect(out.promptTokens).toBe(260);
    expect(out.completionTokens).toBe(90);
  });
});

describe('aggregateLiveSnapshot — composite', () => {
  it('combines all aggregators + carries nowMs', () => {
    const snap = aggregateLiveSnapshot(
      [
        makeStatus({ id: '1', status: 'running', epic_id: 'e1', context_pct: 90 }),
        makeStatus({ id: '2', status: 'waiting', node_id: 'n1' }),
      ],
      { nowMs: 12345 },
    );
    expect(snap.total).toBe(2);
    expect(snap.generatedAtMs).toBe(12345);
    expect(snap.counts.running).toBe(1);
    expect(snap.counts.waiting).toBe(1);
    expect(snap.containers.epics).toBe(1);
    expect(snap.containers.nodes).toBe(1);
    expect(snap.context.ctxMaxPct).toBe(90);
    expect(snap.context.nearThresholdCount).toBe(1);
  });

  it('purity: same input → same output (no clocks)', () => {
    const input = [makeStatus({ id: '1', status: 'running' })];
    const a = aggregateLiveSnapshot(input, { nowMs: 1 });
    const b = aggregateLiveSnapshot(input, { nowMs: 1 });
    expect(a).toEqual(b);
  });
});
