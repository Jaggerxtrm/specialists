// tests/unit/cli/help.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('help CLI — run()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('prints all known subcommands', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      output.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/help.js');
    await run();

    const combined = output.join('\n');
    const expected = ['install', 'list', 'version', 'init', 'edit', 'run', 'status', 'help'];
    for (const cmd of expected) {
      expect(combined).toContain(cmd);
    }
  });

  it('prints specialists <command> usage header', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      output.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/help.js');
    await run();

    expect(output.join('\n')).toContain('specialists <command>');
  });
});
