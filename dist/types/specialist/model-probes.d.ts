import { SpecialistLoader } from './loader.js';
import { runScriptSpecialist, type ScriptGenerateResult, type ScriptRunnerOptions } from './script-runner.js';
export type ProbeVerdict = 'PASS' | 'PARTIAL' | 'FAIL';
export interface AgenticFollowthroughMetrics {
    turns_used: number;
    tools_used: number;
    output_length: number;
    files_outside_scope_touched: number;
    premature_agent_end: boolean;
}
export interface AgenticFollowthroughResult {
    verdict: ProbeVerdict;
    metrics: AgenticFollowthroughMetrics;
    sample_output: string;
    transcript_path: string;
}
export interface AgenticFollowthroughOptions {
    cacheDir?: string;
    timeoutMs?: number;
    runSpecialist?: (input: Parameters<typeof runScriptSpecialist>[0], options: ScriptRunnerOptions) => Promise<ScriptGenerateResult>;
    loader?: SpecialistLoader;
    projectDir?: string;
    now?: Date;
}
export declare function runAgenticFollowthroughProbe(model: string, specName: string, opts?: AgenticFollowthroughOptions): Promise<AgenticFollowthroughResult>;
export declare function getProbeRunDir(model: string, specName: string, cacheDir?: string): string;
export declare function getProbeCanonicalPath(model: string, specName: string, cacheDir?: string): string;
//# sourceMappingURL=model-probes.d.ts.map