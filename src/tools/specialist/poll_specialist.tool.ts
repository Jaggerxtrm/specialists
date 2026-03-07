// src/tools/specialist/poll_specialist.tool.ts
import { z } from 'zod';
import type { JobRegistry } from '../../specialist/jobRegistry.js';

export const pollSpecialistSchema = z.object({
  job_id: z.string().describe('Job ID returned by start_specialist'),
  cursor: z.number().int().min(0).optional().default(0).describe(
    'Character offset from previous poll. Pass next_cursor from the last response to receive only new content. Omit (or pass 0) for the first poll.',
  ),
});

export function createPollSpecialistTool(registry: JobRegistry) {
  return {
    name: 'poll_specialist' as const,
    description: 'Poll a running specialist job. Returns status (running|done|error), delta (new content since cursor), next_cursor, and full output only when done. Pass next_cursor from each response as cursor on the next poll to receive only new tokens.',
    inputSchema: pollSpecialistSchema,
    async execute(input: z.infer<typeof pollSpecialistSchema>) {
      const snapshot = registry.snapshot(input.job_id, input.cursor ?? 0);
      if (!snapshot) {
        return { status: 'error', error: `Job not found: ${input.job_id}`, job_id: input.job_id };
      }
      return snapshot;
    },
  };
}
