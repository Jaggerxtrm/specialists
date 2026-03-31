import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));

const specialistsDir = join(process.cwd(), '.specialists');
const jobsDir = join(specialistsDir, 'jobs');

function writeStatus(jobId: string, status: Record<string, unknown>): void {
  const jobDir = join(jobsDir, jobId);
  mkdirSync(jobDir, { recursive: true });
  writeFileSync(join(jobDir, 'status.json'), JSON.stringify(status), 'utf-8');
}

describe('attach CLI', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    if (existsSync(specialistsDir)) rmSync(specialistsDir, { recursive: true, force: true });
    mkdirSync(jobsDir, { recursive: true });
    (spawnSync as unknown as { mockReset: () => void }).mockReset();
    (execFileSync as unknown as { mockReset: () => void }).mockReset();
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (existsSync(specialistsDir)) rmSync(specialistsDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('exits with usage when job-id is missing', async () => {
    process.argv = ['node', 'specialists', 'attach'];

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/attach.js');
    await expect(run()).rejects.toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith('Usage: specialists attach <job-id>');
  });

  it('exits when the job is not found', async () => {
    process.argv = ['node', 'specialists', 'attach', 'job-missing'];

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/attach.js');
    await expect(run()).rejects.toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith('Job `job-missing` not found. Run `specialists status` to see active jobs.');
  });

  it('exits when the job is already completed', async () => {
    writeStatus('job-done', {
      id: 'job-done',
      status: 'done',
      tmux_session: 'sess-1',
    });
    process.argv = ['node', 'specialists', 'attach', 'job-done'];

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/attach.js');
    await expect(run()).rejects.toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith('Job `job-done` has already completed (status: done). Use `specialists result job-done` to read output.');
  });

  it('exits when tmux session is missing', async () => {
    writeStatus('job-no-session', {
      id: 'job-no-session',
      status: 'running',
    });
    process.argv = ['node', 'specialists', 'attach', 'job-no-session'];

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/attach.js');
    await expect(run()).rejects.toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith('Job `job-no-session` has no tmux session. It may have been started without tmux or tmux was not installed.');
  });

  it('exits when tmux is not installed', async () => {
    writeStatus('job-no-tmux', {
      id: 'job-no-tmux',
      status: 'running',
      tmux_session: 'sess-2',
    });
    process.argv = ['node', 'specialists', 'attach', 'job-no-tmux'];

    (spawnSync as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue({ status: 1 } as never);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/attach.js');
    await expect(run()).rejects.toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith('tmux is not installed. Install tmux to use `specialists attach`.');
  });

  it('attaches to tmux for a running job', async () => {
    writeStatus('job-running', {
      id: 'job-running',
      status: 'running',
      tmux_session: 'sess-live',
    });
    process.argv = ['node', 'specialists', 'attach', 'job-running'];

    (spawnSync as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue({ status: 0 } as never);

    const { run } = await import('../../../src/cli/attach.js');
    await run();

    expect(spawnSync).toHaveBeenCalledWith('which', ['tmux'], { stdio: 'ignore' });
    expect(execFileSync).toHaveBeenCalledWith('tmux', ['attach-session', '-t', 'sess-live'], { stdio: 'inherit' });
  });
});
