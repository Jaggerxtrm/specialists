import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as childProcess from 'node:child_process';
import * as tmuxUtils from '../../../src/cli/tmux-utils.js';
import * as worktree from '../../../src/specialist/worktree.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual };
});
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual };
});
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual };
});
vi.mock('../../../src/cli/tmux-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/cli/tmux-utils.js')>();
  return { ...actual };
});
vi.mock('../../../src/specialist/worktree.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/specialist/worktree.js')>();
  return { ...actual };
});
import { BeadsClient } from '../../../src/specialist/beads.js';
import { SpecialistLoader } from '../../../src/specialist/loader.js';
import { SpecialistRunner } from '../../../src/specialist/runner.js';
import { Supervisor } from '../../../src/specialist/supervisor.js';
import { run } from '../../../src/cli/run.js';

describe('run CLI', () => {
  const originalArgv = process.argv;
  const originalIsTTY = process.stdin.isTTY;

  afterEach(() => {
    process.argv = originalArgv;
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    vi.restoreAllMocks();
  });

  it('uses bead content as the prompt when --bead is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--bead', 'unitAI-55d'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue({
      id: 'unitAI-55d',
      title: 'Refactor auth',
      description: 'Extract JWT validation',
    });
    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);
    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    expect(runnerRun).toHaveBeenCalled();
    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs).toEqual(expect.objectContaining({
      name: 'code-review',
      inputBeadId: 'unitAI-55d',
      keepAlive: undefined,
      noKeepAlive: false,
      beadsWriteNotes: true,
    }));
    expect(runArgs.prompt).toContain('# Task: Refactor auth');
    expect(runArgs.prompt).toContain('Extract JWT validation');
    expect(runArgs.variables).toEqual(expect.objectContaining({
      bead_id: 'unitAI-55d',
    }));
  });

  it('passes noKeepAlive=true when --no-keep-alive is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--no-keep-alive'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY', interactive: true },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.keepAlive).toBeUndefined();
    expect(runArgs.noKeepAlive).toBe(true);
  });

  it('passes beadsWriteNotes=false when --no-bead-notes is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--bead', 'unitAI-55d', '--no-bead-notes'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue({
      id: 'unitAI-55d',
      title: 'Refactor auth',
      description: 'Extract JWT validation',
    });
    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.beadsWriteNotes).toBe(false);
  });

  it('respects specialist beads_write_notes=false from YAML config', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
        beads_write_notes: false,
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.beadsWriteNotes).toBe(false);
  });

  it('does not duplicate backend prefix in completion footer when model is already provider-qualified', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--model', 'anthropic/claude-haiku-4-5'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-123');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-123',
      specialist: 'code-review',
      status: 'done',
      started_at_ms: 0,
      last_event_at_ms: 1000,
      backend: 'anthropic',
      model: 'anthropic/claude-haiku-4-5',
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const stderrText = stderrWrite.mock.calls.map(([chunk]) => String(chunk)).join('');
    const plainText = stderrText.replace(/\x1b\[[0-9;]*m/g, '');

    expect(plainText).toContain('anthropic/claude-haiku-4-5');
    expect(plainText).not.toContain('anthropic/anthropic/claude-haiku-4-5');
  });

  it('auto-provisions worktree for edit-capable specialists when bead is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--bead', 'unitAI-55d'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue({
      id: 'unitAI-55d',
      title: 'Refactor auth',
      description: 'Extract JWT validation',
    });
    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);
    const provisionSpy = vi.spyOn(worktree, 'provisionWorktree').mockReturnValue({
      worktreePath: '/tmp/unitAI-55d-code-review',
      branch: 'feature/unitAI-55d-code-review',
      reused: false,
    });

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-123');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-123',
      specialist: 'code-review',
      status: 'done',
      started_at_ms: 0,
      last_event_at_ms: 1000,
      backend: 'anthropic',
      model: 'anthropic/claude-haiku-4-5',
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
    expect(provisionSpy).toHaveBeenCalledWith({
      beadId: 'unitAI-55d',
      specialistName: 'code-review',
    });
  });

  it('fails when --no-worktree is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--no-worktree'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);

    const allText = [
      ...consoleError.mock.calls.map(args => args.join(' ')),
      ...stderrWrite.mock.calls.map(([chunk]) => String(chunk)),
    ].join('\n');
    expect(allText).toContain('--no-worktree has been removed');
  });

  it('uses tmux background mode when tmux is available', async () => {
    process.argv = ['node', '/repo/src/index.ts', 'run', 'code-review', '--prompt', "he'llo", '--background'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const randomBytesSpy = vi.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('a1b2c3', 'hex') as any);
    const isTmuxAvailableSpy = vi.spyOn(tmuxUtils, 'isTmuxAvailable').mockReturnValue(true);
    const createTmuxSessionSpy = vi.spyOn(tmuxUtils, 'createTmuxSession').mockImplementation(() => {});
    const detachedSpawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementation(() => ({
      pid: 123,
      unref: vi.fn(),
    } as any));

    let latestReads = 0;
    vi.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      if (String(path).endsWith('/.specialists/jobs/latest')) {
        latestReads += 1;
        return latestReads === 1 ? 'old-job' : 'job-from-tmux';
      }
      throw new Error('unexpected path');
    });

    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');

    expect(randomBytesSpy).toHaveBeenCalledWith(3);
    expect(isTmuxAvailableSpy).toHaveBeenCalled();
    expect(createTmuxSessionSpy).toHaveBeenCalledWith(
      'sp-code-review-a1b2c3',
      process.cwd(),
      `${process.execPath} /repo/src/index.ts 'run' 'code-review' '--prompt' 'he'\\''llo'`,
    );
    expect(detachedSpawnSpy).not.toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalledWith('job-from-tmux\n');
    expect(stderrWrite).not.toHaveBeenCalledWith(expect.stringContaining('tmux'));
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('falls back to detached spawn when tmux is not available', async () => {
    process.argv = ['node', '/repo/src/index.ts', 'run', 'code-review', '--prompt', 'hello', '--background'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(tmuxUtils, 'isTmuxAvailable').mockReturnValue(false);
    const createTmuxSessionSpy = vi.spyOn(tmuxUtils, 'createTmuxSession').mockImplementation(() => {});
    const unref = vi.fn();
    const detachedSpawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementation(() => ({
      pid: 456,
      unref,
    } as any));

    let latestReads = 0;
    vi.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      if (String(path).endsWith('/.specialists/jobs/latest')) {
        latestReads += 1;
        return latestReads === 1 ? 'old-job' : 'job-from-fallback';
      }
      throw new Error('unexpected path');
    });

    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');

    expect(createTmuxSessionSpy).not.toHaveBeenCalled();
    expect(detachedSpawnSpy).toHaveBeenCalledTimes(1);
    const [command, spawnArgs, options] = detachedSpawnSpy.mock.calls[0] as [string, string[], any];
    expect(command).toBe(process.execPath);
    expect(spawnArgs).toEqual([
      '/repo/src/index.ts',
      'run',
      'code-review',
      '--prompt',
      'hello',
    ]);
    expect(options.detached).toBe(true);
    expect(options.stdio).toBe('ignore');
    expect(options.cwd).toBe(process.cwd());
    expect(options.env).toBe(process.env);
    expect(unref).toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalledWith('job-from-fallback\n');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('blocks MEDIUM specialists from reusing a running job worktree', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-running'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-running',
      specialist: 'other',
      status: 'running',
      started_at_ms: Date.now(),
      worktree_path: '/tmp/wt-job-running',
    } as any);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);

    const stderrText = consoleError.mock.calls.map((args) => args.map((a) => String(a)).join(' ')).join('\n');
    expect(stderrText).toContain('Target job job-running is still running (status: running).');
    expect(stderrText).toContain('--force-job');
  });

  it('blocks MEDIUM specialists when target job status is starting with exact error text', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-starting'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-starting',
      specialist: 'other',
      status: 'starting',
      started_at_ms: Date.now(),
      worktree_path: '/tmp/wt-job-starting',
    } as any);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);

    const stderrText = consoleError.mock.calls.map((args) => args.map((a) => String(a)).join(' ')).join('\n');
    const plainText = stderrText.replace(/\x1b\[[0-9;]*m/g, '');
    const exactMessage = 'Target job job-starting is still running (status: starting). MEDIUM/HIGH specialists cannot enter an active worktree. Wait for completion or use --force-job to override.';
    const matchedLine = plainText.split('\n').find((line) => line.startsWith('Target job job-starting is still running'));

    expect(matchedLine).toBe(exactMessage);
  });

  it('sets reviewed_job_id variable when --job is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-reviewed'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-reviewed') {
        return {
          id,
          specialist: 'executor',
          status: 'done',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-reviewed',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.variables).toEqual(expect.objectContaining({ reviewed_job_id: 'job-reviewed' }));
  });

  it('allows MEDIUM specialists to reuse done job worktrees', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-done'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-done') {
        return {
          id,
          specialist: 'other',
          status: 'done',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-done',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('allows MEDIUM specialists to reuse error job worktrees', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-error'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-error') {
        return {
          id,
          specialist: 'other',
          status: 'error',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-error',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('allows MEDIUM specialists to reuse cancelled job worktrees', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-cancelled'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-cancelled') {
        return {
          id,
          specialist: 'other',
          status: 'cancelled',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-cancelled',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('blocks MEDIUM specialists for unknown target job status', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-unknown'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-unknown',
      specialist: 'other',
      status: 'unrecognized-status',
      started_at_ms: Date.now(),
      worktree_path: '/tmp/wt-job-unknown',
    } as any);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);

    const stderrText = consoleError.mock.calls.map((args) => args.map((a) => String(a)).join(' ')).join('\n');
    expect(stderrText).toContain("Target job job-unknown has unknown status 'unrecognized-status'.");
    expect(stderrText).toContain('--force-job');
  });

  it('allows --force-job for MEDIUM specialists with unknown target job status', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-unknown', '--force-job'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-unknown') {
        return {
          id,
          specialist: 'other',
          status: 'unrecognized-status',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-unknown',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('allows MEDIUM specialists to reuse waiting job worktrees', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-waiting'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-waiting') {
        return {
          id,
          specialist: 'other',
          status: 'waiting',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-waiting',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('allows READ_ONLY specialists to reuse running job worktrees', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-running'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-running') {
        return {
          id,
          specialist: 'other',
          status: 'running',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-running',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('allows --force-job to bypass active job reuse guard', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-running', '--force-job'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'HIGH' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-running') {
        return {
          id,
          specialist: 'other',
          status: 'running',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-running',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits when both --prompt and --bead are provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--bead', 'unitAI-55d'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith('Error: use either --prompt or --bead, not both.');
    expect(runnerRun).not.toHaveBeenCalled();
  });

  it('exits when neither prompt nor bead nor stdin is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith('Error: provide --prompt, pipe stdin, or use --bead <id>.');
    expect(runnerRun).not.toHaveBeenCalled();
  });
});
