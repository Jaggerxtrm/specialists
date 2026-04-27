import type { EpicRunRecord, EpicState } from './epic-lifecycle.js';
import type { ObservabilitySqliteClient } from './observability-sqlite.js';
import type { SupervisorStatus } from './supervisor.js';
export type ReviewerVerdict = 'pass' | 'partial' | 'fail' | 'missing';
export type ChainReadinessState = 'pending' | 'blocked' | 'pass' | 'failed';
export type EpicReadinessState = 'unresolved' | 'resolving' | 'merge_ready' | 'blocked' | 'failed' | 'merged' | 'abandoned';
interface EvaluatorJob {
    id: string;
    specialist: string;
    status: SupervisorStatus['status'];
    pid?: number;
    started_at_ms: number;
    result_text?: string;
}
export interface ChainReadinessSummary {
    chain_id: string;
    chain_root_bead_id?: string;
    state: ChainReadinessState;
    reviewer_verdict: ReviewerVerdict;
    blocking_reason?: string;
    has_active_jobs: boolean;
    job_ids: string[];
}
export interface PrepReadinessSummary {
    total: number;
    done: number;
    running: number;
    failed: number;
    blocker_job_ids: string[];
}
export interface EpicReadinessSummary {
    epic_id: string;
    persisted_state: EpicState;
    readiness_state: EpicReadinessState;
    next_state: EpicState;
    can_transition: boolean;
    prep: PrepReadinessSummary;
    chains: ChainReadinessSummary[];
    blockers: string[];
    summary: string;
}
export declare function evaluateEpicReadinessSummary(input: {
    epicId: string;
    persistedState: EpicState;
    prepJobs: readonly SupervisorStatus[];
    chainInputs: ReadonlyArray<{
        chain_id: string;
        chain_root_bead_id?: string;
        jobs: readonly EvaluatorJob[];
    }>;
}): EpicReadinessSummary;
export declare function loadEpicReadinessSummary(sqlite: ObservabilitySqliteClient, epicId: string): EpicReadinessSummary;
export declare function syncEpicStateFromReadiness(sqlite: ObservabilitySqliteClient, summary: EpicReadinessSummary): EpicRunRecord;
export {};
//# sourceMappingURL=epic-readiness.d.ts.map