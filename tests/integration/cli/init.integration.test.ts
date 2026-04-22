import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../../..');

async function setupXtrmStructure(cwd: string) {
  await mkdir(join(cwd, '.xtrm', 'skills', 'active'), { recursive: true });
  await mkdir(join(cwd, '.xtrm', 'skills', 'default'), { recursive: true });
  await mkdir(join(cwd, '.xtrm', 'hooks'), { recursive: true });
  await mkdir(join(cwd, '.claude'), { recursive: true });
  await mkdir(join(cwd, '.pi'), { recursive: true });
  await symlink(join(cwd, '.xtrm', 'skills', 'active'), join(cwd, '.claude', 'skills'));
  await symlink(join(cwd, '.xtrm', 'skills', 'active'), join(cwd, '.pi', 'skills'));
}

function runCli(args: string[], cwd: string) {
  return spawnSync('bun', ['run', join(repoRoot, 'src/index.ts'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', SPECIALISTS_INIT_FORCE: '1' },
  });
}

describe('integration: specialists init', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('writes project-scoped .mcp.json via the real CLI entrypoint', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-init-'));
    await setupXtrmStructure(tempDir);

    const result = runCli(['init', '--no-xtrm-check'], tempDir);

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
    await setupXtrmStructure(tempDir);
    await writeFile(join(tempDir, '.mcp.json'), JSON.stringify({
      mcpServers: {
        other: { command: 'other-server', args: ['--json'] },
      },
    }, null, 2));

    const result = runCli(['init', '--no-xtrm-check'], tempDir);

    expect(result.status).toBe(0);

    const mcp = JSON.parse(await readFile(join(tempDir, '.mcp.json'), 'utf-8'));
    expect(mcp.mcpServers.other).toEqual({ command: 'other-server', args: ['--json'] });
    expect(mcp.mcpServers.specialists).toEqual({ command: 'specialists', args: [] });
  });
});
