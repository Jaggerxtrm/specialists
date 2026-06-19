// Shared aggregator core for SupervisorStatus[] → scalar live snapshots.
//
// Current consumer: sp console StatsLine (src/cli/console/runtime.ts) via
// listProcessSnapshot. The single edit-site goal for StatsLine math is
// achieved here.
//
// NOT a shared source for src/specialist/prometheus-projection.ts. The two
// modules look adjacent but have structurally different aggregation models:
//
//   - live-aggregates.ts:  bounded scalar counters over the full job set
//                          (Active = starting+running+waiting, totalTokens,
//                          maxContextPct). One row of output per call.
//
//   - prometheus-projection.ts:  label-keyed groupBy over (repo, specialist,
//                                status, worktree, role, ...) tuples. Each
//                                unique tuple becomes a distinct Prometheus
//                                sample. Output is N rows per scrape; the
//                                shared math overlap is minimal once labels
//                                and histograms are taken into account.
//
// Decision per unitAI-ctb4u.16: keep prometheus aggregation label-keyed and
// in-file rather than forcing both consumers through the same scalar core.
// The cost of unifying would be high (two aggregation models shoehorned
// into one shape, plus a byte-equivalence gate against the existing scrape
// format) for low payoff (the overlapping math is small). The byte-format
// invariant prometheus consumers rely on stays guarded by its existing
// validator (validatePrometheusProjectionText) and golden tests.
//
// If a third consumer arrives that genuinely needs label-keyed scalars,
// extract a shared label-keyed core THEN — not preemptively.
//
// Pure: no IO, no Date.now(), no state. Pass nowMs via opts when needed.

import type { SupervisorStatus } from './supervisor.js';

export type LiveJobStatus = SupervisorStatus['status'];

export interface StatusCounts {
  starting: number;
  running: number;
  waiting: number;
  done: number;
  error: number;
  cancelled: number;
  dead: number;
}

export interface DistinctContainers {
  epics: number;
  nodes: number;
  worktrees: number;
  chains: number;
}

export interface ContextHealth {
  ctxMaxPct: number | undefined;
  ctxAvgPct: number | undefined;
  nearThresholdCount: number; // ctxPct ≥ 80
  criticalCount: number;      // ctxPct ≥ 95
}

export interface TokenAggregates {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

export interface LiveSnapshot {
  generatedAtMs: number;
  total: number;
  counts: StatusCounts;
  containers: DistinctContainers;
  context: ContextHealth;
  tokens: TokenAggregates;
}

export interface AggregateOpts {
  nowMs?: number;
  isDead?: (status: SupervisorStatus) => boolean;
}

const NEAR_THRESHOLD_PCT = 80;
const CRITICAL_PCT = 95;

export function aggregateStatusCounts(
  statuses: ReadonlyArray<SupervisorStatus>,
  opts: AggregateOpts = {},
): StatusCounts {
  const out: StatusCounts = {
    starting: 0,
    running: 0,
    waiting: 0,
    done: 0,
    error: 0,
    cancelled: 0,
    dead: 0,
  };
  for (const status of statuses) {
    if (opts.isDead?.(status)) {
      out.dead += 1;
      continue;
    }
    bumpStatus(out, status.status);
  }
  return out;
}

function bumpStatus(out: StatusCounts, status: LiveJobStatus): void {
  switch (status) {
    case 'starting': out.starting += 1; return;
    case 'running': out.running += 1; return;
    case 'waiting': out.waiting += 1; return;
    case 'done': out.done += 1; return;
    case 'error': out.error += 1; return;
    case 'cancelled': out.cancelled += 1; return;
    default: {
      // Exhaustiveness gate: any new SupervisorStatus['status'] addition will
      // cause this assignment to fail tsc.
      const _exhaustive: never = status;
      void _exhaustive;
    }
  }
}

export function aggregateDistinctContainers(
  statuses: ReadonlyArray<SupervisorStatus>,
): DistinctContainers {
  const epics = new Set<string>();
  const nodes = new Set<string>();
  const worktrees = new Set<string>();
  const chains = new Set<string>();
  for (const status of statuses) {
    if (status.epic_id) epics.add(status.epic_id);
    if (status.node_id) nodes.add(status.node_id);
    const wt = status.worktree_owner_job_id ?? status.worktree_path;
    if (wt) worktrees.add(wt);
    const chain = status.chain_id ?? status.worktree_owner_job_id;
    if (chain) chains.add(chain);
  }
  return {
    epics: epics.size,
    nodes: nodes.size,
    worktrees: worktrees.size,
    chains: chains.size,
  };
}

export function aggregateContextHealth(
  statuses: ReadonlyArray<SupervisorStatus>,
): ContextHealth {
  const pcts = statuses
    .map((s) => s.context_pct)
    .filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
  const ctxMaxPct = pcts.length > 0 ? Math.max(...pcts) : undefined;
  const ctxAvgPct = pcts.length > 0
    ? pcts.reduce((acc, p) => acc + p, 0) / pcts.length
    : undefined;
  const nearThresholdCount = pcts.filter((p) => p >= NEAR_THRESHOLD_PCT).length;
  const criticalCount = pcts.filter((p) => p >= CRITICAL_PCT).length;
  return { ctxMaxPct, ctxAvgPct, nearThresholdCount, criticalCount };
}

export function aggregateTokens(
  statuses: ReadonlyArray<SupervisorStatus>,
): TokenAggregates {
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  for (const s of statuses) {
    const usage = s.metrics?.token_usage;
    if (!usage) continue;
    totalTokens += usage.total_tokens ?? 0;
    promptTokens += usage.input_tokens ?? 0;
    completionTokens += usage.output_tokens ?? 0;
  }
  return { totalTokens, promptTokens, completionTokens };
}

export function aggregateLiveSnapshot(
  statuses: ReadonlyArray<SupervisorStatus>,
  opts: AggregateOpts = {},
): LiveSnapshot {
  return {
    generatedAtMs: opts.nowMs ?? 0,
    total: statuses.length,
    counts: aggregateStatusCounts(statuses, opts),
    containers: aggregateDistinctContainers(statuses),
    context: aggregateContextHealth(statuses),
    tokens: aggregateTokens(statuses),
  };
}
