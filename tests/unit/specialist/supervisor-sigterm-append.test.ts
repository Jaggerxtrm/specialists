import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureObservabilityDbFile, resolveObservabilityDbLocation } from '../../../src/specialist/observability-db.js';

function makeRunOptions() {
  return { name: 'test-specialist', prompt: 'do something', keepAlive: true, inputBeadId: 'unitAI-readonly-1' };
}

async function waitForCondition(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Condition not met before timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function invokeSigtermListenersAddedSince(baseline: Set<NodeJS.SignalsListener>): void {
  const current = process.listeners('SIGTERM') as NodeJS.SignalsListener[];
  for (const listener of current) {
    if (baseline.has(listener)) continue;
    try {
      listener('SIGTERM');
    } catch {
      // ignore handler errors in test
    }
  }
}

type SupervisorType = typeof import('../../../src/specialist/supervisor.js').Supervisor;

describe('Supervisor SIGTERM append behavior', () => {
  let tmpDir: string;
  let jobsDir: string;
  let supervisors: Array<InstanceType<SupervisorType>>;
  let baselineSigtermListeners: Set<NodeJS.SignalsListener>;
  let previousCwd: string;
  let previousJobFileOutputMode: string | undefined;
  let Supervisor: SupervisorType;

  const createSupervisor = (options: ConstructorParameters<SupervisorType>[0]): InstanceType<SupervisorType> => {
    const supervisor = new Supervisor(options);
    supervisors.push(supervisor);
    return supervisor;
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('../../../src/specialist/observability-sqlite.js', () => {
      const statusById = new Map<string, any>();
      const eventsById = new Map<string, any[]>();
      return {
        createObservabilitySqliteClient: () => ({
          close: vi.fn(),
          readStatus: (id: string) => statusById.get(id) ?? null,
          listStatuses: () => [...statusById.values()],
          upsertStatus: (status: any) => {
            statusById.set(status.id, status);
          },
          appendEvent: (id: string, _specialist: string, _beadId: string | undefined, event: any) => {
            const existing = eventsById.get(id) ?? [];
            existing.push(event);
            eventsById.set(id, existing);
          },
          upsertStatusWithEvent: (status: any, event: any) => {
            statusById.set(status.id, status);
            const existing = eventsById.get(status.id) ?? [];
            existing.push(event);
            eventsById.set(status.id, existing);
          },
          upsertStatusWithEventAndResult: (status: any, event: any) => {
            statusById.set(status.id, status);
            const existing = eventsById.get(status.id) ?? [];
            existing.push(event);
            eventsById.set(status.id, existing);
          },
          upsertEpicRun: vi.fn(),
          upsertEpicChainMembership: vi.fn(),
        }),
      };
    });

    ({ Supervisor } = await import('../../../src/specialist/supervisor.js'));

    tmpDir = mkdtempSync(join(tmpdir(), 'supervisor-sigterm-append-'));
    jobsDir = join(tmpDir, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    supervisors = [];
    baselineSigtermListeners = new Set(process.listeners('SIGTERM') as NodeJS.SignalsListener[]);

    previousCwd = process.cwd();
    process.chdir(tmpDir);
    previousJobFileOutputMode = process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    ensureObservabilityDbFile(resolveObservabilityDbLocation(tmpDir));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(supervisors.map((supervisor) => supervisor.dispose()));
    process.chdir(previousCwd);
    if (previousJobFileOutputMode === undefined) {
      delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    } else {
      process.env.SPECIALISTS_JOB_FILE_OUTPUT = previousJobFileOutputMode;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeWaitingKeepAliveRunner(closeMock: ReturnType<typeof vi.fn>) {
    return {
      run: vi.fn().mockImplementation(async (
        _opts: any,
        _onProgress: any,
        _onEvent: any,
        _onMetric: any,
        _onMeta: any,
        _onKill: any,
        _onBead: any,
        onSteerRegistered: any,
        onResumeReady: any,
      ) => {
        onSteerRegistered?.(vi.fn().mockResolvedValue(undefined));
        onResumeReady?.(vi.fn().mockResolvedValue('unused'), closeMock);
        return {
          output: 'waiting output',
          model: 'claude-haiku',
          backend: 'anthropic',
          durationMs: 100,
          specialistVersion: '1.0.0',
          promptHash: 'abc123def4567890',
          beadId: undefined,
          permissionRequired: 'READ_ONLY',
        };
      }),
    } as any;
  }

  it('retries final append when SIGTERM waiting append fails', async () => {
    const updateBeadNotes = vi.fn()
      .mockReturnValueOnce({ ok: false, error: 'transient' })
      .mockReturnValueOnce({ ok: true });
    const beadsClient = { updateBeadNotes, closeBead: vi.fn() } as any;
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const runner = makeWaitingKeepAliveRunner(closeMock);

    const sup = createSupervisor({ jobsDir, runner, runOptions: makeRunOptions(), beadsClient });
    const runPromise = sup.run();

    await waitForCondition(() => existsSync(join(jobsDir, 'latest')));
    const id = readFileSync(join(jobsDir, 'latest'), 'utf-8').trim();
    await waitForCondition(() => sup.readStatus(id)?.status === 'waiting');

    invokeSigtermListenersAddedSince(baselineSigtermListeners);

    await expect(runPromise).resolves.toBe(id);
    expect(updateBeadNotes).toHaveBeenCalledTimes(2);
  });

  it('avoids duplicate append when SIGTERM waiting append succeeds', async () => {
    const updateBeadNotes = vi.fn().mockReturnValue({ ok: true });
    const beadsClient = { updateBeadNotes, closeBead: vi.fn() } as any;
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const runner = makeWaitingKeepAliveRunner(closeMock);

    const sup = createSupervisor({ jobsDir, runner, runOptions: makeRunOptions(), beadsClient });
    const runPromise = sup.run();

    await waitForCondition(() => existsSync(join(jobsDir, 'latest')));
    const id = readFileSync(join(jobsDir, 'latest'), 'utf-8').trim();
    await waitForCondition(() => sup.readStatus(id)?.status === 'waiting');

    invokeSigtermListenersAddedSince(baselineSigtermListeners);

    await expect(runPromise).resolves.toBe(id);
    expect(updateBeadNotes).toHaveBeenCalledTimes(1);
  });
});
