// tests/unit/specialist/runner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecialistRunner } from '../../../src/specialist/runner.js';
import { HookEmitter } from '../../../src/specialist/hooks.js';
import { CircuitBreaker } from '../../../src/utils/circuitBreaker.js';
import { SessionKilledError } from '../../../src/pi/session.js';
import type { BeadsClient } from '../../../src/specialist/beads.js';

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

function makeLoader(overrides: Record<string, unknown> = {}, beadsIntegration = 'auto') {
  return {
    get: vi.fn().mockResolvedValue({
      specialist: {
        metadata: { name: 'test-spec', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY', ...overrides },
        prompt: { task_template: 'Do $prompt', system: 'You are helpful.' },
        communication: undefined,
        capabilities: undefined,
        beads_integration: beadsIntegration,
      },
    }),
  } as any;
}

function makeBeadsClient(overrides: Partial<Record<string, unknown>> = {}): BeadsClient {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    createBead: vi.fn().mockReturnValue('specialists-test-1'),
    closeBead: vi.fn(),
    auditBead: vi.fn(),
    ...overrides,
  } as unknown as BeadsClient;
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
    cb.recordFailure('gemini');
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

  describe('beads integration', () => {
    it('creates and closes bead on success when always', async () => {
      const beadsClient = makeBeadsClient();
      const runner = new SpecialistRunner({
        loader: makeLoader({}, 'always'),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
        beadsClient,
      });
      const result = await runner.run({ name: 'test-spec', prompt: 'go' });
      expect(beadsClient.createBead).toHaveBeenCalledWith('test-spec');
      expect(beadsClient.closeBead).toHaveBeenCalledWith('specialists-test-1', 'COMPLETE', expect.any(Number), expect.any(String));
      expect(beadsClient.auditBead).toHaveBeenCalledWith('specialists-test-1', 'test-spec', expect.any(String), 0);
      expect(result.beadId).toBe('specialists-test-1');
    });

    it('closes bead with ERROR status on run failure', async () => {
      mockSession.prompt.mockRejectedValueOnce(new Error('crash'));
      const beadsClient = makeBeadsClient();
      const runner = new SpecialistRunner({
        loader: makeLoader({}, 'always'),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
        beadsClient,
      });
      await expect(runner.run({ name: 'test-spec', prompt: 'go' })).rejects.toThrow('crash');
      expect(beadsClient.closeBead).toHaveBeenCalledWith('specialists-test-1', 'ERROR', expect.any(Number), expect.any(String));
    });

    it('skips bead when never', async () => {
      const beadsClient = makeBeadsClient();
      const runner = new SpecialistRunner({
        loader: makeLoader({}, 'never'),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
        beadsClient,
      });
      const result = await runner.run({ name: 'test-spec', prompt: 'go' });
      expect(beadsClient.createBead).not.toHaveBeenCalled();
      expect(result.beadId).toBeUndefined();
    });

    it('skips bead when auto and READ_ONLY', async () => {
      const beadsClient = makeBeadsClient();
      const runner = new SpecialistRunner({
        loader: makeLoader({ permission_required: 'READ_ONLY' }, 'auto'),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
        beadsClient,
      });
      const result = await runner.run({ name: 'test-spec', prompt: 'go' });
      expect(beadsClient.createBead).not.toHaveBeenCalled();
      expect(result.beadId).toBeUndefined();
    });

    it('creates bead when auto and MEDIUM permission', async () => {
      const beadsClient = makeBeadsClient();
      const runner = new SpecialistRunner({
        loader: makeLoader({ permission_required: 'MEDIUM' }, 'auto'),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
        beadsClient,
      });
      const result = await runner.run({ name: 'test-spec', prompt: 'go' });
      expect(beadsClient.createBead).toHaveBeenCalledWith('test-spec');
      expect(result.beadId).toBe('specialists-test-1');
    });

    it('does not crash when createBead returns null', async () => {
      const beadsClient = makeBeadsClient({ createBead: vi.fn().mockReturnValue(null) });
      const runner = new SpecialistRunner({
        loader: makeLoader({}, 'always'),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
        beadsClient,
      });
      const result = await runner.run({ name: 'test-spec', prompt: 'go' });
      expect(result.output).toBe('{"result": "ok"}');
      expect(result.beadId).toBeUndefined();
    });

    it('runs normally without beadsClient provided', async () => {
      const runner = new SpecialistRunner({
        loader: makeLoader({}, 'always'),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
      });
      const result = await runner.run({ name: 'test-spec', prompt: 'go' });
      expect(result.output).toBe('{"result": "ok"}');
      expect(result.beadId).toBeUndefined();
    });
  });

  describe('cancellation via SessionKilledError', () => {
    it('does not record circuit-breaker failure when session is killed', async () => {
      mockSession.waitForDone.mockRejectedValueOnce(new SessionKilledError());
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      const recordFailure = vi.spyOn(cb, 'recordFailure');
      const runner = new SpecialistRunner({
        loader: makeLoader(),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: cb,
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
      });
      await expect(runner.run({ name: 'test-spec', prompt: 'go' })).rejects.toBeInstanceOf(SessionKilledError);
      expect(recordFailure).not.toHaveBeenCalled();
      // Model should remain available (circuit NOT tripped)
      expect(cb.isAvailable('gemini')).toBe(true);
    });

    it('closes bead with CANCELLED status when session is killed', async () => {
      mockSession.waitForDone.mockRejectedValueOnce(new SessionKilledError());
      const beadsClient = makeBeadsClient();
      const runner = new SpecialistRunner({
        loader: makeLoader({}, 'always'),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
        beadsClient,
      });
      await expect(runner.run({ name: 'test-spec', prompt: 'go' })).rejects.toBeInstanceOf(SessionKilledError);
      expect(beadsClient.closeBead).toHaveBeenCalledWith('specialists-test-1', 'CANCELLED', expect.any(Number), expect.any(String));
    });

    it('records circuit-breaker failure for real backend errors (not kills)', async () => {
      mockSession.waitForDone.mockRejectedValueOnce(new Error('backend crash'));
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      const recordFailure = vi.spyOn(cb, 'recordFailure');
      const runner = new SpecialistRunner({
        loader: makeLoader(),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: cb,
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
      });
      await expect(runner.run({ name: 'test-spec', prompt: 'go' })).rejects.toThrow('backend crash');
      expect(recordFailure).toHaveBeenCalledOnce();
      expect(cb.isAvailable('gemini')).toBe(false);
    });
  });
});
