import type { Specialist } from '../specialist/schema.js';
interface ParsedArgs {
    name?: string;
    section?: keyof Specialist['specialist'] | 'beads';
    surface?: string;
    raw: boolean;
    all: boolean;
}
export declare function parseArgs(argv: string[]): ParsedArgs;
type SurfaceModelConfig = Pick<Specialist['specialist']['execution'], 'model'> & {
    surface_models?: Record<string, string>;
};
export declare function resolveSurfaceModel(execution: SurfaceModelConfig, surface?: string): string | null;
export declare function run(): Promise<void>;
export {};
//# sourceMappingURL=view.d.ts.map