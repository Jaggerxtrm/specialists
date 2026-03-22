import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const INSTALL_SCRIPT = join(process.cwd(), 'bin', 'install.js');

async function makeBin(dir: string, name: string, body = 'echo ok') {
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh
${body}
`, 'utf8');
  await chmod(path, 0o755);
}

async function runInstall(cwd: string, pathDir: string) {
  try {
    const result = await execFileAsync(process.execPath, [INSTALL_SCRIPT], {
      cwd,
      env: { ...process.env, PATH: pathDir },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

describe('install script', () => {
  let tempDir: string;
  let fakeBin: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-install-test-'));
    fakeBin = join(tempDir, 'bin');
    await mkdir(fakeBin, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('installs specialists hooks and project MCP config', async () => {
    await makeBin(fakeBin, 'pi', 'echo 1.0.0');
    await makeBin(fakeBin, 'bd', 'echo 1.0.0');
    await makeBin(fakeBin, 'xt', 'echo 1.0.0');

    const result = await runInstall(tempDir, fakeBin);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('pi available');
    expect(result.stdout).toContain('registered specialists in .mcp.json');

    const settings = JSON.parse(await readFile(join(tempDir, '.claude', 'settings.json'), 'utf8'));
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toContain('specialists-complete.mjs');
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain('specialists-session-start.mjs');

    const mcp = JSON.parse(await readFile(join(tempDir, '.mcp.json'), 'utf8'));
    expect(mcp.mcpServers.specialists).toEqual({ command: 'specialists', args: [] });
  });

  it('is idempotent on repeated runs', async () => {
    await makeBin(fakeBin, 'pi', 'echo 1.0.0');
    await makeBin(fakeBin, 'bd', 'echo 1.0.0');
    await makeBin(fakeBin, 'xt', 'echo 1.0.0');

    expect((await runInstall(tempDir, fakeBin)).code).toBe(0);
    const second = await runInstall(tempDir, fakeBin);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('already up to date');
    expect(second.stdout).toContain('already registers specialists');

    const settings = JSON.parse(await readFile(join(tempDir, '.claude', 'settings.json'), 'utf8'));
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });

  it('fails with a clear error when xt is missing', async () => {
    await makeBin(fakeBin, 'pi', 'echo 1.0.0');
    await makeBin(fakeBin, 'bd', 'echo 1.0.0');

    const result = await runInstall(tempDir, fakeBin);
    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain('xt not found');
    expect(result.stdout).toContain('xtrm-tools is required');
  });

  it('defers hook registration when an external manager already owns a hook', async () => {
    await makeBin(fakeBin, 'pi', 'echo 1.0.0');
    await makeBin(fakeBin, 'bd', 'echo 1.0.0');
    await makeBin(fakeBin, 'xt', 'echo 1.0.0');
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await writeFile(
      join(tempDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { hooks: [{ type: 'command', command: '/external/specialists-complete.mjs', timeout: 5000 }] },
          ],
        },
      }, null, 2),
      'utf8',
    );

    const result = await runInstall(tempDir, fakeBin);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('managed externally — deferring');

    const settings = JSON.parse(await readFile(join(tempDir, '.claude', 'settings.json'), 'utf8'));
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe('/external/specialists-complete.mjs');
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });
});
