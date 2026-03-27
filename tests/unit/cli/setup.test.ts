// tests/unit/cli/setup.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

describe('setup CLI (deprecated)', () => {
  let out: string[];

  beforeEach(() => {
    out = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => out.push(msg ?? ''));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function runSetup(): Promise<{ stdout: string }> {
    const { run } = await import('../../../src/cli/setup.js');
    await run();
    return { stdout: out.join('\n') };
  }

  it('shows deprecation message and redirects to init', async () => {
    const { stdout } = await runSetup();
    expect(stdout).toContain('DEPRECATED');
    expect(stdout).toContain('specialists init');
  });

  it('mentions key init features', async () => {
    const { stdout } = await runSetup();
    expect(stdout).toContain('MCP server');
    expect(stdout).toContain('workflow context');
  });
});