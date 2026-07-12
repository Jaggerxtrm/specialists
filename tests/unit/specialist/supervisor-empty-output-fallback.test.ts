// tests/unit/specialist/supervisor-empty-output-fallback.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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

describe('Supervisor: empty final-turn output fallback', () => {
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
    tmpDir = mkdtempSync(join(tmpdir(), 'supervisor-empty-output-test-'));
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

  it('reports the last non-empty turn summary when the final turn output is empty', async () => {
    const runner = {
      run: vi.fn().mockImplementation(async (
        _opts: any, onProgress: any, _onEvent: any, onMetric: any,
      ) => {
        // Model streamed real text on an earlier turn, then the final
        // completion came back empty (e.g. provider quirk on the last turn).
        onProgress?.('real turn text');
        onMetric?.({ type: 'turn_summary', turn_index: 1 });
        return {
          output: '',
          model: 'haiku',
          backend: 'anthropic',
          durationMs: 10,
          specialistVersion: '1.0.0',
          promptHash: 'abc123',
          beadId: undefined,
        };
      }),
    } as any;

    const sup = createSupervisor({ jobsDir, runner, runOptions: makeRunOptions() });
    const id = await sup.run();

    expect(sup.readResult(id)).toBe('real turn text');
    expect(persistedResults.get(id)).toBe('real turn text');

    const events = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
      .trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const completion = events.find((event: any) => event.type === 'run_complete');
    expect(completion?.output).toBe('real turn text');
  });

  it('keeps the true empty output when no prior turn summary exists', async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        output: '',
        model: 'haiku',
        backend: 'anthropic',
        durationMs: 10,
        specialistVersion: '1.0.0',
        promptHash: 'abc123',
        beadId: undefined,
      }),
    } as any;

    const sup = createSupervisor({ jobsDir, runner, runOptions: makeRunOptions() });
    const id = await sup.run();

    expect(sup.readResult(id)).toBe('');
  });
});
