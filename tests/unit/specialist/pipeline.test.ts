// tests/unit/specialist/pipeline.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '../../../src/specialist/pipeline.js';

function makeRunner(outputs: string[]) {
  let call = 0;
  return {
    run: vi.fn().mockImplementation(async (opts: any) => ({
      output: outputs[call++] ?? 'default',
      backend: 'gemini',
      model: 'gemini',
      durationMs: 10,
      specialistVersion: '1.0.0',
    })),
  } as any;
}

describe('runPipeline', () => {
  it('passes previous output as $previous_result to next step', async () => {
    const runner = makeRunner(['step1 output', 'step2 output']);
    await runPipeline(
      [
        { name: 'spec-a', prompt: 'do A' },
        { name: 'spec-b', prompt: 'do B' },
      ],
      runner,
    );
    const secondCallVars = runner.run.mock.calls[1][0].variables;
    expect(secondCallVars.previous_result).toBe('step1 output');
  });

  it('returns final_output from last step', async () => {
    const runner = makeRunner(['first', 'second', 'FINAL']);
    const result = await runPipeline(
      [
        { name: 'a', prompt: 'x' },
        { name: 'b', prompt: 'y' },
        { name: 'c', prompt: 'z' },
      ],
      runner,
    );
    expect(result.final_output).toBe('FINAL');
    expect(result.steps).toHaveLength(3);
  });

  it('stops pipeline on failure and marks step as rejected', async () => {
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ output: 'ok', backend: 'g', model: 'g', durationMs: 1, specialistVersion: '1' })
        .mockRejectedValueOnce(new Error('boom')),
    } as any;
    const result = await runPipeline(
      [{ name: 'a', prompt: 'x' }, { name: 'b', prompt: 'y' }, { name: 'c', prompt: 'z' }],
      runner,
    );
    expect(result.steps).toHaveLength(2); // stopped at step b
    expect(result.steps[1].status).toBe('rejected');
    expect(result.steps[1].error).toBe('boom');
    expect(result.final_output).toBeNull();
  });
});
