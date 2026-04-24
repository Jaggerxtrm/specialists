/**
 * Feed v2 Timeline Event Model
 *
 * This module defines the canonical event types for the specialists feed v2 timeline.
 * It is grounded in the actual Pi RPC lifecycle, not in legacy callback abstractions.
 *
 * ## Source of truth
 *
 * This model was derived from:
 * - Live `pi --mode rpc` traces (see unitAI-4pq.1 exploration notes)
 * - Official docs in docs/pi-rpc.md
 * - Current implementation analysis in src/pi/session.ts, src/specialist/supervisor.ts
 *
 * ## Layer model (from RPC reality)
 *
 * 1. **Message construction layer** (nested under message_update.assistantMessageEvent):
 *    - text_start, text_delta, text_end
 *    - thinking_start, thinking_delta, thinking_end
 *    - toolcall_start, toolcall_delta, toolcall_end
 *    - done (message-level completion, reasons: stop | length | toolUse)
 *    - error (message-level failure, reasons: aborted | error)
 *
 * 2. **Tool execution layer** (top-level):
 *    - tool_execution_start
 *    - tool_execution_update (optional, streaming)
 *    - tool_execution_end
 *
 * 3. **Tool result layer** (message role: toolResult):
 *    - message_start (role: toolResult)
 *    - message_end
 *
 * 4. **Turn boundary layer**:
 *    - turn_start
 *    - turn_end (includes assistant message + toolResults[])
 *
 * 5. **Run boundary layer**:
 *    - agent_start
 *    - agent_end (run completion, contains all messages[])
 *
 * ## Completion semantic
 *
 * For feed v2, the canonical completion event is a single `run_complete` event.
 * This resolves the historical ambiguity between:
 * - callback-level `done` (synthetic, from agent_end)
 * - persisted `agent_end` (added after runner returns)
 *
 * The `run_complete` event is emitted once per job and contains:
 * - final status (COMPLETE | ERROR | CANCELLED)
 * - elapsed time
 * - model/backend
 * - error message if applicable
 *
 * ## Persistence contract
 *
 * events.jsonl contains TimelineEvent records (one per line, NDJSON).
 * status.json remains the live mutable state snapshot.
 * result.txt remains final output storage.
 */
/**
 * Base fields present in every timeline event.
 * Written to events.jsonl as NDJSON (one event per line).
 */
export interface TimelineEventBase {
    /** Unix timestamp in milliseconds when the event was written */
    t: number;
    /** Per-job monotonic sequence assigned on write */
    seq?: number;
    /** Event type (see TimelineEventType constants) */
    type: string;
}
/**
 * Run started event.
 * Emitted once when the specialist begins processing.
 */
export interface TimelineEventRunStart extends TimelineEventBase {
    type: 'run_start';
    /** Specialist name */
    specialist: string;
    /** Bead ID if tracking is enabled */
    bead_id?: string;
    startup_snapshot?: {
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
    };
}
/**
 * Model/backend metadata event.
 * Emitted when the first assistant message_start reveals provider info.
 */
export interface TimelineEventMeta extends TimelineEventBase {
    type: 'meta';
    /** Resolved model ID (e.g., 'claude-sonnet-4-6') */
    model: string;
    /** Backend provider (e.g., 'anthropic') */
    backend: string;
    memory_injection?: {
        static_tokens: number;
        memory_tokens: number;
        gitnexus_tokens: number;
        total_tokens: number;
    };
    source?: string;
    data?: Record<string, unknown>;
}
/**
 * Thinking event.
 * Emitted once when reasoning/thinking activity is detected.
 * Note: thinking_* are optional and backend-dependent.
 */
export interface TimelineEventThinking extends TimelineEventBase {
    type: 'thinking';
    char_count?: number;
}
/**
 * Tool activity event.
 * Represents tool execution lifecycle (construction + execution + result).
 *
 * Feed v2 collapses toolcall_* and tool_execution_* into a single tool event
 * because:
 * - toolcall construction is nested under message_update (not durable)
 * - tool execution is the observable action
 * - the combined view is what operators care about
 */
export interface TimelineEventTool extends TimelineEventBase {
    type: 'tool';
    /** Tool name (e.g., 'bash', 'read', 'ls') */
    tool: string;
    /** Execution phase */
    phase: 'start' | 'update' | 'end';
    /** Tool call ID for correlation across start/end events */
    tool_call_id?: string;
    /** True when tool event cannot be correlated to a concrete tool call ID */
    uncorrelated?: boolean;
    /** Whether execution resulted in error */
    is_error?: boolean;
    /** tool_use.input payload forwarded from tool_execution_start */
    args?: Record<string, unknown>;
    /** ISO timestamp of tool start — present on phase=start events for duration computation */
    started_at?: string;
    /** Summarized tool result content (truncated to keep timeline compact) */
    result_summary?: string;
    /** Raw structured tool result payload (when available) */
    result_raw?: Record<string, unknown>;
}
/**
 * Text output event.
 * Emitted once when text content is first detected.
 * Feed v2 does not persist text deltas (too verbose); just presence.
 */
export interface TimelineEventText extends TimelineEventBase {
    type: 'text';
    char_count?: number;
}
/**
 * Message boundary event.
 * Captures assistant/toolResult message lifecycle boundaries.
 */
export interface TimelineEventMessage extends TimelineEventBase {
    type: 'message';
    phase: 'start' | 'end';
    role: 'assistant' | 'toolResult';
}
/**
 * Turn boundary event.
 * Captures RPC turn_start / turn_end lifecycle phases.
 */
export interface TimelineEventTurn extends TimelineEventBase {
    type: 'turn';
    phase: 'start' | 'end';
}
export interface TimelineEventStatusChange extends TimelineEventBase {
    type: 'status_change';
    status: 'starting' | 'running' | 'waiting' | 'done' | 'error' | 'cancelled';
    previous_status?: 'starting' | 'running' | 'waiting' | 'done' | 'error' | 'cancelled';
}
/**
 * Run completion event.
 * THE CANONICAL COMPLETION SIGNAL FOR FEED V2.
 *
 * Emitted exactly once per run, containing final status and metadata.
 * This replaces the historical double-completion (done + agent_end).
 */
export interface TimelineTokenUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
    total_tokens?: number;
    cost_usd?: number;
}
export interface TimelineRunMetrics {
    token_usage?: TimelineTokenUsage;
    finish_reason?: string;
    exit_reason?: string;
    turns?: number;
    tool_calls?: number;
    tool_call_names?: string[];
    auto_compactions?: number;
    auto_retries?: number;
}
export interface TimelineEventRunComplete extends TimelineEventBase {
    type: 'run_complete';
    /** Final status */
    status: 'COMPLETE' | 'ERROR' | 'CANCELLED';
    /** Elapsed time in seconds */
    elapsed_s: number;
    /** Model ID */
    model?: string;
    /** Backend provider */
    backend?: string;
    /** Bead ID if tracking was enabled */
    bead_id?: string;
    /** Error message if status is ERROR */
    error?: string;
    /** Final assistant output text */
    output?: string;
    /** Aggregated metrics promoted for easy JSON consumption */
    token_usage?: TimelineTokenUsage;
    finish_reason?: string;
    tool_calls?: string[];
    exit_reason?: string;
    /** Optional additive metrics summary */
    metrics?: TimelineRunMetrics;
    gitnexus_summary?: {
        files_touched: string[];
        symbols_analyzed: string[];
        highest_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        tool_invocations: number;
    };
}
/**
 * Stale warning event.
 * Emitted when a job has been silent (no activity) beyond a configured threshold,
 * or when a single tool execution exceeds its duration threshold.
 *
 * `reason` discriminates the type of staleness:
 * - `running_silence`       — job running, no events for > running_silence_warn_ms
 * - `running_silence_error` — job running, no events for > running_silence_error_ms
 * - `waiting_stale`         — job waiting for follow-up for > waiting_stale_ms
 * - `tool_duration`         — single tool execution running for > tool_duration_warn_ms
 */
export interface TimelineEventStaleWarning extends TimelineEventBase {
    type: 'stale_warning';
    reason: 'running_silence' | 'running_silence_error' | 'waiting_stale' | 'tool_duration';
    /** How many ms have elapsed without activity */
    silence_ms: number;
    /** The threshold that was crossed */
    threshold_ms: number;
    /** Tool name, present for tool_duration reason */
    tool?: string;
}
export interface TimelineEventTokenUsage extends TimelineEventBase {
    type: 'token_usage';
    token_usage: TimelineTokenUsage;
    source: 'message_done' | 'turn_end' | 'agent_end';
}
export interface TimelineEventFinishReason extends TimelineEventBase {
    type: 'finish_reason';
    finish_reason: string;
    source: 'message_done' | 'turn_end' | 'agent_end';
}
export interface TimelineEventTurnSummary extends TimelineEventBase {
    type: 'turn_summary';
    turn_index: number;
    token_usage?: TimelineTokenUsage;
    finish_reason?: string;
    text_content?: string;
    context_pct?: number;
    context_health?: 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL';
}
export interface TimelineEventCompaction extends TimelineEventBase {
    type: 'compaction';
    phase: 'start' | 'end';
    tokens_before?: number;
    summary?: string;
    first_kept_entry_id?: string;
}
export interface TimelineEventRetry extends TimelineEventBase {
    type: 'retry';
    phase: 'start' | 'end';
    attempt?: number;
    max_attempts?: number;
    delay_ms?: number;
    error_message?: string;
}
export interface TimelineEventModelChange extends TimelineEventBase {
    type: 'model_change';
    action: 'set_model' | 'cycle_model';
    model?: string;
    previous_model?: string;
}
export interface TimelineEventExtensionError extends TimelineEventBase {
    type: 'extension_error';
    extension?: string;
    error_message?: string;
}
export interface TimelineEventApiError extends TimelineEventBase {
    type: 'error';
    source: 'rpc' | 'stderr';
    error_message: string;
}
export interface TimelineEventAutoCommit extends TimelineEventBase {
    type: 'auto_commit_success' | 'auto_commit_skipped' | 'auto_commit_failed';
    reason?: string;
    commit_sha?: string;
    committed_files?: string[];
}
/**
 * Legacy completion events that still exist in older jobs.
 * These are accepted for backward compatibility while feed v2 migrates history.
 */
export interface TimelineEventLegacyComplete extends TimelineEventBase {
    type: 'done' | 'agent_end';
    elapsed_s?: number;
}
/**
 * Union of all timeline event types.
 * This is the canonical type for events.jsonl records.
 */
export type TimelineEvent = TimelineEventRunStart | TimelineEventMeta | TimelineEventThinking | TimelineEventTool | TimelineEventText | TimelineEventMessage | TimelineEventTurn | TimelineEventStatusChange | TimelineEventRunComplete | TimelineEventStaleWarning | TimelineEventTokenUsage | TimelineEventFinishReason | TimelineEventTurnSummary | TimelineEventCompaction | TimelineEventRetry | TimelineEventModelChange | TimelineEventExtensionError | TimelineEventApiError | TimelineEventAutoCommit | TimelineEventLegacyComplete;
export declare const TIMELINE_EVENT_TYPES: {
    readonly RUN_START: "run_start";
    readonly META: "meta";
    readonly THINKING: "thinking";
    readonly TOOL: "tool";
    readonly TEXT: "text";
    readonly MESSAGE: "message";
    readonly TURN: "turn";
    readonly STATUS_CHANGE: "status_change";
    readonly RUN_COMPLETE: "run_complete";
    readonly STALE_WARNING: "stale_warning";
    readonly TOKEN_USAGE: "token_usage";
    readonly FINISH_REASON: "finish_reason";
    readonly TURN_SUMMARY: "turn_summary";
    readonly COMPACTION: "compaction";
    readonly RETRY: "retry";
    readonly MODEL_CHANGE: "model_change";
    readonly EXTENSION_ERROR: "extension_error";
    readonly ERROR: "error";
    readonly AUTO_COMMIT_SUCCESS: "auto_commit_success";
    readonly AUTO_COMMIT_SKIPPED: "auto_commit_skipped";
    readonly AUTO_COMMIT_FAILED: "auto_commit_failed";
    readonly DONE: "done";
    readonly AGENT_END: "agent_end";
};
export declare function mapCallbackEventToTimelineEvent(callbackEvent: string, context: {
    tool?: string;
    toolCallId?: string;
    isError?: boolean;
    args?: Record<string, unknown>;
    resultContent?: string;
    resultRaw?: Record<string, unknown>;
    charCount?: number;
    compaction?: {
        tokensBefore?: number;
        summary?: string;
        firstKeptEntryId?: string;
    };
    retry?: {
        attempt?: number;
        maxAttempts?: number;
        delayMs?: number;
        errorMessage?: string;
    };
    modelChange?: {
        action: 'set_model' | 'cycle_model';
        model?: string;
        previousModel?: string;
    };
    extensionError?: {
        extension?: string;
        errorMessage?: string;
    };
    apiError?: {
        source: 'rpc' | 'stderr';
        errorMessage: string;
    };
    memoryInjection?: {
        static_tokens: number;
        memory_tokens: number;
        gitnexus_tokens: number;
        total_tokens: number;
    };
    metaPayload?: {
        model?: string;
        backend?: string;
        source?: string;
        data?: Record<string, unknown>;
    };
}): TimelineEvent | null;
/**
 * Create a run_start event.
 */
export declare function createRunStartEvent(specialist: string, beadId?: string, startupSnapshot?: TimelineEventRunStart['startup_snapshot']): TimelineEventRunStart;
/**
 * Create a meta event.
 */
export declare function createMetaEvent(model: string, backend: string): TimelineEventMeta;
/**
 * Create a stale_warning event.
 * Emitted when stuck detection thresholds are crossed.
 */
export declare function createStatusChangeEvent(status: TimelineEventStatusChange['status'], previousStatus?: TimelineEventStatusChange['previous_status']): TimelineEventStatusChange;
export declare function createStaleWarningEvent(reason: TimelineEventStaleWarning['reason'], options: {
    silence_ms: number;
    threshold_ms: number;
    tool?: string;
}): TimelineEventStaleWarning;
export declare function createTokenUsageEvent(token_usage: TimelineTokenUsage, source: 'message_done' | 'turn_end' | 'agent_end'): TimelineEventTokenUsage;
export declare function createFinishReasonEvent(finish_reason: string, source: 'message_done' | 'turn_end' | 'agent_end'): TimelineEventFinishReason;
export declare function createTurnSummaryEvent(turn_index: number, token_usage?: TimelineTokenUsage, finish_reason?: string, textContent?: string, contextPct?: number, contextHealth?: 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL'): TimelineEventTurnSummary;
export declare function createCompactionEvent(phase: 'start' | 'end', options?: {
    tokensBefore?: number;
    summary?: string;
    firstKeptEntryId?: string;
}): TimelineEventCompaction;
export declare function createRetryEvent(phase: 'start' | 'end', options?: {
    attempt?: number;
    maxAttempts?: number;
    delayMs?: number;
    errorMessage?: string;
}): TimelineEventRetry;
/**
 * Create a run_complete event.
 * THE CANONICAL COMPLETION EVENT.
 */
export declare function createRunCompleteEvent(status: 'COMPLETE' | 'ERROR' | 'CANCELLED', elapsed_s: number, options?: {
    model?: string;
    backend?: string;
    bead_id?: string;
    error?: string;
    output?: string;
    token_usage?: TimelineTokenUsage;
    finish_reason?: string;
    tool_calls?: string[];
    exit_reason?: string;
    metrics?: TimelineRunMetrics;
    gitnexus_summary?: {
        files_touched: string[];
        symbols_analyzed: string[];
        highest_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        tool_invocations: number;
    };
}): TimelineEventRunComplete;
export declare function createAutoCommitEvent(status: 'success' | 'skipped' | 'failed', options?: {
    reason?: string;
    commit_sha?: string;
    committed_files?: string[];
}): TimelineEventAutoCommit;
/**
 * Parse a timeline event from an events.jsonl line.
 * Returns null for malformed or unknown event types.
 */
export declare function parseTimelineEvent(line: string): TimelineEvent | null;
/**
 * Check if an event is the canonical completion event.
 */
export declare function isRunCompleteEvent(event: TimelineEvent): event is TimelineEventRunComplete;
/**
 * Check if an event represents tool activity.
 */
export declare function isToolEvent(event: TimelineEvent): event is TimelineEventTool;
/**
 * Compare two timeline events by timestamp for sorting.
 * Earlier events come first (ascending order).
 *
 * For events with identical timestamps, the order is preserved (stable sort).
 */
export declare function compareTimelineEvents(a: TimelineEvent, b: TimelineEvent): number;
/**
 * Merge timeline events from multiple jobs into a single chronological stream.
 * Events are sorted by timestamp ascending.
 *
 * @param eventBatches - Array of { jobId, events } objects
 * @returns Merged and sorted events with job attribution
 */
export declare function mergeTimelineEvents(eventBatches: Array<{
    jobId: string;
    specialist: string;
    events: TimelineEvent[];
}>): Array<{
    jobId: string;
    specialist: string;
    event: TimelineEvent;
}>;
/**
 * ## What to persist (events.jsonl)
 *
 * For feed v2, persist these event types only:
 *
 * 1. `run_start` - once per job
 * 2. `meta` - once when model/backend known
 * 3. `thinking` - once if reasoning detected
 * 4. `tool` - per tool start/end
 * 5. `text` - once if text output detected
 * 6. `run_complete` - ONCE per job (canonical completion)
 *
 * Do NOT persist:
 * - `done` (legacy, ambiguous)
 * - `agent_end` (replaced by run_complete)
 * - Streaming deltas (text_delta, thinking_delta, toolcall_delta)
 *
 * ## What to read from status.json
 *
 * status.json provides live mutable state:
 * - current_event, current_tool (for in-progress jobs)
 * - status (starting | running | done | error)
 * - elapsed_s, last_event_at_ms
 * - bead_id
 * - error message
 *
 * For completed jobs, events.jsonl is the source of truth.
 * status.json may be consulted for real-time state.
 *
 * ## What to read from result.txt
 *
 * result.txt contains the final assistant output text.
 * It is NOT part of the event timeline.
 * Use it for result display, not for timeline rendering.
 *
 * ## Completion semantic (repeated for emphasis)
 *
 * There is ONE canonical completion event: `run_complete`.
 * It replaces both:
 * - legacy callback-level `done`
 * - persisted `agent_end`
 *
 * When updating Supervisor to use this model:
 * 1. Remove 'done' from LOGGED_EVENTS
 * 2. Add run_complete emission instead of agent_end
 * 3. Include status, elapsed_s, model, backend, bead_id, error in run_complete
 */ 
//# sourceMappingURL=timeline-events.d.ts.map