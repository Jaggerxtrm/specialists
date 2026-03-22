// tests/unit/specialist/run_parallel.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createRunParallelTool } from '../../../src/tools/specialist/run_parallel.tool.js';

function makeRunner(overrides: Partial<Record<string, unknown>>[] = []) {
  let call = 0;
  return {
    run: vi.fn().mockImplementation(async () => {
      const result = {
        output: 'result output',
        backend: 'google-gemini-cli',
        model: 'gemini',
        durationMs: 42,
        specialistVersion: '1.0.0',
        promptHash: 'abc123def4567890',
        beadId: undefined as string | undefined,
        ...(overrides[call] ?? {}),
      };
      call++;
      return result;
    }),
  } as any;
}

describe('createRunParallelTool', () => {
  it('includes beadId in result when runner returns one', async () => {
    const runner = makeRunner([{ beadId: 'specialists-abc-1' }, { beadId: 'specialists-abc-2' }]);
    const tool = createRunParallelTool(runner);
    const results = await tool.execute({
      specialists: [
        { name: 'spec-a', prompt: 'do A' },
        { name: 'spec-b', prompt: 'do B' },
      ],
      merge_strategy: 'collect',
      timeout_ms: 5000,
    });

    expect(results[0].beadId).toBe('specialists-abc-1');
    expect(results[1].beadId).toBe('specialists-abc-2');
  });

  it('includes undefined beadId when runner does not create a bead', async () => {
    const runner = makeRunner([{ beadId: undefined }]);
    const tool = createRunParallelTool(runner);
    const results = await tool.execute({
      specialists: [{ name: 'spec-a', prompt: 'do A' }],
      merge_strategy: 'collect',
      timeout_ms: 5000,
    });

    expect(results[0].beadId).toBeUndefined();
  });

  it('sets beadId to undefined on rejected specialist', async () => {
    const runner = {
      run: vi.fn().mockRejectedValue(new Error('specialist crashed')),
    } as any;
    const tool = createRunParallelTool(runner);
    const results = await tool.execute({
      specialists: [{ name: 'spec-a', prompt: 'fail' }],
      merge_strategy: 'collect',
      timeout_ms: 5000,
    });

    expect(results[0].status).toBe('rejected');
    expect(results[0].beadId).toBeUndefined();
    expect(results[0].error).toContain('specialist crashed');
  });

  it('returns output and durationMs alongside beadId', async () => {
    const runner = makeRunner([{ beadId: 'bead-xyz', output: 'hello', durationMs: 123 }]);
    const tool = createRunParallelTool(runner);
    const results = await tool.execute({
      specialists: [{ name: 'spec-a', prompt: 'go' }],
      merge_strategy: 'collect',
      timeout_ms: 5000,
    });

    expect(results[0]).toMatchObject({
      specialist: 'spec-a',
      status: 'fulfilled',
      output: 'hello',
      durationMs: 123,
      beadId: 'bead-xyz',
      error: null,
    });
  });
});
