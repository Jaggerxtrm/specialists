import * as z from 'zod';
declare const CONFIG_FILENAME = "user.json";
declare const SPECIALISTS_SUBDIR = "specialists";
export declare const GLOBAL_USER_CONFIG_DOC = "./overrides-guide.md";
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
        fallback_models: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        timeout_ms: z.ZodNullable<z.ZodNumber>;
        stall_timeout_ms: z.ZodNullable<z.ZodNumber>;
        interactive: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        thinking_level: z.ZodNullable<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        max_retries: z.ZodNullable<z.ZodNumber>;
        prompt_limit_bytes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        stdout_limit_bytes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        extensions: z.ZodOptional<z.ZodObject<{
            serena: z.ZodNullable<z.ZodBoolean>;
            gitnexus: z.ZodNullable<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            serena: boolean | null;
            gitnexus: boolean | null;
        }, {
            serena: boolean | null;
            gitnexus: boolean | null;
        }>>;
    }, "strict", z.ZodTypeAny, {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
        fallback_models?: string[] | null | undefined;
        interactive?: boolean | null | undefined;
        stdout_limit_bytes?: number | null | undefined;
        prompt_limit_bytes?: number | null | undefined;
        extensions?: {
            serena: boolean | null;
            gitnexus: boolean | null;
        } | undefined;
    }, {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
        fallback_models?: string[] | null | undefined;
        interactive?: boolean | null | undefined;
        stdout_limit_bytes?: number | null | undefined;
        prompt_limit_bytes?: number | null | undefined;
        extensions?: {
            serena: boolean | null;
            gitnexus: boolean | null;
        } | undefined;
    }>;
    prompt: z.ZodOptional<z.ZodObject<{
        system_prompt_mode: z.ZodNullable<z.ZodEnum<["append", "replace"]>>;
    }, "strict", z.ZodTypeAny, {
        system_prompt_mode: "replace" | "append" | null;
    }, {
        system_prompt_mode: "replace" | "append" | null;
    }>>;
    stall_detection: z.ZodOptional<z.ZodObject<{
        waiting_auto_close_ms: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, "strict", z.ZodTypeAny, {
        waiting_auto_close_ms?: number | null | undefined;
    }, {
        waiting_auto_close_ms?: number | null | undefined;
    }>>;
    beads_write_notes: z.ZodNullable<z.ZodBoolean>;
    notes_mode: z.ZodOptional<z.ZodNullable<z.ZodEnum<["full-trail", "final-only"]>>>;
    output_file: z.ZodOptional<z.ZodNullable<z.ZodString>>;
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
        fallback_models?: string[] | null | undefined;
        interactive?: boolean | null | undefined;
        stdout_limit_bytes?: number | null | undefined;
        prompt_limit_bytes?: number | null | undefined;
        extensions?: {
            serena: boolean | null;
            gitnexus: boolean | null;
        } | undefined;
    };
    skills: {
        paths: string[];
    };
    beads_write_notes: boolean | null;
    prompt?: {
        system_prompt_mode: "replace" | "append" | null;
    } | undefined;
    stall_detection?: {
        waiting_auto_close_ms?: number | null | undefined;
    } | undefined;
    output_file?: string | null | undefined;
    notes_mode?: "full-trail" | "final-only" | null | undefined;
}, {
    execution: {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
        fallback_models?: string[] | null | undefined;
        interactive?: boolean | null | undefined;
        stdout_limit_bytes?: number | null | undefined;
        prompt_limit_bytes?: number | null | undefined;
        extensions?: {
            serena: boolean | null;
            gitnexus: boolean | null;
        } | undefined;
    };
    skills: {
        paths: string[];
    };
    beads_write_notes: boolean | null;
    prompt?: {
        system_prompt_mode: "replace" | "append" | null;
    } | undefined;
    stall_detection?: {
        waiting_auto_close_ms?: number | null | undefined;
    } | undefined;
    output_file?: string | null | undefined;
    notes_mode?: "full-trail" | "final-only" | null | undefined;
}>;
export type GlobalSpecialistOverride = z.infer<typeof GlobalSpecialistOverrideSchema>;
export declare function getGlobalSpecialistOverrideLeafPaths(): readonly string[];
/** Top-level shape: { "<specialist-name>": GlobalSpecialistOverride }. Underscore keys are metadata sentinels. */
export declare const GlobalUserConfigSchema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodObject<{
    execution: z.ZodObject<{
        model: z.ZodNullable<z.ZodString>;
        fallback_model: z.ZodNullable<z.ZodString>;
        fallback_models: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        timeout_ms: z.ZodNullable<z.ZodNumber>;
        stall_timeout_ms: z.ZodNullable<z.ZodNumber>;
        interactive: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        thinking_level: z.ZodNullable<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        max_retries: z.ZodNullable<z.ZodNumber>;
        prompt_limit_bytes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        stdout_limit_bytes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        extensions: z.ZodOptional<z.ZodObject<{
            serena: z.ZodNullable<z.ZodBoolean>;
            gitnexus: z.ZodNullable<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            serena: boolean | null;
            gitnexus: boolean | null;
        }, {
            serena: boolean | null;
            gitnexus: boolean | null;
        }>>;
    }, "strict", z.ZodTypeAny, {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
        fallback_models?: string[] | null | undefined;
        interactive?: boolean | null | undefined;
        stdout_limit_bytes?: number | null | undefined;
        prompt_limit_bytes?: number | null | undefined;
        extensions?: {
            serena: boolean | null;
            gitnexus: boolean | null;
        } | undefined;
    }, {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
        fallback_models?: string[] | null | undefined;
        interactive?: boolean | null | undefined;
        stdout_limit_bytes?: number | null | undefined;
        prompt_limit_bytes?: number | null | undefined;
        extensions?: {
            serena: boolean | null;
            gitnexus: boolean | null;
        } | undefined;
    }>;
    prompt: z.ZodOptional<z.ZodObject<{
        system_prompt_mode: z.ZodNullable<z.ZodEnum<["append", "replace"]>>;
    }, "strict", z.ZodTypeAny, {
        system_prompt_mode: "replace" | "append" | null;
    }, {
        system_prompt_mode: "replace" | "append" | null;
    }>>;
    stall_detection: z.ZodOptional<z.ZodObject<{
        waiting_auto_close_ms: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, "strict", z.ZodTypeAny, {
        waiting_auto_close_ms?: number | null | undefined;
    }, {
        waiting_auto_close_ms?: number | null | undefined;
    }>>;
    beads_write_notes: z.ZodNullable<z.ZodBoolean>;
    notes_mode: z.ZodOptional<z.ZodNullable<z.ZodEnum<["full-trail", "final-only"]>>>;
    output_file: z.ZodOptional<z.ZodNullable<z.ZodString>>;
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
        fallback_models?: string[] | null | undefined;
        interactive?: boolean | null | undefined;
        stdout_limit_bytes?: number | null | undefined;
        prompt_limit_bytes?: number | null | undefined;
        extensions?: {
            serena: boolean | null;
            gitnexus: boolean | null;
        } | undefined;
    };
    skills: {
        paths: string[];
    };
    beads_write_notes: boolean | null;
    prompt?: {
        system_prompt_mode: "replace" | "append" | null;
    } | undefined;
    stall_detection?: {
        waiting_auto_close_ms?: number | null | undefined;
    } | undefined;
    output_file?: string | null | undefined;
    notes_mode?: "full-trail" | "final-only" | null | undefined;
}, {
    execution: {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
        fallback_models?: string[] | null | undefined;
        interactive?: boolean | null | undefined;
        stdout_limit_bytes?: number | null | undefined;
        prompt_limit_bytes?: number | null | undefined;
        extensions?: {
            serena: boolean | null;
            gitnexus: boolean | null;
        } | undefined;
    };
    skills: {
        paths: string[];
    };
    beads_write_notes: boolean | null;
    prompt?: {
        system_prompt_mode: "replace" | "append" | null;
    } | undefined;
    stall_detection?: {
        waiting_auto_close_ms?: number | null | undefined;
    } | undefined;
    output_file?: string | null | undefined;
    notes_mode?: "full-trail" | "final-only" | null | undefined;
}>>, Record<string, {
    execution: {
        model: string | null;
        fallback_model: string | null;
        timeout_ms: number | null;
        stall_timeout_ms: number | null;
        max_retries: number | null;
        thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
        fallback_models?: string[] | null | undefined;
        interactive?: boolean | null | undefined;
        stdout_limit_bytes?: number | null | undefined;
        prompt_limit_bytes?: number | null | undefined;
        extensions?: {
            serena: boolean | null;
            gitnexus: boolean | null;
        } | undefined;
    };
    skills: {
        paths: string[];
    };
    beads_write_notes: boolean | null;
    prompt?: {
        system_prompt_mode: "replace" | "append" | null;
    } | undefined;
    stall_detection?: {
        waiting_auto_close_ms?: number | null | undefined;
    } | undefined;
    output_file?: string | null | undefined;
    notes_mode?: "full-trail" | "final-only" | null | undefined;
}>, unknown>;
export type GlobalUserConfig = Record<string, GlobalSpecialistOverride | string> & {
    _doc?: string;
};
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
 *
 * Atomic-write semantics: serialize JSON, write to a sibling temp file in
 * the same directory, then renameSync over the destination. POSIX rename
 * is atomic within the same filesystem, so a crash between truncate +
 * write can no longer leave user.json empty or half-written.
 *
 * If the rename fails (e.g. cross-filesystem mount, no permission), fall
 * back to a direct writeFileSync so we still update the file rather than
 * leaving the user without a way to persist their override.
 */
export declare function writeGlobalUserConfig(location: GlobalUserConfigPath, config: GlobalUserConfig): void;
export { SPECIALISTS_SUBDIR, CONFIG_FILENAME };
//# sourceMappingURL=global-config.d.ts.map