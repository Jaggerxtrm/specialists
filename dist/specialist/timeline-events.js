// src/specialist/timeline-events.ts
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
// ============================================================================
// EVENT TYPE CONSTANTS
// ============================================================================
export const TIMELINE_EVENT_TYPES = {
    RUN_START: 'run_start',
    META: 'meta',
    THINKING: 'thinking',
    TOOL: 'tool',
    TEXT: 'text',
    MESSAGE: 'message',
    TURN: 'turn',
    STATUS_CHANGE: 'status_change',
    RUN_COMPLETE: 'run_complete',
    STALE_WARNING: 'stale_warning',
    TOKEN_USAGE: 'token_usage',
    FINISH_REASON: 'finish_reason',
    TURN_SUMMARY: 'turn_summary',
    COMPACTION: 'compaction',
    RETRY: 'retry',
    MODEL_CHANGE: 'model_change',
    EXTENSION_ERROR: 'extension_error',
    ERROR: 'error',
    AUTO_COMMIT_SUCCESS: 'auto_commit_success',
    AUTO_COMMIT_SKIPPED: 'auto_commit_skipped',
    AUTO_COMMIT_FAILED: 'auto_commit_failed',
    DONE: 'done',
    AGENT_END: 'agent_end',
};
// ============================================================================
// MAPPING FROM RPC/CALLBACK EVENTS TO TIMELINE EVENTS
// ============================================================================
/**
 * Maps PiAgentSession callback event types to timeline event types.
 *
 * Canonical callback events (post unitAI-4rn fix):
 * - 'thinking'              -> TIMELINE_EVENT_TYPES.THINKING
 * - 'toolcall'              -> TIMELINE_EVENT_TYPES.TOOL (phase: start)
 * - 'tool_execution_start'  -> TIMELINE_EVENT_TYPES.TOOL (phase: start)
 * - 'tool_execution_update' -> TIMELINE_EVENT_TYPES.TOOL (phase: update)
 * - 'tool_execution_end'    -> TIMELINE_EVENT_TYPES.TOOL (phase: end)
 * - 'text'                  -> TIMELINE_EVENT_TYPES.TEXT
 * - 'message_start_*'       -> TIMELINE_EVENT_TYPES.MESSAGE
 * - 'message_end_*'         -> TIMELINE_EVENT_TYPES.MESSAGE
 * - 'turn_start/turn_end'   -> TIMELINE_EVENT_TYPES.TURN
 * - 'agent_end'             -> IGNORED (run-level completion handled as run_complete by supervisor)
 * - 'message_done'          -> IGNORED (message-level completion, not persisted to timeline)
 * - 'done'                  -> IGNORED (legacy name for agent_end, kept for safety)
 */
const TOOL_RESULT_SUMMARY_LIMIT = 500;
function summarizeToolResult(resultContent) {
    if (!resultContent)
        return undefined;
    const compact = resultContent.trim();
    if (!compact)
        return undefined;
    if (compact.length <= TOOL_RESULT_SUMMARY_LIMIT)
        return compact;
    return `${compact.slice(0, TOOL_RESULT_SUMMARY_LIMIT)}…`;
}
export function mapCallbackEventToTimelineEvent(callbackEvent, context) {
    const t = Date.now();
    switch (callbackEvent) {
        case 'thinking':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.THINKING,
                ...(context.charCount !== undefined ? { char_count: context.charCount } : {}),
            };
        case 'tool_execution_start':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.TOOL,
                tool: context.tool ?? 'unknown',
                phase: 'start',
                tool_call_id: context.toolCallId,
                ...(context.toolCallId ? {} : { uncorrelated: true }),
                args: context.args,
                started_at: new Date(t).toISOString(),
            };
        case 'tool_execution_update':
        case 'tool_execution':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.TOOL,
                tool: context.tool ?? 'unknown',
                phase: 'update',
                tool_call_id: context.toolCallId,
                ...(context.toolCallId ? {} : { uncorrelated: true }),
            };
        case 'tool_execution_end': {
            // Tool execution completed
            const resultSummary = summarizeToolResult(context.resultContent);
            return {
                t,
                type: TIMELINE_EVENT_TYPES.TOOL,
                tool: context.tool ?? 'unknown',
                phase: 'end',
                tool_call_id: context.toolCallId,
                ...(context.toolCallId ? {} : { uncorrelated: true }),
                is_error: context.isError,
                ...(resultSummary ? { result_summary: resultSummary } : {}),
                ...(context.resultRaw ? { result_raw: context.resultRaw } : {}),
            };
        }
        case 'message_start_assistant':
            return { t, type: TIMELINE_EVENT_TYPES.MESSAGE, phase: 'start', role: 'assistant' };
        case 'message_end_assistant':
            return { t, type: TIMELINE_EVENT_TYPES.MESSAGE, phase: 'end', role: 'assistant' };
        case 'message_start_tool_result':
            return { t, type: TIMELINE_EVENT_TYPES.MESSAGE, phase: 'start', role: 'toolResult' };
        case 'message_end_tool_result':
            return { t, type: TIMELINE_EVENT_TYPES.MESSAGE, phase: 'end', role: 'toolResult' };
        case 'turn_start':
            return { t, type: TIMELINE_EVENT_TYPES.TURN, phase: 'start' };
        case 'turn_end':
            return { t, type: TIMELINE_EVENT_TYPES.TURN, phase: 'end' };
        case 'auto_compaction_start':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.COMPACTION,
                phase: 'start',
                ...(context.compaction?.tokensBefore !== undefined ? { tokens_before: context.compaction.tokensBefore } : {}),
                ...(context.compaction?.summary ? { summary: context.compaction.summary } : {}),
                ...(context.compaction?.firstKeptEntryId ? { first_kept_entry_id: context.compaction.firstKeptEntryId } : {}),
            };
        case 'auto_compaction_end':
        case 'auto_compaction':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.COMPACTION,
                phase: 'end',
                ...(context.compaction?.tokensBefore !== undefined ? { tokens_before: context.compaction.tokensBefore } : {}),
                ...(context.compaction?.summary ? { summary: context.compaction.summary } : {}),
                ...(context.compaction?.firstKeptEntryId ? { first_kept_entry_id: context.compaction.firstKeptEntryId } : {}),
            };
        case 'auto_retry_start':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.RETRY,
                phase: 'start',
                ...(context.retry?.attempt !== undefined ? { attempt: context.retry.attempt } : {}),
                ...(context.retry?.maxAttempts !== undefined ? { max_attempts: context.retry.maxAttempts } : {}),
                ...(context.retry?.delayMs !== undefined ? { delay_ms: context.retry.delayMs } : {}),
                ...(context.retry?.errorMessage ? { error_message: context.retry.errorMessage } : {}),
            };
        case 'auto_retry_end':
        case 'auto_retry':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.RETRY,
                phase: 'end',
                ...(context.retry?.attempt !== undefined ? { attempt: context.retry.attempt } : {}),
                ...(context.retry?.maxAttempts !== undefined ? { max_attempts: context.retry.maxAttempts } : {}),
                ...(context.retry?.delayMs !== undefined ? { delay_ms: context.retry.delayMs } : {}),
                ...(context.retry?.errorMessage ? { error_message: context.retry.errorMessage } : {}),
            };
        case 'set_model':
        case 'cycle_model':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.MODEL_CHANGE,
                action: callbackEvent,
                ...(context.modelChange?.model ? { model: context.modelChange.model } : {}),
                ...(context.modelChange?.previousModel ? { previous_model: context.modelChange.previousModel } : {}),
            };
        case 'extension_error':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.EXTENSION_ERROR,
                ...(context.extensionError?.extension ? { extension: context.extensionError.extension } : {}),
                ...(context.extensionError?.errorMessage ? { error_message: context.extensionError.errorMessage } : {}),
            };
        case 'api_error':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.ERROR,
                source: context.apiError?.source ?? 'rpc',
                error_message: context.apiError?.errorMessage ?? 'Unknown API error',
            };
        case 'memory_injection':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.META,
                model: 'memory_injection',
                backend: 'injected',
                ...(context.memoryInjection ? { memory_injection: context.memoryInjection } : {}),
            };
        case 'meta': {
            const payload = context.metaPayload;
            return {
                t,
                type: TIMELINE_EVENT_TYPES.META,
                model: payload?.model ?? 'meta',
                backend: payload?.backend ?? 'injected',
                ...(payload?.source ? { source: payload.source } : {}),
                ...(payload?.data ? { data: payload.data } : {}),
            };
        }
        case 'text':
            return {
                t,
                type: TIMELINE_EVENT_TYPES.TEXT,
                ...(context.charCount !== undefined ? { char_count: context.charCount } : {}),
            };
        case 'agent_end':
        case 'message_done':
        case 'done':
            // IGNORE on the write path: supervisor emits run_complete instead.
            // Legacy 'done' kept for safety; 'agent_end' is the post-unitAI-4rn name.
            return null;
        default:
            // Unknown callback event - don't persist
            return null;
    }
}
// ============================================================================
// TIMELINE EVENT CONSTRUCTORS
// ============================================================================
/**
 * Create a run_start event.
 */
export function createRunStartEvent(specialist, beadId, startupSnapshot) {
    return {
        t: Date.now(),
        type: TIMELINE_EVENT_TYPES.RUN_START,
        specialist,
        bead_id: beadId,
        ...(startupSnapshot ? { startup_snapshot: startupSnapshot } : {}),
    };
}
/**
 * Create a meta event.
 */
export function createMetaEvent(model, backend) {
    return {
        t: Date.now(),
        type: TIMELINE_EVENT_TYPES.META,
        model,
        backend,
    };
}
/**
 * Create a stale_warning event.
 * Emitted when stuck detection thresholds are crossed.
 */
export function createStatusChangeEvent(status, previousStatus) {
    return {
        t: Date.now(),
        type: TIMELINE_EVENT_TYPES.STATUS_CHANGE,
        status,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
    };
}
export function createStaleWarningEvent(reason, options) {
    return {
        t: Date.now(),
        type: TIMELINE_EVENT_TYPES.STALE_WARNING,
        reason,
        silence_ms: options.silence_ms,
        threshold_ms: options.threshold_ms,
        ...(options.tool !== undefined ? { tool: options.tool } : {}),
    };
}
export function createTokenUsageEvent(token_usage, source) {
    return {
        t: Date.now(),
        type: TIMELINE_EVENT_TYPES.TOKEN_USAGE,
        token_usage,
        source,
    };
}
export function createFinishReasonEvent(finish_reason, source) {
    return {
        t: Date.now(),
        type: TIMELINE_EVENT_TYPES.FINISH_REASON,
        finish_reason,
        source,
    };
}
export function createTurnSummaryEvent(turn_index, token_usage, finish_reason, textContent, contextPct, contextHealth) {
    return {
        t: Date.now(),
        type: TIMELINE_EVENT_TYPES.TURN_SUMMARY,
        turn_index,
        ...(token_usage ? { token_usage } : {}),
        ...(finish_reason ? { finish_reason } : {}),
        ...(textContent ? { text_content: textContent } : {}),
        ...(contextPct !== undefined ? { context_pct: contextPct } : {}),
        ...(contextHealth ? { context_health: contextHealth } : {}),
    };
}
export function createCompactionEvent(phase, options) {
    return {
        t: Date.now(),
        type: TIMELINE_EVENT_TYPES.COMPACTION,
        phase,
        ...(options?.tokensBefore !== undefined ? { tokens_before: options.tokensBefore } : {}),
        ...(options?.summary ? { summary: options.summary } : {}),
        ...(options?.firstKeptEntryId ? { first_kept_entry_id: options.firstKeptEntryId } : {}),
    };
}
export function createRetryEvent(phase, options) {
    return {
        t: Date.now(),
        type: TIMELINE_EVENT_TYPES.RETRY,
        phase,
        ...(options?.attempt !== undefined ? { attempt: options.attempt } : {}),
        ...(options?.maxAttempts !== undefined ? { max_attempts: options.maxAttempts } : {}),
        ...(options?.delayMs !== undefined ? { delay_ms: options.delayMs } : {}),
        ...(options?.errorMessage ? { error_message: options.errorMessage } : {}),
    };
}
/**
 * Create a run_complete event.
 * THE CANONICAL COMPLETION EVENT.
 */
export function createRunCompleteEvent(status, elapsed_s, options) {
    return {
        t: Date.now(),
        type: TIMELINE_EVENT_TYPES.RUN_COMPLETE,
        status,
        elapsed_s,
        ...options,
    };
}
export function createAutoCommitEvent(status, options) {
    const type = status === 'success'
        ? TIMELINE_EVENT_TYPES.AUTO_COMMIT_SUCCESS
        : status === 'skipped'
            ? TIMELINE_EVENT_TYPES.AUTO_COMMIT_SKIPPED
            : TIMELINE_EVENT_TYPES.AUTO_COMMIT_FAILED;
    return {
        t: Date.now(),
        type,
        ...(options?.reason ? { reason: options.reason } : {}),
        ...(options?.commit_sha ? { commit_sha: options.commit_sha } : {}),
        ...(options?.committed_files ? { committed_files: options.committed_files } : {}),
    };
}
// ============================================================================
// PARSING HELPERS
// ============================================================================
/**
 * Parse a timeline event from an events.jsonl line.
 * Returns null for malformed or unknown event types.
 */
export function parseTimelineEvent(line) {
    try {
        const parsed = JSON.parse(line);
        if (!parsed || typeof parsed !== 'object')
            return null;
        if (typeof parsed.t !== 'number')
            return null;
        if (typeof parsed.type !== 'string')
            return null;
        if (parsed.type === TIMELINE_EVENT_TYPES.DONE) {
            return {
                t: parsed.t,
                type: TIMELINE_EVENT_TYPES.DONE,
                elapsed_s: typeof parsed.elapsed_s === 'number' ? parsed.elapsed_s : undefined,
            };
        }
        if (parsed.type === TIMELINE_EVENT_TYPES.AGENT_END) {
            return {
                t: parsed.t,
                type: TIMELINE_EVENT_TYPES.AGENT_END,
                elapsed_s: typeof parsed.elapsed_s === 'number' ? parsed.elapsed_s : undefined,
            };
        }
        // Validate against canonical types
        const knownTypes = Object.values(TIMELINE_EVENT_TYPES)
            .filter((type) => type !== TIMELINE_EVENT_TYPES.DONE && type !== TIMELINE_EVENT_TYPES.AGENT_END);
        if (!knownTypes.includes(parsed.type))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
/**
 * Check if an event is the canonical completion event.
 */
export function isRunCompleteEvent(event) {
    return event.type === TIMELINE_EVENT_TYPES.RUN_COMPLETE;
}
/**
 * Check if an event represents tool activity.
 */
export function isToolEvent(event) {
    return event.type === TIMELINE_EVENT_TYPES.TOOL;
}
// ============================================================================
// ORDERING SEMANTICS
// ============================================================================
/**
 * Compare two timeline events by timestamp for sorting.
 * Earlier events come first (ascending order).
 *
 * For events with identical timestamps, the order is preserved (stable sort).
 */
export function compareTimelineEvents(a, b) {
    const timeDiff = a.t - b.t;
    if (timeDiff !== 0)
        return timeDiff;
    return (a.seq ?? 0) - (b.seq ?? 0);
}
/**
 * Merge timeline events from multiple jobs into a single chronological stream.
 * Events are sorted by timestamp ascending.
 *
 * @param eventBatches - Array of { jobId, events } objects
 * @returns Merged and sorted events with job attribution
 */
export function mergeTimelineEvents(eventBatches) {
    const merged = [];
    for (const batch of eventBatches) {
        for (const event of batch.events) {
            merged.push({
                jobId: batch.jobId,
                specialist: batch.specialist,
                event,
            });
        }
    }
    // Sort globally by (t, job_id, seq)
    merged.sort((a, b) => {
        const timeDiff = a.event.t - b.event.t;
        if (timeDiff !== 0)
            return timeDiff;
        const jobDiff = a.jobId.localeCompare(b.jobId);
        if (jobDiff !== 0)
            return jobDiff;
        return (a.event.seq ?? 0) - (b.event.seq ?? 0);
    });
    return merged;
}
// ============================================================================
// FEED V2 DESIGN NOTES (for implementers)
// ============================================================================
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
//# sourceMappingURL=timeline-events.js.map