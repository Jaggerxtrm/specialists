import { type ChildProcess } from 'node:child_process';
import { SpecialistLoader } from './loader.js';
import type { Specialist } from './schema.js';
export type ScriptSpecialistErrorType = 'specialist_not_found' | 'specialist_load_error' | 'pre_script_failed' | 'runtime_tool_catalog_unavailable' | 'template_variable_missing' | 'template_field_misuse' | 'auth' | 'quota' | 'timeout' | 'network' | 'invalid_json' | 'prompt_too_large' | 'output_too_large' | 'internal';
export interface ScriptGenerateRequest {
    specialist: string;
    requested_specialist?: string;
    variables?: Record<string, string>;
    template?: string;
    template_field?: string;
    model_override?: string;
    thinking_level?: string;
    timeout_ms?: number;
    trace?: boolean;
}
export interface ScriptGenerateSuccess {
    success: true;
    output: string;
    parsed_json?: unknown;
    meta: {
        specialist: string;
        requested_specialist?: string;
        resolved_specialist?: string;
        model: string;
        duration_ms: number;
        trace_id: string;
    };
}
export interface ScriptGenerateFailure {
    success: false;
    error: string;
    error_type: ScriptSpecialistErrorType;
    meta?: {
        specialist?: string;
        requested_specialist?: string;
        resolved_specialist?: string;
        model?: string;
        duration_ms?: number;
        trace_id?: string;
    };
}
export type ScriptGenerateResult = ScriptGenerateSuccess | ScriptGenerateFailure;
export interface TrustOptions {
    allowSkills?: boolean;
    allowSkillsRoots?: string[];
    allowLocalScripts?: boolean;
    allowWriteCapable?: boolean;
    baseDir?: string;
}
export declare class CompatGuardError extends Error {
    readonly field: 'execution.interactive' | 'execution.requires_worktree' | 'execution.permission_required' | 'skills.scripts' | 'skills.paths' | 'prompt.skill_inherit';
    constructor(field: 'execution.interactive' | 'execution.requires_worktree' | 'execution.permission_required' | 'skills.scripts' | 'skills.paths' | 'prompt.skill_inherit', message: string);
}
export interface SkillSource {
    path: string;
    sha256: string;
    source: 'skills.paths' | 'prompt.skill_inherit';
    attestation: 'observation_time_only';
}
export interface ScriptRunnerOptions {
    loader: SpecialistLoader;
    projectDir?: string;
    fallbackModel?: string;
    observabilityDbPath?: string;
    onChild?: (child: ChildProcess) => void;
    onAuditFailure?: (error: unknown) => void;
    trust?: TrustOptions;
    surface?: 'script' | 'serve';
}
export declare function compatGuard(spec: Specialist, trust?: TrustOptions): void;
export declare function computeSkillSources(spec: Specialist, baseDir?: string): SkillSource[];
export declare function renderTaskTemplate(template: string, variables: Record<string, string>): string;
export declare function applyOutputContract(prompt: string, spec: Specialist): string;
export declare const DEFAULT_PENDING_LINE_LIMIT_BYTES: number;
export declare const DEFAULT_ASSISTANT_TEXT_LIMIT_BYTES: number;
export declare const DEFAULT_STDERR_LIMIT_BYTES: number;
export declare const DEFAULT_PROMPT_LIMIT_BYTES: number;
export declare function resolvePromptLimitBytes(spec: Specialist): number;
export declare function resolveAssistantTextLimitBytes(spec: Specialist): number;
/**
 * Returns the deduplicated list of required output keys for this spec.
 * Sources, in order:
 *   1. `execution.expected_output_keys` — author-declared, fires for any response_format.
 *   2. `prompt.output_schema.required` — JSON Schema required array, only relevant when
 *      `response_format === 'json'` (the runtime parses the JSON anyway in that case).
 * Authors using `response_format: 'text'` with an inline JSON contract should declare
 * `expected_output_keys` so saved-but-corrupt outputs are caught instead of stored.
 */
export declare function collectRequiredOutputKeys(spec: {
    specialist: {
        execution: {
            response_format?: string;
            expected_output_keys?: unknown;
        };
        prompt: {
            output_schema?: {
                required?: unknown;
            };
        };
    };
}): string[];
/**
 * Detects when `input.template` looks like a spec field name (e.g. "task_template",
 * "normalize_template") instead of an actual template body. This catches the
 * production bug where a consumer passes the key name expecting the service to
 * dereference it on `spec.prompt`. Returns the offending field name when misused,
 * or null otherwise.
 */
export declare function detectTemplateFieldMisuse(template: string, specPrompt: Record<string, unknown> | null | undefined): string | null;
export declare function runScriptSpecialist(input: ScriptGenerateRequest, options: ScriptRunnerOptions): Promise<ScriptGenerateResult>;
export declare function collectModelCandidates(input: ScriptGenerateRequest, spec: Specialist, options: ScriptRunnerOptions): string[];
type AttemptFailureReason = 'assistant_text_too_large' | 'stderr_too_large' | 'malformed_line_too_large';
export declare function classifyAttempt(attempt: {
    text: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
    outputTooLarge: boolean;
    outputTooLargeReason?: AttemptFailureReason;
}): {
    retryable: boolean;
    kind: 'success' | 'failure';
    error: string;
    errorType: ScriptSpecialistErrorType;
    text: string;
};
export declare function isRetryableModelFailure(stderr: string, text: string): boolean;
export {};
//# sourceMappingURL=script-runner.d.ts.map