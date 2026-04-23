import * as z from 'zod';
export declare const SpecialistSchema: z.ZodObject<{
    specialist: z.ZodObject<{
        metadata: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            author: z.ZodOptional<z.ZodString>;
            created: z.ZodOptional<z.ZodString>;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            version: string;
            description: string;
            category: string;
            author?: string | undefined;
            created?: string | undefined;
            updated?: string | undefined;
            tags?: string[] | undefined;
        }, {
            name: string;
            version: string;
            description: string;
            category: string;
            author?: string | undefined;
            created?: string | undefined;
            updated?: string | undefined;
            tags?: string[] | undefined;
        }>;
        execution: z.ZodObject<{
            mode: z.ZodDefault<z.ZodEnum<["tool", "skill", "auto"]>>;
            model: z.ZodString;
            fallback_model: z.ZodOptional<z.ZodString>;
            timeout_ms: z.ZodDefault<z.ZodNumber>;
            stall_timeout_ms: z.ZodOptional<z.ZodNumber>;
            max_retries: z.ZodDefault<z.ZodNumber>;
            interactive: z.ZodDefault<z.ZodBoolean>;
            response_format: z.ZodDefault<z.ZodEnum<["text", "json", "markdown"]>>;
            /** Semantic output archetype used for structured output contracts and schema extensions. */
            output_type: z.ZodDefault<z.ZodEnum<["codegen", "analysis", "review", "synthesis", "orchestration", "workflow", "research", "custom"]>>;
            /** Controls which pi tools are available to the agent.
             *  READ_ONLY : read, grep, find, ls        (no bash, no writes)
             *  LOW       : + bash                       (inspect/run, no file edits)
             *  MEDIUM    : + edit                       (can edit existing files)
             *  HIGH      : + write                      (full access — create new files)
             */
            permission_required: z.ZodDefault<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>>;
            /** Whether specialist requires worktree isolation. Set false for workflow specialists that write shared state (.xtrm/memory.md) and should commit directly to master. */
            requires_worktree: z.ZodDefault<z.ZodBoolean>;
            /** Pass --thinking <level> to pi. Models that don't support thinking ignore this. */
            thinking_level: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
            auto_commit: z.ZodDefault<z.ZodEnum<["never", "checkpoint_on_waiting", "checkpoint_on_terminal"]>>;
            /** Optional per-session extension toggles. `false` disables injection of extension. */
            extensions: z.ZodOptional<z.ZodObject<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                serena?: boolean | undefined;
                gitnexus?: boolean | undefined;
            }, {
                serena?: boolean | undefined;
                gitnexus?: boolean | undefined;
            }>>;
            preferred_profile: z.ZodOptional<z.ZodString>;
            approval_mode: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            mode: "tool" | "skill" | "auto";
            model: string;
            timeout_ms: number;
            max_retries: number;
            interactive: boolean;
            response_format: "text" | "json" | "markdown";
            output_type: "codegen" | "analysis" | "review" | "synthesis" | "orchestration" | "workflow" | "research" | "custom";
            permission_required: "READ_ONLY" | "LOW" | "MEDIUM" | "HIGH";
            requires_worktree: boolean;
            auto_commit: "never" | "checkpoint_on_waiting" | "checkpoint_on_terminal";
            fallback_model?: string | undefined;
            stall_timeout_ms?: number | undefined;
            thinking_level?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
            extensions?: {
                serena?: boolean | undefined;
                gitnexus?: boolean | undefined;
            } | undefined;
            preferred_profile?: string | undefined;
            approval_mode?: string | undefined;
        }, {
            model: string;
            mode?: "tool" | "skill" | "auto" | undefined;
            fallback_model?: string | undefined;
            timeout_ms?: number | undefined;
            stall_timeout_ms?: number | undefined;
            max_retries?: number | undefined;
            interactive?: boolean | undefined;
            response_format?: "text" | "json" | "markdown" | undefined;
            output_type?: "codegen" | "analysis" | "review" | "synthesis" | "orchestration" | "workflow" | "research" | "custom" | undefined;
            permission_required?: "READ_ONLY" | "LOW" | "MEDIUM" | "HIGH" | undefined;
            requires_worktree?: boolean | undefined;
            thinking_level?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
            auto_commit?: "never" | "checkpoint_on_waiting" | "checkpoint_on_terminal" | undefined;
            extensions?: {
                serena?: boolean | undefined;
                gitnexus?: boolean | undefined;
            } | undefined;
            preferred_profile?: string | undefined;
            approval_mode?: string | undefined;
        }>;
        prompt: z.ZodObject<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            normalize_template: z.ZodOptional<z.ZodString>;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            examples: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            task_template: string;
            system?: string | undefined;
            normalize_template?: string | undefined;
            output_schema?: Record<string, unknown> | undefined;
            examples?: unknown[] | undefined;
            skill_inherit?: string | undefined;
        }, {
            task_template: string;
            system?: string | undefined;
            normalize_template?: string | undefined;
            output_schema?: Record<string, unknown> | undefined;
            examples?: unknown[] | undefined;
            skill_inherit?: string | undefined;
        }>;
        skills: z.ZodOptional<z.ZodObject<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodObject<{
                run: z.ZodOptional<z.ZodString>;
                path: z.ZodOptional<z.ZodString>;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                phase: "pre" | "post";
                inject_output: boolean;
                run?: string | undefined;
                path?: string | undefined;
            }, {
                phase: "pre" | "post";
                run?: string | undefined;
                path?: string | undefined;
                inject_output?: boolean | undefined;
            }>, {
                run: string;
                phase: "pre" | "post";
                inject_output: boolean;
            }, {
                phase: "pre" | "post";
                run?: string | undefined;
                path?: string | undefined;
                inject_output?: boolean | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            paths?: string[] | undefined;
            scripts?: {
                run: string;
                phase: "pre" | "post";
                inject_output: boolean;
            }[] | undefined;
        }, {
            paths?: string[] | undefined;
            scripts?: {
                phase: "pre" | "post";
                run?: string | undefined;
                path?: string | undefined;
                inject_output?: boolean | undefined;
            }[] | undefined;
        }>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            required_tools?: string[] | undefined;
            external_commands?: string[] | undefined;
        }, {
            required_tools?: string[] | undefined;
            external_commands?: string[] | undefined;
        }>>;
        communication: z.ZodOptional<z.ZodObject<{
            /**
             * Declarative pipeline metadata only.
             * Runner does not auto-chain specialists; orchestrators may consume this field.
             */
            next_specialists: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
        }, "strip", z.ZodTypeAny, {
            next_specialists?: string | string[] | undefined;
        }, {
            next_specialists?: string | string[] | undefined;
        }>>;
        validation: z.ZodOptional<z.ZodObject<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            files_to_watch?: string[] | undefined;
            stale_threshold_days?: number | undefined;
        }, {
            files_to_watch?: string[] | undefined;
            stale_threshold_days?: number | undefined;
        }>>;
        stall_detection: z.ZodOptional<z.ZodObject<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            running_silence_warn_ms?: number | undefined;
            running_silence_error_ms?: number | undefined;
            waiting_stale_ms?: number | undefined;
            tool_duration_warn_ms?: number | undefined;
        }, {
            running_silence_warn_ms?: number | undefined;
            running_silence_error_ms?: number | undefined;
            waiting_stale_ms?: number | undefined;
            tool_duration_warn_ms?: number | undefined;
        }>>;
        mandatory_rules: z.ZodOptional<z.ZodObject<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                text: string;
                id: string;
                level: "error" | "warn" | "info";
                when?: string | undefined;
            }, {
                text: string;
                id: string;
                level?: "error" | "warn" | "info" | undefined;
                when?: string | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            template_sets: string[];
            disable_default_globals: boolean;
            inline_rules: {
                text: string;
                id: string;
                level: "error" | "warn" | "info";
                when?: string | undefined;
            }[];
        }, {
            template_sets?: string[] | undefined;
            disable_default_globals?: boolean | undefined;
            inline_rules?: {
                text: string;
                id: string;
                level?: "error" | "warn" | "info" | undefined;
                when?: string | undefined;
            }[] | undefined;
        }>>;
        /** Write the final output to this file path after the session completes */
        output_file: z.ZodOptional<z.ZodString>;
        beads_integration: z.ZodDefault<z.ZodEnum<["auto", "always", "never"]>>;
        beads_write_notes: z.ZodDefault<z.ZodBoolean>;
        heartbeat: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        metadata: {
            name: string;
            version: string;
            description: string;
            category: string;
            author?: string | undefined;
            created?: string | undefined;
            updated?: string | undefined;
            tags?: string[] | undefined;
        };
        execution: {
            mode: "tool" | "skill" | "auto";
            model: string;
            timeout_ms: number;
            max_retries: number;
            interactive: boolean;
            response_format: "text" | "json" | "markdown";
            output_type: "codegen" | "analysis" | "review" | "synthesis" | "orchestration" | "workflow" | "research" | "custom";
            permission_required: "READ_ONLY" | "LOW" | "MEDIUM" | "HIGH";
            requires_worktree: boolean;
            auto_commit: "never" | "checkpoint_on_waiting" | "checkpoint_on_terminal";
            fallback_model?: string | undefined;
            stall_timeout_ms?: number | undefined;
            thinking_level?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
            extensions?: {
                serena?: boolean | undefined;
                gitnexus?: boolean | undefined;
            } | undefined;
            preferred_profile?: string | undefined;
            approval_mode?: string | undefined;
        };
        prompt: {
            task_template: string;
            system?: string | undefined;
            normalize_template?: string | undefined;
            output_schema?: Record<string, unknown> | undefined;
            examples?: unknown[] | undefined;
            skill_inherit?: string | undefined;
        };
        beads_integration: "auto" | "never" | "always";
        beads_write_notes: boolean;
        validation?: {
            files_to_watch?: string[] | undefined;
            stale_threshold_days?: number | undefined;
        } | undefined;
        skills?: {
            paths?: string[] | undefined;
            scripts?: {
                run: string;
                phase: "pre" | "post";
                inject_output: boolean;
            }[] | undefined;
        } | undefined;
        capabilities?: {
            required_tools?: string[] | undefined;
            external_commands?: string[] | undefined;
        } | undefined;
        communication?: {
            next_specialists?: string | string[] | undefined;
        } | undefined;
        stall_detection?: {
            running_silence_warn_ms?: number | undefined;
            running_silence_error_ms?: number | undefined;
            waiting_stale_ms?: number | undefined;
            tool_duration_warn_ms?: number | undefined;
        } | undefined;
        mandatory_rules?: {
            template_sets: string[];
            disable_default_globals: boolean;
            inline_rules: {
                text: string;
                id: string;
                level: "error" | "warn" | "info";
                when?: string | undefined;
            }[];
        } | undefined;
        output_file?: string | undefined;
        heartbeat?: unknown;
    }, {
        metadata: {
            name: string;
            version: string;
            description: string;
            category: string;
            author?: string | undefined;
            created?: string | undefined;
            updated?: string | undefined;
            tags?: string[] | undefined;
        };
        execution: {
            model: string;
            mode?: "tool" | "skill" | "auto" | undefined;
            fallback_model?: string | undefined;
            timeout_ms?: number | undefined;
            stall_timeout_ms?: number | undefined;
            max_retries?: number | undefined;
            interactive?: boolean | undefined;
            response_format?: "text" | "json" | "markdown" | undefined;
            output_type?: "codegen" | "analysis" | "review" | "synthesis" | "orchestration" | "workflow" | "research" | "custom" | undefined;
            permission_required?: "READ_ONLY" | "LOW" | "MEDIUM" | "HIGH" | undefined;
            requires_worktree?: boolean | undefined;
            thinking_level?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
            auto_commit?: "never" | "checkpoint_on_waiting" | "checkpoint_on_terminal" | undefined;
            extensions?: {
                serena?: boolean | undefined;
                gitnexus?: boolean | undefined;
            } | undefined;
            preferred_profile?: string | undefined;
            approval_mode?: string | undefined;
        };
        prompt: {
            task_template: string;
            system?: string | undefined;
            normalize_template?: string | undefined;
            output_schema?: Record<string, unknown> | undefined;
            examples?: unknown[] | undefined;
            skill_inherit?: string | undefined;
        };
        validation?: {
            files_to_watch?: string[] | undefined;
            stale_threshold_days?: number | undefined;
        } | undefined;
        skills?: {
            paths?: string[] | undefined;
            scripts?: {
                phase: "pre" | "post";
                run?: string | undefined;
                path?: string | undefined;
                inject_output?: boolean | undefined;
            }[] | undefined;
        } | undefined;
        capabilities?: {
            required_tools?: string[] | undefined;
            external_commands?: string[] | undefined;
        } | undefined;
        communication?: {
            next_specialists?: string | string[] | undefined;
        } | undefined;
        stall_detection?: {
            running_silence_warn_ms?: number | undefined;
            running_silence_error_ms?: number | undefined;
            waiting_stale_ms?: number | undefined;
            tool_duration_warn_ms?: number | undefined;
        } | undefined;
        mandatory_rules?: {
            template_sets?: string[] | undefined;
            disable_default_globals?: boolean | undefined;
            inline_rules?: {
                text: string;
                id: string;
                level?: "error" | "warn" | "info" | undefined;
                when?: string | undefined;
            }[] | undefined;
        } | undefined;
        output_file?: string | undefined;
        beads_integration?: "auto" | "never" | "always" | undefined;
        beads_write_notes?: boolean | undefined;
        heartbeat?: unknown;
    }>;
}, "strip", z.ZodTypeAny, {
    specialist: {
        metadata: {
            name: string;
            version: string;
            description: string;
            category: string;
            author?: string | undefined;
            created?: string | undefined;
            updated?: string | undefined;
            tags?: string[] | undefined;
        };
        execution: {
            mode: "tool" | "skill" | "auto";
            model: string;
            timeout_ms: number;
            max_retries: number;
            interactive: boolean;
            response_format: "text" | "json" | "markdown";
            output_type: "codegen" | "analysis" | "review" | "synthesis" | "orchestration" | "workflow" | "research" | "custom";
            permission_required: "READ_ONLY" | "LOW" | "MEDIUM" | "HIGH";
            requires_worktree: boolean;
            auto_commit: "never" | "checkpoint_on_waiting" | "checkpoint_on_terminal";
            fallback_model?: string | undefined;
            stall_timeout_ms?: number | undefined;
            thinking_level?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
            extensions?: {
                serena?: boolean | undefined;
                gitnexus?: boolean | undefined;
            } | undefined;
            preferred_profile?: string | undefined;
            approval_mode?: string | undefined;
        };
        prompt: {
            task_template: string;
            system?: string | undefined;
            normalize_template?: string | undefined;
            output_schema?: Record<string, unknown> | undefined;
            examples?: unknown[] | undefined;
            skill_inherit?: string | undefined;
        };
        beads_integration: "auto" | "never" | "always";
        beads_write_notes: boolean;
        validation?: {
            files_to_watch?: string[] | undefined;
            stale_threshold_days?: number | undefined;
        } | undefined;
        skills?: {
            paths?: string[] | undefined;
            scripts?: {
                run: string;
                phase: "pre" | "post";
                inject_output: boolean;
            }[] | undefined;
        } | undefined;
        capabilities?: {
            required_tools?: string[] | undefined;
            external_commands?: string[] | undefined;
        } | undefined;
        communication?: {
            next_specialists?: string | string[] | undefined;
        } | undefined;
        stall_detection?: {
            running_silence_warn_ms?: number | undefined;
            running_silence_error_ms?: number | undefined;
            waiting_stale_ms?: number | undefined;
            tool_duration_warn_ms?: number | undefined;
        } | undefined;
        mandatory_rules?: {
            template_sets: string[];
            disable_default_globals: boolean;
            inline_rules: {
                text: string;
                id: string;
                level: "error" | "warn" | "info";
                when?: string | undefined;
            }[];
        } | undefined;
        output_file?: string | undefined;
        heartbeat?: unknown;
    };
}, {
    specialist: {
        metadata: {
            name: string;
            version: string;
            description: string;
            category: string;
            author?: string | undefined;
            created?: string | undefined;
            updated?: string | undefined;
            tags?: string[] | undefined;
        };
        execution: {
            model: string;
            mode?: "tool" | "skill" | "auto" | undefined;
            fallback_model?: string | undefined;
            timeout_ms?: number | undefined;
            stall_timeout_ms?: number | undefined;
            max_retries?: number | undefined;
            interactive?: boolean | undefined;
            response_format?: "text" | "json" | "markdown" | undefined;
            output_type?: "codegen" | "analysis" | "review" | "synthesis" | "orchestration" | "workflow" | "research" | "custom" | undefined;
            permission_required?: "READ_ONLY" | "LOW" | "MEDIUM" | "HIGH" | undefined;
            requires_worktree?: boolean | undefined;
            thinking_level?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
            auto_commit?: "never" | "checkpoint_on_waiting" | "checkpoint_on_terminal" | undefined;
            extensions?: {
                serena?: boolean | undefined;
                gitnexus?: boolean | undefined;
            } | undefined;
            preferred_profile?: string | undefined;
            approval_mode?: string | undefined;
        };
        prompt: {
            task_template: string;
            system?: string | undefined;
            normalize_template?: string | undefined;
            output_schema?: Record<string, unknown> | undefined;
            examples?: unknown[] | undefined;
            skill_inherit?: string | undefined;
        };
        validation?: {
            files_to_watch?: string[] | undefined;
            stale_threshold_days?: number | undefined;
        } | undefined;
        skills?: {
            paths?: string[] | undefined;
            scripts?: {
                phase: "pre" | "post";
                run?: string | undefined;
                path?: string | undefined;
                inject_output?: boolean | undefined;
            }[] | undefined;
        } | undefined;
        capabilities?: {
            required_tools?: string[] | undefined;
            external_commands?: string[] | undefined;
        } | undefined;
        communication?: {
            next_specialists?: string | string[] | undefined;
        } | undefined;
        stall_detection?: {
            running_silence_warn_ms?: number | undefined;
            running_silence_error_ms?: number | undefined;
            waiting_stale_ms?: number | undefined;
            tool_duration_warn_ms?: number | undefined;
        } | undefined;
        mandatory_rules?: {
            template_sets?: string[] | undefined;
            disable_default_globals?: boolean | undefined;
            inline_rules?: {
                text: string;
                id: string;
                level?: "error" | "warn" | "info" | undefined;
                when?: string | undefined;
            }[] | undefined;
        } | undefined;
        output_file?: string | undefined;
        beads_integration?: "auto" | "never" | "always" | undefined;
        beads_write_notes?: boolean | undefined;
        heartbeat?: unknown;
    };
}>;
export type Specialist = z.infer<typeof SpecialistSchema>;
export type ScriptEntry = {
    run: string;
    phase: 'pre' | 'post';
    inject_output: boolean;
};
export interface ValidationError {
    path: string;
    message: string;
    code: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: string[];
}
/**
 * Validate specialist JSON content and return structured results.
 * Use this for CLI validation and friendly error messages.
 */
export declare function validateSpecialist(jsonContent: string): Promise<ValidationResult>;
export declare function parseSpecialist(jsonContent: string): Promise<Specialist>;
//# sourceMappingURL=schema.d.ts.map