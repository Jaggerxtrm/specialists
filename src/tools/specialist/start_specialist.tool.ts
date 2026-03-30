// src/tools/specialist/start_specialist.tool.ts
import * as z from 'zod';
import type { SpecialistRunner } from '../../specialist/runner.js';
import { Supervisor } from '../../specialist/supervisor.js';
import type { BeadsClient } from '../../specialist/beads.js';
import { join } from 'node:path';
import { logger } from '../../utils/logger.js';

export const startSpecialistSchema = z.object({
  name: z.string().describe('Specialist identifier (e.g. codebase-explorer)'),
  prompt: z.string().describe('The task or question for the specialist'),
  variables: z.record(z.string()).optional().describe('Additional $variable substitutions'),
  backend_override: z.string().optional().describe('Force a specific backend (gemini, qwen, anthropic)'),
  bead_id: z.string().optional().describe('Existing bead ID to associate with this run (propagated into status.json and run_start event)'),
});

export function createStartSpecialistTool(runner: SpecialistRunner, beadsClient?: BeadsClient) {
  return {
    name: 'start_specialist' as const,
    description:
      'Start a specialist asynchronously. Returns job_id immediately. ' +
      'Use feed_specialist to stream events and track progress (pass job_id and --follow for live output). ' +
      'Use specialist_status for circuit breaker health checks. ' +
      'Use stop_specialist to cancel. Enables true parallel execution of multiple specialists.',
    inputSchema: startSpecialistSchema,
    async execute(input: z.infer<typeof startSpecialistSchema>) {
      const jobsDir = join(process.cwd(), '.specialists', 'jobs');

      const jobStarted = new Promise<string>((resolve, reject) => {
        const supervisor = new Supervisor({
          runner,
          runOptions: {
            name: input.name,
            prompt: input.prompt,
            variables: input.variables,
            backendOverride: input.backend_override,
            inputBeadId: input.bead_id,
          },
          jobsDir,
          beadsClient,
          onJobStarted: ({ id }) => resolve(id),
        });

        void supervisor.run().catch((error: unknown) => {
          logger.error(`start_specialist job failed: ${error instanceof Error ? error.message : String(error)}`);
          reject(error);
        });
      });

      const jobId = await jobStarted;
      return { job_id: jobId };
    },
  };
}
