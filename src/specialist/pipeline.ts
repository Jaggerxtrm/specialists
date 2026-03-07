// src/specialist/pipeline.ts
//
// Sequential pipeline: each specialist in the chain receives the previous
// specialist's output as the $previous_result template variable.
// Implements §5.3 Pattern 1: Message Queue from omni-specialist.md.
//
import type { SpecialistRunner, RunOptions } from './runner.js';

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
export async function runPipeline(
  steps: PipelineStep[],
  runner: SpecialistRunner,
  onProgress?: (msg: string) => void,
): Promise<PipelineResult> {
  const results: PipelineResult['steps'] = [];
  let previousResult = '';

  for (const step of steps) {
    const options: RunOptions = {
      name: step.name,
      prompt: step.prompt,
      variables: { ...step.variables, previous_result: previousResult },
      backendOverride: step.backend_override,
    };

    try {
      const result = await runner.run(options, onProgress);
      previousResult = result.output;
      results.push({
        specialist: step.name,
        status: 'fulfilled',
        output: result.output,
        durationMs: result.durationMs,
        error: null,
      });
    } catch (err: any) {
      results.push({
        specialist: step.name,
        status: 'rejected',
        output: null,
        durationMs: null,
        error: err.message ?? String(err),
      });
      // Stop pipeline on failure
      break;
    }
  }

  return {
    steps: results,
    final_output: results[results.length - 1]?.output ?? null,
  };
}
