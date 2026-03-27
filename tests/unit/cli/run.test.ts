import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeadsClient } from '../../../src/specialist/beads.js';
import { SpecialistLoader } from '../../../src/specialist/loader.js';
import { SpecialistRunner } from '../../../src/specialist/runner.js';
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
      keepAlive: false,
    }));
    expect(runArgs.prompt).toContain('# Task: Refactor auth');
    expect(runArgs.prompt).toContain('Extract JWT validation');
    expect(runArgs.variables).toEqual(expect.objectContaining({
      bead_id: 'unitAI-55d',
    }));
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
