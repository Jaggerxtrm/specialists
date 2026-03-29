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

describe('integration: specialists result', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('prints result for a done job without --wait', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-result-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'abc123', { status: 'done' }, 'hello world\n');

    const result = runCli(['result', 'abc123'], tempDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('hello world');
  });

  it('exits 1 and prints error for a failed job without --wait', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-result-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'err123', { status: 'error', error: 'something blew up' });

    const result = runCli(['result', 'err123'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('something blew up');
  });

  it('exits 1 when job does not exist', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-result-'));

    const result = runCli(['result', 'nonexistent'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No job found: nonexistent');
  });

  it('--wait prints result immediately when job is already done', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-result-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'done99', { status: 'done' }, 'finished output\n');

    const result = runCli(['result', 'done99', '--wait'], tempDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('finished output');
  });

  it('--wait exits 1 when job is already in error state', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-result-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'err99', { status: 'error', error: 'fatal error' });

    const result = runCli(['result', 'err99', '--wait'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('fatal error');
  });

  it('--wait with --timeout exits 1 when job stays running past timeout', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-result-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'run99', { status: 'running' });

    const result = runCli(['result', 'run99', '--wait', '--timeout', '1'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Timeout');
    expect(result.stderr).toContain('run99');
  });

  it('--timeout with invalid value exits 1', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-result-'));

    const result = runCli(['result', 'somejob', '--timeout', '-5'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--timeout must be a positive integer');
  });
});
