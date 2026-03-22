import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function importInitModule() {
  return import(`../../../src/cli/init.js?test=${Date.now()}-${Math.random()}`);
}

async function runInit(cwd: string) {
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  const { run } = await importInitModule();
  await run();
}

describe('init CLI — run()', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-init-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates specialists/ directory when it does not exist', async () => {
    await runInit(tempDir);
    expect(existsSync(join(tempDir, 'specialists'))).toBe(true);
  });

  it('creates AGENTS.md with Specialists section when file does not exist', async () => {
    await runInit(tempDir);
    const content = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('## Specialists');
    expect(content).toContain('specialist_init');
  });

  it('appends Specialists section to existing AGENTS.md without marker', async () => {
    const existing = '# My Project\n\nSome existing content.\n';
    await writeFile(join(tempDir, 'AGENTS.md'), existing, 'utf-8');
    await runInit(tempDir);
    const content = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain('## Specialists');
  });

  it('does not duplicate Specialists section on second run', async () => {
    await runInit(tempDir);
    await runInit(tempDir);
    const content = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    const count = (content.match(/## Specialists/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('does not overwrite existing AGENTS.md that already has ## Specialists', async () => {
    const existing = '# Project\n\n## Specialists\n\nCustom text here.\n';
    await writeFile(join(tempDir, 'AGENTS.md'), existing, 'utf-8');
    await runInit(tempDir);
    const content = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('Custom text here.');
    expect((content.match(/## Specialists/g) ?? []).length).toBe(1);
  });

  it('does not fail if specialists/ directory already exists', async () => {
    await mkdir(join(tempDir, 'specialists'));
    await runInit(tempDir);
    expect(existsSync(join(tempDir, 'specialists'))).toBe(true);
  });

  it('creates project .mcp.json with specialists registration', async () => {
    await runInit(tempDir);
    const content = JSON.parse(await readFile(join(tempDir, '.mcp.json'), 'utf-8'));
    expect(content).toEqual({
      mcpServers: {
        specialists: {
          command: 'specialists',
          args: [],
        },
      },
    });
  });

  it('preserves existing MCP servers when registering specialists', async () => {
    await writeFile(join(tempDir, '.mcp.json'), JSON.stringify({
      mcpServers: {
        other: { command: 'other-server', args: ['--json'] },
      },
    }, null, 2));

    await runInit(tempDir);

    const content = JSON.parse(await readFile(join(tempDir, '.mcp.json'), 'utf-8'));
    expect(content.mcpServers.other).toEqual({ command: 'other-server', args: ['--json'] });
    expect(content.mcpServers.specialists).toEqual({ command: 'specialists', args: [] });
  });

  it('does not rewrite specialists MCP config on second run', async () => {
    await runInit(tempDir);
    const first = await readFile(join(tempDir, '.mcp.json'), 'utf-8');
    await runInit(tempDir);
    const second = await readFile(join(tempDir, '.mcp.json'), 'utf-8');
    expect(second).toBe(first);
  });
});
