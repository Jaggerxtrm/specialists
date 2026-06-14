import * as z from 'zod';
declare const CONFIG_FILENAME = "user.json";
declare const SPECIALISTS_SUBDIR = "specialists";
export type GlobalConfigSource = 'xdg' | 'config-home' | 'legacy';
export interface GlobalUserConfigPath {
    /** Absolute path to user.json (may not exist yet). */
    path: string;
    /** Whether the resolved path currently exists on disk. */
    exists: boolean;
    /** Which resolution rule produced this path. */
    source: GlobalConfigSource;
}
/**
 * Resolve the global user-config path. Resolution order:
 *   1. $XDG_CONFIG_HOME/specialists/user.json      -> source: 'xdg'
 *   2. $HOME/.config/specialists/user.json         -> source: 'config-home'
 *   3. $HOME/.specialists/user.json (read-only)    -> source: 'legacy'
 *
 * When $XDG_CONFIG_HOME is set it always wins (write target).
 * When unset, config-home is the write target; legacy is a read-only
 * fallback surfaced only when config-home is absent but legacy exists.
 */
export declare function getGlobalUserConfigPath(): GlobalUserConfigPath;
export declare const GlobalSpecialistOverrideSchema: z.ZodObject<{
    execution: z.ZodObject<{
        model: z.ZodNullable<z.ZodString>;
        fallback_model: z.ZodNullable<z.ZodString>;
        timeout_ms: z.ZodNullable<z.ZodNumber>;
        stall_timeout_ms: z.ZodNullable<z.ZodNumber>;
        thinking_level: z.ZodNullable<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        max_retries: z.ZodNullable<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
    }, {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
    }>;
    beads_write_notes: z.ZodNullable<z.ZodBoolean>;
    skills: z.ZodObject<{
        paths: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        paths: string[];
    }, {
        paths: string[];
    }>;
}, "strict", z.ZodTypeAny, {
    execution: {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
    };
    skills: {
        paths: string[];
    };
    beads_write_notes: boolean | null;
}, {
    execution: {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
    };
    skills: {
        paths: string[];
    };
    beads_write_notes: boolean | null;
}>;
export type GlobalSpecialistOverride = z.infer<typeof GlobalSpecialistOverrideSchema>;
/** Top-level shape: { "<specialist-name>": GlobalSpecialistOverride }. */
export declare const GlobalUserConfigSchema: z.ZodRecord<z.ZodString, z.ZodObject<{
    execution: z.ZodObject<{
        model: z.ZodNullable<z.ZodString>;
        fallback_model: z.ZodNullable<z.ZodString>;
        timeout_ms: z.ZodNullable<z.ZodNumber>;
        stall_timeout_ms: z.ZodNullable<z.ZodNumber>;
        thinking_level: z.ZodNullable<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        max_retries: z.ZodNullable<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
    }, {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
    }>;
    beads_write_notes: z.ZodNullable<z.ZodBoolean>;
    skills: z.ZodObject<{
        paths: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        paths: string[];
    }, {
        paths: string[];
    }>;
}, "strict", z.ZodTypeAny, {
    execution: {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
    };
    skills: {
        paths: string[];
    };
    beads_write_notes: boolean | null;
}, {
    execution: {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
    };
    skills: {
        paths: string[];
    };
    beads_write_notes: boolean | null;
}>>;
export type GlobalUserConfig = z.infer<typeof GlobalUserConfigSchema>;
export interface GlobalConfigValidationResult {
    valid: boolean;
    errors: Array<{
        path: string;
        message: string;
    }>;
}
/**
 * Build the override template for a single specialist (all fields defaulted to
 * null / [] = inherit). Used by sp init --global to seed each specialist entry.
 */
export declare function buildSpecialistOverrideTemplate(): GlobalSpecialistOverride;
/**
 * Build the full global config template keyed by specialist name.
 * @param specialistNames - every specialist currently visible to SpecialistLoader.list()
 */
export declare function buildGlobalUserConfigTemplate(specialistNames: ReadonlyArray<string>): GlobalUserConfig;
export interface GlobalConfigMergeResult {
    config: GlobalUserConfig;
    added: string[];
    extended: string[];
    removed: string[];
}
/**
 * Idempotent merge: extend an existing global config with newly-shipped
 * specialists and fill any missing override fields with defaults.
 * NEVER clobbers a user-filled value. Removed specialists STAY in the file.
 *
 * @param existing - parsed existing config (may be empty)
 * @param template - fresh template built from SpecialistLoader.list()
 */
export declare function mergeGlobalUserConfig(existing: Readonly<Record<string, unknown>>, template: GlobalUserConfig): GlobalConfigMergeResult;
/**
 * Validate a raw JSON string against the global user-config schema.
 * Returns structured errors; never throws on invalid input.
 */
export declare function validateGlobalUserConfig(jsonContent: string): GlobalConfigValidationResult;
/**
 * Read and parse the global user config. Returns null if the file does not
 * exist. Throws on invalid JSON. Callers validating before use should prefer
 * {@link validateGlobalUserConfig}.
 */
export declare function readGlobalUserConfig(location: GlobalUserConfigPath): GlobalUserConfig | null;
/**
 * Write the global user config, creating parent directories as needed.
 */
export declare function writeGlobalUserConfig(location: GlobalUserConfigPath, config: GlobalUserConfig): void;
export { SPECIALISTS_SUBDIR, CONFIG_FILENAME };
//# sourceMappingURL=global-config.d.ts.map