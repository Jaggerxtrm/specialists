// src/tools/specialist/specialist_init.tool.ts
//
// Session bootstrap MCP tool.
// Checks if beads is available, runs `bd init` if .beads/ missing,
// then returns the list of available specialists for agent orientation.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { SpecialistLoader } from '../../specialist/loader.js';

export interface SpecialistInitDeps {
  /** Returns true if the bd CLI is available in PATH. */
  bdAvailable: () => boolean;
  /** Returns true if a .beads/ directory exists in cwd. */
  beadsExists: () => boolean;
  /** Runs `bd init` and returns the exit status. */
  bdInit: () => { status: number | null };
}

export const specialistInitSchema = z.object({});

export function createSpecialistInitTool(loader: SpecialistLoader, deps?: SpecialistInitDeps) {
  const resolved: SpecialistInitDeps = deps ?? {
    bdAvailable: () => spawnSync('bd', ['--version'], { stdio: 'ignore' }).status === 0,
    beadsExists: () => existsSync(join(process.cwd(), '.beads')),
    bdInit: () => spawnSync('bd', ['init'], { stdio: 'ignore' }),
  };

  return {
    name: 'specialist_init' as const,
    description:
      'Session bootstrap: initializes beads in the project if not already set up, ' +
      'then returns available specialists. Call at session start for orientation.',
    inputSchema: specialistInitSchema,

    async execute(_input: z.infer<typeof specialistInitSchema>) {
      const available = resolved.bdAvailable();
      let initialized = false;

      if (available) {
        if (resolved.beadsExists()) {
          initialized = true;
        } else {
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
