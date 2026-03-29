// src/tools/specialist/resume_specialist.tool.ts
import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JobRegistry } from '../../specialist/jobRegistry.js';
import { Supervisor } from '../../specialist/supervisor.js';

export const resumeSpecialistSchema = z.object({
  job_id: z.string().describe('Job ID of a waiting keep-alive specialist session'),
  task: z.string().describe('Next task/prompt to send to the specialist (conversation history is retained)'),
});

export function createResumeSpecialistTool(registry: JobRegistry) {
  return {
    name: 'resume_specialist' as const,
    description:
      'Resume a waiting keep-alive specialist session with a next-turn prompt. ' +
      'The Pi session retains full conversation history between turns. ' +
      'Only valid for jobs in waiting state (started with keepAlive=true, CLI: --keep-alive --background). ' +
      'Use steer_specialist for mid-run steering of running jobs.',
    inputSchema: resumeSpecialistSchema,
    async execute(input: z.infer<typeof resumeSpecialistSchema>) {
      // Try in-process registry first (start_specialist jobs with keepAlive)
      const snap = registry.snapshot(input.job_id);
      if (snap) {
        if (snap.status !== 'waiting') {
          return { status: 'error', error: `Job is not waiting (status: ${snap.status}). resume is only valid in waiting state.`, job_id: input.job_id };
        }
        const result = await registry.followUp(input.job_id, input.task);
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
        return { status: 'error', error: `Job is not waiting (status: ${status.status}). resume is only valid in waiting state.`, job_id: input.job_id };
      }
      if (!status.fifo_path) {
        return { status: 'error', error: 'Job has no steer pipe', job_id: input.job_id };
      }

      try {
        const payload = JSON.stringify({ type: 'resume', task: input.task }) + '\n';
        writeFileSync(status.fifo_path, payload, { flag: 'a' });
        return { status: 'sent', job_id: input.job_id, task: input.task };
      } catch (err: any) {
        return { status: 'error', error: `Failed to write to steer pipe: ${err?.message}`, job_id: input.job_id };
      }
    },
  };
}
