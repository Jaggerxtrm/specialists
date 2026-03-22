import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../../..');

function runCli(args: string[], cwd: string) {
  return spawnSync('bun', ['run', join(repoRoot, 'src/index.ts'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('integration: specialists init', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('writes project-scoped .mcp.json via the real CLI entrypoint', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-init-'));

    const result = runCli(['init'], tempDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('specialists init');

    const mcp = JSON.parse(await readFile(join(tempDir, '.mcp.json'), 'utf-8'));
    expect(mcp).toEqual({
      mcpServers: {
        specialists: {
          command: 'specialists',
          args: [],
        },
      },
    });
  });

  it('merges specialists registration into an existing .mcp.json file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-init-'));
    await writeFile(join(tempDir, '.mcp.json'), JSON.stringify({
      mcpServers: {
        other: { command: 'other-server', args: ['--json'] },
      },
    }, null, 2));

    const result = runCli(['init'], tempDir);

    expect(result.status).toBe(0);

    const mcp = JSON.parse(await readFile(join(tempDir, '.mcp.json'), 'utf-8'));
    expect(mcp.mcpServers.other).toEqual({ command: 'other-server', args: ['--json'] });
    expect(mcp.mcpServers.specialists).toEqual({ command: 'specialists', args: [] });
  });
});
