// tests/unit/cli/init.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// run() reads process.cwd() — mock it per test
async function runInit(cwd: string) {
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  const { run } = await import('../../../src/cli/init.js');
  await run();
  vi.restoreAllMocks();
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
    // clear module cache so each test gets a fresh import
    vi.resetModules();
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
    vi.resetModules();
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
    // Only one occurrence of the marker
    expect((content.match(/## Specialists/g) ?? []).length).toBe(1);
  });

  it('does not fail if specialists/ directory already exists', async () => {
    await mkdir(join(tempDir, 'specialists'));
    await expect(runInit(tempDir)).resolves.not.toThrow();
    expect(existsSync(join(tempDir, 'specialists'))).toBe(true);
  });
});
