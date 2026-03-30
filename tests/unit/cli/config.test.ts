import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EXECUTOR_YAML = `specialist:
  metadata:
    name: executor
  execution:
    stall_timeout_ms: 120000
    timeout_ms: 0
`;

const EXPLORER_YAML = `specialist:
  metadata:
    name: explorer
  execution:
    stall_timeout_ms: 150000
    timeout_ms: 0
`;

describe('config CLI', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-config-test-'));
    const configDir = join(tempDir, 'config', 'specialists');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'executor.specialist.yaml'), EXECUTOR_YAML, 'utf-8');
    await writeFile(join(configDir, 'explorer.specialist.yaml'), EXPLORER_YAML, 'utf-8');

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('gets a key across all specialists', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = ['node', 'specialists', 'config', 'get', 'specialist.execution.stall_timeout_ms'];

    const { run } = await import('../../../src/cli/config.js');
    await run();

    const output = logSpy.mock.calls.map(call => String(call[0] ?? '')).join('\n');
    expect(output).toContain('executor');
    expect(output).toContain('explorer');
    expect(output).toContain('120000');
    expect(output).toContain('150000');
  });

  it('sets a key across all specialists by default', async () => {
    process.argv = ['node', 'specialists', 'config', 'set', 'specialist.execution.stall_timeout_ms', '180000'];

    const { run } = await import('../../../src/cli/config.js');
    await run();

    const executor = await readFile(join(tempDir, 'config', 'specialists', 'executor.specialist.yaml'), 'utf-8');
    const explorer = await readFile(join(tempDir, 'config', 'specialists', 'explorer.specialist.yaml'), 'utf-8');

    expect(executor).toContain('stall_timeout_ms: 180000');
    expect(explorer).toContain('stall_timeout_ms: 180000');
  });

  it('sets a key for one specialist with --name', async () => {
    process.argv = [
      'node',
      'specialists',
      'config',
      'set',
      'specialist.execution.stall_timeout_ms',
      '210000',
      '--name',
      'executor',
    ];

    const { run } = await import('../../../src/cli/config.js');
    await run();

    const executor = await readFile(join(tempDir, 'config', 'specialists', 'executor.specialist.yaml'), 'utf-8');
    const explorer = await readFile(join(tempDir, 'config', 'specialists', 'explorer.specialist.yaml'), 'utf-8');

    expect(executor).toContain('stall_timeout_ms: 210000');
    expect(explorer).toContain('stall_timeout_ms: 150000');
  });

  it('exits with code 1 on invalid arguments', async () => {
    process.argv = ['node', 'specialists', 'config', 'set', 'specialist.execution.stall_timeout_ms'];

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
      throw new Error(`exit:${code}`);
    });

    const { run } = await import('../../../src/cli/config.js');
    await expect(run()).rejects.toThrow('exit:1');

    exitSpy.mockRestore();
  });
});
