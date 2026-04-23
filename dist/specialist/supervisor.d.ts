import type { SpecialistRunner, RunOptions } from './runner.js';
import type { BeadsClient } from './beads.js';
import type { SessionRunMetrics } from '../pi/session.js';
import type { StallDetectionConfig } from './loader.js';
export declare const STALL_DETECTION_DEFAULTS: Required<StallDetectionConfig>;
export type SupervisorJobStatus = 'starting' | 'running' | 'waiting' | 'done' | 'error' | 'cancelled';
export interface SupervisorStatus {
    id: string;
    specialist: string;
    status: SupervisorJobStatus;
    current_event?: string;
    current_tool?: string;
    model?: string;
    backend?: string;
    pid?: number;
    started_at_ms: number;
    elapsed_s?: number;
    last_event_at_ms?: number;
    bead_id?: string;
    node_id?: string;
    session_file?: string;
    fifo_path?: string;
    tmux_session?: string;
    worktree_path?: string;
    reused_from_job_id?: string;
    worktree_owner_job_id?: string;
    chain_kind?: 'chain' | 'prep';
    chain_id?: string;
    chain_root_job_id?: string;
    chain_root_bead_id?: string;
    epic_id?: string;
    branch?: string;
    startup_context?: {
        job_id?: string;
        specialist_name?: string;
        bead_id?: string;
        reused_from_job_id?: string;
        worktree_owner_job_id?: string;
        chain_id?: string;
        chain_root_job_id?: string;
        chain_root_bead_id?: string;
        worktree_path?: string;
        branch?: string;
        variables_keys?: string[];
        reviewed_job_id_present?: boolean;
        reused_worktree_awareness_present?: boolean;
        bead_context_present?: boolean;
        memory_injection?: {
            static_tokens: number;
            memory_tokens: number;
            gitnexus_tokens: number;
            total_tokens: number;
        };
        skills?: {
            count: number;
            activated: string[];
        };
    };
    metrics?: SessionRunMetrics;
    context_pct?: number;
    context_health?: ContextHealth;
    error?: string;
    auto_commit_count?: number;
    last_auto_commit_sha?: string;
    last_auto_commit_at_ms?: number;
}
export type SupervisorStatusView = SupervisorStatus & {
    is_dead: boolean;
};
export interface SupervisorOptions {
    runner: SpecialistRunner;
    runOptions: RunOptions;
    /** Absolute path to .specialists/jobs/. Defaults to the git-common-root-anchored path. */
    jobsDir?: string;
    beadsClient?: BeadsClient;
    /** Optional callback to stream progress deltas to stdout/elsewhere */
    onProgress?: (delta: string) => void;
    /** Optional callback for meta events (backend/model) */
    onMeta?: (meta: {
        backend: string;
        model: string;
    }) => void;
    /** Optional callback fired as soon as a job id is allocated and persisted */
    onJobStarted?: (job: {
        id: string;
    }) => void;
    /** Stall detection thresholds — merged with STALL_DETECTION_DEFAULTS */
    stallDetection?: StallDetectionConfig;
}
type ContextHealth = 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL';
export declare function isPidAlive(pid: number | undefined): boolean;
export declare function isJobDead(status: Pick<SupervisorStatus, 'status' | 'pid' | 'tmux_session'>): boolean;
export declare class Supervisor {
    private opts;
    private readonly sqliteClient;
    private readonly resolvedJobsDir;
    private isDisposed;
    private disposePromise;
    private pendingSqliteOperations;
    private readonly pendingSqliteDrainResolvers;
    constructor(opts: SupervisorOptions);
    private createDisposedSqliteError;
    private withSqliteOperation;
    private waitForPendingSqliteOperations;
    dispose(): Promise<void>;
    private jobDir;
    private statusPath;
    private resultPath;
    private eventsPath;
    private readyDir;
    private writeReadyMarker;
    private withComputedLiveness;
    readStatus(id: string): SupervisorStatusView | null;
    updateJobStatus(id: string, status: Extract<SupervisorJobStatus, 'done' | 'cancelled' | 'error' | 'waiting' | 'running' | 'starting'>, error?: string): SupervisorStatusView | null;
    /** List all jobs sorted newest-first. */
    listJobs(): SupervisorStatusView[];
    private withStatusLineageDefaults;
    private writeStatusFileOnly;
    private writeStatusFile;
    /** GC: remove job dirs older than JOB_TTL_DAYS. */
    private gc;
    /** Crash recovery: mark running jobs with dead PID as error, and emit stale warnings. */
    private crashRecovery;
    /**
     * Run the specialist under supervision. Writes job state to disk.
     * Returns the job ID when complete (or throws on error).
     */
    run(): Promise<string>;
}
export {};
//# sourceMappingURL=supervisor.d.ts.map