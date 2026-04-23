// src/tools/specialist/feed_specialist.tool.ts
import * as z from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJobEventsById, isJobComplete } from '../../specialist/timeline-query.js';
import { formatSpecialistModel } from '../../specialist/model-display.js';
export const feedSpecialistSchema = z.object({
    job_id: z.string().describe('Job ID printed by specialists run'),
    cursor: z.number().int().min(0).optional().default(0).describe('Event index offset from previous call. Pass next_cursor from the last response to receive only new events. Omit (or pass 0) for the first call.'),
    limit: z.number().int().min(1).max(100).optional().default(50).describe('Maximum number of events to return per call.'),
});
export function createFeedSpecialistTool(jobsDir) {
    return {
        name: 'feed_specialist',
        description: 'Read cursor-paginated timeline events from a specialist job\'s events.jsonl. ' +
            'Returns structured event objects (run_start, meta, tool, text, run_complete, etc.) ' +
            'with job metadata (status, specialist, model, bead_id). ' +
            'Poll incrementally: pass next_cursor from each response as cursor on the next call. ' +
            'When is_complete=true and has_more=false, the job is fully observed. ' +
            'Use for structured event inspection; use specialists result <job-id> for final text output.',
        inputSchema: feedSpecialistSchema,
        async execute(input) {
            const { job_id, cursor = 0, limit = 50 } = input;
            // Read job metadata from status.json
            const statusPath = join(jobsDir, job_id, 'status.json');
            if (!existsSync(statusPath)) {
                return { error: `Job not found: ${job_id}`, job_id };
            }
            let status = 'unknown';
            let specialist = 'unknown';
            let model;
            let bead_id;
            let metrics;
            try {
                const s = JSON.parse(readFileSync(statusPath, 'utf-8'));
                status = s.status ?? 'unknown';
                specialist = s.specialist ?? 'unknown';
                model = s.model;
                bead_id = s.bead_id;
                metrics = typeof s.metrics === 'object' && s.metrics !== null
                    ? s.metrics
                    : undefined;
            }
            catch {
                // status.json unreadable — continue with defaults
            }
            // Read all events from events.jsonl
            const allEvents = readJobEventsById(jobsDir, job_id);
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
//# sourceMappingURL=feed_specialist.tool.js.map