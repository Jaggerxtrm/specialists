export declare const PRESET_REFERENCE_PREFIX = "@preset/";
export declare const PRESET_REFERENCE_MAX_DEPTH = 4;
export interface PresetDefinition {
    description: string;
    fields: Record<string, unknown>;
}
export interface LoadPresetsOptions {
    force?: boolean;
    baseDir?: string;
}
export interface ResolvePresetOptions {
    specialist?: string;
}
export interface PresetResolution {
    value: unknown;
    presetName?: string;
    depth: number;
}
export declare class SpecialistPresetNotFoundError extends Error {
    readonly presetName: string;
    readonly specialist: string | undefined;
    readonly fieldPath: string;
    readonly knownPresets: readonly string[];
    constructor(presetName: string, specialist: string | undefined, fieldPath: string, knownPresets: readonly string[]);
}
export declare class SpecialistPresetCycleError extends Error {
    readonly visited: readonly string[];
    readonly specialist: string | undefined;
    readonly fieldPath: string;
    constructor(visited: readonly string[], specialist: string | undefined, fieldPath: string);
}
export declare function loadPresets(options?: LoadPresetsOptions): Record<string, PresetDefinition>;
export declare function resolvePresetReference(value: unknown, fieldPath: string, presets: Record<string, PresetDefinition>, visited?: Set<string>, options?: ResolvePresetOptions): PresetResolution;
export declare function isPresetReference(value: unknown): value is string;
//# sourceMappingURL=preset-resolver.d.ts.map