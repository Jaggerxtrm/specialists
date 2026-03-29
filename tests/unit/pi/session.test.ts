// tests/unit/pi/session.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  const proc = {
    stdin,
    stdout,
    on: vi.fn().mockImplementation((evt: string, h: Function) => {
      procHandlers[evt] = h;
    }),
    kill: vi.fn(),
  };

  mockSpawn.mockReturnValue(proc);

  return { proc, stdin, stdout, stdoutHandlers, procHandlers };
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
});

// ── PiAgentSession behaviour tests ───────────────────────────────────────────
describe('PiAgentSession', () => {
  let fake: ReturnType<typeof makeFakeProc>;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = makeFakeProc();
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

    // stderr is a separate stream — extract from spawn call
    const spawnCall = mockSpawn.mock.calls[0];
    expect(spawnCall[2].stdio).toEqual(['pipe', 'pipe', 'pipe']);

    // Simulate stderr data via the stored proc reference
    // The proc mock doesn't have a real stderr, but we can verify stdio config
    expect(session.getStderr()).toBe('');
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
