import * as z from 'zod';
export declare const SpecialistSchema: z.ZodObject<{
    specialist: z.ZodObject<{
        metadata: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>;
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>;
        prompt: z.ZodObject<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>;
        skills: z.ZodOptional<z.ZodObject<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        validation: z.ZodOptional<z.ZodObject<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        stall_detection: z.ZodOptional<z.ZodObject<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        mandatory_rules: z.ZodOptional<z.ZodObject<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        /** Write the final output to this file path after the session completes */
        output_file: z.ZodOptional<z.ZodString>;
        beads_integration: z.ZodDefault<z.ZodEnum<["auto", "always", "never"]>>;
        beads_write_notes: z.ZodDefault<z.ZodBoolean>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        metadata: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>;
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>;
        prompt: z.ZodObject<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>;
        skills: z.ZodOptional<z.ZodObject<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        validation: z.ZodOptional<z.ZodObject<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        stall_detection: z.ZodOptional<z.ZodObject<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        mandatory_rules: z.ZodOptional<z.ZodObject<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        /** Write the final output to this file path after the session completes */
        output_file: z.ZodOptional<z.ZodString>;
        beads_integration: z.ZodDefault<z.ZodEnum<["auto", "always", "never"]>>;
        beads_write_notes: z.ZodDefault<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        metadata: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>;
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>;
        prompt: z.ZodObject<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>;
        skills: z.ZodOptional<z.ZodObject<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        validation: z.ZodOptional<z.ZodObject<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        stall_detection: z.ZodOptional<z.ZodObject<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        mandatory_rules: z.ZodOptional<z.ZodObject<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        /** Write the final output to this file path after the session completes */
        output_file: z.ZodOptional<z.ZodString>;
        beads_integration: z.ZodDefault<z.ZodEnum<["auto", "always", "never"]>>;
        beads_write_notes: z.ZodDefault<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    specialist: z.ZodObject<{
        metadata: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>;
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>;
        prompt: z.ZodObject<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>;
        skills: z.ZodOptional<z.ZodObject<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        validation: z.ZodOptional<z.ZodObject<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        stall_detection: z.ZodOptional<z.ZodObject<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        mandatory_rules: z.ZodOptional<z.ZodObject<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        /** Write the final output to this file path after the session completes */
        output_file: z.ZodOptional<z.ZodString>;
        beads_integration: z.ZodDefault<z.ZodEnum<["auto", "always", "never"]>>;
        beads_write_notes: z.ZodDefault<z.ZodBoolean>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        metadata: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>;
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>;
        prompt: z.ZodObject<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>;
        skills: z.ZodOptional<z.ZodObject<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        validation: z.ZodOptional<z.ZodObject<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        stall_detection: z.ZodOptional<z.ZodObject<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        mandatory_rules: z.ZodOptional<z.ZodObject<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        /** Write the final output to this file path after the session completes */
        output_file: z.ZodOptional<z.ZodString>;
        beads_integration: z.ZodDefault<z.ZodEnum<["auto", "always", "never"]>>;
        beads_write_notes: z.ZodDefault<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        metadata: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>;
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>;
        prompt: z.ZodObject<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>;
        skills: z.ZodOptional<z.ZodObject<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        validation: z.ZodOptional<z.ZodObject<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        stall_detection: z.ZodOptional<z.ZodObject<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        mandatory_rules: z.ZodOptional<z.ZodObject<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        /** Write the final output to this file path after the session completes */
        output_file: z.ZodOptional<z.ZodString>;
        beads_integration: z.ZodDefault<z.ZodEnum<["auto", "always", "never"]>>;
        beads_write_notes: z.ZodDefault<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    specialist: z.ZodObject<{
        metadata: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>;
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>;
        prompt: z.ZodObject<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>;
        skills: z.ZodOptional<z.ZodObject<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        validation: z.ZodOptional<z.ZodObject<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        stall_detection: z.ZodOptional<z.ZodObject<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        mandatory_rules: z.ZodOptional<z.ZodObject<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        /** Write the final output to this file path after the session completes */
        output_file: z.ZodOptional<z.ZodString>;
        beads_integration: z.ZodDefault<z.ZodEnum<["auto", "always", "never"]>>;
        beads_write_notes: z.ZodDefault<z.ZodBoolean>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        metadata: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>;
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>;
        prompt: z.ZodObject<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>;
        skills: z.ZodOptional<z.ZodObject<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        validation: z.ZodOptional<z.ZodObject<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        stall_detection: z.ZodOptional<z.ZodObject<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        mandatory_rules: z.ZodOptional<z.ZodObject<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        /** Write the final output to this file path after the session completes */
        output_file: z.ZodOptional<z.ZodString>;
        beads_integration: z.ZodDefault<z.ZodEnum<["auto", "always", "never"]>>;
        beads_write_notes: z.ZodDefault<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        metadata: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            name: z.ZodString;
            version: z.ZodString;
            description: z.ZodString;
            category: z.ZodString;
            updated: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>;
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
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
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                serena: z.ZodOptional<z.ZodBoolean>;
                gitnexus: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>;
        }, z.ZodTypeAny, "passthrough">>;
        prompt: z.ZodObject<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            system: z.ZodOptional<z.ZodString>;
            task_template: z.ZodString;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            skill_inherit: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>;
        skills: z.ZodOptional<z.ZodObject<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
            paths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Pre/post scripts or commands run locally (not inside the agent session) */
            scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                run: z.ZodString;
                phase: z.ZodEnum<["pre", "post"]>;
                inject_output: z.ZodDefault<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** Pi tool names required by this specialist (validated pre-run against permission level). */
            required_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** CLI binaries the agent depends on (validated at run-time before session starts). */
            external_commands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        validation: z.ZodOptional<z.ZodObject<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
            files_to_watch: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Days before STALE escalates to AGED */
            stale_threshold_days: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        stall_detection: z.ZodOptional<z.ZodObject<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            /** ms of silence while running before warn (default 60_000) */
            running_silence_warn_ms: z.ZodOptional<z.ZodNumber>;
            /** ms of silence while running before marking stale (default 300_000) */
            running_silence_error_ms: z.ZodOptional<z.ZodNumber>;
            /** ms in waiting state before emitting warning (default 3_600_000) */
            waiting_stale_ms: z.ZodOptional<z.ZodNumber>;
            /** ms a single tool execution may run before warning (default 120_000) */
            tool_duration_warn_ms: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>>;
        mandatory_rules: z.ZodOptional<z.ZodObject<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            template_sets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            disable_default_globals: z.ZodDefault<z.ZodBoolean>;
            inline_rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodString;
                level: z.ZodDefault<z.ZodEnum<["error", "warn", "info"]>>;
                text: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.ZodTypeAny, "passthrough">>, "many">>;
        }, z.ZodTypeAny, "passthrough">>>;
        /** Write the final output to this file path after the session completes */
        output_file: z.ZodOptional<z.ZodString>;
        beads_integration: z.ZodDefault<z.ZodEnum<["auto", "always", "never"]>>;
        beads_write_notes: z.ZodDefault<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough">>;
}, z.ZodTypeAny, "passthrough">>;
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