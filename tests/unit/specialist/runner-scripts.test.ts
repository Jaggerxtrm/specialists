// tests/unit/specialist/runner-scripts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecialistRunner } from '../../../src/specialist/runner.js';
import { HookEmitter } from '../../../src/specialist/hooks.js';
import { CircuitBreaker } from '../../../src/utils/circuitBreaker.js';

// Mock execSync — scripts run locally, not via pi RPC
vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue('script output\n'),
  spawn: vi.fn(),
}));

import { execSync } from 'node:child_process';
const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;

function makeMockSession() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    prompt: vi.fn().mockResolvedValue(undefined),
    waitForDone: vi.fn().mockResolvedValue(undefined),
    getLastOutput: vi.fn().mockResolvedValue('final output'),
    kill: vi.fn(),
    meta: { backend: 'google-gemini-cli', model: 'gemini', sessionId: 'sid', startedAt: new Date() },
  };
}

function makeLoader(scripts?: Array<{ path: string; phase: 'pre' | 'post'; inject_output: boolean }>) {
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

describe('SpecialistRunner — script execution', () => {
  let mockSession: ReturnType<typeof makeMockSession>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = makeMockSession();
    mockExecSync.mockReturnValue('script output\n');
  });

  it('runs pre-phase scripts and injects XML-formatted output into prompt', async () => {
    mockExecSync.mockReturnValue('tree output here\n');
    const runner = new SpecialistRunner({
      loader: makeLoader([{ path: 'tree .', phase: 'pre', inject_output: true }]),
      hooks: new HookEmitter({ tracePath: '/tmp/test-runner-scripts.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    await runner.run({ name: 'test-spec', prompt: 'analyze' });

    expect(mockExecSync).toHaveBeenCalledWith('tree .', expect.objectContaining({ encoding: 'utf8' }));

    const promptArg = mockSession.prompt.mock.calls[0][0] as string;
    expect(promptArg).toContain('<pre_flight_context>');
    expect(promptArg).toContain('tree output here');
    expect(promptArg).toContain('</pre_flight_context>');
  });

  it('runs post-phase scripts after getting output', async () => {
    const runner = new SpecialistRunner({
      loader: makeLoader([{ path: 'echo done', phase: 'post', inject_output: false }]),
      hooks: new HookEmitter({ tracePath: '/tmp/test-runner-scripts2.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    await runner.run({ name: 'test-spec', prompt: 'do thing' });

    // execSync (post script) must be called after getLastOutput
    const execOrder = mockExecSync.mock.invocationCallOrder[0];
    const outputOrder = mockSession.getLastOutput.mock.invocationCallOrder[0];
    expect(outputOrder).toBeLessThan(execOrder);
  });

  it('does not inject output when inject_output is false', async () => {
    const runner = new SpecialistRunner({
      loader: makeLoader([{ path: 'ls', phase: 'pre', inject_output: false }]),
      hooks: new HookEmitter({ tracePath: '/tmp/test-runner-scripts3.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    await runner.run({ name: 'test-spec', prompt: 'x' });

    // Script still runs (for side effects)
    expect(mockExecSync).toHaveBeenCalledWith('ls', expect.anything());

    // But output is not injected into the prompt
    const promptArg = mockSession.prompt.mock.calls[0][0] as string;
    expect(promptArg).not.toContain('<pre_flight_context>');
    expect(promptArg).not.toContain('script output');
  });

  it('works without any scripts defined', async () => {
    const runner = new SpecialistRunner({
      loader: makeLoader(undefined),
      hooks: new HookEmitter({ tracePath: '/tmp/test-runner-scripts4.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    const result = await runner.run({ name: 'test-spec', prompt: 'no scripts' });

    expect(mockExecSync).not.toHaveBeenCalled();
    expect(result.output).toBe('final output');
  });

  it('includes exit_code attribute when script fails', async () => {
    const err: any = new Error('command failed');
    err.stdout = 'partial output\n';
    err.status = 1;
    mockExecSync.mockImplementationOnce(() => { throw err; });

    const runner = new SpecialistRunner({
      loader: makeLoader([{ path: 'failing-check.sh', phase: 'pre', inject_output: true }]),
      hooks: new HookEmitter({ tracePath: '/tmp/test-runner-scripts5.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    await runner.run({ name: 'test-spec', prompt: 'run' });

    const promptArg = mockSession.prompt.mock.calls[0][0] as string;
    expect(promptArg).toContain('exit_code="1"');
    expect(promptArg).toContain('partial output');
  });
});
