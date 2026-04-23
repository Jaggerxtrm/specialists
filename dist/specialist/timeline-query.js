// src/specialist/timeline-query.ts
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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseTimelineEvent, compareTimelineEvents, } from './timeline-events.js';
import { createObservabilitySqliteClient } from './observability-sqlite.js';
// ============================================================================
// SINGLE JOB READING
// ============================================================================
/**
 * Read all timeline events from a single job's events.jsonl file.
 * Returns events in chronological order (oldest first).
 * Skips malformed lines non-fatally.
 */
export function readJobEvents(jobDir) {
    const jobId = basename(jobDir);
    try {
        const sqliteEvents = createObservabilitySqliteClient()?.readEvents(jobId) ?? [];
        if (sqliteEvents.length > 0) {
            sqliteEvents.sort(compareTimelineEvents);
            return sqliteEvents;
        }
    }
    catch {
        // fallback to file-based timeline
    }
    const eventsPath = join(jobDir, 'events.jsonl');
    if (!existsSync(eventsPath))
        return [];
    const content = readFileSync(eventsPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const events = [];
    for (const line of lines) {
        const event = parseTimelineEvent(line);
        if (event)
            events.push(event);
    }
    // Already in chronological order (append-only), but sort for safety
    events.sort(compareTimelineEvents);
    return events;
}
/**
 * Read timeline events from a job by ID within a jobs directory.
 */
export function readJobEventsById(jobsDir, jobId) {
    return readJobEvents(join(jobsDir, jobId));
}
/**
 * Read events from all jobs in a jobs directory.
 * Returns batches unsorted — use mergeTimelineEvents for chronological order.
 */
export function readAllJobEvents(jobsDir) {
    if (!existsSync(jobsDir))
        return [];
    const batches = [];
    const entries = readdirSync(jobsDir);
    for (const entry of entries) {
        const jobDir = join(jobsDir, entry);
        try {
            const stat = require('node:fs').statSync(jobDir);
            if (!stat.isDirectory())
                continue;
        }
        catch {
            continue;
        }
        const jobId = entry;
        const statusPath = join(jobDir, 'status.json');
        // Read specialist name from status.json
        let specialist = 'unknown';
        let beadId;
        if (existsSync(statusPath)) {
            try {
                const status = JSON.parse(readFileSync(statusPath, 'utf-8'));
                specialist = status.specialist ?? 'unknown';
                beadId = status.bead_id;
            }
            catch {
                // ignore
            }
        }
        const events = readJobEvents(jobDir);
        if (events.length > 0) {
            batches.push({ jobId, specialist, beadId, events });
        }
    }
    return batches;
}
/**
 * Merge timeline events from multiple jobs into a single chronological stream.
 * Events are sorted by timestamp ascending (oldest first).
 */
export function mergeTimelineEvents(batches) {
    const merged = [];
    for (const batch of batches) {
        for (const event of batch.events) {
            merged.push({
                jobId: batch.jobId,
                specialist: batch.specialist,
                beadId: batch.beadId,
                event,
            });
        }
    }
    // Sort globally by (t, job_id, seq)
    merged.sort((a, b) => {
        const timeDiff = compareTimelineEvents(a.event, b.event);
        if (timeDiff !== 0)
            return timeDiff;
        const jobDiff = a.jobId.localeCompare(b.jobId);
        if (jobDiff !== 0)
            return jobDiff;
        return (a.event.seq ?? 0) - (b.event.seq ?? 0);
    });
    return merged;
}
/**
 * Apply filters to a merged timeline.
 */
export function filterTimelineEvents(merged, filter) {
    let result = merged;
    if (filter.since !== undefined) {
        result = result.filter(({ event }) => event.t >= filter.since);
    }
    if (filter.jobId !== undefined) {
        result = result.filter(({ jobId }) => jobId === filter.jobId);
    }
    if (filter.specialist !== undefined) {
        result = result.filter(({ specialist }) => specialist === filter.specialist);
    }
    if (filter.limit !== undefined && filter.limit > 0) {
        result = result.slice(-filter.limit);
    }
    return result;
}
/**
 * Convenience: read, merge, and filter in one call.
 */
export function queryTimeline(jobsDir, filter = {}) {
    let batches = readAllJobEvents(jobsDir);
    // Early filter by jobId if specified (avoid reading all jobs)
    if (filter.jobId !== undefined) {
        batches = batches.filter((b) => b.jobId === filter.jobId);
    }
    // Early filter by specialist if specified
    if (filter.specialist !== undefined) {
        batches = batches.filter((b) => b.specialist === filter.specialist);
    }
    const merged = mergeTimelineEvents(batches);
    return filterTimelineEvents(merged, filter);
}
// ============================================================================
// RECENT SNAPSHOT
// ============================================================================
/**
 * Get events from the last N minutes.
 * Useful for feed v2's default snapshot window before follow mode.
 */
export function getRecentEvents(jobsDir, minutesAgo = 5, limit = 100) {
    const since = Date.now() - minutesAgo * 60 * 1000;
    return queryTimeline(jobsDir, { since, limit });
}
// ============================================================================
// JOB LIFECYCLE HELPERS
// ============================================================================
/**
 * Check if a job has completed (has run_complete event).
 */
export function isJobComplete(events) {
    return events.some((e) => e.type === 'run_complete');
}
/**
 * Get the completion status of a job from its events.
 * Returns null if not complete.
 */
export function getJobCompletionStatus(events) {
    const completeEvent = events.find((e) => e.type === 'run_complete');
    if (!completeEvent || completeEvent.type !== 'run_complete')
        return null;
    return {
        status: completeEvent.status,
        elapsed_s: completeEvent.elapsed_s,
        error: completeEvent.error,
        metrics: completeEvent.metrics,
    };
}
/**
 * Get tool activity summary from events.
 * Returns array of { tool, start_t, end_t } pairs.
 */
export function getToolActivity(events) {
    const toolStarts = new Map();
    const activity = [];
    for (const event of events) {
        if (event.type !== 'tool')
            continue;
        const key = event.tool_call_id ?? event.tool;
        if (event.phase === 'start') {
            toolStarts.set(key, { start_t: event.t, tool: event.tool });
        }
        else if (event.phase === 'end') {
            const entry = toolStarts.get(key);
            activity.push({
                tool: event.tool,
                start_t: entry?.start_t ?? event.t,
                end_t: event.t,
            });
            toolStarts.delete(key);
        }
    }
    // Add incomplete tool calls (started but not ended)
    for (const { start_t, tool } of toolStarts.values()) {
        activity.push({ tool, start_t });
    }
    return activity;
}
//# sourceMappingURL=timeline-query.js.map