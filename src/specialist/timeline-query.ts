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
import {
  type TimelineEvent,
  parseTimelineEvent,
  compareTimelineEvents,
} from './timeline-events.js';
import { createObservabilitySqliteClient } from './observability-sqlite.js';

// ============================================================================
// SINGLE JOB READING
// ============================================================================

/**
 * Read all timeline events from a single job's events.jsonl file.
 * Returns events in chronological order (oldest first).
 * Skips malformed lines non-fatally.
 */
export function readJobEvents(jobDir: string): TimelineEvent[] {
  const jobId = basename(jobDir);
  try {
    const sqliteEvents = createObservabilitySqliteClient()?.readEvents(jobId) ?? [];
    if (sqliteEvents.length > 0) {
      sqliteEvents.sort(compareTimelineEvents);
      return sqliteEvents;
    }
  } catch {
    // fallback to file-based timeline
  }

  const eventsPath = join(jobDir, 'events.jsonl');
  if (!existsSync(eventsPath)) return [];

  const content = readFileSync(eventsPath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);

  const events: TimelineEvent[] = [];
  for (const line of lines) {
    const event = parseTimelineEvent(line);
    if (event) events.push(event);
  }

  // Already in chronological order (append-only), but sort for safety
  events.sort(compareTimelineEvents);
  return events;
}

/**
 * Read timeline events from a job by ID within a jobs directory.
 */
export function readJobEventsById(jobsDir: string, jobId: string): TimelineEvent[] {
  return readJobEvents(join(jobsDir, jobId));
}

// ============================================================================
// MULTI-JOB QUERYING
// ============================================================================

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
export function readAllJobEvents(jobsDir: string): JobEventsBatch[] {
  if (!existsSync(jobsDir)) return [];

  const batches: JobEventsBatch[] = [];
  const entries = readdirSync(jobsDir);

  for (const entry of entries) {
    const jobDir = join(jobsDir, entry);
    try {
      const stat = require('node:fs').statSync(jobDir);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    const jobId = entry;
    const statusPath = join(jobDir, 'status.json');

    // Read specialist name from status.json
    let specialist = 'unknown';
    let beadId: string | undefined;
    if (existsSync(statusPath)) {
      try {
        const status = JSON.parse(readFileSync(statusPath, 'utf-8'));
        specialist = status.specialist ?? 'unknown';
        beadId = status.bead_id;
      } catch {
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
export function mergeTimelineEvents(
  batches: JobEventsBatch[]
): Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }> {
  const merged: Array<{
    jobId: string;
    specialist: string;
    beadId?: string;
    event: TimelineEvent;
  }> = [];

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

  // Sort by timestamp ascending
  merged.sort((a, b) => compareTimelineEvents(a.event, b.event));

  return merged;
}

// ============================================================================
// FILTERING
// ============================================================================

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
export function filterTimelineEvents(
  merged: Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }>,
  filter: TimelineFilter
): Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }> {
  let result = merged;

  if (filter.since !== undefined) {
    result = result.filter(({ event }) => event.t >= filter.since!);
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
export function queryTimeline(
  jobsDir: string,
  filter: TimelineFilter = {}
): Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }> {
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
export function getRecentEvents(
  jobsDir: string,
  minutesAgo: number = 5,
  limit: number = 100
): Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }> {
  const since = Date.now() - minutesAgo * 60 * 1000;
  return queryTimeline(jobsDir, { since, limit });
}

// ============================================================================
// JOB LIFECYCLE HELPERS
// ============================================================================

/**
 * Check if a job has completed (has run_complete event).
 */
export function isJobComplete(events: TimelineEvent[]): boolean {
  return events.some((e) => e.type === 'run_complete');
}

/**
 * Get the completion status of a job from its events.
 * Returns null if not complete.
 */
export function getJobCompletionStatus(
  events: TimelineEvent[]
): { status: 'COMPLETE' | 'ERROR' | 'CANCELLED'; elapsed_s: number; error?: string; metrics?: Record<string, unknown> } | null {
  const completeEvent = events.find((e) => e.type === 'run_complete');
  if (!completeEvent || completeEvent.type !== 'run_complete') return null;

  return {
    status: completeEvent.status,
    elapsed_s: completeEvent.elapsed_s,
    error: completeEvent.error,
    metrics: completeEvent.metrics as Record<string, unknown> | undefined,
  };
}

/**
 * Get tool activity summary from events.
 * Returns array of { tool, start_t, end_t } pairs.
 */
export function getToolActivity(
  events: TimelineEvent[]
): Array<{ tool: string; start_t: number; end_t?: number }> {
  const toolStarts = new Map<string, { start_t: number; tool: string }>();
  const activity: Array<{ tool: string; start_t: number; end_t?: number }> = [];

  for (const event of events) {
    if (event.type !== 'tool') continue;

    const key = event.tool_call_id ?? event.tool;
    if (event.phase === 'start') {
      toolStarts.set(key, { start_t: event.t, tool: event.tool });
    } else if (event.phase === 'end') {
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