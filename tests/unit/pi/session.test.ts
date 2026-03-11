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

  it("mapPermissionToTools('LOW') passes 'read,bash,edit,write,grep,find,ls' to --tools", async () => {
    const session = await PiAgentSession.create({ model: 'gemini', permissionLevel: 'LOW' });
    await session.start();

    const args: string[] = mockSpawn.mock.calls[0][1];
    const toolsIdx = args.indexOf('--tools');
    expect(toolsIdx).toBeGreaterThan(-1);
    expect(args[toolsIdx + 1]).toBe('read,bash,edit,write,grep,find,ls');
  });

  it("mapPermissionToTools('READ_ONLY') passes 'read,bash,grep,find,ls' to --tools", async () => {
    const session = await PiAgentSession.create({ model: 'gemini', permissionLevel: 'READ_ONLY' });
    await session.start();

    const args: string[] = mockSpawn.mock.calls[0][1];
    const toolsIdx = args.indexOf('--tools');
    expect(toolsIdx).toBeGreaterThan(-1);
    expect(args[toolsIdx + 1]).toBe('read,bash,grep,find,ls');
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
