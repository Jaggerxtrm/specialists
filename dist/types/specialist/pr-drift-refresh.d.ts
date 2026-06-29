import type { ObservabilitySqliteClient } from './observability-sqlite.js';
export type PrClassification = 'clean' | 'needs-rebase' | 'conflicted' | 'blocked' | 'stale' | 'unknown';
export type PrDriftRefreshErrorKind = 'gh_unavailable' | 'no_pr' | 'parse_error' | 'network';
export interface PrDriftRefreshResult {
    ok: boolean;
    classification: PrClassification;
    error_kind?: PrDriftRefreshErrorKind;
    error_summary?: string;
    raw?: Record<string, unknown>;
}
export declare function refreshPrDriftForJob(opts: {
    jobId: string;
    prUrl: string;
    headSha?: string;
    client: ObservabilitySqliteClient;
}): Promise<PrDriftRefreshResult>;
//# sourceMappingURL=pr-drift-refresh.d.ts.map