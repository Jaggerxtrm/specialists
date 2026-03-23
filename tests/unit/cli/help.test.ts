// tests/unit/cli/help.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('help CLI — run()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function captureHelp(): Promise<string> {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      output.push(msg ?? '');
    });
    const { run } = await import('../../../src/cli/help.js');
    await run();
    return output.join('\n');
  }

  it('prints usage section', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('Usage:');
    expect(combined).toContain('specialists [command]');
  });

  it('teaches bead-first workflow', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('bd create');
    expect(combined).toContain('--bead');
    expect(combined).toContain('Tracked work');
  });

  it('distinguishes tracked vs ad-hoc work', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('Ad-hoc work');
    expect(combined).toContain('--prompt');
  });

  it('mentions --context-depth and --no-beads semantics', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('--context-depth');
    expect(combined).toContain('--no-beads');
    expect(combined).toContain('does not disable bead reading');
  });

  it('lists core commands plainly', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('Core commands:');
    for (const cmd of ['init', 'list', 'run', 'feed', 'result', 'stop', 'status', 'doctor', 'quickstart']) {
      expect(combined, `missing command: ${cmd}`).toContain(cmd);
    }
  });

  it('shows deprecated setup and install commands', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('[deprecated] Use specialists init instead');
  });

  it('mentions xtrm worktree commands', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('xtrm worktree commands:');
    expect(combined).toContain('xt pi');
    expect(combined).toContain('xt end');
  });

  it('references quickstart and command-specific help', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('specialists quickstart');
    expect(combined).toContain('specialists run --help');
    expect(combined).toContain('specialists init --help');
  });

  it('states project-only model', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('project-only');
  });
});
