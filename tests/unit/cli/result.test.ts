import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const specialistsDir = join(process.cwd(), '.specialists');
const jobsDir = join(specialistsDir, 'jobs');

function createJob(jobId: string, status: 'starting' | 'running' | 'waiting' | 'done' | 'error', withResult = false): void {
  const jobDir = join(jobsDir, jobId);
  mkdirSync(jobDir, { recursive: true });
  writeFileSync(
    join(jobDir, 'status.json'),
    JSON.stringify({
      id: jobId,
      specialist: 'bug-hunt',
      status,
      started_at_ms: Date.now() - 1000,
    }),
    'utf-8',
  );

  if (withResult) {
    writeFileSync(join(jobDir, 'result.txt'), 'last completed output', 'utf-8');
  }
}

describe('result CLI', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    if (existsSync(specialistsDir)) rmSync(specialistsDir, { recursive: true, force: true });
    mkdirSync(jobsDir, { recursive: true });
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (existsSync(specialistsDir)) rmSync(specialistsDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prints last completed output when job is running but result.txt exists', async () => {
    createJob('job1', 'running', true);
    process.argv = ['node', 'specialists', 'result', 'job1'];

    const stderrWrites: string[] = [];
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stderrWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/result.js');
    await run();

    expect(stdoutWrites.join('')).toContain('last completed output');
    expect(stderrWrites.join('')).toContain('Showing last completed output');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits with code 1 when job is running and result.txt does not exist', async () => {
    createJob('job2', 'running', false);
    process.argv = ['node', 'specialists', 'result', 'job2'];

    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/result.js');
    await expect(run()).rejects.toThrow('exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
