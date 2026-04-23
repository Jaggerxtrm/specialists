// src/tools/specialist/specialist_init.tool.ts
//
// Session bootstrap MCP tool.
// Checks if beads is available, runs `bd init` if .beads/ missing,
// then returns the list of available specialists for agent orientation.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
export const specialistInitSchema = z.object({});
export function createSpecialistInitTool(loader, deps) {
    const resolved = deps ?? {
        bdAvailable: () => spawnSync('bd', ['--version'], { stdio: 'ignore' }).status === 0,
        beadsExists: () => existsSync(join(process.cwd(), '.beads')),
        bdInit: () => spawnSync('bd', ['init'], { stdio: 'ignore' }),
    };
    return {
        name: 'specialist_init',
        description: 'Call this first at session start. Returns available specialists and initializes beads ' +
            'tracking (runs `bd init` if not already set up). ' +
            'Response includes: specialists[] (use with use_specialist), ' +
            'beads.available (bool), beads.initialized (bool). ' +
            'If beads.available is true, specialists with permission LOW/MEDIUM/HIGH will auto-create ' +
            'a beads issue when they run — no action needed from you.',
        inputSchema: specialistInitSchema,
        async execute(_input) {
            const available = resolved.bdAvailable();
            let initialized = false;
            if (available) {
                if (resolved.beadsExists()) {
                    initialized = true;
                }
                else {
                    const result = resolved.bdInit();
                    initialized = result.status === 0;
                }
            }
            const specialists = await loader.list();
            return {
                specialists,
                beads: { available, initialized },
            };
        },
    };
}
//# sourceMappingURL=specialist_init.tool.js.map