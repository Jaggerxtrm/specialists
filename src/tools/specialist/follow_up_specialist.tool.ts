// src/tools/specialist/follow_up_specialist.tool.ts
// DEPRECATED: Use resume_specialist instead.
import { z } from 'zod';
import type { JobRegistry } from '../../specialist/jobRegistry.js';
import { createResumeSpecialistTool } from './resume_specialist.tool.js';

export const followUpSpecialistSchema = z.object({
  job_id: z.string().describe('Job ID of a waiting keep-alive specialist session'),
  message: z.string().describe('Next prompt to send to the specialist (conversation history is retained)'),
});

export function createFollowUpSpecialistTool(registry: JobRegistry) {
  const resumeTool = createResumeSpecialistTool(registry);
  return {
    name: 'follow_up_specialist' as const,
    description:
      '[DEPRECATED] Use resume_specialist instead. ' +
      'Delegates to resume_specialist with a deprecation warning.',
    inputSchema: followUpSpecialistSchema,
    async execute(input: z.infer<typeof followUpSpecialistSchema>) {
      console.error('[specialists] DEPRECATED: follow_up_specialist is deprecated. Use resume_specialist instead.');
      return resumeTool.execute({ job_id: input.job_id, task: input.message });
    },
  };
}
