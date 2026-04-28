import { type ChildProcess } from 'node:child_process';
import { SpecialistLoader } from './loader.js';
import type { Specialist } from './schema.js';
export type ScriptSpecialistErrorType = 'specialist_not_found' | 'specialist_load_error' | 'template_variable_missing' | 'auth' | 'quota' | 'timeout' | 'network' | 'invalid_json' | 'output_too_large' | 'internal';
export interface ScriptGenerateRequest {
    specialist: string;
    variables?: Record<string, string>;
    template?: string;
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
        model?: string;
        duration_ms?: number;
        trace_id?: string;
    };
}
export type ScriptGenerateResult = ScriptGenerateSuccess | ScriptGenerateFailure;
export interface ScriptRunnerOptions {
    loader: SpecialistLoader;
    projectDir?: string;
    fallbackModel?: string;
    observabilityDbPath?: string;
    onChild?: (child: ChildProcess) => void;
    onAuditFailure?: (error: unknown) => void;
}
export declare function compatGuard(spec: Specialist): void;
export declare function renderTaskTemplate(template: string, variables: Record<string, string>): string;
export declare function runScriptSpecialist(input: ScriptGenerateRequest, options: ScriptRunnerOptions): Promise<ScriptGenerateResult>;
//# sourceMappingURL=script-runner.d.ts.map