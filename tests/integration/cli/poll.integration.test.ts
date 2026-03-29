import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

function runCli(args: string[], cwd: string) {
  return spawnSync('bun', ['run', join(repoRoot, 'src/index.ts'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 10_000,
  });
}

async function writeJobFiles(
  jobsDir: string,
  jobId: string,
  status: Partial<SupervisorStatus> & { status: SupervisorStatus['status'] },
  resultContent?: string,
) {
  const jobDir = join(jobsDir, jobId);
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, 'status.json'), JSON.stringify({
    id: jobId,
    specialist: 'test',
    started_at_ms: Date.now(),
    ...status,
  }), 'utf-8');
  if (resultContent !== undefined) {
    await writeFile(join(jobDir, 'result.txt'), resultContent, 'utf-8');
  }
}

describe('integration: specialists poll', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('outputs JSON for a done job', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-poll-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'abc123', { status: 'done' }, 'the result\n');

    const result = runCli(['poll', 'abc123'], tempDir);

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.job_id).toBe('abc123');
    expect(json.status).toBe('done');
    expect(json.output).toContain('the result');
    expect(typeof json.cursor).toBe('number');
    expect(typeof json.output_cursor).toBe('number');
  });

  it('populates output_delta when output_cursor is behind result.txt length', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-poll-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'delta1', { status: 'done' }, 'hello world\n');

    // First poll: output_cursor=0 → delta should be the full content
    const r1 = runCli(['poll', 'delta1', '--output-cursor', '0'], tempDir);
    const j1 = JSON.parse(r1.stdout);
    expect(j1.output_delta).toBe('hello world\n');
    expect(j1.output_cursor).toBe(12); // 'hello world\n'.length

    // Second poll: pass back output_cursor → delta should be empty (caught up)
    const r2 = runCli(['poll', 'delta1', '--output-cursor', String(j1.output_cursor)], tempDir);
    const j2 = JSON.parse(r2.stdout);
    expect(j2.output_delta).toBe('');
  });

  it('output_delta is empty for running job with no result.txt', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-poll-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'run1', { status: 'running' });

    const result = runCli(['poll', 'run1'], tempDir);
    const json = JSON.parse(result.stdout);
    expect(json.output_delta).toBe('');
    expect(json.output_cursor).toBe(0);
    // output is empty while running
    expect(json.output).toBe('');
  });

  it('returns JSON error object for unknown job and exits 1', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-poll-'));

    const result = runCli(['poll', 'nosuchjob'], tempDir);
    expect(result.status).toBe(1);
    const json = JSON.parse(result.stdout);
    expect(json.status).toBe('error');
    expect(json.error).toContain('nosuchjob');
  });

  it('--follow flag exits 1 with redirect message', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-poll-'));

    const result = runCli(['poll', 'somejob', '--follow'], tempDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("specialists feed --follow");
  });

  it('--json flag is silently ignored (JSON is always the output)', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-poll-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'jsontest', { status: 'done' }, 'ok\n');

    const result = runCli(['poll', 'jsontest', '--json'], tempDir);
    expect(result.status).toBe(0);
    // Should still be valid JSON
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('stdout contains no ANSI escape sequences', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-poll-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'ansitest', { status: 'done' }, 'clean output\n');

    const result = runCli(['poll', 'ansitest'], tempDir);
    // ANSI escape codes start with ESC (\x1b) followed by [
    expect(result.stdout).not.toMatch(/\x1b\[/);
  });

  it('JSON output contains all required PollResult fields', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-poll-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'schema1', { status: 'done' }, 'output\n');

    const result = runCli(['poll', 'schema1'], tempDir);
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);

    // All required PollResult fields must be present
    expect(json).toHaveProperty('job_id');
    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('elapsed_ms');
    expect(json).toHaveProperty('cursor');
    expect(json).toHaveProperty('output_cursor');
    expect(json).toHaveProperty('output');
    expect(json).toHaveProperty('output_delta');
    expect(json).toHaveProperty('events');

    // Types must match
    expect(typeof json.job_id).toBe('string');
    expect(typeof json.status).toBe('string');
    expect(typeof json.elapsed_ms).toBe('number');
    expect(typeof json.cursor).toBe('number');
    expect(typeof json.output_cursor).toBe('number');
    expect(typeof json.output).toBe('string');
    expect(typeof json.output_delta).toBe('string');
    expect(Array.isArray(json.events)).toBe(true);
  });
});
