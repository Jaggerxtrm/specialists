// src/tools/specialist/feed_specialist.tool.ts
import * as z from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJobEventsById, isJobComplete } from '../../specialist/timeline-query.js';
import { createObservabilitySqliteClient } from '../../specialist/observability-sqlite.js';
import { formatSpecialistModel } from '../../specialist/model-display.js';
import { detectJobOutputMode } from '../../cli/status.js';

export const feedSpecialistSchema = z.object({
  job_id: z.string().describe('Job ID printed by specialists run'),
  cursor: z.number().int().min(0).optional().default(0).describe(
    'Event index offset from previous call. Pass next_cursor from the last response to receive only new events. Omit (or pass 0) for the first call.',
  ),
  limit: z.number().int().min(1).max(100).optional().default(50).describe(
    'Maximum number of events to return per call.',
  ),
});

export function createFeedSpecialistTool(jobsDir: string) {
  return {
    name: 'feed_specialist' as const,
    description:
      'Read cursor-paginated timeline events from DB-backed specialist job state. ' +
      'Legacy file reads exist only for operator/debug fallback. ' +
      'Returns structured event objects (run_start, meta, tool, text, run_complete, etc.) ' +
      'with job metadata (status, specialist, model, bead_id). ' +
      'Poll incrementally: pass next_cursor from each response as cursor on the next call. ' +
      'When is_complete=true and has_more=false, the job is fully observed. ' +
      'Use for structured event inspection; use specialists result <job-id> for final text output.',
    inputSchema: feedSpecialistSchema,
    async execute(input: z.infer<typeof feedSpecialistSchema>) {
      const { job_id, cursor = 0, limit = 50 } = input;

      const sqliteClient = createObservabilitySqliteClient();
      // Read job metadata from DB first, file fallback only when file output is on.
      const statusPath = join(jobsDir, job_id, 'status.json');
      const statusRecord = sqliteClient?.readStatus(job_id);
      if (!statusRecord && !existsSync(statusPath)) {
        return { error: `Job not found: ${job_id}`, job_id };
      }

      let status = statusRecord?.status ?? 'unknown';
      let specialist = statusRecord?.specialist ?? 'unknown';
      let model: string | undefined = statusRecord?.model;
      let bead_id: string | undefined = statusRecord?.bead_id;
      let metrics: Record<string, unknown> | undefined = statusRecord?.metrics as Record<string, unknown> | undefined;
      if (!statusRecord && detectJobOutputMode() === 'on' && existsSync(statusPath)) {
        try {
          const s = JSON.parse(readFileSync(statusPath, 'utf-8'));
          status = s.status ?? 'unknown';
          specialist = s.specialist ?? 'unknown';
          model = s.model;
          bead_id = s.bead_id;
          metrics = typeof s.metrics === 'object' && s.metrics !== null
            ? s.metrics as Record<string, unknown>
            : undefined;
        } catch {
          // status.json unreadable — continue with defaults
        }
      }

      const dbEvents = sqliteClient?.readEvents(job_id);
      const allEvents = (dbEvents && dbEvents.length > 0)
        ? dbEvents
        : (detectJobOutputMode() === 'on' ? readJobEventsById(jobsDir, job_id) : (dbEvents ?? []));
      const total = allEvents.length;

      // Apply cursor + limit slice
      const sliced = allEvents.slice(cursor, cursor + limit);
      const next_cursor = cursor + sliced.length;
      const has_more = next_cursor < total;
      const is_complete = isJobComplete(allEvents);

      return {
        job_id,
        specialist,
        specialist_model: formatSpecialistModel(specialist, model),
        ...(model !== undefined ? { model } : {}),
        status,
        ...(bead_id !== undefined ? { bead_id } : {}),
        ...(metrics !== undefined ? { metrics } : {}),
        events: sliced,
        cursor,
        next_cursor,
        has_more,
        is_complete,
      };
    },
  };
}
