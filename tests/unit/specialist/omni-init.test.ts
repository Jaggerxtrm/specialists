// tests/unit/specialist/omni-init.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createOmniInitTool } from '../../../src/tools/specialist/omni_init.tool.js';

function makeLoader(specialists = [{ name: 'codebase-explorer', scope: 'system' }]) {
  return { list: vi.fn().mockResolvedValue(specialists) } as any;
}

describe('omni_init tool', () => {
  it('returns specialist list', async () => {
    const tool = createOmniInitTool(makeLoader(), {
      bdAvailable: () => false,
      beadsExists: () => true,
      bdInit: () => ({ status: 0 }),
    });
    const result = await tool.execute({});
    expect(result.specialists).toHaveLength(1);
    expect(result.specialists[0].name).toBe('codebase-explorer');
  });

  it('skips bd init when bd not available', async () => {
    const bdInit = vi.fn().mockReturnValue({ status: 0 });
    const tool = createOmniInitTool(makeLoader(), {
      bdAvailable: () => false,
      beadsExists: () => false,
      bdInit,
    });
    const result = await tool.execute({});
    expect(bdInit).not.toHaveBeenCalled();
    expect(result.beads.available).toBe(false);
    expect(result.beads.initialized).toBe(false);
  });

  it('runs bd init when bd available and .beads/ missing', async () => {
    const bdInit = vi.fn().mockReturnValue({ status: 0 });
    const tool = createOmniInitTool(makeLoader(), {
      bdAvailable: () => true,
      beadsExists: () => false,
      bdInit,
    });
    const result = await tool.execute({});
    expect(bdInit).toHaveBeenCalledOnce();
    expect(result.beads.available).toBe(true);
    expect(result.beads.initialized).toBe(true);
  });

  it('skips bd init when .beads/ already exists', async () => {
    const bdInit = vi.fn().mockReturnValue({ status: 0 });
    const tool = createOmniInitTool(makeLoader(), {
      bdAvailable: () => true,
      beadsExists: () => true,
      bdInit,
    });
    const result = await tool.execute({});
    expect(bdInit).not.toHaveBeenCalled();
    expect(result.beads.available).toBe(true);
    expect(result.beads.initialized).toBe(true);
  });

  it('reports initialized false when bd init fails', async () => {
    const tool = createOmniInitTool(makeLoader(), {
      bdAvailable: () => true,
      beadsExists: () => false,
      bdInit: () => ({ status: 1 }),
    });
    const result = await tool.execute({});
    expect(result.beads.initialized).toBe(false);
  });
});
