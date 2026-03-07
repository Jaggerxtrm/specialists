// src/tools/specialist/start_specialist.tool.ts
import { z } from 'zod';
import type { SpecialistRunner } from '../../specialist/runner.js';
import type { JobRegistry } from '../../specialist/jobRegistry.js';

export const startSpecialistSchema = z.object({
  name: z.string().describe('Specialist identifier (e.g. codebase-explorer)'),
  prompt: z.string().describe('The task or question for the specialist'),
  variables: z.record(z.string()).optional().describe('Additional $variable substitutions'),
  backend_override: z.string().optional().describe('Force a specific backend (gemini, qwen, anthropic)'),
});

export function createStartSpecialistTool(runner: SpecialistRunner, registry: JobRegistry) {
  return {
    name: 'start_specialist' as const,
    description: 'Start a specialist asynchronously. Returns job_id immediately — use poll_specialist to track progress and get output. Enables true parallel execution of multiple specialists.',
    inputSchema: startSpecialistSchema,
    async execute(input: z.infer<typeof startSpecialistSchema>) {
      const jobId = runner.startAsync({
        name: input.name,
        prompt: input.prompt,
        variables: input.variables,
        backendOverride: input.backend_override,
      }, registry);
      return { job_id: jobId };
    },
  };
}
