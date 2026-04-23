/**
 * Timeline Query Primitives for Feed v2
 *
 * Read and merge timeline events across multiple jobs while keeping the flat-file
 * hot path architecture intact.
 *
 * ## Architecture
 *
 * - Each job stores events in `.specialists/jobs/<id>/events.jsonl`
 * - This module reads those files and provides query/merge operations
 * - No database — direct file reads with efficient streaming
 *
 * ## Usage
 *
 * ```typescript
 * import { readJobEvents, mergeTimelineEvents } from './timeline-query.js';
 *
 * // Read events from a single job
 * const events = readJobEvents('.specialists/jobs/abc123');
 *
 * // Merge events from multiple jobs chronologically
 * const merged = mergeTimelineEvents([
 *   { jobId: 'abc123', specialist: 'code-review', events: events1 },
 *   { jobId: 'def456', specialist: 'bug-hunt', events: events2 },
 * ]);
 * ```
 */
import { type TimelineEvent } from './timeline-events.js';
/**
 * Read all timeline events from a single job's events.jsonl file.
 * Returns events in chronological order (oldest first).
 * Skips malformed lines non-fatally.
 */
export declare function readJobEvents(jobDir: string): TimelineEvent[];
/**
 * Read timeline events from a job by ID within a jobs directory.
 */
export declare function readJobEventsById(jobsDir: string, jobId: string): TimelineEvent[];
export interface JobEventsBatch {
    jobId: string;
    specialist: string;
    beadId?: string;
    events: TimelineEvent[];
}
/**
 * Read events from all jobs in a jobs directory.
 * Returns batches unsorted — use mergeTimelineEvents for chronological order.
 */
export declare function readAllJobEvents(jobsDir: string): JobEventsBatch[];
/**
 * Merge timeline events from multiple jobs into a single chronological stream.
 * Events are sorted by timestamp ascending (oldest first).
 */
export declare function mergeTimelineEvents(batches: JobEventsBatch[]): Array<{
    jobId: string;
    specialist: string;
    beadId?: string;
    event: TimelineEvent;
}>;
/**
 * Filter options for timeline queries.
 */
export interface TimelineFilter {
    /** Minimum timestamp (inclusive) */
    since?: number;
    /** Maximum number of events to return */
    limit?: number;
    /** Filter by job ID */
    jobId?: string;
    /** Filter by specialist name */
    specialist?: string;
}
/**
 * Apply filters to a merged timeline.
 */
export declare function filterTimelineEvents(merged: Array<{
    jobId: string;
    specialist: string;
    beadId?: string;
    event: TimelineEvent;
}>, filter: TimelineFilter): Array<{
    jobId: string;
    specialist: string;
    beadId?: string;
    event: TimelineEvent;
}>;
/**
 * Convenience: read, merge, and filter in one call.
 */
export declare function queryTimeline(jobsDir: string, filter?: TimelineFilter): Array<{
    jobId: string;
    specialist: string;
    beadId?: string;
    event: TimelineEvent;
}>;
/**
 * Get events from the last N minutes.
 * Useful for feed v2's default snapshot window before follow mode.
 */
export declare function getRecentEvents(jobsDir: string, minutesAgo?: number, limit?: number): Array<{
    jobId: string;
    specialist: string;
    beadId?: string;
    event: TimelineEvent;
}>;
/**
 * Check if a job has completed (has run_complete event).
 */
export declare function isJobComplete(events: TimelineEvent[]): boolean;
/**
 * Get the completion status of a job from its events.
 * Returns null if not complete.
 */
export declare function getJobCompletionStatus(events: TimelineEvent[]): {
    status: 'COMPLETE' | 'ERROR' | 'CANCELLED';
    elapsed_s: number;
    error?: string;
    metrics?: Record<string, unknown>;
} | null;
/**
 * Get tool activity summary from events.
 * Returns array of { tool, start_t, end_t } pairs.
 */
export declare function getToolActivity(events: TimelineEvent[]): Array<{
    tool: string;
    start_t: number;
    end_t?: number;
}>;
//# sourceMappingURL=timeline-query.d.ts.map