// src/tools/specialist/list_specialists.tool.ts
import { z } from 'zod';
import type { SpecialistLoader } from '../../specialist/loader.js';

export const listSpecialistsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g. analysis/code)'),
  scope: z.enum(['project', 'user', 'system', 'all']).optional().describe('Filter by scope'),
});

export function createListSpecialistsTool(loader: SpecialistLoader) {
  return {
    name: 'list_specialists' as const,
    description: 'List available specialists. Returns lightweight catalog — no prompts or full config.',
    inputSchema: listSpecialistsSchema,
    async execute(input: z.infer<typeof listSpecialistsSchema>) {
      const list = await loader.list(input.category);
      return input.scope && input.scope !== 'all'
        ? list.filter(s => s.scope === input.scope)
        : list;
    },
  };
}
