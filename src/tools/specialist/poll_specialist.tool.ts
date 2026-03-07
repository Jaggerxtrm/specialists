// src/tools/specialist/poll_specialist.tool.ts
import { z } from 'zod';
import type { JobRegistry } from '../../specialist/jobRegistry.js';

export const pollSpecialistSchema = z.object({
  job_id: z.string().describe('Job ID returned by start_specialist'),
});

export function createPollSpecialistTool(registry: JobRegistry) {
  return {
    name: 'poll_specialist' as const,
    description: 'Poll a running specialist job. Returns status (running|done|error), accumulated output so far, and current pi event type (thinking|toolcall|tool_execution|text|done). Poll repeatedly until status is done or error.',
    inputSchema: pollSpecialistSchema,
    async execute(input: z.infer<typeof pollSpecialistSchema>) {
      const snapshot = registry.snapshot(input.job_id);
      if (!snapshot) {
        return { status: 'error', error: `Job not found: ${input.job_id}`, job_id: input.job_id };
      }
      return snapshot;
    },
  };
}
