// src/tools/specialist/follow_up_specialist.tool.ts
import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JobRegistry } from '../../specialist/jobRegistry.js';
import { Supervisor } from '../../specialist/supervisor.js';

export const followUpSpecialistSchema = z.object({
  job_id: z.string().describe('Job ID of a waiting keep-alive specialist session'),
  message: z.string().describe('Next prompt to send to the specialist (conversation history is retained)'),
});

export function createFollowUpSpecialistTool(registry: JobRegistry) {
  return {
    name: 'follow_up_specialist' as const,
    description: 'Send a follow-up prompt to a waiting keep-alive specialist session. The Pi session retains full conversation history between turns. Only works for jobs started with keepAlive=true (CLI: --keep-alive --background).',
    inputSchema: followUpSpecialistSchema,
    async execute(input: z.infer<typeof followUpSpecialistSchema>) {
      // Try in-process registry first (start_specialist jobs with keepAlive)
      const snap = registry.snapshot(input.job_id);
      if (snap) {
        if (snap.status !== 'waiting') {
          return { status: 'error', error: `Job is not waiting (status: ${snap.status})`, job_id: input.job_id };
        }
        const result = await registry.followUp(input.job_id, input.message);
        if (result.ok) {
          return { status: 'resumed', job_id: input.job_id, output: result.output };
        }
        return { status: 'error', error: result.error, job_id: input.job_id };
      }

      // Fall back to FIFO for Supervisor-managed background jobs
      const jobsDir = join(process.cwd(), '.specialists', 'jobs');
      const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });
      const status = supervisor.readStatus(input.job_id);

      if (!status) {
        return { status: 'error', error: `Job not found: ${input.job_id}`, job_id: input.job_id };
      }
      if (status.status !== 'waiting') {
        return { status: 'error', error: `Job is not waiting (status: ${status.status})`, job_id: input.job_id };
      }
      if (!status.fifo_path) {
        return { status: 'error', error: 'Job has no steer pipe', job_id: input.job_id };
      }

      try {
        const payload = JSON.stringify({ type: 'prompt', message: input.message }) + '\n';
        writeFileSync(status.fifo_path, payload, { flag: 'a' });
        return { status: 'sent', job_id: input.job_id, message: input.message };
      } catch (err: any) {
        return { status: 'error', error: `Failed to write to steer pipe: ${err?.message}`, job_id: input.job_id };
      }
    },
  };
}
