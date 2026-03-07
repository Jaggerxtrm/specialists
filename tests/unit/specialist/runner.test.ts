// tests/unit/specialist/runner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecialistRunner } from '../../../src/specialist/runner.js';
import { HookEmitter } from '../../../src/specialist/hooks.js';
import { CircuitBreaker } from '../../../src/utils/circuitBreaker.js';

function makeMockSession() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    prompt: vi.fn().mockResolvedValue(undefined),
    waitForDone: vi.fn().mockResolvedValue(undefined),
    getLastOutput: vi.fn().mockResolvedValue('{"result": "ok"}'),
    executeBash: vi.fn().mockResolvedValue(''),
    kill: vi.fn(),
    meta: { backend: 'google-gemini-cli', model: 'gemini', sessionId: 'test-id', startedAt: new Date() },
  };
}

function makeLoader(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn().mockResolvedValue({
      specialist: {
        metadata: { name: 'test-spec', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY', ...overrides },
        prompt: { task_template: 'Do $prompt', system: 'You are helpful.' },
        communication: undefined,
        capabilities: undefined,
      },
    }),
  } as any;
}

describe('SpecialistRunner', () => {
  let mockSession: ReturnType<typeof makeMockSession>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = makeMockSession();
  });

  it('executes specialist and returns output', async () => {
    const runner = new SpecialistRunner({
      loader: makeLoader(),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    const result = await runner.run({ name: 'test-spec', prompt: 'analyze this' });
    expect(result.output).toBe('{"result": "ok"}');
    expect(result.backend).toBe('google-gemini-cli');
    expect(result.specialistVersion).toBe('1.0.0');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('calls pi session lifecycle in order', async () => {
    const sessionFactory = vi.fn().mockResolvedValue(mockSession);
    const runner = new SpecialistRunner({
      loader: makeLoader(),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory,
    });
    await runner.run({ name: 'test-spec', prompt: 'do thing' });
    expect(mockSession.start).toHaveBeenCalledOnce();
    expect(mockSession.prompt).toHaveBeenCalledWith('Do do thing');
    expect(mockSession.waitForDone).toHaveBeenCalledOnce();
    expect(mockSession.getLastOutput).toHaveBeenCalledOnce();
    expect(mockSession.kill).toHaveBeenCalledOnce();
  });

  it('kills session even on error', async () => {
    mockSession.prompt.mockRejectedValueOnce(new Error('backend down'));
    const runner = new SpecialistRunner({
      loader: makeLoader(),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    await expect(runner.run({ name: 'test-spec', prompt: 'fail' })).rejects.toThrow('backend down');
    expect(mockSession.kill).toHaveBeenCalledOnce();
  });

  it('uses fallback backend when primary circuit is OPEN', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure('gemini'); // open gemini circuit
    const sessionFactory = vi.fn().mockResolvedValue(mockSession);
    const runner = new SpecialistRunner({
      loader: makeLoader({ fallback_model: 'qwen' }),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace2.jsonl' }),
      circuitBreaker: cb,
      sessionFactory,
    });
    const result = await runner.run({ name: 'test-spec', prompt: 'test' });
    expect(result.model).toBe('qwen');
  });
});
