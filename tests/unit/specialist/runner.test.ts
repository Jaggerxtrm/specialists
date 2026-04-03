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
    getLastOutput: vi.fn().mockResolvedValue(JSON.stringify({
      summary: 'Done',
      status: 'success',
      issues_closed: [],
      issues_created: [],
      follow_ups: [],
      risks: [],
      verification: [],
    })),
    getState: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
    executeBash: vi.fn().mockResolvedValue(''),
    kill: vi.fn(),
    meta: { backend: 'google-gemini-cli', model: 'gemini', sessionId: 'test-id', startedAt: new Date() },
  };
}

function makeLoader(
  executionOverrides: Record<string, unknown> = {},
  beadsIntegration = 'auto',
  promptOverrides: Record<string, unknown> = {},
) {
  return {
    get: vi.fn().mockResolvedValue({
      specialist: {
        metadata: { name: 'test-spec', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY', ...executionOverrides },
        prompt: { task_template: 'Do $prompt', system: 'You are helpful.', ...promptOverrides },
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
    readBead: vi.fn(),
    addDependency: vi.fn(),
    closeBead: vi.fn(),
    auditBead: vi.fn(),
    updateBeadNotes: vi.fn(),
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
    expect(JSON.parse(result.output).status).toBe('success');
    expect(result.backend).toBe('google-gemini-cli');
    expect(result.specialistVersion).toBe('1.0.0');
    expect(result.promptHash).toHaveLength(16);
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
    expect(mockSession.close).toHaveBeenCalledOnce();
    expect(mockSession.kill).not.toHaveBeenCalled();
  });

  it('passes execution.stall_timeout_ms through to PiAgentSession options', async () => {
    const sessionFactory = vi.fn().mockResolvedValue(mockSession);
    const runner = new SpecialistRunner({
      loader: makeLoader({ stall_timeout_ms: 1234 }),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory,
    });

    await runner.run({ name: 'test-spec', prompt: 'do thing' });

    expect(sessionFactory).toHaveBeenCalledWith(expect.objectContaining({
      stallTimeoutMs: 1234,
    }));
  });

  it('injects markdown output contract when response_format=markdown', async () => {
    const sessionFactory = vi.fn().mockResolvedValue(mockSession);
    const runner = new SpecialistRunner({
      loader: makeLoader({ response_format: 'markdown', output_type: 'codegen' }),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory,
    });

    await runner.run({ name: 'test-spec', prompt: 'do thing' });

    const sessionOptions = sessionFactory.mock.calls[0][0];
    expect(sessionOptions.systemPrompt).toContain('## Output Contract');
    expect(sessionOptions.systemPrompt).toContain('## Summary');
    expect(sessionOptions.systemPrompt).toContain('Output archetype: `codegen`');
  });

  it('injects JSON-only contract when response_format=json', async () => {
    const sessionFactory = vi.fn().mockResolvedValue(mockSession);
    const runner = new SpecialistRunner({
      loader: makeLoader({ response_format: 'json', output_type: 'review' }),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory,
    });

    await runner.run({ name: 'test-spec', prompt: 'do thing' });

    const sessionOptions = sessionFactory.mock.calls[0][0];
    expect(sessionOptions.systemPrompt).toContain('Respond with a single valid JSON object only.');
    expect(sessionOptions.systemPrompt).toContain('Output archetype: `review`');
  });

  it('does not inject output contract when response_format=text', async () => {
    const sessionFactory = vi.fn().mockResolvedValue(mockSession);
    const runner = new SpecialistRunner({
      loader: makeLoader({ response_format: 'text', output_type: 'analysis' }),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory,
    });

    await runner.run({ name: 'test-spec', prompt: 'do thing' });

    const sessionOptions = sessionFactory.mock.calls[0][0];
    expect(sessionOptions.systemPrompt).not.toContain('## Output Contract');
  });

  it('warns when response_format=json output is not parseable JSON', async () => {
    mockSession.getLastOutput.mockResolvedValueOnce('not-json');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const runner = new SpecialistRunner({
      loader: makeLoader({ response_format: 'json' }),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });

    await runner.run({ name: 'test-spec', prompt: 'do thing' });

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Strong warning: response_format=json but output is not valid JSON'));
    stderrSpy.mockRestore();
  });

  it('warns when markdown+output_schema omits machine-readable block', async () => {
    mockSession.getLastOutput.mockResolvedValueOnce('## Summary\nDone.');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const runner = new SpecialistRunner({
      loader: makeLoader(
        { response_format: 'markdown' },
        'auto',
        {
          output_schema: {
            type: 'object',
            properties: { status: { type: 'string' } },
            required: ['status'],
          },
        },
      ),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });

    await runner.run({ name: 'test-spec', prompt: 'do thing' });

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('missing `## Machine-readable block` JSON fenced block'));
    stderrSpy.mockRestore();
  });

  it('defaults to keepAlive when execution.interactive=true', async () => {
    const onResumeReady = vi.fn();
    const runner = new SpecialistRunner({
      loader: makeLoader({ interactive: true }),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });

    await runner.run({ name: 'test-spec', prompt: 'analyze this' }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, onResumeReady);

    expect(onResumeReady).toHaveBeenCalledOnce();
    expect(mockSession.close).not.toHaveBeenCalled();
  });

  it('respects noKeepAlive override when execution.interactive=true', async () => {
    const onResumeReady = vi.fn();
    const runner = new SpecialistRunner({
      loader: makeLoader({ interactive: true }),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });

    await runner.run({ name: 'test-spec', prompt: 'analyze this', noKeepAlive: true }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, onResumeReady);

    expect(onResumeReady).not.toHaveBeenCalled();
    expect(mockSession.close).toHaveBeenCalledOnce();
  });

  it('returns correct backend even when kill() destroys meta', async () => {
    // Simulate kill() nullifying the meta property (the bug scenario)
    mockSession.kill = vi.fn().mockImplementation(() => {
      (mockSession as any).meta = null;
    });
    const runner = new SpecialistRunner({
      loader: makeLoader(),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });
    const result = await runner.run({ name: 'test-spec', prompt: 'analyze this' });
    // backend must be the value captured BEFORE kill(), not undefined
    expect(result.backend).toBe('google-gemini-cli');
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

  it('retries transient failures and succeeds on a later attempt', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      mockSession.waitForDone
        .mockRejectedValueOnce(new Error('Specialist timed out after 5000ms'))
        .mockResolvedValueOnce(undefined);

      const runner = new SpecialistRunner({
        loader: makeLoader(),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
      });

      const result = await runner.run({ name: 'test-spec', prompt: 'go', maxRetries: 1 });

      expect(JSON.parse(result.output).status).toBe('success');
      expect(mockSession.prompt).toHaveBeenCalledTimes(2);
      expect(mockSession.waitForDone).toHaveBeenCalledTimes(2);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('does not retry auth errors even when retries are configured', async () => {
    mockSession.waitForDone.mockRejectedValueOnce(new Error('401 Unauthorized'));
    const runner = new SpecialistRunner({
      loader: makeLoader(),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });

    await expect(runner.run({ name: 'test-spec', prompt: 'go', maxRetries: 3 })).rejects.toThrow('401 Unauthorized');
    expect(mockSession.prompt).toHaveBeenCalledTimes(1);
  });

  it('records circuit-breaker failure only once after final retry fails', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      mockSession.waitForDone.mockRejectedValue(new Error('Specialist timed out after 5000ms'));
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      const recordFailure = vi.spyOn(cb, 'recordFailure');

      const runner = new SpecialistRunner({
        loader: makeLoader(),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: cb,
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
      });

      await expect(runner.run({ name: 'test-spec', prompt: 'go', maxRetries: 2 })).rejects.toThrow('Specialist timed out after 5000ms');

      expect(mockSession.prompt).toHaveBeenCalledTimes(3);
      expect(recordFailure).toHaveBeenCalledTimes(1);
    } finally {
      randomSpy.mockRestore();
    }
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
    it('creates bead and emits audit on success when always (closeBead delegated to Supervisor)', async () => {
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
      // Supervisor calls closeBead AFTER updateBeadNotes — runner must NOT close on success
      expect(beadsClient.closeBead).not.toHaveBeenCalled();
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
      expect(beadsClient.auditBead).toHaveBeenCalledWith('specialists-test-1', 'test-spec', expect.any(String), 1);
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

    it('uses input bead directly — no second tracking bead created', async () => {
      const beadsClient = makeBeadsClient();
      const runner = new SpecialistRunner({
        loader: makeLoader({ permission_required: 'MEDIUM' }, 'auto'),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
        beadsClient,
      });
      const result = await runner.run({ name: 'test-spec', prompt: 'go', inputBeadId: 'unitAI-55d' });
      expect(beadsClient.createBead).not.toHaveBeenCalled();
      expect(result.beadId).toBe('unitAI-55d');
    });

    it('exposes bead_context and bead_id template variables for bead runs', async () => {
      const loader = {
        get: vi.fn().mockResolvedValue({
          specialist: {
            metadata: { name: 'test-spec', version: '1.0.0' },
            execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
            prompt: { task_template: 'Prompt=$prompt\nBead=$bead_context\nId=$bead_id', system: 'You are helpful.' },
            communication: undefined,
            capabilities: undefined,
            beads_integration: 'never',
          },
        }),
      } as any;
      const runner = new SpecialistRunner({
        loader,
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
      });
      await runner.run({
        name: 'test-spec',
        prompt: '# Task: Refactor auth',
        inputBeadId: 'unitAI-55d',
      });
      expect(mockSession.prompt).toHaveBeenCalledWith([
        'Prompt=# Task: Refactor auth',
        'Bead=# Task: Refactor auth',
        'Id=unitAI-55d',
      ].join('\n'));
    });

    it('substitutes bead template variables in system prompt for bead runs', async () => {
      const sessionFactory = vi.fn().mockResolvedValue(mockSession);
      const runner = new SpecialistRunner({
        loader: makeLoader(
          {},
          'never',
          { system: 'Inspect bead $bead_id and task $prompt' },
        ),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory,
      });

      await runner.run({
        name: 'test-spec',
        prompt: '# Task: Refactor auth\nImprove token validation flow.',
        inputBeadId: 'unitAI-55d',
      });

      const sessionOptions = sessionFactory.mock.calls[0][0];
      expect(sessionOptions.systemPrompt).toContain('Inspect bead unitAI-55d and task # Task: Refactor auth\nImprove token validation flow.');
      expect(sessionOptions.systemPrompt).not.toContain('$bead_id');
      expect(sessionOptions.systemPrompt).not.toContain('$prompt');
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
      expect(JSON.parse(result.output).status).toBe('success');
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
      expect(JSON.parse(result.output).status).toBe('success');
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
