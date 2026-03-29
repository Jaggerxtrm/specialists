// tests/unit/tools/specialist/start_specialist.tool.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createStartSpecialistTool } from '../../../../src/tools/specialist/start_specialist.tool.js';

function makeMockRunner(jobId = 'job-abc') {
  return {
    startAsync: vi.fn().mockResolvedValue(jobId),
  } as any;
}

function makeMockRegistry() {
  return {} as any;
}

describe('start_specialist tool', () => {
  it('returns job_id from startAsync', async () => {
    const runner = makeMockRunner('job-xyz');
    const tool = createStartSpecialistTool(runner, makeMockRegistry());

    const result = await tool.execute({ name: 'code-review', prompt: 'review this' }) as any;
    expect(result.job_id).toBe('job-xyz');
  });

  it('forwards bead_id as inputBeadId to startAsync', async () => {
    const runner = makeMockRunner();
    const tool = createStartSpecialistTool(runner, makeMockRegistry());

    await tool.execute({ name: 'bug-hunt', prompt: 'find bugs', bead_id: 'unitAI-ext-42' });

    expect(runner.startAsync).toHaveBeenCalledWith(
      expect.objectContaining({ inputBeadId: 'unitAI-ext-42' }),
      expect.anything(),
    );
  });

  it('works without bead_id — inputBeadId is undefined (backward compat)', async () => {
    const runner = makeMockRunner();
    const tool = createStartSpecialistTool(runner, makeMockRegistry());

    await tool.execute({ name: 'planner', prompt: 'plan sprint' });

    expect(runner.startAsync).toHaveBeenCalledWith(
      expect.objectContaining({ inputBeadId: undefined }),
      expect.anything(),
    );
  });

  it('forwards name, prompt, variables, and backend_override correctly', async () => {
    const runner = makeMockRunner();
    const tool = createStartSpecialistTool(runner, makeMockRegistry());

    await tool.execute({
      name: 'architect',
      prompt: 'design system',
      variables: { context: 'microservices' },
      backend_override: 'anthropic',
    });

    expect(runner.startAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'architect',
        prompt: 'design system',
        variables: { context: 'microservices' },
        backendOverride: 'anthropic',
      }),
      expect.anything(),
    );
  });
});
