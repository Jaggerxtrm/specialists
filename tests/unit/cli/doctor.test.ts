import { describe, it, expect, vi, afterEach } from 'vitest';

describe('doctor CLI — run()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function runDoctor(): Promise<{ combined: string }> {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => output.push(msg ?? ''));
    const { run } = await import('../../../src/cli/doctor.js');
    await run();
    return { combined: output.join('\n') };
  }

  it('prints specialists doctor header', async () => {
    const { combined } = await runDoctor();
    expect(combined).toContain('specialists doctor');
  });

  it('prints all section headers', async () => {
    const { combined } = await runDoctor();
    expect(combined).toContain('pi');
    expect(combined).toContain('beads');
    expect(combined).toContain('xtrm-tools');
    expect(combined).toContain('Claude Code hooks');
    expect(combined).toContain('MCP');
    expect(combined).toContain('Skill drift');
    expect(combined).toContain('Background jobs');
  });

  it('prints a summary result line', async () => {
    const { combined } = await runDoctor();
    const hasSummary =
      combined.includes('All checks passed') ||
      combined.includes('Some checks failed');
    expect(hasSummary).toBe(true);
  });

  it('checks for both expected hooks', async () => {
    const { combined } = await runDoctor();
    const hooks = [
      'specialists-complete.mjs',
      'specialists-session-start.mjs',
    ];
    for (const hook of hooks) {
      expect(combined, `missing hook check: ${hook}`).toContain(hook);
    }
  });

  it('mentions fix hints for failures', async () => {
    const { combined } = await runDoctor();
    const hasHintOrPass =
      combined.includes('→ fix:') ||
      combined.includes('All checks passed');
    expect(hasHintOrPass).toBe(true);
  });
});
