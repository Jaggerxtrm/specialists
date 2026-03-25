// src/tools/specialist/steer_specialist.tool.ts
import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JobRegistry } from '../../specialist/jobRegistry.js';
import { Supervisor } from '../../specialist/supervisor.js';

export const steerSpecialistSchema = z.object({
  job_id: z.string().describe('Job ID returned by start_specialist or specialists run --background'),
  message: z.string().describe('Steering instruction to send to the running agent (e.g. "focus only on supervisor.ts")'),
});

export function createSteerSpecialistTool(registry: JobRegistry) {
  return {
    name: 'steer_specialist' as const,
    description: 'Send a mid-run steering message to a running specialist job. The agent receives the message after its current tool calls finish, before the next LLM call. Works for both in-process jobs (start_specialist) and background CLI jobs (specialists run --background).',
    inputSchema: steerSpecialistSchema,
    async execute(input: z.infer<typeof steerSpecialistSchema>) {
      // Try in-process registry first (start_specialist jobs)
      const snap = registry.snapshot(input.job_id);
      if (snap) {
        const result = await registry.steer(input.job_id, input.message);
        if (result.ok) {
          return { status: 'steered', job_id: input.job_id, message: input.message };
        }
        return { status: 'error', error: result.error, job_id: input.job_id };
      }

      // Fall back to FIFO for Supervisor-managed background jobs (specialists run --background)
      const jobsDir = join(process.cwd(), '.specialists', 'jobs');
      const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });
      const status = supervisor.readStatus(input.job_id);

      if (!status) {
        return { status: 'error', error: `Job not found: ${input.job_id}`, job_id: input.job_id };
      }
      if (status.status === 'done' || status.status === 'error') {
        return { status: 'error', error: `Job is already ${status.status}`, job_id: input.job_id };
      }
      if (!status.fifo_path) {
        return { status: 'error', error: 'Job has no steer pipe (may have been started without FIFO support)', job_id: input.job_id };
      }

      try {
        const payload = JSON.stringify({ type: 'steer', message: input.message }) + '\n';
        writeFileSync(status.fifo_path, payload, { flag: 'a' });
        return { status: 'steered', job_id: input.job_id, message: input.message };
      } catch (err: any) {
        return { status: 'error', error: `Failed to write to steer pipe: ${err?.message}`, job_id: input.job_id };
      }
    },
  };
}
