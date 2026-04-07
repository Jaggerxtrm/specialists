import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

function createJob(
  rootDir: string,
  jobId: string,
  overrides: Record<string, unknown> = {},
): void {
  const jobDir = join(rootDir, '.specialists', 'jobs', jobId);
  mkdirSync(jobDir, { recursive: true });
  writeFileSync(
    join(jobDir, 'status.json'),
    JSON.stringify({
      id: jobId,
      specialist: 'executor',
      status: 'running',
      model: 'anthropic/claude-sonnet-4-6',
      backend: 'anthropic',
      elapsed_s: 60,
      started_at_ms: Date.now() - 60_000,
      pid: process.pid, // current PID = alive
      metrics: { turns: 3, tool_calls: 5 },
      ...overrides,
    }),
    'utf-8',
  );
}

describe('ps CLI — run()', () => {
  const TEST_TIMEOUT_MS = 20_000;
  const originalArgv = process.argv;
  const originalCwd = process.cwd();
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specialists-ps-'));
    process.chdir(tempDir);
    // Ensure .specialists/jobs exists
    mkdirSync(join(tempDir, '.specialists', 'jobs'), { recursive: true });
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('completes without throwing when no jobs exist', async () => {
    process.argv = ['node', 'specialists', 'ps'];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { run } = await import('../../../src/cli/ps.js');
    await expect(run()).resolves.toBeUndefined();
  }, TEST_TIMEOUT_MS);

  it('shows empty summary when no jobs exist', async () => {
    process.argv = ['node', 'specialists', 'ps'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/ps.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('0 jobs');
    expect(clean).toContain('0 running');
    expect(clean).toContain('0 waiting');
  }, TEST_TIMEOUT_MS);

  it('shows running job with alive PID', async () => {
    createJob(tempDir, 'aaa111', {
      specialist: 'explorer',
      status: 'running',
      pid: process.pid, // current process = alive
    });
    process.argv = ['node', 'specialists', 'ps'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/ps.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('aaa111');
    expect(clean).toContain('explorer');
    expect(clean).toContain('1 running');
  }, TEST_TIMEOUT_MS);

  it('filters dead jobs from default output', async () => {
    createJob(tempDir, 'dead01', {
      status: 'running',
      pid: 99999999, // very unlikely to be alive
    });
    process.argv = ['node', 'specialists', 'ps'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/ps.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).not.toContain('dead01');
    expect(clean).toContain('0 jobs');
  }, TEST_TIMEOUT_MS);

  it('--all includes dead jobs with dead label', async () => {
    createJob(tempDir, 'dead02', {
      status: 'waiting',
      pid: 99999999,
    });
    process.argv = ['node', 'specialists', 'ps', '--all'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/ps.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('dead02');
    expect(clean).toContain('dead');
  }, TEST_TIMEOUT_MS);

  it('--all includes terminal jobs (done/error)', async () => {
    createJob(tempDir, 'done01', { status: 'done' });
    createJob(tempDir, 'err01', { status: 'error', error: 'crashed' });
    process.argv = ['node', 'specialists', 'ps', '--all'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/ps.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('done01');
    expect(clean).toContain('err01');
  }, TEST_TIMEOUT_MS);

  it('--json outputs valid JSON with trees array', async () => {
    createJob(tempDir, 'json01', { pid: process.pid });
    process.argv = ['node', 'specialists', 'ps', '--json'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/ps.js');
    await run();
    const raw = output.join('\n');
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty('trees');
    expect(Array.isArray(parsed.trees)).toBe(true);
  }, TEST_TIMEOUT_MS);

  it('sorts waiting jobs before running jobs', async () => {
    createJob(tempDir, 'run01', {
      status: 'running',
      pid: process.pid,
      started_at_ms: Date.now() - 120_000,
    });
    createJob(tempDir, 'wait01', {
      status: 'waiting',
      pid: process.pid,
      started_at_ms: Date.now() - 60_000,
    });
    process.argv = ['node', 'specialists', 'ps'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/ps.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    const waitPos = clean.indexOf('wait01');
    const runPos = clean.indexOf('run01');
    expect(waitPos).toBeGreaterThan(-1);
    expect(runPos).toBeGreaterThan(-1);
    expect(waitPos).toBeLessThan(runPos);
  }, TEST_TIMEOUT_MS);

  it('shows context_pct when available', async () => {
    createJob(tempDir, 'ctx01', {
      pid: process.pid,
      context_pct: 54.2,
      context_health: 'MONITOR',
    });
    process.argv = ['node', 'specialists', 'ps'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/ps.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('54');
  }, TEST_TIMEOUT_MS);

  it('groups jobs by worktree_owner_job_id', async () => {
    const wt = join(tempDir, 'wt-test');
    mkdirSync(wt, { recursive: true });
    createJob(tempDir, 'owner1', {
      pid: process.pid,
      worktree_path: wt,
      worktree_owner_job_id: 'owner1',
      branch: 'feature/test',
    });
    createJob(tempDir, 'child1', {
      pid: process.pid,
      worktree_path: wt,
      worktree_owner_job_id: 'owner1',
      reused_from_job_id: 'owner1',
    });
    process.argv = ['node', 'specialists', 'ps'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/ps.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    // Both should appear
    expect(clean).toContain('owner1');
    expect(clean).toContain('child1');
    // Should be in same worktree section
    expect(clean).toContain('feature/test');
  }, TEST_TIMEOUT_MS);
});
