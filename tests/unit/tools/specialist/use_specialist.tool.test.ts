import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeadsClient } from '../../../../src/specialist/beads.js';
import { createUseSpecialistTool } from '../../../../src/tools/specialist/use_specialist.tool.js';

describe('use_specialist tool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts bead_id input and forwards bead-derived prompt/variables', async () => {
    const readBead = vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue({
      id: 'unitAI-55d',
      title: 'Refactor auth',
      description: 'Extract JWT validation',
      notes: 'Preserve current middleware contract',
    });
    const runner = {
      run: vi.fn().mockResolvedValue({ output: 'ok', durationMs: 1, model: 'gemini', backend: 'google-gemini-cli' }),
    } as any;

    const tool = createUseSpecialistTool(runner);
    await tool.execute({ name: 'code-review', bead_id: 'unitAI-55d' });

    expect(readBead).toHaveBeenCalledWith('unitAI-55d');
    expect(runner.run).toHaveBeenCalledWith({
      name: 'code-review',
      prompt: '# Task: Refactor auth\nExtract JWT validation\n\n## Notes\nPreserve current middleware contract',
      variables: {
        bead_context: '# Task: Refactor auth\nExtract JWT validation\n\n## Notes\nPreserve current middleware contract',
        bead_id: 'unitAI-55d',
      },
      backendOverride: undefined,
      autonomyLevel: undefined,
      inputBeadId: 'unitAI-55d',
    }, undefined);
  });

  it('throws when bead_id cannot be resolved', async () => {
    vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue(null);
    const tool = createUseSpecialistTool({ run: vi.fn() } as any);

    await expect(tool.execute({ name: 'code-review', bead_id: 'unitAI-missing' }))
      .rejects.toThrow("Unable to read bead 'unitAI-missing' via bd show --json");
  });
});
