/**
 * Run specialists sequentially, passing each output as $previous_result
 * to the next step.
 */
export async function runPipeline(steps, runner, onProgress) {
    const results = [];
    let previousResult = '';
    for (const step of steps) {
        const options = {
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
        }
        catch (err) {
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
//# sourceMappingURL=pipeline.js.map