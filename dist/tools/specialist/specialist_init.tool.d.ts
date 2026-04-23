import * as z from 'zod';
import type { SpecialistLoader } from '../../specialist/loader.js';
export interface SpecialistInitDeps {
    /** Returns true if the bd CLI is available in PATH. */
    bdAvailable: () => boolean;
    /** Returns true if a .beads/ directory exists in cwd. */
    beadsExists: () => boolean;
    /** Runs `bd init` and returns the exit status. */
    bdInit: () => {
        status: number | null;
    };
}
export declare const specialistInitSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function createSpecialistInitTool(loader: SpecialistLoader, deps?: SpecialistInitDeps): {
    name: "specialist_init";
    description: string;
    inputSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
    execute(_input: z.infer<typeof specialistInitSchema>): Promise<{
        specialists: import("../../specialist/loader.js").SpecialistSummary[];
        beads: {
            available: boolean;
            initialized: boolean;
        };
    }>;
};
//# sourceMappingURL=specialist_init.tool.d.ts.map