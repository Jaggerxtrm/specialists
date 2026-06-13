import { type ScriptEntry, type Specialist, type BlockedFieldWarning } from './schema.js';
import { type GlobalUserConfigPath } from './global-config.js';
export interface StallDetectionConfig {
    running_silence_warn_ms?: number;
    running_silence_error_ms?: number;
    waiting_stale_ms?: number;
    tool_duration_warn_ms?: number;
}
export interface SpecialistSummary {
    name: string;
    description: string;
    category: string;
    version: string;
    /** Merged model after layer overrides. Empty string when no layer supplies a model. */
    model: string;
    permission_required: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
    interactive: boolean;
    thinking_level?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    skills: string[];
    scripts: ScriptEntry[];
    mandatoryRuleTemplateSets: string[];
    scope: 'user' | 'default' | 'package';
    /**
     * Scope says where override came from.
     * user = repo authoring layer, default = repo-managed mirror, package = upstream fallback.
     */
    source: 'user' | 'default-mirror' | 'package-fallback' | 'package-live' | 'legacy';
    filePath: string;
    updated?: string;
    filestoWatch?: string[];
    staleThresholdDays?: number;
    stallDetection?: StallDetectionConfig;
}
/** Thrown by SpecialistLoader.get when execution.model is null/empty after all overrides merge. */
export declare class SpecialistMissingModelError extends Error {
    readonly specialistName: string;
    constructor(specialistName: string);
}
/** Returns STALE, AGED, or OK based on file mtimes vs metadata.updated */
export declare function checkStaleness(summary: SpecialistSummary): Promise<'OK' | 'STALE' | 'AGED'>;
interface LoaderOptions {
    projectDir?: string;
}
export declare class SpecialistLoader {
    private cache;
    private blockedFieldWarnings;
    private projectDir;
    constructor(options?: LoaderOptions);
    /**
     * Scan dirs in priority order: highest-priority layer FIRST (user → default → package).
     * Used both to find a file for a given name (first hit wins for "where to load") and
     * to know which package/default file feeds the merge base.
     */
    private getScanDirs;
    private toJson;
    private resolveSpecialistPath;
    /** Find every layer that has a file for `name`, ordered base-first (package → default → user). */
    private findLayerHits;
    /**
     * Apply override-allowed fields from `override` onto `base`, in place.
     * `source` controls blocked-field severity ('strip' for global, 'warn' for repo layers).
     * Returns warnings (does NOT mutate the warnings store).
     */
    private applyOverrideFields;
    /**
     * Build the merged spec for `name`. Reads every contributing layer
     * (package base → global user.json → repo default → repo user) and applies
     * override-allowed fields field-by-field. Does NOT throw on null model;
     * caller (get) enforces the missing-model error.
     */
    private buildMergedSpec;
    list(category?: string): Promise<SpecialistSummary[]>;
    get(name: string): Promise<Specialist>;
    /**
     * Blocked-field warnings collected during the most recent list() or get() calls.
     * Returns all warnings when called without a name; filters to one specialist otherwise.
     */
    getBlockedFieldWarnings(name?: string): BlockedFieldWarning[];
    /** Resolution of the global user-config path. Returns null only if HOME is unset and XDG_CONFIG_HOME is empty. */
    getGlobalLayerPath(): GlobalUserConfigPath | null;
    invalidateCache(name?: string): void;
}
export {};
//# sourceMappingURL=loader.d.ts.map