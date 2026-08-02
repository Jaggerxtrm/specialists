import { afterEach, describe, expect, it, vi } from 'vitest';

const originalArgv = [...process.argv];

afterEach(() => {
  process.argv = [...originalArgv];
  vi.restoreAllMocks();
});

describe('render-skill-prefix CLI', () => {
  it('rejects no arguments with a usage error before loading a specialist', async () => {
    process.argv = ['node', 'specialists', 'render-skill-prefix'];
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number | string) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/render-skill-prefix.js');
    await expect(run()).rejects.toThrow('exit:1');
    expect(output.join('')).toContain('Usage: specialists render-skill-prefix <name> [--surface pi|claude|codex]');
  });
});
