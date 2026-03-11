// tests/unit/cli/help.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('help CLI — run()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
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

  it('prints all known subcommands', async () => {
    const combined = await captureHelp();
    const expected = ['install', 'list', 'version', 'init', 'edit', 'run', 'status', 'help',
      'quickstart', 'doctor', 'setup'];
    for (const cmd of expected) {
      expect(combined, `missing command: ${cmd}`).toContain(cmd);
    }
  });

  it('prints specialists <command> usage header', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('specialists <command>');
  });

  it('prints command categories', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('Setup');
    expect(combined).toContain('Discovery');
    expect(combined).toContain('Running');
    expect(combined).toContain('Jobs');
  });

  it('references quickstart guide', async () => {
    const combined = await captureHelp();
    expect(combined).toContain('quickstart');
  });
});
