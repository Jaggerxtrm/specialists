import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
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
) {
  const jobDir = join(jobsDir, jobId);
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, 'status.json'), JSON.stringify({
    id: jobId,
    specialist: 'test',
    started_at_ms: Date.now(),
    ...status,
  }), 'utf-8');
}

// ── resume command ─────────────────────────────────────────────────────────────
describe('integration: specialists resume', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('exits 1 with usage when job-id or task are missing', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-resume-'));

    const result = runCli(['resume'], tempDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage:');
  });

  it('exits 1 with clear error when job does not exist', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-resume-'));

    const result = runCli(['resume', 'nosuchjob', 'do more'], tempDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nosuchjob');
  });

  it('exits 1 with clear error when job is not in waiting state (running)', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-resume-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'run1', { status: 'running' });

    const result = runCli(['resume', 'run1', 'continue please'], tempDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('waiting');
  });

  it('exits 1 with clear error when job is not in waiting state (done)', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-resume-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'done1', { status: 'done' });

    const result = runCli(['resume', 'done1', 'continue please'], tempDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('waiting');
  });

  it('exits 1 with clear error when waiting job has no fifo_path', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-resume-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    await writeJobFiles(jobsDir, 'wait1', { status: 'waiting' });

    const result = runCli(['resume', 'wait1', 'do more work'], tempDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('steer pipe');
  });

  it('writes {type:"resume"} payload to fifo and prints success on happy path', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-resume-'));
    const jobsDir = join(tempDir, '.specialists', 'jobs');
    const fifoPath = join(tempDir, 'test.fifo');
    // Pre-create the file so writeFileSync can append to it
    await writeFile(fifoPath, '', 'utf-8');
    await writeJobFiles(jobsDir, 'wait2', { status: 'waiting', fifo_path: fifoPath });

    const result = runCli(['resume', 'wait2', 'do more work'], tempDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('wait2');

    const written = await readFile(fifoPath, 'utf-8');
    const payload = JSON.parse(written.trim());
    expect(payload.type).toBe('resume');
    expect(payload.task).toBe('do more work');
  });
});

// ── follow-up command (deprecated alias for resume) ───────────────────────────
describe('integration: specialists follow-up (deprecated)', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('prints deprecation notice to stderr', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-followup-'));

    // Even an invalid invocation should still show the deprecation notice first
    const result = runCli(['follow-up'], tempDir);
    expect(result.stderr).toContain('DEPRECATED');
    expect(result.stderr).toContain('resume');
  });

  it('delegates to resume — same error for missing args', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-followup-'));

    const result = runCli(['follow-up'], tempDir);
    expect(result.status).toBe(1);
    // Both deprecation notice AND usage error from resume
    expect(result.stderr).toContain('DEPRECATED');
    expect(result.stderr).toContain('Usage:');
  });

  it('delegates to resume — same error for unknown job', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-followup-'));

    const result = runCli(['follow-up', 'nosuchjob', 'task'], tempDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DEPRECATED');
    expect(result.stderr).toContain('nosuchjob');
  });
});
