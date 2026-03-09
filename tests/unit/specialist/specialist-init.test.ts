// tests/unit/specialist/specialist-init.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createSpecialistInitTool, SpecialistInitDeps } from '../../../src/tools/specialist/specialist_init.tool.js';

const makeLoader = (specialists: string[] = ['foo', 'bar']) =>
  ({ list: vi.fn().mockResolvedValue(specialists) } as any);

const makeDeps = (overrides: Partial<SpecialistInitDeps> = {}): SpecialistInitDeps => ({
  bdAvailable: vi.fn().mockReturnValue(true),
  beadsExists: vi.fn().mockReturnValue(false),
  bdInit: vi.fn().mockReturnValue({ status: 0 }),
  ...overrides,
});

describe('specialist_init tool', () => {
  it('returns specialist list', async () => {
    const tool = createSpecialistInitTool(makeLoader(['alpha', 'beta']), makeDeps());
    const result = await tool.execute({});
    expect(result.specialists).toEqual(['alpha', 'beta']);
  });

  it('skips bd init when bd not available', async () => {
    const deps = makeDeps({ bdAvailable: () => false });
    const tool = createSpecialistInitTool(makeLoader(), deps);
    const result = await tool.execute({});
    expect(result.beads.available).toBe(false);
    expect(result.beads.initialized).toBe(false);
    expect(deps.bdInit).not.toHaveBeenCalled();
  });

  it('runs bd init when bd available and .beads/ missing', async () => {
    const deps = makeDeps({ beadsExists: () => false, bdAvailable: () => true });
    const tool = createSpecialistInitTool(makeLoader(), deps);
    const result = await tool.execute({});
    expect(deps.bdInit).toHaveBeenCalledOnce();
    expect(result.beads.initialized).toBe(true);
  });

  it('skips bd init when .beads/ already exists', async () => {
    const deps = makeDeps({ beadsExists: () => true });
    const tool = createSpecialistInitTool(makeLoader(), deps);
    const result = await tool.execute({});
    expect(deps.bdInit).not.toHaveBeenCalled();
    expect(result.beads.initialized).toBe(true);
  });

  it('reports initialized false when bd init fails', async () => {
    const deps = makeDeps({ bdInit: () => ({ status: 1 }) });
    const tool = createSpecialistInitTool(makeLoader(), deps);
    const result = await tool.execute({});
    expect(result.beads.initialized).toBe(false);
  });
});
