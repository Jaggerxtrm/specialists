// src/tools/specialist/stop_specialist.tool.ts
import { z } from 'zod';
import type { JobRegistry } from '../../specialist/jobRegistry.js';

export const stopSpecialistSchema = z.object({
  job_id: z.string().describe('Job ID returned by start_specialist'),
});

export function createStopSpecialistTool(registry: JobRegistry) {
  return {
    name: 'stop_specialist' as const,
    description: 'Cancel a running specialist job. Kills the pi process immediately and sets status to cancelled. Subsequent poll_specialist calls return status: cancelled with output buffered up to that point.',
    inputSchema: stopSpecialistSchema,
    async execute(input: z.infer<typeof stopSpecialistSchema>) {
      const result = registry.cancel(input.job_id);
      if (!result) {
        return { status: 'error', error: `Job not found: ${input.job_id}`, job_id: input.job_id };
      }
      return { ...result, job_id: input.job_id };
    },
  };
}
