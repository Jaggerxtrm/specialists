import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

function createJob(rootDir: string, jobId: string, eventCount = 0): void {
  const jobDir = join(rootDir, '.specialists', 'jobs', jobId);
  mkdirSync(jobDir, { recursive: true });
  writeFileSync(
    join(jobDir, 'status.json'),
    JSON.stringify({
      id: jobId,
      specialist: 'explorer',
      status: 'running',
      model: 'anthropic/claude-haiku-4-5',
      backend: 'anthropic',
      elapsed_s: 83,
      bead_id: 'unitAI-tv3',
      started_at_ms: Date.now() - 83_000,
      session_file: '/tmp/session.jsonl',
      metrics: {
        turns: 4,
        tool_calls: 7,
        finish_reason: 'stop',
        exit_reason: 'agent_end',
        token_usage: {
          total_tokens: 1234,
          cost_usd: 0.042,
        },
      },
    }),
    'utf-8',
  );

  if (eventCount > 0) {
    const lines = Array.from({ length: eventCount }, (_, idx) => JSON.stringify({ t: idx, type: 'tool_start' }));
    writeFileSync(join(jobDir, 'events.jsonl'), `${lines.join('\n')}\n`, 'utf-8');
  }
}

describe('status CLI — run()', () => {
  const TEST_TIMEOUT_MS = 20000;
  const originalArgv = process.argv;
  const originalCwd = process.cwd();
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specialists-status-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('completes without throwing', async () => {
    process.argv = ['node', 'specialists', 'status'];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { run } = await import('../../../src/cli/status.js');
    await expect(run()).resolves.toBeUndefined();
  }, TEST_TIMEOUT_MS);

  it('prints Specialists section header', async () => {
    process.argv = ['node', 'specialists', 'status'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('Specialists');
  }, TEST_TIMEOUT_MS);

  it('prints pi section header', async () => {
    process.argv = ['node', 'specialists', 'status'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('pi');
  }, TEST_TIMEOUT_MS);

  it('prints beads section header', async () => {
    process.argv = ['node', 'specialists', 'status'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('beads');
  }, TEST_TIMEOUT_MS);

  it('prints MCP section header', async () => {
    process.argv = ['node', 'specialists', 'status'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('MCP');
  }, TEST_TIMEOUT_MS);

  it('shows single-job detail view with event count when --job is provided', async () => {
    createJob(tempDir, 'job-123', 3);
    process.argv = ['node', 'specialists', 'status', '--job', 'job-123'];

    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });

    const { run } = await import('../../../src/cli/status.js');
    await run();

    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('Job job-123');
    expect(clean).toContain('model        anthropic/claude-haiku-4-5');
    expect(clean).toContain('elapsed      1m23s');
    expect(clean).toContain('bead_id      unitAI-tv3');
    expect(clean).toContain('events       3');
    expect(clean).toContain('turns        4');
    expect(clean).toContain('tool_calls   7');
    expect(clean).toContain('finish       stop');
    expect(clean).toContain('exit_reason  agent_end');
    expect(clean).toContain('tokens       1234');
    expect(clean).toContain('cost_usd     $0.042000');
    expect(clean).not.toContain('Active Jobs');
  }, TEST_TIMEOUT_MS);

  it('returns single-job JSON payload when --json --job is provided', async () => {
    createJob(tempDir, 'job-abc', 2);
    process.argv = ['node', 'specialists', 'status', '--json', '--job', 'job-abc'];

    const writes: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      writes.push(String(msg ?? ''));
    });

    const { run } = await import('../../../src/cli/status.js');
    await run();

    const payload = JSON.parse(writes.join('\n')) as { job: { id: string; event_count: number; metrics?: { turns?: number } } };
    expect(payload.job.id).toBe('job-abc');
    expect(payload.job.event_count).toBe(2);
    expect(payload.job.metrics?.turns).toBe(4);
  }, TEST_TIMEOUT_MS);
});
