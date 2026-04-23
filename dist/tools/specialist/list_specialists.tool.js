// src/tools/specialist/list_specialists.tool.ts
import { z } from 'zod';
export const listSpecialistsSchema = z.object({
    category: z.string().optional().describe('Filter by category (e.g. analysis/code)'),
    scope: z.enum(['project', 'user', 'system', 'all']).optional().describe('Filter by scope'),
});
export function createListSpecialistsTool(loader) {
    return {
        name: 'list_specialists',
        description: 'List available specialists. Returns lightweight catalog — no prompts or full config.',
        inputSchema: listSpecialistsSchema,
        async execute(input) {
            const list = await loader.list(input.category);
            return input.scope && input.scope !== 'all'
                ? list.filter(s => s.scope === input.scope)
                : list;
        },
    };
}
//# sourceMappingURL=list_specialists.tool.js.map