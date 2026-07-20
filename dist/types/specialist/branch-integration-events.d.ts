export declare const BRANCH_INTEGRATION_SCHEMA_VERSION: "xtrm.branch.integration.v1";
/** The specialist chain branch that was merged. */
export interface BranchIntegrationSource {
    job_id: string;
    branch: string;
    worktree: string;
}
/** The branch the source was merged into (a coordinator integration branch, or the default branch). */
export interface BranchIntegrationTarget {
    branch: string;
    worktree: string;
    role?: string;
}
export type BranchIntegrationStatus = 'merged';
export interface BranchIntegrationEvent {
    schema_version: typeof BRANCH_INTEGRATION_SCHEMA_VERSION;
    timestamp: string;
    t_unix_ms: number;
    source: BranchIntegrationSource;
    target: BranchIntegrationTarget;
    status: BranchIntegrationStatus;
    commit: string;
}
export interface CreateBranchIntegrationEventOptions {
    source: BranchIntegrationSource;
    target: BranchIntegrationTarget;
    commit: string;
    status?: BranchIntegrationStatus;
    t_unix_ms?: number;
    timestamp?: string;
}
export declare function createBranchIntegrationEvent(options: CreateBranchIntegrationEventOptions): BranchIntegrationEvent;
//# sourceMappingURL=branch-integration-events.d.ts.map