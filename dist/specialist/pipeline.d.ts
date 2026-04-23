import type { SpecialistRunner } from './runner.js';
export interface PipelineStep {
    name: string;
    prompt: string;
    variables?: Record<string, string>;
    backend_override?: string;
}
export interface PipelineResult {
    steps: Array<{
        specialist: string;
        status: 'fulfilled' | 'rejected';
        output: string | null;
        durationMs: number | null;
        error: string | null;
    }>;
    final_output: string | null;
}
/**
 * Run specialists sequentially, passing each output as $previous_result
 * to the next step.
 */
export declare function runPipeline(steps: PipelineStep[], runner: SpecialistRunner, onProgress?: (msg: string) => void): Promise<PipelineResult>;
//# sourceMappingURL=pipeline.d.ts.map