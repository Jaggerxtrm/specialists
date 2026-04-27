import type { SupervisorStatus } from './supervisor.js';
/**
 * Epic lifecycle is independent from node lifecycle:
 * - epic: merge-gated publication lifecycle for wave-bound chain groups
 * - chain: worktree lineage rooted at worktree_owner_job_id
 * - job: one specialist run
 * - node: coordinator/member runtime lifecycle
 */
export declare const EPIC_STATES: readonly ["open", "resolving", "merge_ready", "merged", "failed", "abandoned"];
export type EpicState = (typeof EPIC_STATES)[number];
export declare const EPIC_TERMINAL_STATES: readonly ["merged", "failed", "abandoned"];
export declare const VALID_EPIC_TRANSITIONS: Record<EpicState, readonly EpicState[]>;
export interface EpicRunRecord {
    epic_id: string;
    status: EpicState;
    updated_at_ms: number;
    status_json: string;
}
export interface EpicChainRecord {
    chain_id: string;
    epic_id: string;
    chain_root_bead_id?: string;
    chain_root_job_id?: string;
    updated_at_ms: number;
}
export interface EpicReadinessInput {
    epicId: string;
    epicStatus: EpicState;
    chainStatuses: ReadonlyArray<{
        chainId: string;
        hasRunningJob: boolean;
    }>;
}
export interface EpicReadinessResult {
    epicId: string;
    epicStatus: EpicState;
    isReady: boolean;
    blockingChains: string[];
    summary: string;
}
export declare function isEpicTerminalState(status: EpicState): boolean;
export declare function isEpicUnresolvedState(status: EpicState): boolean;
export declare function canTransitionEpicState(from: EpicState, to: EpicState): boolean;
export declare function transitionEpicState(from: EpicState, to: EpicState): EpicState;
export declare function resolveChainId(status: Pick<SupervisorStatus, 'id' | 'worktree_path' | 'worktree_owner_job_id' | 'chain_id'>): string | undefined;
export declare function evaluateEpicMergeReadiness(input: EpicReadinessInput): EpicReadinessResult;
export interface EpicTransitionAuditEntry {
    from: EpicState;
    to: EpicState;
    at_ms: number;
    reason?: string;
    trigger?: string;
    forced?: boolean;
}
export declare function appendEpicTransitionAudit(statusJson: string | undefined, entry: EpicTransitionAuditEntry): string;
export declare function summarizeEpicTransition(epicId: string, from: EpicState, to: EpicState): string;
//# sourceMappingURL=epic-lifecycle.d.ts.map