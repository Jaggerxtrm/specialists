import type { SpecialistRunner, RunOptions } from './runner.js';
import { type RuntimeOriginV1, type SpecialistSpawnOriginV1 } from './runtime-origin.js';
import type { BeadsClient } from './beads.js';
import { type TimelineEvent, type TimelineEventControlSignal, type TimelineEventRunComplete } from './timeline-events.js';
import type { SessionRunMetrics, SessionTokenUsage } from '../pi/session.js';
type ActivePiSession = {
    close(): Promise<void>;
    kill(reason?: Error): void;
};
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
    output_type?: string;
    pid?: number;
    started_at_ms: number;
    elapsed_s?: number;
    last_event_at_ms?: number;
    bead_id?: string;
    node_id?: string;
    session_id?: string;
    conversation_id?: string;
    trace_id?: string;
    span_id?: string;
    parent_span_id?: string;
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
    startup_payload_json?: string;
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
        mandatory_rules_injection?: {
            sets_loaded: string[];
            rules_count: number;
            inline_rules_count: number;
            globals_disabled: boolean;
            token_estimate: number;
        };
        skills?: {
            count: number;
            activated: string[];
        };
        spawn_origin_kind?: 'xtmux.agent_instance' | 'specialist.job' | 'unknown';
        parent_job_id?: string;
        root_pane_id?: string;
        root_agent_instance_id?: string;
    };
    metrics?: SessionRunMetrics;
    context_pct?: number;
    context_health?: ContextHealth;
    error?: string;
    auto_commit_count?: number;
    last_auto_commit_sha?: string;
    last_auto_commit_at_ms?: number;
    pr_url?: string;
    pr_head_sha?: string;
    pr_state?: string;
    pr_merge_state?: string;
    pr_classification?: string;
    pr_base_ref?: string;
    pr_base_sha?: string;
    pr_drift_checked_at_ms?: number;
    base_sha_pinned?: string;
    base_sha_pinned_at_ms?: number;
    spawn_origin?: SpecialistSpawnOriginV1;
    parent_job_id?: string;
    root_runtime_origin?: RuntimeOriginV1;
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
        sessionId?: string;
    }) => void;
    /** Optional callback fired as soon as a job id is allocated and persisted */
    onJobStarted?: (job: {
        id: string;
    }) => void;
    /** Stall detection thresholds — merged with STALL_DETECTION_DEFAULTS */
    stallDetection?: StallDetectionConfig;
}
export declare function emitParentNotification(statusSnapshot: SupervisorStatus, activeSiblingAssignee?: string): void;
export declare function formatHandoffBlock(result: {
    output: string;
    promptHash?: string;
    durationMs?: number;
    model: string;
    backend: string;
    specialist: string;
    jobId: string;
    status: SupervisorJobStatus;
    timestamp: string;
    tokenUsage?: SessionTokenUsage;
    turnIndex?: number;
}, options: {
    final: boolean;
}): string;
export declare function shouldPersistHandoffBlock(params: {
    output: string;
    notesMode: 'full-trail' | 'final-only';
    final: boolean;
}): boolean;
type ContextHealth = 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL';
export declare const AUTO_COMMIT_NOISE_PREFIXES: readonly [".xtrm/", ".wolf/", ".specialists/jobs/", ".beads/", ".pi/"];
/** Detects whether the GitNexus index in `cwd` has embeddings, so a re-analyze
 *  preserves them via `--embeddings`. Reads `.gitnexus/meta.json` and inspects
 *  `stats.embeddings`. Falls back to `false` (no `--embeddings`) on any error. */
export declare function gitnexusHasEmbeddings(cwd: string): boolean;
export declare function isPidAlive(pid: number | undefined): boolean;
export declare function isJobDead(status: Pick<SupervisorStatus, 'status' | 'pid' | 'tmux_session'>): boolean;
export declare const DEAD_JOB_ERROR = "Process crashed or was killed";
/**
 * Terminal transition for a job whose process (or tmux session) is gone: the error
 * status plus the run_complete event that carries it. Returns null when the job is
 * still live or has no usable start time.
 *
 * Callers persist both and must then call `emitParentNotification` — a dead job left
 * in a non-terminal status never notifies its parent, which waits forever
 * (xtrm-wiy5n.4.13).
 */
export declare function buildDeadJobRecovery(status: SupervisorStatus, now?: number): {
    status: SupervisorStatus;
    event: TimelineEventRunComplete;
} | null;
/**
 * Best-effort death-cause artifact so a job dir that only ever held steer.pipe still
 * names why the job vanished.
 */
export declare function writeDeadJobArtifact(jobsDir: string, status: SupervisorStatus): void;
export declare class Supervisor {
    private opts;
    private readonly sqliteClient;
    private readonly resolvedJobsDir;
    private isDisposed;
    private disposePromise;
    private pendingSqliteOperations;
    private readonly pendingSqliteDrainResolvers;
    private activeSession;
    private readonly isJobFileOutputEnabled;
    constructor(opts: SupervisorOptions);
    private createDisposedSqliteError;
    private withSqliteOperation;
    private waitForPendingSqliteOperations;
    setActiveSession(session: ActivePiSession): void;
    dispose(): Promise<void>;
    private closeActiveSession;
    private jobDir;
    private statusPath;
    private resultPath;
    private observabilityDbPath;
    private eventsPath;
    private readyDir;
    private writeReadyMarker;
    private withComputedLiveness;
    private reconcileDeadStatus;
    readStatus(id: string): SupervisorStatusView | null;
    listLiveJobsForBead(beadId: string): string[];
    private activeSiblingAssignee;
    listChainJobIds(chainId: string): string[];
    readResult(id: string): string | null;
    finalizeWaitingJob(id: string): SupervisorStatusView | null;
    private appendEventBestEffort;
    emitMetaEvent(jobId: string, model: string, backend: string): void;
    emitControlEvent(jobId: string, action: string, options: Omit<TimelineEventControlSignal, 't' | 'type' | 'action'>): void;
    emitTimelineEvent(jobId: string, event: TimelineEvent): void;
    updateJobStatus(id: string, status: Extract<SupervisorJobStatus, 'done' | 'cancelled' | 'error' | 'waiting' | 'running' | 'starting'>, error?: string): SupervisorStatusView | null;
    aggregateJobMetricsBestEffort(jobId: string): void;
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