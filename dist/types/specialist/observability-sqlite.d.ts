type BunDb = any;
import type { TimelineEvent, TimelineEventTool } from './timeline-events.js';
import type { SupervisorStatus } from './supervisor.js';
import type { EpicChainRecord, EpicRunRecord } from './epic-lifecycle.js';
import type { PersistedChainIdentity } from './chain-identity.js';
export declare function parseJournalMode(mode: string | null | undefined): string | null;
export declare function enforceWalMode(db: BunDb): void;
export declare function verifyWalMode(db: BunDb): void;
export declare function initSchema(db: BunDb): void;
export type NodeRunStatus = 'created' | 'starting' | 'running' | 'waiting' | 'degraded' | 'awaiting_merge' | 'fixing_after_review' | 'failed' | 'error' | 'done' | 'stopped';
export type NodeEventType = 'node_created' | 'node_started' | 'node_state_changed' | 'member_started' | 'member_state_changed' | 'member_output_received' | 'member_failed' | 'member_recovered' | 'member_respawned' | 'member_job_rebound' | 'member_disabled' | 'coordinator_resumed' | 'coordinator_resume_state' | 'coordinator_resume_skipped' | 'coordinator_first_turn_context_built' | 'coordinator_output_received' | 'coordinator_output_invalid' | 'coordinator_repair_requested' | 'memory_updated' | 'memory_patch_rejected' | 'memory_patch_deduplicated' | 'action_queued' | 'action_written' | 'action_observed' | 'action_superseded' | 'action_completed' | 'action_failed' | 'action_dropped' | 'node_recovered' | 'node_waiting' | 'node_done' | 'node_error' | 'node_stopped' | 'phase_started' | 'phase_completed' | 'bead_created' | 'worktree_provisioned' | 'member_spawned_dynamic' | 'member_replaced' | 'coordinator_restarted' | 'pr_created' | 'pr_updated' | 'node_completed';
export interface NodeRunRow {
    id: string;
    node_name: string;
    status: NodeRunStatus;
    coordinator_job_id?: string;
    started_at_ms?: number;
    updated_at_ms: number;
    waiting_on?: string;
    error?: string;
    memory_namespace?: string;
    status_json: string;
    pr_number?: number;
    pr_url?: string;
    pr_head_sha?: string;
    gate_results?: string;
    completion_strategy?: string;
}
export interface NodeMemberRow {
    node_run_id: string;
    member_id: string;
    job_id?: string;
    specialist: string;
    model?: string;
    role?: string;
    status: string;
    enabled?: boolean;
    generation?: number;
    worktree_path?: string;
    parent_member_id?: string;
    replaced_member_id?: string;
    phase_id?: string;
}
export interface NodeMemoryRow {
    node_run_id: string;
    namespace?: string;
    entry_type?: 'fact' | 'question' | 'decision';
    entry_id?: string;
    summary?: string;
    source_member_id?: string;
    confidence?: number;
    provenance_json?: string;
    created_at_ms?: number;
    updated_at_ms?: number;
}
export interface ChainEpicLinkRecord {
    chain_id: string;
    epic_id?: string;
    chain_root_job_id?: string;
    chain_root_bead_id?: string;
}
export interface MemoryCacheState {
    lastSyncAtMs: number;
    memoryCount: number;
}
export interface MemoryCacheInputRecord {
    key: string;
    value: string;
}
export interface RelevantMemoryRecord {
    key: string;
    value: string;
    bm25: number;
    recency: number;
    accessFrequency: number;
    score: number;
}
export interface EpicChainLatestJobRecord {
    chain_id: string;
    epic_id: string;
    chain_root_bead_id?: string;
    chain_root_job_id?: string;
    job_id: string;
    status?: string;
    branch?: string;
    updated_at_ms: number;
}
export interface PruneObservabilityOptions {
    beforeMs: number;
    includeEpics: boolean;
    apply: boolean;
    nowMs?: number;
    eventsRetentionMs?: number;
    skipExtract?: boolean;
}
export interface JobMetricsRecord {
    job_id: string;
    specialist: string;
    model: string | null;
    status: string;
    chain_kind: string | null;
    chain_id: string | null;
    bead_id: string | null;
    node_id: string | null;
    epic_id: string | null;
    started_at_ms: number | null;
    completed_at_ms: number | null;
    elapsed_ms: number | null;
    total_turns: number;
    total_tools: number;
    tool_call_counts_json: string;
    token_trajectory_json: string;
    context_trajectory_json: string;
    stall_gaps_json: string;
    run_complete_json: string | null;
    updated_at_ms: number;
}
export interface PruneObservabilityReport {
    dryRun: boolean;
    beforeMs: number;
    eventsCutoffMs: number;
    includeEpics: boolean;
    deletedEvents: number;
    deletedResults: number;
    deletedJobs: number;
    deletedEpicRuns: number;
    skippedActiveChainJobs: number;
    extractedJobs: number;
}
export interface OrphanScanFinding {
    kind: 'orphan' | 'stale-pointer' | 'integrity-violation';
    code: 'chain_membership_without_jobs' | 'epic_without_chains' | 'job_epic_without_membership' | 'worktree_missing_on_disk';
    message: string;
    details: Record<string, string | number | boolean | null>;
}
export interface ObservabilitySqliteClient {
    upsertStatus(status: SupervisorStatus): void;
    upsertEpicRun(epic: EpicRunRecord): void;
    upsertEpicChainMembership(chain: EpicChainRecord): void;
    upsertStatusWithEvent(status: SupervisorStatus, event: TimelineEvent): void;
    upsertStatusWithEventAndResult(status: SupervisorStatus, event: TimelineEvent, output: string): void;
    appendEvent(jobId: string, specialist: string, beadId: string | undefined, event: TimelineEvent): void;
    upsertResult(jobId: string, output: string): void;
    bootstrapNode(nodeRunId: string, nodeName: string, memoryNamespace?: string): void;
    upsertNodeRun(nodeRun: NodeRunRow): void;
    upsertNodeMember(member: NodeMemberRow): void;
    appendNodeEvent(nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void;
    upsertNodeMemory(entry: NodeMemoryRow): void;
    upsertNodeRunWithEvent(nodeRun: NodeRunRow, t: number, type: NodeEventType, eventJson: unknown): void;
    upsertNodeMemberWithEvent(member: NodeMemberRow, nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void;
    upsertNodeMemoryWithEvent(entry: NodeMemoryRow, nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void;
    readNodeRun(nodeRunId: string): NodeRunRow | null;
    listNodeRuns(filter?: {
        status?: NodeRunStatus;
    }): NodeRunRow[];
    listNodeRunsByRef(partialRef: string, statuses: readonly NodeRunStatus[]): NodeRunRow[];
    listNodeRunsByStatuses(statuses: readonly NodeRunStatus[]): NodeRunRow[];
    readNodeMembers(nodeRunId: string): NodeMemberRow[];
    readNodeEvents(nodeRunId: string, opts?: {
        type?: NodeEventType;
        limit?: number;
    }): Array<{
        id: number;
        seq: number;
        t: number;
        type: string;
        event_json: string;
    }>;
    readNodeMemory(nodeRunId: string, opts?: {
        namespace?: string;
        entry_type?: 'fact' | 'question' | 'decision';
    }): NodeMemoryRow[];
    queryMemberContextHealth(jobId: string): number | null;
    readStatus(jobId: string): SupervisorStatus | null;
    listStatuses(): SupervisorStatus[];
    readEpicRun(epicId: string): EpicRunRecord | null;
    listEpicRuns(): EpicRunRecord[];
    resolveEpicByChainId(chainId: string): EpicChainRecord | null;
    resolveEpicByChainRootBeadId(chainRootBeadId: string): EpicChainRecord | null;
    listEpicChains(epicId: string): EpicChainRecord[];
    deleteEpicChainMembership(epicId: string, chainIds: readonly string[]): string[];
    listEpicChainsWithLatestJob(epicId: string): EpicChainLatestJobRecord[];
    readChainIdentity(jobId: string): PersistedChainIdentity | null;
    listChainJobIds(chainId: string): string[];
    resolveChainEpicLinkByJobId(jobId: string): ChainEpicLinkRecord | null;
    readEvents(jobId: string): TimelineEvent[];
    readEventsAfterSeq(jobId: string, afterSeq: number): TimelineEvent[];
    readLatestToolEvent(jobId: string): TimelineEventTool | null;
    aggregateJobMetrics(jobId: string): JobMetricsRecord | null;
    listJobMetrics(filters?: {
        spec?: string;
        model?: string;
        sinceMs?: number;
    }): JobMetricsRecord[];
    readResult(jobId: string): string | null;
    syncMemoriesCache(memories: readonly MemoryCacheInputRecord[], syncedAtMs?: number): void;
    getMemoriesCacheState(): MemoryCacheState | null;
    queryRelevantMemories(keywords: readonly string[], limit?: number, nowMs?: number): RelevantMemoryRecord[];
    invalidateMemoriesCache(): void;
    hasActiveJobs(statuses?: readonly string[]): boolean;
    listActiveJobs(statuses?: readonly string[]): Array<{
        job_id: string;
        specialist: string;
        status: string;
    }>;
    getDatabaseSizeBytes(): number;
    vacuumDatabase(): {
        beforeBytes: number;
        afterBytes: number;
    };
    pruneObservabilityData(options: PruneObservabilityOptions): PruneObservabilityReport;
    scanOrphans(): OrphanScanFinding[];
    close(): void;
}
export declare function hasRunCompleteEvent(jobId: string, cwd?: string): boolean;
export declare function createObservabilitySqliteClient(cwd?: string): ObservabilitySqliteClient | null;
export {};
//# sourceMappingURL=observability-sqlite.d.ts.map