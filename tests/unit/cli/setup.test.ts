// tests/unit/cli/setup.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('setup CLI — run()', () => {
  let tmpDir: string;
  let origArgv: string[];
  let origCwd: () => string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `specialists-setup-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    origArgv = process.argv;
    origCwd = process.cwd.bind(process);
    process.cwd = () => tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    process.argv = origArgv;
    process.cwd = origCwd;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function runSetup(flags: string[] = []): Promise<{ stdout: string }> {
    process.argv = ['node', 'specialists', 'setup', ...flags];
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => out.push(msg ?? ''));
    const { run } = await import('../../../src/cli/setup.js');
    await run();
    return { stdout: out.join('\n') };
  }

  it('creates CLAUDE.md with workflow block by default', async () => {
    const { stdout } = await runSetup(['--project']);
    const claudePath = join(tmpDir, 'CLAUDE.md');
    expect(existsSync(claudePath)).toBe(true);
    const content = readFileSync(claudePath, 'utf-8');
    expect(content).toContain('## Specialists Workflow');
    expect(stdout).toContain('CLAUDE.md');
  });

  it('creates AGENTS.md with --agents flag', async () => {
    await runSetup(['--agents']);
    const agentsPath = join(tmpDir, 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('## Specialists Workflow');
  });

  it('workflow block contains MCP tools table', async () => {
    await runSetup(['--project']);
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('use_specialist');
    expect(content).toContain('start_specialist');
    expect(content).toContain('poll_specialist');
  });

  it('workflow block contains CLI quick reference', async () => {
    await runSetup(['--project']);
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('specialists run');
    expect(content).toContain('--background');
    expect(content).toContain('specialists result');
  });

  it('is idempotent — skips if marker already present', async () => {
    await runSetup(['--project']);
    const firstContent = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');

    vi.resetModules();
    const { stdout } = await runSetup(['--project']);
    const secondContent = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');

    expect(secondContent).toBe(firstContent);
    expect(stdout).toContain('already contains');
  });

  it('appends to existing file without overwriting', async () => {
    const claudePath = join(tmpDir, 'CLAUDE.md');
    const existing = '# My Project\n\nExisting content here.\n';
    writeFileSync(claudePath, existing);

    await runSetup(['--project']);
    const content = readFileSync(claudePath, 'utf-8');
    expect(content).toContain('My Project');
    expect(content).toContain('Existing content here.');
    expect(content).toContain('## Specialists Workflow');
  });

  it('--dry-run prints block without writing', async () => {
    const { stdout } = await runSetup(['--project', '--dry-run']);
    const claudePath = join(tmpDir, 'CLAUDE.md');
    expect(existsSync(claudePath)).toBe(false);
    expect(stdout).toContain('dry-run');
    expect(stdout).toContain('## Specialists Workflow');
  });
});
