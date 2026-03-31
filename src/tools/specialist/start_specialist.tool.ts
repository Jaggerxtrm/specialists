// src/tools/specialist/start_specialist.tool.ts
import * as z from 'zod';
import type { SpecialistRunner } from '../../specialist/runner.js';
import { Supervisor } from '../../specialist/supervisor.js';
import type { BeadsClient } from '../../specialist/beads.js';
import { join } from 'node:path';
import { logger } from '../../utils/logger.js';
import { SpecialistLoader } from '../../specialist/loader.js';

const START_SPECIALIST_DEPRECATION_WARNING =
  '[DEPRECATED] start_specialist will be removed in the next major release. Prefer CLI background jobs: specialists run <name> --prompt "..." --background';

export const startSpecialistSchema = z.object({
  name: z.string().describe('Specialist identifier (e.g. codebase-explorer)'),
  prompt: z.string().describe('The task or question for the specialist'),
  variables: z.record(z.string()).optional().describe('Additional $variable substitutions'),
  backend_override: z.string().optional().describe('Force a specific backend (gemini, qwen, anthropic)'),
  bead_id: z.string().optional().describe('Existing bead ID to associate with this run (propagated into status.json and run_start event)'),
  keep_alive: z.boolean().optional().describe('Keep the specialist session open for resume_specialist (overrides execution.interactive).'),
  no_keep_alive: z.boolean().optional().describe('Force one-shot behavior even when execution.interactive is true.'),
});

export function createStartSpecialistTool(runner: SpecialistRunner, beadsClient?: BeadsClient) {
  return {
    name: 'start_specialist' as const,
    description:
      '[DEPRECATED] Start a specialist asynchronously. Returns job_id immediately. ' +
      'Use feed_specialist to stream events and track progress (pass job_id and --follow for live output). ' +
      'Use specialist_status for circuit breaker health checks. ' +
      'Use stop_specialist to cancel. Prefer CLI background jobs: specialists run <name> --prompt "..." --background.',
    inputSchema: startSpecialistSchema,
    async execute(input: z.infer<typeof startSpecialistSchema>) {
      const jobsDir = join(process.cwd(), '.specialists', 'jobs');
      let keepAlive: boolean | undefined;

      try {
        const loader = new SpecialistLoader();
        const specialist = await loader.get(input.name);
        const interactiveDefault = specialist.specialist.execution.interactive ? true : undefined;
        keepAlive = input.no_keep_alive ? false : (input.keep_alive ?? interactiveDefault);
      } catch {
        keepAlive = input.no_keep_alive ? false : input.keep_alive;
      }

      const jobStarted = new Promise<string>((resolve, reject) => {
        const supervisor = new Supervisor({
          runner,
          runOptions: {
            name: input.name,
            prompt: input.prompt,
            variables: input.variables,
            backendOverride: input.backend_override,
            inputBeadId: input.bead_id,
            keepAlive,
            noKeepAlive: input.no_keep_alive ?? false,
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
      return {
        job_id: jobId,
        warning: START_SPECIALIST_DEPRECATION_WARNING,
      };
    },
  };
}
