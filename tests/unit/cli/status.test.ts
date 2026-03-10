// tests/unit/cli/status.test.ts
// status.ts spawns real processes (pi, bd, which). We test it as a smoke test:
// verify it runs without throwing and produces output with the expected sections.
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('status CLI — run()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('completes without throwing', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { run } = await import('../../../src/cli/status.js');
    await expect(run()).resolves.not.toThrow();
  });

  it('prints Specialists section header', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      output.push(msg ?? '');
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    // Strip ANSI codes for assertion
    const clean = output.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    expect(clean).toContain('Specialists');
  });

  it('prints pi section header', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      output.push(msg ?? '');
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = output.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    expect(clean).toContain('pi');
  });

  it('prints beads section header', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      output.push(msg ?? '');
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = output.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    expect(clean).toContain('beads');
  });

  it('prints MCP section header', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      output.push(msg ?? '');
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = output.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    expect(clean).toContain('MCP');
  });
});
