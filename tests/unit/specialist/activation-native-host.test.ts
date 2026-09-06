import { describe, it, expect, vi } from 'vitest';

/**
 * The native path must never reach for a subprocess. `spawn` is replaced with a throwing
 * stub rather than a spy: if the host ever regressed to the legacy `sp run` boundary the
 * test fails at the call site with a clear cause, instead of passing and reporting a count
 * afterwards. Everything else in node:child_process stays real — `execSync` is used by
 * tool-catalog resolution and the system-prompt defaults.
 */
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: (...args: unknown[]) => {
      throw new Error(`native activation must not spawn a subprocess; got spawn(${String(args[0])})`);
    },
  };
});
import { NativeActivationHost, type ActivationForensicSink } from '../../../src/activation/native-host.js';
import { DispatchRejectedError } from '../../../src/activation/types.js';
import type { PiSdk, PiAgentSessionLike, PiAgentSessionEvent } from '../../../src/activation/pi-sdk.js';

/**
 * Phase 1 acceptance. The load-bearing assertions here are:
 *   - a real Specialist definition drives the child (acceptance A);
 *   - a read-only child cannot receive mutation tools (acceptance G);
 *   - NO subprocess is spawned — this is the whole point of the native path;
 *   - the session is NOT disposed when it settles (acceptance H's precondition);
 *   - a write-capable Specialist is refused while no lease exists.
 */

interface FakeSessionOptions { record: { createArgs?: Record<string, unknown> } }

function fakeSession(opts: FakeSessionOptions & { assistantText?: string; stopReason?: string; errorMessage?: string }): PiAgentSessionLike & {
  disposed: boolean; prompts: string[]; emit: (e: PiAgentSessionEvent) => void;
} {
  const listeners: Array<(e: PiAgentSessionEvent) => void> = [];
  const messages: unknown[] = [];
  const session = {
    sessionId: 'pi-sess-123',
    messages,
    isIdle: true,
    disposed: false,
    prompts: [] as string[],
    activeTools: ['read', 'grep'],
    async prompt(text: string) {
      session.prompts.push(text);
      listeners.forEach(l => l({ type: 'agent_start' }));
      messages.push({
        role: 'assistant',
        content: opts.assistantText ?? 'done',
        ...(opts.stopReason ? { stopReason: opts.stopReason } : {}),
        ...(opts.errorMessage ? { errorMessage: opts.errorMessage } : {}),
      });
      listeners.forEach(l => l({ type: 'agent_end', willRetry: false }));
      listeners.forEach(l => l({ type: 'agent_settled' }));
    },
    async steer() {}, async followUp() {}, async abort() {},
    dispose() { session.disposed = true; },
    subscribe(l: (e: PiAgentSessionEvent) => void) {
      listeners.push(l);
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    },
    getActiveToolNames: () => session.activeTools,
    setActiveToolsByName(names: string[]) { session.activeTools = names; },
    async waitForIdle() {},
    emit: (e: PiAgentSessionEvent) => listeners.forEach(l => l(e)),
  };
  return session as unknown as ReturnType<typeof fakeSession>;
}

function makeSdk(record: { createArgs?: Record<string, unknown> }, session: PiAgentSessionLike): PiSdk {
  return {
    createAgentSession: async (options?: Record<string, unknown>) => {
      record.createArgs = options;
      return { session };
    },
    ModelRuntime: { create: async () => ({ hasConfiguredAuth: () => true }) },
    resolveModelScopeWithDiagnostics: () => ({
      scopedModels: [{ model: { id: 'test-model', provider: 'testprov' } }],
      diagnostics: [],
    }),
    defineTool: (d) => d,
  };
}

const BEAD = {
  id: 'ISSUE-1',
  title: 'Investigate the thing',
  description: 'PROBLEM\nx\n\nSUCCESS\ny',
};

function loaderFor(spec: Record<string, unknown>) {
  return { get: async () => spec } as never;
}

function readOnlySpec() {
  return {
    specialist: {
      metadata: { name: 'researcher', version: '1.0.0', description: 'd', category: 'c' },
      execution: {
        model: 'testprov/test-model',
        permission_required: 'READ_ONLY',
        response_format: 'text',
        output_type: 'research',
        bare: false,
      },
      prompt: { system: 'You are the researcher.', task_template: 'Do: {{bead_id}}' },
    },
  };
}

function collectingSink(): ActivationForensicSink & { names: string[]; events: Array<Record<string, unknown>> } {
  const names: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  return {
    names, events,
    emit(e) { names.push(e.name); events.push(e as unknown as Record<string, unknown>); },
  };
}

describe('NativeActivationHost — Phase 1 read-only', () => {
  it('runs a read-only Specialist in-process without spawning a subprocess', async () => {
    const record: { createArgs?: Record<string, unknown> } = {};
    const session = fakeSession({ record, assistantText: 'the answer' });
    const sink = collectingSink();

    const host = new NativeActivationHost({
      loader: loaderFor(readOnlySpec()),
      beadsClient: { readBead: () => BEAD } as never,
      forensics: sink,
      loadSdk: async () => makeSdk(record, session),
      cwd: process.cwd(),
    });

    const handle = await host.start({
      specialist: 'researcher',
      beadId: 'ISSUE-1',
      requestedByParticipantId: 'coordinator',
    });
    const result = await handle.result;

    // Reaching here at all proves no subprocess was spawned — the mock throws.
    expect(result.status).toBe('completed');
    expect(result.output).toBe('the answer');
    expect(result.piSessionId).toBe('pi-sess-123');
    expect(handle.access).toBe('read');
  });

  it('grants the child only its resolved tool contract, with pi builtins suppressed', async () => {
    const record: { createArgs?: Record<string, unknown> } = {};
    const session = fakeSession({ record });

    const host = new NativeActivationHost({
      loader: loaderFor(readOnlySpec()),
      beadsClient: { readBead: () => BEAD } as never,
      loadSdk: async () => makeSdk(record, session),
      cwd: process.cwd(),
    });

    await (await host.start({
      specialist: 'researcher', beadId: 'ISSUE-1', requestedByParticipantId: 'coordinator',
    })).result;

    const args = record.createArgs!;
    // `noTools: "builtin"` rather than `tools: []` — the latter also empties customTools.
    expect(args.noTools).toBe('builtin');

    const tools = args.tools as string[];
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    // Acceptance G: a read-only child must not hold mutation tools.
    expect(tools).not.toContain('edit');
    expect(tools).not.toContain('write');
  });

  it('does not dispose the session when the agent settles', async () => {
    const record: { createArgs?: Record<string, unknown> } = {};
    const session = fakeSession({ record });

    const host = new NativeActivationHost({
      loader: loaderFor(readOnlySpec()),
      beadsClient: { readBead: () => BEAD } as never,
      loadSdk: async () => makeSdk(record, session),
      cwd: process.cwd(),
    });

    const handle = await host.start({
      specialist: 'researcher', beadId: 'ISSUE-1', requestedByParticipantId: 'coordinator',
    });
    await handle.result;

    // A settled Specialist stays alive and resumable. Disposal is explicit only.
    expect((session as unknown as { disposed: boolean }).disposed).toBe(false);
    expect(host.inspect(handle.activationId)?.state).toBe('settled');

    await host.stop(handle.activationId);
    expect((session as unknown as { disposed: boolean }).disposed).toBe(true);
    expect(host.inspect(handle.activationId)).toBeUndefined();
  });

  it('emits admission and lifecycle forensics, including a settled event', async () => {
    const record: { createArgs?: Record<string, unknown> } = {};
    const session = fakeSession({ record });
    const sink = collectingSink();

    const host = new NativeActivationHost({
      loader: loaderFor(readOnlySpec()),
      beadsClient: { readBead: () => BEAD } as never,
      forensics: sink,
      loadSdk: async () => makeSdk(record, session),
      cwd: process.cwd(),
    });

    await (await host.start({
      specialist: 'researcher', beadId: 'ISSUE-1', requestedByParticipantId: 'coordinator',
    })).result;

    expect(sink.names).toEqual(expect.arrayContaining([
      'activation_requested', 'activation_admitted', 'activation_starting',
      'activation_started', 'turn_started', 'turn_completed',
      'activation_settled', 'activation_completed',
    ]));
  });

  it('refuses a write-capable Specialist while no workspace lease exists, and leaves forensic evidence', async () => {
    const record: { createArgs?: Record<string, unknown> } = {};
    const session = fakeSession({ record });
    const sink = collectingSink();
    const spec = readOnlySpec();
    (spec.specialist.execution as Record<string, unknown>).permission_required = 'HIGH';

    const host = new NativeActivationHost({
      loader: loaderFor(spec),
      beadsClient: { readBead: () => BEAD } as never,
      forensics: sink,
      loadSdk: async () => makeSdk(record, session),
      cwd: process.cwd(),
    });

    await expect(host.start({
      specialist: 'executor', beadId: 'ISSUE-1', requestedByParticipantId: 'coordinator',
    })).rejects.toBeInstanceOf(DispatchRejectedError);

    // No session may exist for a refused dispatch.
    expect(record.createArgs).toBeUndefined();
    // A refused dispatch is still runtime evidence.
    expect(sink.names).toContain('activation_rejected');
  });

  it('rejects an unavailable model override before creating a session', async () => {
    const record: { createArgs?: Record<string, unknown> } = {};
    const session = fakeSession({ record });
    const sink = collectingSink();

    const sdk = makeSdk(record, session);
    sdk.resolveModelScopeWithDiagnostics = () => ({
      scopedModels: [],
      diagnostics: [{ type: 'warning', code: 'no-match', message: 'No models match pattern "bogus/model"', pattern: 'bogus/model' }],
    });

    const host = new NativeActivationHost({
      loader: loaderFor(readOnlySpec()),
      beadsClient: { readBead: () => BEAD } as never,
      forensics: sink,
      loadSdk: async () => sdk,
      cwd: process.cwd(),
    });

    await expect(host.start({
      specialist: 'researcher',
      beadId: 'ISSUE-1',
      requestedByParticipantId: 'coordinator',
      modelOverride: 'bogus/model',
    })).rejects.toThrow(/model_unavailable/);

    expect(record.createArgs).toBeUndefined();
    expect(sink.names).toContain('activation_rejected');
  });
});

describe('createActivationForensicSink', () => {
  it('writes activation events to observability.db and never throws on writer failure', async () => {
    const { createActivationForensicSink } = await import('../../../src/activation/forensic-sink.js');
    const rows: Array<{ jobId: string; specialist: string; beadId?: string; event: Record<string, unknown> }> = [];

    const sink = createActivationForensicSink({
      appendForensicEvent: (jobId: string, specialist: string, beadId: string | undefined, event: Record<string, unknown>) => {
        rows.push({ jobId, specialist, beadId, event });
      },
    } as never);

    sink.emit({
      activationId: 'act:abc', attemptId: 'att:abc:1', participantId: 'specialist:researcher',
      specialist: 'researcher', beadId: 'ISSUE-1', name: 'activation_admitted', payload: { tier: 'READ_ONLY' },
    });
    sink.emit({
      activationId: 'act:abc', attemptId: 'att:abc:1', participantId: 'specialist:researcher',
      specialist: 'researcher', beadId: 'ISSUE-1', name: 'activation_rejected', payload: { reason: 'x' },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].jobId).toBe('act:abc');
    expect(rows[0].event.event_family).toBe('activation');
    expect(rows[0].event.event_name).toBe('activation.activation_admitted');
    expect(rows[0].event.severity).toBe('info');
    // A refused dispatch is error-severity evidence, not a silent return value.
    expect(rows[1].event.severity).toBe('error');
    // attempt_id has no column yet, so it must at least survive in the body.
    expect((rows[0].event.body as Record<string, unknown>).attempt_id).toBe('att:abc:1');
    expect((rows[0].event.correlation as Record<string, unknown>).participant_id).toBe('specialist:researcher');

    // Forensics must never be the reason an activation fails.
    const exploding = createActivationForensicSink({
      appendForensicEvent: () => { throw new Error('db gone'); },
    } as never);
    expect(() => exploding.emit({
      activationId: 'a', attemptId: 'b', participantId: 'c', specialist: 'd', name: 'activation_started',
    })).not.toThrow();

    // A null client yields a no-op sink rather than throwing at construction.
    expect(() => createActivationForensicSink(null).emit({
      activationId: 'a', attemptId: 'b', participantId: 'c', specialist: 'd', name: 'activation_started',
    })).not.toThrow();
  });
});

/**
 * Both cases below are regressions found by the live smoke (unitAI-rrdnt.11), not by this
 * file. The original doubles were permissive enough to pass while the real runtime failed:
 * a stub `createAgentSession` accepts any `model` value, and a stub session never reports a
 * failed turn. Each is now pinned here so the cheap suite catches it next time.
 */
describe('NativeActivationHost — defects found by the live smoke', () => {
  it('passes the resolved pi Model object to createAgentSession, never a provider-qualified string', async () => {
    const record: { createArgs?: Record<string, unknown> } = {};
    const session = fakeSession({ record });
    const host = new NativeActivationHost({
      loader: loaderFor(readOnlySpec()),
      beadsClient: { readBead: () => BEAD } as never,
      loadSdk: async () => makeSdk(record, session),
      cwd: process.cwd(),
    });

    const handle = await host.start({
      specialist: 'researcher',
      beadId: 'ISSUE-1',
      requestedByParticipantId: 'coordinator:test',
    });
    await handle.result;

    // pi's createAgentSession takes `model?: Model<any>`. A string is accepted silently and
    // then fails mid-turn with "No API key found for undefined".
    expect(record.createArgs?.model).toEqual({ id: 'test-model', provider: 'testprov' });
    expect(typeof record.createArgs?.model).not.toBe('string');
  });

  it('reports a turn that ended in error as failed, not as completed with empty output', async () => {
    const record: { createArgs?: Record<string, unknown> } = {};
    const session = fakeSession({
      record,
      assistantText: '',
      stopReason: 'error',
      errorMessage: '429: monthly usage limit reached',
    });
    const sink = collectingSink();
    const host = new NativeActivationHost({
      loader: loaderFor(readOnlySpec()),
      beadsClient: { readBead: () => BEAD } as never,
      loadSdk: async () => makeSdk(record, session),
      forensics: sink,
      cwd: process.cwd(),
    });

    const handle = await host.start({
      specialist: 'researcher',
      beadId: 'ISSUE-1',
      requestedByParticipantId: 'coordinator:test',
    });
    const result = await handle.result;

    expect(result.status).toBe('failed');
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors?.[0]).toContain('429');
    expect(sink.names).toContain('activation_failed');
    expect(sink.names).not.toContain('activation_completed');
  });
});
