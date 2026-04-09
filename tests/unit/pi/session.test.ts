// tests/unit/pi/session.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { mapSpecialistBackend, getProviderArgs } from '../../../src/pi/backendMap.js';

// ── Mock node:child_process before importing session ──────────────────────────
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { PiAgentSession, StallTimeoutError } from '../../../src/pi/session.js';

const mockSpawn = spawn as ReturnType<typeof vi.fn>;

// ── backendMap tests (pre-existing) ──────────────────────────────────────────
describe('backendMap', () => {
  it('maps gemini to google-gemini-cli', () => {
    expect(mapSpecialistBackend('gemini')).toBe('google-gemini-cli');
    expect(mapSpecialistBackend('google')).toBe('google-gemini-cli');
  });
  it('maps qwen to openai', () => {
    expect(mapSpecialistBackend('qwen')).toBe('openai');
  });
  it('maps claude/anthropic to anthropic', () => {
    expect(mapSpecialistBackend('claude')).toBe('anthropic');
    expect(mapSpecialistBackend('anthropic')).toBe('anthropic');
  });
  it('passes through unknown backends', () => {
    expect(mapSpecialistBackend('groq')).toBe('groq');
    expect(mapSpecialistBackend('openrouter')).toBe('openrouter');
  });
  it('returns --api-key args for qwen', () => {
    const args = getProviderArgs('qwen');
    expect(args).toContain('--api-key');
  });
  it('returns empty args for gemini', () => {
    expect(getProviderArgs('gemini')).toHaveLength(0);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a fresh fake ChildProcess and wire it up to mockSpawn. */
function makeFakeProc() {
  const stdoutHandlers: Record<string, Function> = {};
  const stderrHandlers: Record<string, Function> = {};
  const procHandlers: Record<string, Function> = {};

  const stdin = {
    write: vi.fn().mockImplementation((_data: any, cb?: any) => { cb?.(); return true; }),
    end: vi.fn(),
    writable: true,
  };

  const stdout = {
    on: vi.fn().mockImplementation((evt: string, h: Function) => {
      stdoutHandlers[evt] = h;
    }),
  };

  const stderr = {
    on: vi.fn().mockImplementation((evt: string, h: Function) => {
      stderrHandlers[evt] = h;
    }),
  };

  const proc = {
    stdin,
    stdout,
    stderr,
    on: vi.fn().mockImplementation((evt: string, h: Function) => {
      procHandlers[evt] = h;
    }),
    kill: vi.fn(),
  };

  mockSpawn.mockReturnValue(proc);

  return { proc, stdin, stdout, stderr, stdoutHandlers, stderrHandlers, procHandlers };
}

// ── Protocol event injection helper ──────────────────────────────────────────

/** Emit a single NDJSON line into the session as if pi wrote it to stdout. */
function emitLine(fake: ReturnType<typeof makeFakeProc>, obj: object) {
  fake.stdoutHandlers['data']?.(Buffer.from(JSON.stringify(obj) + '\n'));
}

// ── RPC protocol parsing tests ────────────────────────────────────────────────

describe('_handleEvent — RPC protocol parsing', () => {
  let fake: ReturnType<typeof makeFakeProc>;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = makeFakeProc();
  });

  it('thinking_delta nested in message_update calls onThinking', async () => {
    const onThinking = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onThinking });
    await session.start();

    emitLine(fake, {
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', delta: 'hmm...' },
    });

    expect(onThinking).toHaveBeenCalledOnce();
    expect(onThinking).toHaveBeenCalledWith('hmm...');
  });

  it('top-level thinking_delta does NOT call onThinking', async () => {
    const onThinking = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onThinking });
    await session.start();

    emitLine(fake, { type: 'thinking_delta', delta: 'should be ignored' });

    expect(onThinking).not.toHaveBeenCalled();
  });

  it('thinking_start nested in message_update fires onEvent("thinking")', async () => {
    const onEvent = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onEvent });
    await session.start();

    emitLine(fake, {
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_start' },
    });

    expect(onEvent).toHaveBeenCalledWith('thinking');
  });

  it('toolcall_start nested in message_update calls onToolStart and onEvent("toolcall")', async () => {
    const onToolStart = vi.fn();
    const onEvent = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onToolStart, onEvent });
    await session.start();

    emitLine(fake, {
      type: 'message_update',
      assistantMessageEvent: { type: 'toolcall_start', name: 'bash' },
    });

    expect(onToolStart).toHaveBeenCalledOnce();
    expect(onToolStart).toHaveBeenCalledWith('bash');
    expect(onEvent).toHaveBeenCalledWith('toolcall');
  });

  it('top-level toolcall_start does NOT call onToolStart or onEvent("toolcall")', async () => {
    const onToolStart = vi.fn();
    const onEvent = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onToolStart, onEvent });
    await session.start();

    emitLine(fake, { type: 'toolcall_start', name: 'bash' });

    expect(onToolStart).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalledWith('toolcall');
  });

  it('agent_end fires onEvent("agent_end"), not onEvent("done")', async () => {
    const onEvent = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onEvent });
    await session.start();

    emitLine(fake, { type: 'agent_end', messages: [] });

    expect(onEvent).toHaveBeenCalledWith('agent_end');
    expect(onEvent).not.toHaveBeenCalledWith('done');
  });

  it('assistantMessageEvent.done fires onEvent("message_done")', async () => {
    const onEvent = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onEvent });
    await session.start();

    emitLine(fake, {
      type: 'message_update',
      assistantMessageEvent: { type: 'done', stopReason: 'stop' },
    });

    expect(onEvent).toHaveBeenCalledWith('message_done');
  });

  it('assistantMessageEvent.done emits finish_reason metric', async () => {
    const onMetric = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onMetric });
    await session.start();

    emitLine(fake, {
      type: 'message_update',
      assistantMessageEvent: { type: 'done', stopReason: 'length' },
    });

    expect(onMetric).toHaveBeenCalledWith({
      type: 'finish_reason',
      finish_reason: 'length',
      source: 'message_done',
    });
  });

  it('text_delta nested in message_update calls onToken and onEvent("text")', async () => {
    const onToken = vi.fn();
    const onEvent = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onToken, onEvent });
    await session.start();

    emitLine(fake, {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'hello' },
    });

    expect(onToken).toHaveBeenCalledWith('hello');
    expect(onEvent).toHaveBeenCalledWith('text');
  });

  it('tool_execution_end passes undefined resultRaw when result is not an object', async () => {
    const onToolEnd = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onToolEnd });
    await session.start();

    emitLine(fake, {
      type: 'tool_execution_end',
      toolName: 'bash',
      isError: false,
      result: 'plain text result',
    });

    expect(onToolEnd).toHaveBeenCalledWith('bash', false, undefined, undefined, undefined);
  });
});

// ── PiAgentSession behaviour tests ───────────────────────────────────────────
describe('PiAgentSession', () => {
  let fake: ReturnType<typeof makeFakeProc>;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = makeFakeProc();
  });

  it('pins spawn cwd to an absolute current working directory by default', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    const spawnOptions = mockSpawn.mock.calls[0][2] as { cwd?: string };
    expect(spawnOptions.cwd).toBe(resolve(process.cwd()));
  });

  it('resolves provided relative cwd to an absolute path at spawn time', async () => {
    const session = await PiAgentSession.create({ model: 'gemini', cwd: '.' });
    await session.start();

    const spawnOptions = mockSpawn.mock.calls[0][2] as { cwd?: string };
    expect(spawnOptions.cwd).toBe(resolve('.'));
  });

  it('prompt() does NOT close stdin', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();
    const promptP = session.prompt('do the thing');
    emitLine(fake, { type: 'response', id: 1, success: true });
    await promptP;
    expect(fake.stdin.end).not.toHaveBeenCalled();
  });

  it('waitForDone(100) rejects with timeout error when agent_end never fires', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();
    await expect(session.waitForDone(100)).rejects.toThrow(/timed out after 100ms/i);
  });

  it('stall timeout kills stalled session and rejects with StallTimeoutError', async () => {
    vi.useFakeTimers();
    try {
      const session = await PiAgentSession.create({ model: 'gemini', stallTimeoutMs: 50 });
      await session.start();
      const promptP = session.prompt('do work');
      emitLine(fake, { type: 'response', id: 1, success: true });
      await promptP;

      const done = session.waitForDone().catch((err) => err);
      await vi.advanceTimersByTimeAsync(60);

      const err = await done;
      expect(err).toBeInstanceOf(StallTimeoutError);
      expect(fake.proc.kill).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stall timeout resets when activity arrives', async () => {
    vi.useFakeTimers();
    try {
      const session = await PiAgentSession.create({ model: 'gemini', stallTimeoutMs: 50 });
      await session.start();
      const promptP = session.prompt('do work');
      emitLine(fake, { type: 'response', id: 1, success: true });
      await promptP;

      await vi.advanceTimersByTimeAsync(40);
      emitLine(fake, { type: 'turn_start' });
      await vi.advanceTimersByTimeAsync(40);
      expect(fake.proc.kill).not.toHaveBeenCalled();

      emitLine(fake, { type: 'agent_end', messages: [] });
      await expect(session.waitForDone()).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('extends stall timeout for bash test commands', async () => {
    vi.useFakeTimers();
    try {
      const session = await PiAgentSession.create({
        model: 'gemini',
        stallTimeoutMs: 50,
        testCommandStallTimeoutMs: 200,
      });
      await session.start();
      const promptP = session.prompt('run tests');
      emitLine(fake, { type: 'response', id: 1, success: true });
      await promptP;

      emitLine(fake, {
        type: 'tool_execution_start',
        toolName: 'bash',
        toolCallId: 'tool-1',
        args: { command: 'bun --bun vitest run tests/unit/cli/run.test.ts' },
      });

      await vi.advanceTimersByTimeAsync(60);
      expect(fake.proc.kill).not.toHaveBeenCalled();

      const done = session.waitForDone().catch((err) => err);
      await vi.advanceTimersByTimeAsync(150);
      const err = await done;
      expect(err).toBeInstanceOf(StallTimeoutError);
      expect(fake.proc.kill).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores base stall timeout after bash test command ends', async () => {
    vi.useFakeTimers();
    try {
      const session = await PiAgentSession.create({
        model: 'gemini',
        stallTimeoutMs: 50,
        testCommandStallTimeoutMs: 200,
      });
      await session.start();
      const promptP = session.prompt('run tests');
      emitLine(fake, { type: 'response', id: 1, success: true });
      await promptP;

      emitLine(fake, {
        type: 'tool_execution_start',
        toolName: 'bash',
        toolCallId: 'tool-1',
        args: { command: 'npm test -- --runInBand' },
      });
      await vi.advanceTimersByTimeAsync(40);
      emitLine(fake, {
        type: 'tool_execution_end',
        toolName: 'bash',
        toolCallId: 'tool-1',
        isError: false,
        result: { content: [] },
      });

      const done = session.waitForDone().catch((err) => err);
      await vi.advanceTimersByTimeAsync(60);
      const err = await done;
      expect(err).toBeInstanceOf(StallTimeoutError);
      expect(fake.proc.kill).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('close clears stall watchdog timer', async () => {
    vi.useFakeTimers();
    try {
      const session = await PiAgentSession.create({ model: 'gemini', stallTimeoutMs: 50 });
      await session.start();
      const promptP = session.prompt('do work');
      emitLine(fake, { type: 'response', id: 1, success: true });
      await promptP;

      const closePromise = session.close();
      fake.procHandlers['close']?.(0);
      await closePromise;

      await vi.advanceTimersByTimeAsync(100);
      expect(fake.proc.kill).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('close() calls stdin.end() and resolves when process exits', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    const closePromise = session.close();

    // stdin.end() must be called synchronously when close() runs
    expect(fake.stdin.end).toHaveBeenCalled();

    // Simulate the OS closing the process (code 0)
    fake.procHandlers['close']?.(0);

    // close() should now resolve (no throw)
    await expect(closePromise).resolves.toBeUndefined();
  });

  it("mapPermissionToTools('LOW') passes 'read,bash,grep,find,ls' to --tools", async () => {
    const session = await PiAgentSession.create({ model: 'gemini', permissionLevel: 'LOW' });
    await session.start();

    const args: string[] = mockSpawn.mock.calls[0][1];
    const toolsIdx = args.indexOf('--tools');
    expect(toolsIdx).toBeGreaterThan(-1);
    expect(args[toolsIdx + 1]).toBe('read,bash,grep,find,ls');
  });

  it("mapPermissionToTools('READ_ONLY') passes 'read,grep,find,ls' to --tools", async () => {
    const session = await PiAgentSession.create({ model: 'gemini', permissionLevel: 'READ_ONLY' });
    await session.start();

    const args: string[] = mockSpawn.mock.calls[0][1];
    const toolsIdx = args.indexOf('--tools');
    expect(toolsIdx).toBeGreaterThan(-1);
    expect(args[toolsIdx + 1]).toBe('read,grep,find,ls');
  });

  it("mapPermissionToTools('HIGH') passes 'read,bash,edit,write,grep,find,ls' to --tools", async () => {
    const session = await PiAgentSession.create({ model: 'gemini', permissionLevel: 'HIGH' });
    await session.start();

    const args: string[] = mockSpawn.mock.calls[0][1];
    const toolsIdx = args.indexOf('--tools');
    expect(toolsIdx).toBeGreaterThan(-1);
    expect(args[toolsIdx + 1]).toBe('read,bash,edit,write,grep,find,ls');
  });
});

// ── ID-mapped concurrent RPC dispatch tests ───────────────────────────────────
describe('sendCommand — concurrent dispatch', () => {
  let fake: ReturnType<typeof makeFakeProc>;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = makeFakeProc();
  });

  it('concurrent sendCommand calls each get a unique id and resolve independently', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    // Start two prompts concurrently (they won't complete until we emit responses)
    const p1 = session.prompt('first task');
    const p2 = session.prompt('second task');

    // Responses arrive out of order — id=2 resolves before id=1
    emitLine(fake, { type: 'response', id: 2, success: true });
    emitLine(fake, { type: 'response', id: 1, success: true });

    await Promise.all([p1, p2]);

    // Both writes contain their respective id fields
    const writes = fake.stdin.write.mock.calls.map((c: any[]) => JSON.parse(c[0]));
    const ids = writes.map((w: any) => w.id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });

  it('prompt() throws when response.success === false', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    const p = session.prompt('bad task');
    emitLine(fake, { type: 'response', id: 1, success: false, error: 'already streaming' });

    await expect(p).rejects.toThrow('already streaming');
  });

  it('steer() throws when response.success === false', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    const p = session.steer('redirect');
    emitLine(fake, { type: 'response', id: 1, success: false, error: 'steer rejected' });

    await expect(p).rejects.toThrow('steer rejected');
  });

  it('sendCommand rejects with timeout error when no response arrives', async () => {
    vi.useFakeTimers();
    try {
      const session = await PiAgentSession.create({ model: 'gemini' });
      await session.start();

      const p = session.prompt('task').catch((e) => e);
      await vi.advanceTimersByTimeAsync(11_000);
      const err = await p;
      expect(err.message).toMatch(/RPC timeout/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('kill() rejects all pending RPC requests', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    const p = session.prompt('task').catch((e) => e);
    session.kill();
    const err = await p;
    expect(err.message).toMatch(/killed/i);
  });

  it('stderr is accumulated and accessible via getStderr()', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    fake.stderrHandlers['data']?.(Buffer.from('warning: something\n'));
    fake.stderrHandlers['data']?.(Buffer.from('error: details\n'));

    expect(session.getStderr()).toBe('warning: something\nerror: details\n');
  });

  it('getStderr() returns empty string when no stderr emitted', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();
    expect(session.getStderr()).toBe('');
  });

  it('captures token usage metrics from agent_end payloads', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    emitLine(fake, {
      type: 'agent_end',
      usage: {
        input_tokens: 10,
        output_tokens: 15,
        total_tokens: 25,
      },
      messages: [],
    });

    const metrics = session.getMetrics();
    expect(metrics.token_usage?.total_tokens).toBe(25);
    expect(metrics.token_usage?.input_tokens).toBe(10);
    expect(metrics.token_usage?.output_tokens).toBe(15);
  });

  it('captures token usage from assistant message usage format in turn_end and agent_end', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    emitLine(fake, {
      type: 'turn_end',
      message: {
        role: 'assistant',
        usage: {
          input: 21,
          output: 13,
          cacheRead: 5,
          cacheWrite: 2,
          cost: { total: 0.1234 },
        },
      },
    });

    emitLine(fake, {
      type: 'agent_end',
      messages: [{ role: 'assistant', content: [], usage: { input: 30, output: 20 } }],
    });

    const metrics = session.getMetrics();
    expect(metrics.token_usage?.input_tokens).toBe(30);
    expect(metrics.token_usage?.output_tokens).toBe(20);
    expect(metrics.token_usage?.cache_read_tokens).toBe(5);
    expect(metrics.token_usage?.cache_creation_tokens).toBe(2);
    expect(metrics.token_usage?.total_tokens).toBe(50);
    expect(metrics.token_usage?.cost_usd).toBe(0.1234);
  });

  it('auto_compaction_start and auto_compaction_end both fire onEvent("auto_compaction")', async () => {
    const onEvent = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onEvent });
    await session.start();

    emitLine(fake, { type: 'auto_compaction_start' });
    emitLine(fake, { type: 'auto_compaction_end' });

    const calls = onEvent.mock.calls.map((c: any[]) => c[0]);
    expect(calls.filter((t: string) => t === 'auto_compaction')).toHaveLength(2);
  });

  it('auto_retry_start and auto_retry_end both fire onEvent("auto_retry")', async () => {
    const onEvent = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onEvent });
    await session.start();

    emitLine(fake, { type: 'auto_retry_start' });
    emitLine(fake, { type: 'auto_retry_end' });

    const calls = onEvent.mock.calls.map((c: any[]) => c[0]);
    expect(calls.filter((t: string) => t === 'auto_retry')).toHaveLength(2);
  });
});

// ── ID dispatch edge cases ─────────────────────────────────────────────────────
describe('sendCommand — ID dispatch edge cases', () => {
  let fake: ReturnType<typeof makeFakeProc>;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = makeFakeProc();
  });

  it('response with unknown ID is ignored — no crash', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    // No pending request with id=999 — must not throw
    expect(() => {
      emitLine(fake, { type: 'response', id: 999, success: true });
    }).not.toThrow();
  });

  it('steer() resolves when pi responds with success=true', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    const p = session.steer('redirect please');
    emitLine(fake, { type: 'response', id: 1, success: true });

    await expect(p).resolves.toBeUndefined();
  });

  it('non-timed-out concurrent request resolves despite sibling timeout', async () => {
    vi.useFakeTimers();
    try {
      const session = await PiAgentSession.create({ model: 'gemini' });
      await session.start();

      // p1 will time out (id=1), p2 resolves before the timeout
      const p1 = session.prompt('first').catch((e) => e);
      const p2 = session.prompt('second');

      // Respond to p2 immediately — it should be done before the timeout fires
      emitLine(fake, { type: 'response', id: 2, success: true });
      await expect(p2).resolves.toBeUndefined();

      // Advance past the 10s default timeout — only p1 should have timed out
      await vi.advanceTimersByTimeAsync(11_000);
      const err1 = await p1;
      expect(err1.message).toMatch(/RPC timeout/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('timed-out request is cleaned from the pending map (late response causes no crash)', async () => {
    vi.useFakeTimers();
    try {
      const session = await PiAgentSession.create({ model: 'gemini' });
      await session.start();

      const p = session.prompt('task').catch((e) => e);
      await vi.advanceTimersByTimeAsync(11_000);
      await p; // request has already rejected

      // Emit a response for the now-deleted entry — must not crash or double-resolve
      expect(() => {
        emitLine(fake, { type: 'response', id: 1, success: true });
      }).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('malformed JSONL line is silently skipped — no crash', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    expect(() => {
      fake.stdoutHandlers['data']?.(Buffer.from('not valid json\n'));
    }).not.toThrow();
  });

  it('unknown event type is silently ignored — no crash', async () => {
    const onEvent = vi.fn();
    const session = await PiAgentSession.create({ model: 'gemini', onEvent });
    await session.start();

    expect(() => {
      emitLine(fake, { type: 'completely_unknown_event_xyz', payload: 42 });
    }).not.toThrow();

    // onEvent must not have been called with the unknown type
    expect(onEvent).not.toHaveBeenCalledWith('completely_unknown_event_xyz');
  });
});

// ── kill() behaviour ──────────────────────────────────────────────────────────
describe('kill()', () => {
  let fake: ReturnType<typeof makeFakeProc>;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = makeFakeProc();
  });

  it('sends {type:"abort"} to stdin before calling proc.kill()', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    const callOrder: string[] = [];
    fake.stdin.write.mockImplementation((_data: any, cb?: any) => {
      callOrder.push('write');
      cb?.();
      return true;
    });
    fake.proc.kill.mockImplementation(() => { callOrder.push('kill'); });

    session.kill();

    expect(callOrder).toEqual(['write', 'kill']);
    const writtenPayload = JSON.parse(fake.stdin.write.mock.calls[0][0]);
    expect(writtenPayload).toMatchObject({ type: 'abort' });
  });

  it('is idempotent — second call is a no-op', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    session.kill();
    expect(() => session.kill()).not.toThrow();
    // proc.kill should only have been called once
    expect(fake.proc.kill).toHaveBeenCalledOnce();
  });

  it('kill() completes even when stdin write throws', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    fake.stdin.write.mockImplementation(() => { throw new Error('pipe broken'); });

    expect(() => session.kill()).not.toThrow();
    expect(fake.proc.kill).toHaveBeenCalledOnce();
  });

  it('process close while requests are pending — pending requests are rejected by kill()', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();

    const p = session.prompt('task').catch((e) => e);

    // Simulate the process dying abruptly via kill()
    session.kill();

    const err = await p;
    expect(err.message).toMatch(/killed/i);
  });
});
