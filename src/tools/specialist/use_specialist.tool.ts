// src/tools/specialist/use_specialist.tool.ts
import { z } from 'zod';
import type { SpecialistRunner } from '../../specialist/runner.js';

export const useSpecialistSchema = z.object({
  name: z.string().describe('Specialist identifier (e.g. codebase-explorer)'),
  prompt: z.string().describe('The task or question for the specialist'),
  variables: z.record(z.string()).optional().describe('Additional $variable substitutions'),
  backend_override: z.string().optional().describe('Force a specific backend (gemini, qwen, anthropic)'),
  autonomy_level: z.string().optional().describe('Override permission level for this invocation'),
});

export function createUseSpecialistTool(runner: SpecialistRunner) {
  return {
    name: 'use_specialist' as const,
    description: 'Execute a specialist. Full lifecycle: load → agents.md → pi → validate → output.',
    inputSchema: useSpecialistSchema,
    async execute(input: z.infer<typeof useSpecialistSchema>, onProgress?: (msg: string) => void) {
      return runner.run({
        name: input.name,
        prompt: input.prompt,
        variables: input.variables,
        backendOverride: input.backend_override,
        autonomyLevel: input.autonomy_level,
      }, onProgress);
    },
  };
}
