import { type EpicState } from './epic-lifecycle.js';
import { type EpicReadinessSummary } from './epic-readiness.js';
import type { ObservabilitySqliteClient } from './observability-sqlite.js';
interface DriftReport {
    stale_chain_refs: string[];
    dead_jobs_blocking_readiness: string[];
    integrity_flags: string[];
    stale_redirect_markers: string[];
}
export interface EpicSyncResult {
    epic_id: string;
    apply: boolean;
    drift: DriftReport;
    repairs: {
        dead_jobs_marked_error: string[];
        stale_chain_refs_pruned: string[];
        readiness_resynced: boolean;
        redirect_markers_cleared: boolean;
    };
    readiness_before: EpicReadinessSummary;
    readiness_after: EpicReadinessSummary;
}
export interface EpicAbandonResult {
    epic_id: string;
    from_state: EpicState;
    to_state: 'abandoned';
    forced: boolean;
    reason: string;
    live_member_job_ids: string[];
}
export declare function withEpicAdvisoryLock<T>(epicId: string, action: () => T): T;
export declare function syncEpicState(sqlite: ObservabilitySqliteClient, epicId: string, apply: boolean): EpicSyncResult;
export declare function abandonEpic(sqlite: ObservabilitySqliteClient, epicId: string, reason: string, force: boolean): EpicAbandonResult;
export {};
//# sourceMappingURL=epic-reconciler.d.ts.map