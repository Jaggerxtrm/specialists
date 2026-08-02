import type { Specialist } from '../specialist/schema.js';
export type Surface = 'pi' | 'claude' | 'codex';
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
/**
 * Load a specialist for the requested surface.
 *
 * Pi/Claude keep the historical runtime gate exactly as K1 pinned it:
 * `loader.get()` hard-fails on a null/empty `execution.model`. The native
 * codex surface (K3, unitAI-e67up.2; experimental until GATE-IFACE) resolves
 * its own effective model — `execution.surface_models.codex` wins, otherwise
 * `execution.model` — so a codex-only configuration is renderable while a
 * configuration with no usable model fails with the canonical missing-model
 * error shape. The surface is selected ONLY by this flag: a model spelling
 * such as `openai-codex/...` is provider data and never aliases the codex
 * surface.
 */
export declare function loadSpecialistForSurface(name: string, surface: Surface): Promise<Specialist>;
export declare function run(): Promise<void>;
//# sourceMappingURL=render-task.d.ts.map