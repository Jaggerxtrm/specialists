// tests/unit/specialist/supervisor-degenerate-turn.test.ts
// xtrm-5kwk2 Layer 2: a keep-alive turn that completes with no output text and
// no tool calls must be nudged exactly once before the session parks in waiting,
// instead of silently stalling with an empty result.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keep the real synchronous process helpers so the SQLite-backed supervisor
// initializes normally; only prevent the detached status watchdog from spawning.
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: vi.fn(() => ({ pid: 1234, unref: vi.fn() })),
}));
import { Supervisor } from '../../../src/specialist/supervisor.js';

function makeRunOptions(name = 'test-specialist') {
  return { name, prompt: 'do something' };
}

describe('Supervisor: degenerate-turn nudge (xtrm-5kwk2)', () => {
  let tmpDir: string;
  let jobsDir: string;
  let originalJobFileOutputEnv: string | undefined;
  let supervisors: Supervisor[];
  let persistedResults: Map<string, string>;

  const createSupervisor = (options: ConstructorParameters<typeof Supervisor>[0]): Supervisor => {
    const supervisor = new Supervisor(options);
    (supervisor as any).sqliteClient = {
      appendEvent: vi.fn(),
      aggregateJobMetrics: vi.fn(),
      close: vi.fn(),
      readResult: vi.fn((id: string) => persistedResults.get(id) ?? null),
      upsertResult: vi.fn((id: string, output: string) => persistedResults.set(id, output)),
      upsertStatus: vi.fn(),
      upsertStatusWithEvent: vi.fn(),
      upsertStatusWithEventAndResult: vi.fn((status: { id: string }, _event: unknown, output: string) => persistedResults.set(status.id, output)),
    };
    supervisors.push(supervisor);
    return supervisor;
  };

  beforeEach(() => {
    originalJobFileOutputEnv = process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    tmpDir = mkdtempSync(join(tmpdir(), 'supervisor-degenerate-turn-'));
    jobsDir = join(tmpDir, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    supervisors = [];
    persistedResults = new Map();
  });

  afterEach(async () => {
    if (originalJobFileOutputEnv === undefined) {
      delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    } else {
      process.env.SPECIALISTS_JOB_FILE_OUTPUT = originalJobFileOutputEnv;
    }
    vi.restoreAllMocks();
    await Promise.all(supervisors.map((supervisor) => supervisor.dispose()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function waitForCondition(check: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Condition not met before timeout');
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  function keepAliveRunnerWithResume(resumeMock: ReturnType<typeof vi.fn>, output: string) {
    return {
      run: vi.fn().mockImplementation(async (
        _opts: any, _onProgress: any, _onEvent: any, _onMetric: any, _onMeta: any, _onKill: any, _onSession: any, _onBead: any,
        onSteerRegistered: any, onResumeReady: any,
      ) => {
        onSteerRegistered?.(vi.fn().mockResolvedValue(undefined));
        onResumeReady?.(resumeMock, vi.fn().mockResolvedValue(undefined));
        return {
          output,
          model: 'haiku',
          backend: 'anthropic',
          durationMs: 10,
          specialistVersion: '1.0.0',
          promptHash: 'abc123',
          beadId: undefined,
        };
      }),
    } as any;
  }

  it('nudges exactly once when a completed turn produced no output and no tool calls', async () => {
    const resumeMock = vi.fn().mockResolvedValue('nudged output');
    const sup = createSupervisor({
      jobsDir,
      runner: keepAliveRunnerWithResume(resumeMock, ''),
      runOptions: { ...makeRunOptions(), keepAlive: true },
    });

    const runPromise = sup.run();
    await waitForCondition(() => existsSync(join(jobsDir, 'latest')));
    const id = readFileSync(join(jobsDir, 'latest'), 'utf-8').trim();

    await waitForCondition(() => resumeMock.mock.calls.length === 1);
    expect(resumeMock).toHaveBeenCalledTimes(1);
    expect(resumeMock.mock.calls[0]![0]).toContain('produced no output');

    await waitForCondition(() => sup.readStatus(id)?.status === 'waiting');
    expect(sup.readResult(id)).toBe('nudged output');

    // Close the keep-alive session to let run() resolve.
    const fifoPath = sup.readStatus(id)?.fifo_path;
    if (fifoPath) {
      writeFileSync(fifoPath, JSON.stringify({ type: 'close' }) + '\n', { flag: 'a' });
    }
    await expect(runPromise).resolves.toBe(id);
    expect(resumeMock).toHaveBeenCalledTimes(1);
  });

  it('does not nudge a keep-alive turn that produced output', async () => {
    const resumeMock = vi.fn().mockResolvedValue('second turn');
    const sup = createSupervisor({
      jobsDir,
      runner: keepAliveRunnerWithResume(resumeMock, 'first turn output'),
      runOptions: { ...makeRunOptions(), keepAlive: true },
    });

    const runPromise = sup.run();
    await waitForCondition(() => existsSync(join(jobsDir, 'latest')));
    const id = readFileSync(join(jobsDir, 'latest'), 'utf-8').trim();

    // Give the supervisor a beat to reach the waiting checkpoint.
    await waitForCondition(() => sup.readStatus(id)?.status === 'waiting');
    expect(resumeMock).not.toHaveBeenCalled();
    expect(sup.readResult(id)).toBe('first turn output');

    const fifoPath = sup.readStatus(id)?.fifo_path;
    if (fifoPath) {
      writeFileSync(fifoPath, JSON.stringify({ type: 'close' }) + '\n', { flag: 'a' });
    }
    await expect(runPromise).resolves.toBe(id);
  });
});
