// tests/unit/pi/session.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapSpecialistBackend, getProviderArgs } from '../../../src/pi/backendMap.js';

// ── Mock node:child_process before importing session ──────────────────────────
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { PiAgentSession } from '../../../src/pi/session.js';

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
    await session.prompt('do the thing');
    expect(fake.stdin.end).not.toHaveBeenCalled();
  });

  it('waitForDone(100) rejects with timeout error when agent_end never fires', async () => {
    const session = await PiAgentSession.create({ model: 'gemini' });
    await session.start();
    await expect(session.waitForDone(100)).rejects.toThrow(/timed out after 100ms/i);
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
