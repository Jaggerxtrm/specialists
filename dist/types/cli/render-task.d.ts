import type { Specialist } from '../specialist/schema.js';
export type Surface = 'pi' | 'claude';
/** Flags shared by every render verb. `render-task` adds a positional specialist name. */
export interface RenderArgs {
    beadId: string;
    cwd: string;
    contextDepth: number;
    surface: Surface;
    positional: string[];
}
export type ErrorCode = 'usage' | 'specialist_not_found' | 'bead_not_found' | 'template_render_failed' | 'mandatory_rules_failed';
export declare function fail(code: ErrorCode, message: string): never;
/** Shared flag parsing. Each verb enforces its own required-argument shape. */
export declare function parseRenderArgs(argv: string[]): RenderArgs;
/**
 * Read the bead, run the one shared task-side assembly, and emit the envelope.
 *
 * `specialistName` is null for the roleless render — the key stays present so a
 * single consumer parser covers both verbs.
 */
export declare function renderAndEmit(specialist: Specialist['specialist'], specialistName: string | null, args: RenderArgs): void;
export declare function run(): Promise<void>;
//# sourceMappingURL=render-task.d.ts.map