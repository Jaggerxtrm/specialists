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
    nearThresholdCount: number;
    criticalCount: number;
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
export declare function aggregateStatusCounts(statuses: ReadonlyArray<SupervisorStatus>, opts?: AggregateOpts): StatusCounts;
export declare function aggregateDistinctContainers(statuses: ReadonlyArray<SupervisorStatus>): DistinctContainers;
export declare function aggregateContextHealth(statuses: ReadonlyArray<SupervisorStatus>): ContextHealth;
export declare function aggregateTokens(statuses: ReadonlyArray<SupervisorStatus>): TokenAggregates;
export declare function aggregateLiveSnapshot(statuses: ReadonlyArray<SupervisorStatus>, opts?: AggregateOpts): LiveSnapshot;
//# sourceMappingURL=live-aggregates.d.ts.map