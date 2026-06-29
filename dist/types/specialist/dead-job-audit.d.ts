import type { ObservabilitySqliteClient } from './observability-sqlite.js';
export interface DeadJobAuditFinding {
    job_id: string;
    pid: number;
    reason: string;
    age_ms: number;
}
export interface DeadJobAuditResult {
    dryRun: boolean;
    found: DeadJobAuditFinding[];
    cancelled: number;
}
export declare function auditDeadJobs(opts: {
    client: ObservabilitySqliteClient;
    dryRun?: boolean;
    nowMs?: number;
    isPidAlive?: (pid: number) => boolean;
    minAgeMs?: number;
}): DeadJobAuditResult;
//# sourceMappingURL=dead-job-audit.d.ts.map