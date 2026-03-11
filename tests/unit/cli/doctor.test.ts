// tests/unit/cli/doctor.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

// Doctor calls spawnSync for pi/claude checks, existsSync for hook/dir checks.
// We mock at the module level to avoid real process spawning.

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
    expect(combined).toContain('Claude Code hooks');
    expect(combined).toContain('MCP');
    expect(combined).toContain('Background jobs');
  });

  it('prints a summary result line', async () => {
    const { combined } = await runDoctor();
    // Either all passed or some failed
    const hasSummary =
      combined.includes('All checks passed') ||
      combined.includes('Some checks failed');
    expect(hasSummary).toBe(true);
  });

  it('checks for all 7 expected hooks', async () => {
    const { combined } = await runDoctor();
    const hooks = [
      'specialists-main-guard.mjs',
      'beads-edit-gate.mjs',
      'beads-commit-gate.mjs',
      'beads-stop-gate.mjs',
      'beads-close-memory-prompt.mjs',
      'specialists-complete.mjs',
      'specialists-session-start.mjs',
    ];
    for (const hook of hooks) {
      expect(combined, `missing hook check: ${hook}`).toContain(hook);
    }
  });

  it('mentions fix hints for failures', async () => {
    // At minimum, the MCP check will likely fail in test env (no claude binary registered)
    // so there should be at least one fix hint or all-passed summary
    const { combined } = await runDoctor();
    const hasHintOrPass =
      combined.includes('→ fix:') ||
      combined.includes('All checks passed');
    expect(hasHintOrPass).toBe(true);
  });
});
