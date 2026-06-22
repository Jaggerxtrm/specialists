import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
  };
});

import { Supervisor } from '../../../src/specialist/supervisor.js';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

function makeRunOptions(name = 'test-specialist') {
  return { name, prompt: 'do something', keepAlive: true };
}

describe('Supervisor waiting auto-close', () => {
  let tmpDir: string;
  let jobsDir: string;
  let originalJobFileOutputEnv: string | undefined;
  let supervisors: Supervisor[];

  const createSupervisor = (options: ConstructorParameters<typeof Supervisor>[0]): Supervisor => {
    const supervisor = new Supervisor(options);
    supervisors.push(supervisor);
    return supervisor;
  };

  beforeEach(() => {
    originalJobFileOutputEnv = process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    tmpDir = mkdtempSync(join(tmpdir(), 'supervisor-auto-close-'));
    jobsDir = join(tmpDir, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    supervisors = [];
  });

  afterEach(async () => {
    if (originalJobFileOutputEnv === undefined) {
      delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    } else {
      process.env.SPECIALISTS_JOB_FILE_OUTPUT = originalJobFileOutputEnv;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    await Promise.all(supervisors.map((supervisor) => supervisor.dispose()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('gracefully closes waiting keep-alive sessions after waiting_auto_close_ms', async () => {
    vi.useFakeTimers();

    const closeMock = vi.fn().mockResolvedValue(undefined);
    const runner = {
      run: vi.fn().mockImplementation(async (
        _opts: any,
        _onProgress: any,
        _onEvent: any,
        _onMetric: any,
        _onMeta: any,
        _onKillRegistered: any,
        _onBeadCreated: any,
        _onSteerRegistered: any,
        onResumeReady: any,
      ) => {
        onResumeReady?.(vi.fn().mockResolvedValue('unused'), closeMock);
        return {
          output: 'first turn output',
          model: 'claude-haiku',
          backend: 'anthropic',
          durationMs: 100,
          specialistVersion: '1.0.0',
          promptHash: 'abc123def4567890',
          beadId: undefined,
        };
      }),
    } as any;

    const sup = createSupervisor({
      jobsDir,
      runner,
      runOptions: makeRunOptions(),
      stallDetection: { waiting_auto_close_ms: 1_000 },
    });

    const runPromise = sup.run();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(11_000);

    const id = await runPromise;
    const status = sup.readStatus(id);
    expect(status?.status).toBe('done');
    expect(closeMock).toHaveBeenCalledOnce();

    const events = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
      .trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    expect(events.some((event: any) => event.type === 'control_signal' && event.action === 'waiting_auto_close_requested')).toBe(true);
    expect(events.some((event: any) => event.type === 'control_signal' && event.action === 'waiting_auto_close_completed')).toBe(true);
  });

  it('requests forced termination when graceful waiting auto-close times out', async () => {
    vi.useFakeTimers();

    const killMock = vi.fn();
    const closeMock = vi.fn().mockImplementation(() => new Promise<void>(() => {}));
    const runner = {
      run: vi.fn().mockImplementation(async (
        _opts: any,
        _onProgress: any,
        _onEvent: any,
        _onMetric: any,
        _onMeta: any,
        onKillRegistered: any,
        _onBeadCreated: any,
        _onSteerRegistered: any,
        onResumeReady: any,
      ) => {
        onKillRegistered?.(killMock);
        onResumeReady?.(vi.fn().mockResolvedValue('unused'), closeMock);
        return {
          output: 'first turn output',
          model: 'claude-haiku',
          backend: 'anthropic',
          durationMs: 100,
          specialistVersion: '1.0.0',
          promptHash: 'abc123def4567890',
          beadId: undefined,
        };
      }),
    } as any;

    const sup = createSupervisor({
      jobsDir,
      runner,
      runOptions: makeRunOptions(),
      stallDetection: { waiting_auto_close_ms: 1_000 },
    });

    const runPromise = sup.run();
    const runResult = runPromise.catch((error) => error);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(16_000);

    await expect(runResult).resolves.toBeInstanceOf(Error);
    const rejection = await runResult;
    expect(String((rejection as Error).message)).toMatch(/forced termination requested/);
    const id = readFileSync(join(jobsDir, 'latest'), 'utf-8').trim();
    const status = sup.readStatus(id) as SupervisorStatus | null;
    expect(status?.status).toBe('error');
    expect(killMock).toHaveBeenCalledOnce();

    const events = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
      .trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    expect(events.some((event: any) => event.type === 'control_signal' && event.action === 'waiting_auto_close_requested')).toBe(true);
    expect(events.some((event: any) => event.type === 'control_signal' && event.action === 'waiting_auto_close_force_requested')).toBe(true);
  });
});
