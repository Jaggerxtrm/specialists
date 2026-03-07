// src/tools/specialist/run_parallel.tool.ts
import { z } from 'zod';
import type { SpecialistRunner } from '../../specialist/runner.js';

const InvocationSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  variables: z.record(z.string()).optional(),
  backend_override: z.string().optional(),
});

export const runParallelSchema = z.object({
  specialists: z.array(InvocationSchema).min(1),
  merge_strategy: z.enum(['collect', 'synthesize', 'vote']).default('collect'),
  timeout_ms: z.number().default(120_000),
});

export function createRunParallelTool(runner: SpecialistRunner) {
  return {
    name: 'run_parallel' as const,
    description: 'Execute multiple specialists concurrently. Returns aggregated results.',
    inputSchema: runParallelSchema,
    async execute(input: z.infer<typeof runParallelSchema>) {
      if (input.merge_strategy !== 'collect') {
        throw new Error(`Merge strategy '${input.merge_strategy}' not yet implemented (v2.1)`);
      }
      const results = await Promise.allSettled(
        input.specialists.map(s => runner.run({
          name: s.name, prompt: s.prompt,
          variables: s.variables, backendOverride: s.backend_override,
        }))
      );
      return results.map((r, i) => ({
        specialist: input.specialists[i].name,
        status: r.status,
        output: r.status === 'fulfilled' ? r.value.output : null,
        durationMs: r.status === 'fulfilled' ? r.value.durationMs : null,
        error: r.status === 'rejected' ? String((r.reason as any)?.message) : null,
      }));
    },
  };
}
