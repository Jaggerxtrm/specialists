// tests/unit/specialist/runner-scripts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecialistRunner } from '../../../src/specialist/runner.js';
import { HookEmitter } from '../../../src/specialist/hooks.js';
import { CircuitBreaker } from '../../../src/utils/circuitBreaker.js';

// Mock spawnSync — scripts run locally via spawnSync(shell), not via pi RPC.
// Also serves commandExists (`which`) pre-run validation with status 0.
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: 'script output\n', stderr: '' }),
}));

import { spawnSync } from 'node:child_process';
const mockSpawnSync = spawnSync as unknown as ReturnType<typeof vi.fn>;

function makeMockSession() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    prompt: vi.fn().mockResolvedValue(undefined),
    waitForDone: vi.fn().mockResolvedValue(undefined),
    getLastOutput: vi.fn().mockResolvedValue('final output'),
    getState: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
    kill: vi.fn(),
    meta: { backend: 'google-gemini-cli', model: 'gemini', sessionId: 'sid', startedAt: new Date() },
  };
}

interface TestScript {
  path?: string;
  run?: string;
  phase: 'pre' | 'post';
  inject_output: boolean;
  required?: boolean;
}

function makeLoader(scripts?: TestScript[]) {
  return {
    get: vi.fn().mockResolvedValue({
      specialist: {
        metadata: { name: 'test-spec', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt. Context: $pre_script_output', system: undefined },
        communication: undefined,
        capabilities: undefined,
        skills: scripts ? { scripts } : undefined,
      },
    }),
  } as any;
}

function makeRunner(scripts?: TestScript[], session = makeMockSession()) {
  const sessionFactory = vi.fn().mockResolvedValue(session);
  const runner = new SpecialistRunner({
    loader: makeLoader(scripts),
    hooks: new HookEmitter({ tracePath: '/tmp/test-runner-scripts.jsonl' }),
    circuitBreaker: new CircuitBreaker(),
    sessionFactory,
  });
  return { runner, sessionFactory, session };
}

describe('SpecialistRunner — script execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'script output\n', stderr: '' });
  });

  it('runs pre-phase scripts via shell-equivalent spawnSync', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'tree output here\n', stderr: '' });
    const { runner } = makeRunner([{ path: 'tree .', phase: 'pre', inject_output: true }]);
    await runner.run({ name: 'test-spec', prompt: 'analyze' });

    expect(mockSpawnSync).toHaveBeenCalledWith('tree .', expect.objectContaining({ encoding: 'utf8', shell: true }));
  });

  it('injects pre-script stdout into the session prompt', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'tree output here\n', stderr: '' });
    const { runner, session } = makeRunner([{ path: 'tree .', phase: 'pre', inject_output: true }]);
    await runner.run({ name: 'test-spec', prompt: 'analyze' });

    const promptArg = session.prompt.mock.calls[0][0] as string;
    expect(promptArg).toContain('<pre_flight_context>');
    expect(promptArg).toContain('tree output here');
    expect(promptArg).toContain('</pre_flight_context>');
  });

  it('runs post-phase scripts after the session produced output', async () => {
    const { runner, session } = makeRunner([{ path: 'echo done', phase: 'post', inject_output: false }]);
    await runner.run({ name: 'test-spec', prompt: 'do thing' });

    const execOrder = mockSpawnSync.mock.invocationCallOrder.at(-1)!;
    const outputOrder = session.getLastOutput.mock.invocationCallOrder[0];
    expect(outputOrder).toBeLessThan(execOrder);
  });

  it('does not inject output when inject_output is false', async () => {
    const { runner, session } = makeRunner([{ path: 'ls', phase: 'pre', inject_output: false }]);
    await runner.run({ name: 'test-spec', prompt: 'x' });

    // Script still runs (for side effects)
    expect(mockSpawnSync).toHaveBeenCalledWith('ls', expect.anything());

    // But output is not injected into the prompt
    const promptArg = session.prompt.mock.calls[0][0] as string;
    expect(promptArg).not.toContain('<pre_flight_context>');
    expect(promptArg).not.toContain('script output');
  });

  it('works without any scripts defined', async () => {
    const { runner, session } = makeRunner(undefined);
    const result = await runner.run({ name: 'test-spec', prompt: 'no scripts' });

    expect(mockSpawnSync).not.toHaveBeenCalledWith('tree .', expect.anything());
    expect(result.output).toBe('final output');
    expect(session.start).toHaveBeenCalled();
  });

  it('includes exit_code attribute when optional script fails (existing injection preserved)', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' }); // which probe
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: 'partial output\n', stderr: '' });
    const { runner, session } = makeRunner([{ path: 'failing-check.sh', phase: 'pre', inject_output: true }]);
    await runner.run({ name: 'test-spec', prompt: 'run' });

    const promptArg = session.prompt.mock.calls[0][0] as string;
    expect(promptArg).toContain('exit_code="1"');
    expect(promptArg).toContain('partial output');
  });

  it('aborts before session factory when a required pre script exits nonzero (stderr-only)', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' }); // which probe
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'drift machinery missing\n' }); // pre script
    const { runner, sessionFactory, session } = makeRunner([
      { path: 'preflight.sh', phase: 'pre', inject_output: true, required: true },
    ]);

    await expect(runner.run({ name: 'test-spec', prompt: 'run' })).rejects.toThrow(/pre-script/i);

    expect(sessionFactory).not.toHaveBeenCalled();
    expect(session.start).not.toHaveBeenCalled();
    expect(session.prompt).not.toHaveBeenCalled();
  });

  it('required failure diagnostics retain bounded stdout and stderr with exact exit code', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' }); // which probe
    mockSpawnSync.mockReturnValueOnce({
      status: 3,
      stdout: `${'o'.repeat(50_000)}`,
      stderr: 'scope.py missing machinery\u009b31m\n',
    });
    const { runner } = makeRunner([
      { path: 'preflight.sh', phase: 'pre', inject_output: true, required: true },
    ]);

    const error = await runner.run({ name: 'test-spec', prompt: 'run' }).then(
      () => { throw new Error('expected rejection'); },
      (err: Error) => err,
    );

    const message = error.message;
    expect(message).toContain('preflight.sh');
    expect(message).toContain('exit code 3');
    expect(message).toContain('scope.py missing machinery31m');
    expect(message).not.toContain('\u009b');
    expect(message).toContain('truncated');
    // Bounded: 4KB per stream + wrapper, even with a 50KB stdout.
    expect(message.length).toBeLessThan(10_000);
  });

  it('aborts on required timeout and represents the signal', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' }); // which probe
    mockSpawnSync.mockReturnValueOnce({ status: null, signal: 'SIGTERM', stdout: '', stderr: '' });
    const { runner, sessionFactory } = makeRunner([
      { path: 'slow-preflight.sh', phase: 'pre', inject_output: false, required: true },
    ]);

    await expect(runner.run({ name: 'test-spec', prompt: 'run' })).rejects.toThrow(/SIGTERM/);
    expect(sessionFactory).not.toHaveBeenCalled();
  });

  it('optional nonzero scripts keep the session running (no gating)', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' }); // which probe
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: 'warn text\n', stderr: 'warn-stderr\n' });
    const { runner, sessionFactory } = makeRunner([
      { path: 'warn-check.sh', phase: 'pre', inject_output: true },
    ]);

    await expect(runner.run({ name: 'test-spec', prompt: 'run' })).resolves.toBeDefined();
    expect(sessionFactory).toHaveBeenCalled();
  });

  it('post-phase script failure does not abort the run', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' }); // which probe
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'post failure\n' });
    const { runner, session } = makeRunner([{ path: 'post-fail.sh', phase: 'post', inject_output: false }]);

    await expect(runner.run({ name: 'test-spec', prompt: 'run' })).resolves.toBeDefined();
    expect(session.prompt).toHaveBeenCalled();
  });

  it('mixed scripts: optional failure does not gate, later required success continues', async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' }) // which: optional.sh
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' }) // which: required.sh
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'optional noise\n' }) // pre: optional.sh
      .mockReturnValueOnce({ status: 0, stdout: 'ok data\n', stderr: '' }); // pre: required.sh
    const { runner, sessionFactory } = makeRunner([
      { path: 'optional.sh', phase: 'pre', inject_output: true },
      { path: 'required.sh', phase: 'pre', inject_output: true, required: true },
    ]);

    await expect(runner.run({ name: 'test-spec', prompt: 'run' })).resolves.toBeDefined();
    expect(sessionFactory).toHaveBeenCalled();
  });
});
