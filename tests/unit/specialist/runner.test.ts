// tests/unit/specialist/runner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
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

function createReviewerDiffRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'reviewer-diff-'));
  execSync('git init -b main', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email test@example.com', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name Test User', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'tracked.txt'), 'base\n');
  execSync('git add tracked.txt', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m base', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'tracked.txt'), 'base\nstaged\n');
  execSync('git add tracked.txt', { cwd: dir, stdio: 'pipe' });
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function createEmptyReviewerRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'reviewer-empty-'));
  execSync('git init -b main', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email test@example.com', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name Test User', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'tracked.txt'), 'base\n');
  execSync('git add tracked.txt', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m base', { cwd: dir, stdio: 'pipe' });
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
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
    const renderedTask = mockSession.prompt.mock.calls.at(-1)?.[0] as string;
    expect(renderedTask).toContain('Do do thing');
    expect(renderedTask).toContain('## MANDATORY_RULES');
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

  it('passes execution.extensions opt-out to PiAgentSession', async () => {
    const sessionFactory = vi.fn().mockResolvedValue(mockSession);
    const runner = new SpecialistRunner({
      loader: makeLoader({ extensions: { serena: false, gitnexus: false } }),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory,
    });

    await runner.run({ name: 'test-spec', prompt: 'do thing' });

    expect(sessionFactory).toHaveBeenCalledWith(expect.objectContaining({
      excludeExtensions: ['pi-serena-tools', 'pi-gitnexus'],
    }));
  });

  it('uses staged diff when unstaged diff empty for reviewer startup', async () => {
    const repo = createReviewerDiffRepo();
    try {
      const sessionFactory = vi.fn().mockResolvedValue(mockSession);
      const runner = new SpecialistRunner({
        loader: {
          get: vi.fn().mockResolvedValue({
            specialist: {
              metadata: { name: 'reviewer', version: '1.0.0' },
              execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
              prompt: { task_template: 'review $reviewed_job_id', system: 'You are reviewer.' },
              communication: undefined,
              capabilities: undefined,
              beads_integration: 'never',
            },
          }),
        } as any,
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory,
      });

      await runner.run({
        name: 'reviewer',
        prompt: 'review this',
        reusedFromJobId: 'job-reviewed',
        workingDirectory: repo.dir,
      });

      const promptArg = mockSession.prompt.mock.calls.at(-1)?.[0] as string;
      const sessionOptions = sessionFactory.mock.calls[0][0] as { systemPrompt?: string };
      const systemPrompt = sessionOptions.systemPrompt ?? '';
      expect(promptArg).toContain('review $reviewed_job_id');
      expect(systemPrompt).toContain('## Reviewer Diff Context');
      expect(systemPrompt).toContain('Patch source:');
      expect(systemPrompt).toContain('staged diff');
      expect(systemPrompt).toContain('Diff stat:');
      expect(systemPrompt).toContain('tracked.txt');
      expect(systemPrompt).toContain('staged');
    } finally {
      repo.cleanup();
    }
  });

  it('fails fast when reviewer patch sources all empty', async () => {
    const repo = createEmptyReviewerRepo();
    try {
      const runner = new SpecialistRunner({
        loader: {
          get: vi.fn().mockResolvedValue({
            specialist: {
              metadata: { name: 'reviewer', version: '1.0.0' },
              execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
              prompt: { task_template: 'review $reviewed_job_id', system: 'You are reviewer.' },
              communication: undefined,
              capabilities: undefined,
              beads_integration: 'never',
            },
          }),
        } as any,
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
      });

      await expect(runner.run({
        name: 'reviewer',
        prompt: 'review this',
        reusedFromJobId: 'job-reviewed',
        workingDirectory: repo.dir,
      })).rejects.toThrow('Reviewer startup blocked: no patch context found in injected diff, unstaged diff, staged diff, or branch-vs-base diff.');
    } finally {
      repo.cleanup();
    }
  });


  it('prefers injected diff context over git fallbacks for reviewer startup', async () => {
    const repo = createEmptyReviewerRepo();
    try {
      const sessionFactory = vi.fn().mockResolvedValue(mockSession);
      const runner = new SpecialistRunner({
        loader: {
          get: vi.fn().mockResolvedValue({
            specialist: {
              metadata: { name: 'reviewer', version: '1.0.0' },
              execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
              prompt: { task_template: 'review $reviewed_job_id', system: 'You are reviewer.' },
              communication: undefined,
              capabilities: undefined,
              beads_integration: 'never',
            },
          }),
        } as any,
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory,
      });

      await runner.run({
        name: 'reviewer',
        prompt: 'review this',
        reusedFromJobId: 'job-reviewed',
        workingDirectory: repo.dir,
        variables: {
          reviewed_job_id: 'job-reviewed',
          reviewer_diff_source: 'injected diff context',
          reviewer_diff_stat: ' tracked.txt | 1 +',
          reviewer_diff_files: 'tracked.txt',
          reviewer_diff_hunks: '### tracked.txt\n@@ -1 +1 @@\n-base\n+injected',
        },
      });

      const sessionOptions = sessionFactory.mock.calls[0][0] as { systemPrompt?: string };
      const systemPrompt = sessionOptions.systemPrompt ?? '';
      expect(systemPrompt).toContain('Patch source:');
      expect(systemPrompt).toContain('injected diff context');
      expect(systemPrompt).toContain('tracked.txt');
      expect(systemPrompt).toContain('+injected');
    } finally {
      repo.cleanup();
    }
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

  it('strips JSON fences for response_format=json outputs before returning', async () => {
    mockSession.getLastOutput.mockResolvedValueOnce('```json\n{"summary":"Done","status":"success","issues_closed":[],"issues_created":[],"follow_ups":[],"risks":[],"verification":[]}\n```');

    const runner = new SpecialistRunner({
      loader: makeLoader({ response_format: 'json' }),
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
      sessionFactory: vi.fn().mockResolvedValue(mockSession),
    });

    const result = await runner.run({ name: 'test-spec', prompt: 'do thing' });

    expect(result.output.startsWith('```')).toBe(false);
    expect(JSON.parse(result.output).status).toBe('success');
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
        beadsClient: makeBeadsClient({ readBead: vi.fn().mockReturnValue(null) }),
      });
      await runner.run({
        name: 'test-spec',
        prompt: '# Task: Refactor auth',
        inputBeadId: 'unitAI-55d',
      });
      const renderedTask = mockSession.prompt.mock.calls.at(-1)?.[0] as string;
      expect(renderedTask).toContain([
        'Prompt=# Task: Refactor auth',
        'Bead=# Task: Refactor auth',
        'Id=unitAI-55d',
      ].join('\n'));
      expect(renderedTask).toContain('## MANDATORY_RULES');
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
        beadsClient: makeBeadsClient({ readBead: vi.fn().mockReturnValue(null) }),
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

    it('renders bead_id placeholder as empty string for non-bead system prompts', async () => {
      const sessionFactory = vi.fn().mockResolvedValue(mockSession);
      const runner = new SpecialistRunner({
        loader: makeLoader({}, 'never', { system: 'bead=[$bead_id] prompt=$prompt' }),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory,
      });

      await runner.run({ name: 'test-spec', prompt: 'review docs' });

      const sessionOptions = sessionFactory.mock.calls[0][0];
      expect(sessionOptions.systemPrompt).toContain('bead=[] prompt=review docs');
      expect(sessionOptions.systemPrompt).not.toContain('$bead_id');
    });

    it('renders bead_id placeholder as empty string for non-bead task templates', async () => {
      const runner = new SpecialistRunner({
        loader: makeLoader({}, 'never', { task_template: 'bead=[$bead_id]\nprompt=$prompt' }),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
      });

      await runner.run({ name: 'test-spec', prompt: 'sync docs' });

      const renderedTask = mockSession.prompt.mock.calls.at(-1)?.[0] as string;
      expect(renderedTask).toContain('bead=[]');
      expect(renderedTask).toContain('prompt=sync docs');
      expect(renderedTask).not.toContain('$bead_id');
    });

    it.each([
      'reviewer',
      'explorer',
      'debugger',
      'sync-docs',
      'executor',
    ])('injects cwd/worktree boundary rule into bead task payload for %s', async specialistName => {
      const runner = new SpecialistRunner({
        loader: {
          get: vi.fn().mockResolvedValue({
            specialist: {
              metadata: { name: specialistName, version: '1.0.0' },
              execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
              prompt: { task_template: 'Task: $prompt', system: 'You are helpful.' },
              communication: undefined,
              capabilities: undefined,
              beads_integration: 'never',
            },
          }),
        } as any,
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
      });

      await runner.run({
        name: specialistName,
        prompt: 'inspect boundary behavior',
        inputBeadId: 'unitAI-55d',
        workingDirectory: '/repo/worktree',
        worktreeBoundary: '/repo/worktree',
      });

      const promptArg = mockSession.prompt.mock.calls.at(-1)?.[0] as string;
      expect(promptArg).toContain('## Runtime Boundary Rules');
      expect(promptArg).toContain('Current cwd: /repo/worktree');
      expect(promptArg).toContain('Assigned worktree boundary: /repo/worktree');
      expect(promptArg).toContain('Do NOT run `cd` outside the current cwd / assigned worktree.');
      expect(promptArg).toContain('Do NOT broad-search /home, repo root, or unrelated paths when evidence is missing.');
      expect(promptArg).toContain('If required evidence is missing inside the current scope, STOP immediately, report exactly what is missing, and ask for the artifact or clarification instead of widening search.');
    });

    it('injects reused lineage variables into task template context', async () => {
      const runner = new SpecialistRunner({
        loader: makeLoader(
          { permission_required: 'READ_ONLY' },
          'never',
          {
            task_template: 'reuse=$reused_from_job_id\nowner=$worktree_owner_job_id',
            system: 'You are helpful.',
          },
        ),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory: vi.fn().mockResolvedValue(mockSession),
        beadsClient: makeBeadsClient({ readBead: vi.fn().mockReturnValue(null) }),
      });

      await runner.run({
        name: 'test-spec',
        prompt: 'do thing',
        reusedFromJobId: 'job-reused-123',
        worktreeOwnerJobId: 'job-owner-999',
      });

      const renderedTask = mockSession.prompt.mock.calls.at(-1)?.[0] as string;
      expect(renderedTask).toContain('reuse=job-reused-123');
      expect(renderedTask).toContain('owner=job-owner-999');
      expect(renderedTask).not.toContain('$reused_from_job_id');
      expect(renderedTask).not.toContain('$worktree_owner_job_id');
    });

    it('injects reused lineage variables into system prompt template context', async () => {
      const sessionFactory = vi.fn().mockResolvedValue(mockSession);
      const runner = new SpecialistRunner({
        loader: makeLoader(
          { permission_required: 'READ_ONLY' },
          'never',
          {
            system: 'lineage reuse=$reused_from_job_id owner=$worktree_owner_job_id prompt=$prompt',
          },
        ),
        hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
        circuitBreaker: new CircuitBreaker(),
        sessionFactory,
        beadsClient: makeBeadsClient({ readBead: vi.fn().mockReturnValue(null) }),
      });

      await runner.run({
        name: 'test-spec',
        prompt: 'review this run',
        reusedFromJobId: 'job-reused-abc',
        worktreeOwnerJobId: 'job-owner-def',
      });

      const sessionOptions = sessionFactory.mock.calls[0][0];
      expect(sessionOptions.systemPrompt).toContain('lineage reuse=job-reused-abc owner=job-owner-def prompt=review this run');
      expect(sessionOptions.systemPrompt).not.toContain('$reused_from_job_id');
      expect(sessionOptions.systemPrompt).not.toContain('$worktree_owner_job_id');
    });

    it('renders reviewed_job_id into reviewer lineage block so normal --job flow does not request manual id', async () => {
      const loader = {
        get: vi.fn().mockResolvedValue({
          specialist: {
            metadata: { name: 'reviewer', version: '1.0.0' },
            execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
            prompt: {
              task_template: [
                'Audit run',
                'Resolved lineage input:',
                '- reviewed_job_id: $reviewed_job_id',
              ].join('\n'),
              system: 'You are reviewer.',
            },
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
        beadsClient: makeBeadsClient({ readBead: vi.fn().mockReturnValue(null) }),
      });

      await runner.run({
        name: 'reviewer',
        prompt: 'review this',
        variables: { reviewed_job_id: 'job-reviewed' },
      });

      const renderedTask = mockSession.prompt.mock.calls.at(-1)?.[0] as string;
      expect(renderedTask).toContain('- reviewed_job_id: job-reviewed');
      expect(renderedTask).not.toContain('$reviewed_job_id');
      expect(renderedTask).not.toContain('Need reviewed_job_id');
    });

    it('defines authoritative review context rules in reviewer config prompt', async () => {
      const reviewerConfigPath = '/home/dawid/dev/specialists/.worktrees/unitAI-xcaov/unitAI-xcaov-executor/config/specialists/reviewer.specialist.json';
      const reviewerConfig = JSON.parse(readFileSync(reviewerConfigPath, 'utf8'));
      const systemPrompt = reviewerConfig?.specialist?.prompt?.system ?? '';
      expect(systemPrompt).toContain('## AUTHORITATIVE REVIEW CONTEXT');
      expect(systemPrompt).toContain('Evidence precedence, highest to lowest');
      expect(systemPrompt).toContain('Missing local artifacts MUST NOT trigger FAIL by itself.');
      expect(systemPrompt).toContain('authoritative_lineage_present: yes|no');
      expect(systemPrompt).toContain('authoritative_result_present: yes|no');
      expect(systemPrompt).toContain('authoritative_diff_present: yes|no');
      expect(systemPrompt).toContain('local_lookup_status: success|partial|missing|not_attempted');
      expect(systemPrompt).toContain('contradiction_detected: yes|no');
      expect(systemPrompt).toContain('missing_required_injected_fields: []|[list]');
      expect(systemPrompt).toContain('limitation_note: <short note or none>');
      expect(systemPrompt).toContain('Required injected fields for authoritative traceability:');
      expect(systemPrompt).toContain('Local lookup failure with valid injected context => PARTIAL or PASS, never FAIL by itself.');
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
