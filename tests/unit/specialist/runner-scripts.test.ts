// tests/unit/specialist/runner-scripts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecialistRunner } from '../../../src/specialist/runner.js';
import { HookEmitter } from '../../../src/specialist/hooks.js';
import { CircuitBreaker } from '../../../src/utils/circuitBreaker.js';

function makeMockSession(overrides: Partial<{
  executeBash: () => Promise<string>;
}> = {}) {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    prompt: vi.fn().mockResolvedValue(undefined),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
    getLastOutput: vi.fn().mockResolvedValue('final output'),
    executeBash: vi.fn().mockResolvedValue('script output'),
    kill: vi.fn(),
    meta: { backend: 'google-gemini-cli', model: 'gemini', sessionId: 'sid', startedAt: new Date() },
    ...overrides,
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
  });

  it('runs pre-phase scripts and injects output into prompt', async () => {
    mockSession.executeBash.mockResolvedValue('tree output here');
    const runner = new SpecialistRunner({
      loader: makeLoader([{ path: 'tree .', phase: 'pre', inject_output: true }]),
      hooks: new HookEmitter({ tracePath: '/tmp/test-runner-scripts.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    await runner.run({ name: 'test-spec', prompt: 'analyze' });
    expect(mockSession.executeBash).toHaveBeenCalledWith('tree .');
    // The prompt should contain the injected pre_script_output
    const promptArg = mockSession.prompt.mock.calls[0][0] as string;
    expect(promptArg).toContain('tree output here');
  });

  it('runs post-phase scripts after getting output', async () => {
    const runner = new SpecialistRunner({
      loader: makeLoader([{ path: 'echo done', phase: 'post', inject_output: false }]),
      hooks: new HookEmitter({ tracePath: '/tmp/test-runner-scripts2.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    await runner.run({ name: 'test-spec', prompt: 'do thing' });
    // post script runs after getLastOutput
    const bashCallOrder = mockSession.executeBash.mock.invocationCallOrder[0];
    const outputCallOrder = mockSession.getLastOutput.mock.invocationCallOrder[0];
    expect(outputCallOrder).toBeLessThan(bashCallOrder);
  });

  it('does not inject if inject_output is false', async () => {
    const runner = new SpecialistRunner({
      loader: makeLoader([{ path: 'ls', phase: 'pre', inject_output: false }]),
      hooks: new HookEmitter({ tracePath: '/tmp/test-runner-scripts3.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    await runner.run({ name: 'test-spec', prompt: 'x' });
    expect(mockSession.executeBash).toHaveBeenCalledWith('ls');
    // No injection — pre_script_output remains as literal (not substituted since value is '')
    const promptArg = mockSession.prompt.mock.calls[0][0] as string;
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
    expect(mockSession.executeBash).not.toHaveBeenCalled();
    expect(result.output).toBe('final output');
  });
});
