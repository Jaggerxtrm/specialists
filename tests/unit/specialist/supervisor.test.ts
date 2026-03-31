// tests/unit/specialist/supervisor.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  utimesSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as childProcess from 'node:child_process';
import { Supervisor } from '../../../src/specialist/supervisor.js';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

function makeMockRunner(output = 'test output', model = 'haiku', backend = 'anthropic') {
  return {
    run: vi.fn().mockResolvedValue({
      output,
      model,
      backend,
      durationMs: 100,
      specialistVersion: '1.0.0',
      promptHash: 'abc123def4567890',
      beadId: undefined,
    }),
  } as any;
}

function makeRunOptions(name = 'test-specialist') {
  return { name, prompt: 'do something' };
}

describe('Supervisor', () => {
  let tmpDir: string;
  let jobsDir: string;
  let originalTmuxSessionEnv: string | undefined;

  beforeEach(() => {
    originalTmuxSessionEnv = process.env.SPECIALISTS_TMUX_SESSION;
    tmpDir = mkdtempSync(join(tmpdir(), 'supervisor-test-'));
    jobsDir = join(tmpDir, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
  });

  afterEach(() => {
    if (originalTmuxSessionEnv === undefined) {
      delete process.env.SPECIALISTS_TMUX_SESSION;
    } else {
      process.env.SPECIALISTS_TMUX_SESSION = originalTmuxSessionEnv;
    }
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('run() creates job directory with status.json, events.jsonl, result.txt', async () => {
    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    const id = await sup.run();

    const jobDir = join(jobsDir, id);
    expect(existsSync(join(jobDir, 'status.json'))).toBe(true);
    expect(existsSync(join(jobDir, 'events.jsonl'))).toBe(true);
    expect(existsSync(join(jobDir, 'result.txt'))).toBe(true);
  });

  it('status.json has all expected fields after successful run', async () => {
    const sup = new Supervisor({
      jobsDir,
      runner: makeMockRunner('output text', 'claude-haiku', 'anthropic'),
      runOptions: makeRunOptions('my-specialist'),
    });
    const id = await sup.run();

    const status: SupervisorStatus = JSON.parse(
      readFileSync(join(jobsDir, id, 'status.json'), 'utf-8'),
    );
    expect(status.id).toBe(id);
    expect(status.specialist).toBe('my-specialist');
    expect(status.status).toBe('done');
    expect(status.pid).toBe(process.pid);
    expect(status.started_at_ms).toBeGreaterThan(0);
    expect(status.elapsed_s).toBeGreaterThanOrEqual(0);
    expect(status.model).toBe('claude-haiku');
    expect(status.backend).toBe('anthropic');
    expect(status.bead_id).toBeUndefined();
  });

  it('result.txt contains the runner output string', async () => {
    const sup = new Supervisor({
      jobsDir,
      runner: makeMockRunner('hello world output'),
      runOptions: makeRunOptions(),
    });
    const id = await sup.run();

    expect(readFileSync(join(jobsDir, id, 'result.txt'), 'utf-8')).toBe('hello world output');
  });

  it('events.jsonl contains at least one valid JSON line', async () => {
    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    const id = await sup.run();

    const content = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('.specialists/ready/<id> marker is created on success', async () => {
    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    const id = await sup.run();

    const readyMarker = join(jobsDir, '..', 'ready', id);
    expect(existsSync(readyMarker)).toBe(true);
  });

  it('writes jobs/latest and fires onJobStarted callback with the allocated id', async () => {
    const onJobStarted = vi.fn();
    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions(), onJobStarted });
    const id = await sup.run();

    expect(onJobStarted).toHaveBeenCalledWith({ id });
    expect(readFileSync(join(jobsDir, 'latest'), 'utf-8').trim()).toBe(id);
  });


  it('pins result output and metadata to bead notes when beadId is present', async () => {
    const beadsClient = { updateBeadNotes: vi.fn(), closeBead: vi.fn() } as any;
    const runner = makeMockRunner('hello bead', 'claude-haiku', 'anthropic');
    runner.run.mockResolvedValueOnce({
      output: 'hello bead',
      model: 'claude-haiku',
      backend: 'anthropic',
      durationMs: 321,
      specialistVersion: '1.0.0',
      promptHash: 'abc123def4567890',
      beadId: 'specialists-123',
    });
    const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions(), beadsClient });

    await sup.run();

    expect(beadsClient.updateBeadNotes).toHaveBeenCalledWith(
      'specialists-123',
      expect.stringContaining('hello bead'),
    );
    expect(beadsClient.updateBeadNotes).toHaveBeenCalledWith(
      'specialists-123',
      expect.stringContaining('prompt_hash=abc123def4567890'),
    );
    expect(beadsClient.updateBeadNotes).toHaveBeenCalledWith(
      'specialists-123',
      expect.stringContaining('elapsed_ms=321'),
    );
  });

  it('closes owned bead AFTER updateBeadNotes on success', async () => {
    const updateBeadNotes = vi.fn();
    const closeBead = vi.fn();
    const beadsClient = { updateBeadNotes, closeBead } as any;
    const runner = makeMockRunner('output', 'haiku', 'anthropic');
    runner.run.mockResolvedValueOnce({
      output: 'output',
      model: 'haiku',
      backend: 'anthropic',
      durationMs: 100,
      specialistVersion: '1.0.0',
      promptHash: 'abc123',
      beadId: 'specialists-abc',
    });
    // No inputBeadId → runner owns the bead
    const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions(), beadsClient });
    await sup.run();

    expect(updateBeadNotes).toHaveBeenCalledOnce();
    expect(closeBead).toHaveBeenCalledWith('specialists-abc', 'COMPLETE', 100, 'haiku');
    // Verify ordering: updateBeadNotes must have been called before closeBead
    const updateOrder = updateBeadNotes.mock.invocationCallOrder[0];
    const closeOrder = closeBead.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(closeOrder);
  });

  it('does NOT close input bead (orchestrator owns lifecycle)', async () => {
    const updateBeadNotes = vi.fn();
    const closeBead = vi.fn();
    const beadsClient = { updateBeadNotes, closeBead } as any;
    const runner = makeMockRunner('output', 'haiku', 'anthropic');
    runner.run.mockResolvedValueOnce({
      output: 'output',
      model: 'haiku',
      backend: 'anthropic',
      durationMs: 100,
      specialistVersion: '1.0.0',
      promptHash: 'abc123',
      beadId: 'unitAI-external',
    });
    // inputBeadId set → orchestrator owns the bead lifecycle
    const runOptions = { ...makeRunOptions(), inputBeadId: 'unitAI-external' };
    const sup = new Supervisor({ jobsDir, runner, runOptions, beadsClient });
    await sup.run();

    expect(updateBeadNotes).toHaveBeenCalledOnce();
    expect(closeBead).not.toHaveBeenCalled();
  });

  it('skips note writing for external beads when beadsWriteNotes is false', async () => {
    const updateBeadNotes = vi.fn();
    const closeBead = vi.fn();
    const beadsClient = { updateBeadNotes, closeBead } as any;
    const runner = makeMockRunner('output', 'haiku', 'anthropic');
    runner.run.mockResolvedValueOnce({
      output: 'output',
      model: 'haiku',
      backend: 'anthropic',
      durationMs: 100,
      specialistVersion: '1.0.0',
      promptHash: 'abc123',
      beadId: 'unitAI-external',
    });
    const runOptions = { ...makeRunOptions(), inputBeadId: 'unitAI-external', beadsWriteNotes: false };
    const sup = new Supervisor({ jobsDir, runner, runOptions, beadsClient });

    await sup.run();

    expect(updateBeadNotes).not.toHaveBeenCalled();
    expect(closeBead).not.toHaveBeenCalled();
  });

  it('always writes notes for owned beads even when beadsWriteNotes is false', async () => {
    const updateBeadNotes = vi.fn();
    const closeBead = vi.fn();
    const beadsClient = { updateBeadNotes, closeBead } as any;
    const runner = makeMockRunner('owned output', 'haiku', 'anthropic');
    runner.run.mockResolvedValueOnce({
      output: 'owned output',
      model: 'haiku',
      backend: 'anthropic',
      durationMs: 100,
      specialistVersion: '1.0.0',
      promptHash: 'abc123',
      beadId: 'specialists-owned',
    });
    const runOptions = { ...makeRunOptions(), beadsWriteNotes: false };
    const sup = new Supervisor({ jobsDir, runner, runOptions, beadsClient });

    await sup.run();

    expect(updateBeadNotes).toHaveBeenCalledOnce();
    expect(closeBead).toHaveBeenCalledWith('specialists-owned', 'COMPLETE', 100, 'haiku');
  });

  it('appends READ_ONLY result to input bead notes after completion', async () => {
    const updateBeadNotes = vi.fn();
    const closeBead = vi.fn();
    const beadsClient = { updateBeadNotes, closeBead } as any;
    const runner = makeMockRunner('readonly output', 'haiku', 'anthropic');
    runner.run.mockResolvedValueOnce({
      output: 'readonly output',
      model: 'haiku',
      backend: 'anthropic',
      durationMs: 100,
      specialistVersion: '1.0.0',
      promptHash: 'abc123',
      beadId: undefined,
      permissionRequired: 'READ_ONLY',
    });
    const runOptions = { ...makeRunOptions(), inputBeadId: 'unitAI-readonly-1' };
    const sup = new Supervisor({ jobsDir, runner, runOptions, beadsClient });

    await sup.run();

    expect(updateBeadNotes).toHaveBeenCalledWith(
      'unitAI-readonly-1',
      expect.stringContaining('readonly output'),
    );
    expect(closeBead).not.toHaveBeenCalled();
  });

  it('on runner error: status=error, error field set, no result.txt written', async () => {
    const runner = {
      run: vi.fn().mockRejectedValue(new Error('backend exploded')),
    } as any;
    const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });

    await expect(sup.run()).rejects.toThrow('backend exploded');

    // Find the single job directory that was created (ignore jobs/latest marker file)
    const entries = readdirSync(jobsDir).filter((entry) => entry !== 'latest');
    expect(entries).toHaveLength(1);
    const id = entries[0];

    const status: SupervisorStatus = JSON.parse(
      readFileSync(join(jobsDir, id, 'status.json'), 'utf-8'),
    );
    expect(status.status).toBe('error');
    expect(status.error).toBe('backend exploded');
    expect(existsSync(join(jobsDir, id, 'result.txt'))).toBe(false);
    expect(existsSync(join(jobsDir, '..', 'ready', id))).toBe(true);

    const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
      .trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const runComplete = lines.find((event: any) => event.type === 'run_complete');
    expect(runComplete).toBeDefined();
    expect(runComplete.status).toBe('ERROR');
  });

  it('GC: job dirs older than TTL are deleted on next run', async () => {
    // Create an "old" job directory with mtime 8 days ago (> default 7-day TTL)
    const oldId = 'oldabc';
    const oldJobDir = join(jobsDir, oldId);
    mkdirSync(oldJobDir, { recursive: true });
    const oldStatus: SupervisorStatus = {
      id: oldId,
      specialist: 'x',
      status: 'done',
      started_at_ms: 0,
    };
    writeFileSync(join(oldJobDir, 'status.json'), JSON.stringify(oldStatus));

    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    utimesSync(oldJobDir, eightDaysAgo, eightDaysAgo);

    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    await sup.run();

    expect(existsSync(oldJobDir)).toBe(false);
  });

  it('crash recovery: status=running with dead PID gets marked error', async () => {
    const crashedId = 'crash1';
    const crashedDir = join(jobsDir, crashedId);
    mkdirSync(crashedDir, { recursive: true });

    const crashStatus: SupervisorStatus = {
      id: crashedId,
      specialist: 'test',
      status: 'running',
      started_at_ms: Date.now() - 10_000,
      pid: 999_999_999, // Impossibly large PID — always dead
    };
    writeFileSync(join(crashedDir, 'status.json'), JSON.stringify(crashStatus));

    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    await sup.run();

    const recovered: SupervisorStatus = JSON.parse(
      readFileSync(join(crashedDir, 'status.json'), 'utf-8'),
    );
    expect(recovered.status).toBe('error');
    expect(recovered.error).toBe('Process crashed or was killed');
  });

  it('crash recovery: waiting job idle beyond waiting_stale_ms gets stale_warning event', async () => {
    const waitingId = 'wait01';
    const waitingDir = join(jobsDir, waitingId);
    mkdirSync(waitingDir, { recursive: true });

    const now = Date.now();
    const waitingStatus: SupervisorStatus = {
      id: waitingId,
      specialist: 'test',
      status: 'waiting',
      started_at_ms: now - 4_000_000,
      last_event_at_ms: now - 4_000_000, // 4000s ago, well over 3600s default
    };
    writeFileSync(join(waitingDir, 'status.json'), JSON.stringify(waitingStatus));

    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    await sup.run();

    const eventsPath = join(waitingDir, 'events.jsonl');
    expect(existsSync(eventsPath)).toBe(true);
    const lines = readFileSync(eventsPath, 'utf-8')
      .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const warning = lines.find((e: any) => e.type === 'stale_warning' && e.reason === 'waiting_stale');
    expect(warning).toBeDefined();
    expect(warning.threshold_ms).toBe(3_600_000);
  });

  it('recreates job artifacts if the jobs directory is deleted mid-run', async () => {
    const runner = {
      run: vi.fn().mockImplementation(async (_runOptions: any, _onProgress: any, onEvent: any) => {
        onEvent?.('text');
        rmSync(tmpDir, { recursive: true, force: true });
        return {
          output: 'recovered output',
          model: 'haiku',
          backend: 'anthropic',
          durationMs: 100,
          specialistVersion: '1.0.0',
          promptHash: 'abc123def4567890',
          beadId: undefined,
        };
      }),
    } as any;

    const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
    const id = await sup.run();

    expect(existsSync(join(jobsDir, id, 'status.json'))).toBe(true);
    expect(existsSync(join(jobsDir, id, 'result.txt'))).toBe(true);
    expect(existsSync(join(jobsDir, '..', 'ready', id))).toBe(true);
    expect(readFileSync(join(jobsDir, id, 'result.txt'), 'utf-8')).toBe('recovered output');
  });

  it('listJobs() returns all jobs sorted newest-first', () => {
    const olderStatus: SupervisorStatus = {
      id: 'older1',
      specialist: 'x',
      status: 'done',
      started_at_ms: 1000,
    };
    const newerStatus: SupervisorStatus = {
      id: 'newer2',
      specialist: 'x',
      status: 'done',
      started_at_ms: 2000,
    };

    mkdirSync(join(jobsDir, 'older1'), { recursive: true });
    writeFileSync(join(jobsDir, 'older1', 'status.json'), JSON.stringify(olderStatus));
    mkdirSync(join(jobsDir, 'newer2'), { recursive: true });
    writeFileSync(join(jobsDir, 'newer2', 'status.json'), JSON.stringify(newerStatus));

    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    const jobs = sup.listJobs();

    expect(jobs).toHaveLength(2);
    expect(jobs[0].id).toBe('newer2');
    expect(jobs[1].id).toBe('older1');
  });

  it('readStatus() returns null for unknown id', () => {
    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    expect(sup.readStatus('nonexistent')).toBeNull();
  });

  describe('bead_id propagation (auto-bead path)', () => {
    it('status.json is updated with bead_id when onBeadCreated callback fires', async () => {
      const runner = {
        run: vi.fn().mockImplementation(async (
          _opts: any, _onProg: any, _onEvt: any, _onMeta: any, _onKill: any,
          onBeadCreated: any,
        ) => {
          onBeadCreated('unitAI-auto-99');
          return {
            output: 'done', model: 'haiku', backend: 'anthropic',
            durationMs: 10, specialistVersion: '1.0.0', promptHash: 'abc123',
            beadId: 'unitAI-auto-99',
          };
        }),
      } as any;
      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      const id = await sup.run();

      const status: SupervisorStatus = JSON.parse(readFileSync(join(jobsDir, id, 'status.json'), 'utf-8'));
      expect(status.bead_id).toBe('unitAI-auto-99');
    });

    it('run_complete event contains bead_id when runner returns beadId', async () => {
      const runner = makeMockRunner('out', 'haiku', 'anthropic');
      runner.run.mockResolvedValueOnce({
        output: 'done', model: 'haiku', backend: 'anthropic',
        durationMs: 10, specialistVersion: '1.0.0', promptHash: 'abc123',
        beadId: 'unitAI-auto-88',
      });
      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const runComplete = lines.find((e: any) => e.type === 'run_complete');
      expect(runComplete).toBeDefined();
      expect(runComplete.bead_id).toBe('unitAI-auto-88');
    });

    it('run_complete event has no bead_id when no bead is associated', async () => {
      const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const runComplete = lines.find((e: any) => e.type === 'run_complete');
      expect(runComplete).toBeDefined();
      expect(runComplete.bead_id).toBeUndefined();
    });
  });

  describe('stuck detection', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('emits running_silence stale_warning after silence exceeds warn threshold', async () => {
      vi.useFakeTimers();

      const runner = {
        run: vi.fn().mockImplementation(async (
          _opts: any, _onProg: any, onEvent: any,
        ) => {
          onEvent?.('turn_start'); // sets status to 'running' and records lastActivityMs
          vi.advanceTimersByTime(70_000); // 70s > 60s default warn threshold
          return {
            output: 'done', model: 'haiku', backend: 'anthropic',
            durationMs: 70_000, specialistVersion: '1.0.0', promptHash: 'abc',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const warn = lines.find((e: any) => e.type === 'stale_warning' && e.reason === 'running_silence');
      expect(warn).toBeDefined();
      expect(warn.threshold_ms).toBe(60_000);
      expect(warn.silence_ms).toBeGreaterThan(60_000);
    });

    it('does not emit running_silence warning before threshold', async () => {
      vi.useFakeTimers();

      const runner = {
        run: vi.fn().mockImplementation(async (
          _opts: any, _onProg: any, onEvent: any,
        ) => {
          onEvent?.('turn_start');
          vi.advanceTimersByTime(50_000); // only 50s — below 60s threshold
          return {
            output: 'done', model: 'haiku', backend: 'anthropic',
            durationMs: 50_000, specialistVersion: '1.0.0', promptHash: 'abc',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const warn = lines.find((e: any) => e.type === 'stale_warning' && e.reason === 'running_silence');
      expect(warn).toBeUndefined();
    });

    it('resets silence timer on activity — no warning when silence resets below threshold', async () => {
      vi.useFakeTimers();

      const runner = {
        run: vi.fn().mockImplementation(async (
          _opts: any, _onProg: any, onEvent: any,
        ) => {
          onEvent?.('turn_start');
          vi.advanceTimersByTime(50_000); // 50s — below threshold
          onEvent?.('auto_retry');        // resets silence timer to now (50s mark)
          vi.advanceTimersByTime(50_000); // another 50s from reset — still below 60s
          return {
            output: 'done', model: 'haiku', backend: 'anthropic',
            durationMs: 100_000, specialistVersion: '1.0.0', promptHash: 'abc',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const silenceWarnings = lines.filter((e: any) =>
        e.type === 'stale_warning' && e.reason === 'running_silence',
      );
      expect(silenceWarnings).toHaveLength(0);
    });

    it('emits tool_duration stale_warning when tool exceeds threshold', async () => {
      vi.useFakeTimers();

      const runner = {
        run: vi.fn().mockImplementation(async (
          _opts: any, _onProg: any, onEvent: any,
          _onMeta: any, _onKill: any, _onBead: any, _onSteer: any, _onResume: any,
          onToolStart: any,
        ) => {
          onEvent?.('turn_start');
          onToolStart?.('bash', { command: 'sleep 999' }, 'call-1');
          vi.advanceTimersByTime(130_000); // 130s > 120s default tool_duration_warn_ms
          return {
            output: 'done', model: 'haiku', backend: 'anthropic',
            durationMs: 130_000, specialistVersion: '1.0.0', promptHash: 'abc',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const toolWarn = lines.find((e: any) => e.type === 'stale_warning' && e.reason === 'tool_duration');
      expect(toolWarn).toBeDefined();
      expect(toolWarn.tool).toBe('bash');
      expect(toolWarn.threshold_ms).toBe(120_000);
      expect(toolWarn.silence_ms).toBeGreaterThan(120_000);
    });

    it('respects custom stallDetection thresholds', async () => {
      vi.useFakeTimers();

      const runner = {
        run: vi.fn().mockImplementation(async (
          _opts: any, _onProg: any, onEvent: any,
        ) => {
          onEvent?.('turn_start');
          vi.advanceTimersByTime(35_000); // 35s → interval fires at 30s, silenceMs=30s > 20s threshold
          return {
            output: 'done', model: 'haiku', backend: 'anthropic',
            durationMs: 35_000, specialistVersion: '1.0.0', promptHash: 'abc',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({
        jobsDir,
        runner,
        runOptions: makeRunOptions(),
        stallDetection: { running_silence_warn_ms: 20_000 },
      });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const warn = lines.find((e: any) => e.type === 'stale_warning' && e.reason === 'running_silence');
      expect(warn).toBeDefined();
      expect(warn.threshold_ms).toBe(20_000);
    });

    it('emits running_silence_error event and transitions to error when silence exceeds error threshold', async () => {
      vi.useFakeTimers();

      const runner = {
        run: vi.fn().mockImplementation(async (
          _opts: any, _onProg: any, onEvent: any,
        ) => {
          onEvent?.('turn_start');
          vi.advanceTimersByTime(90_000); // 90s > 80s custom error threshold
          return {
            output: 'done', model: 'haiku', backend: 'anthropic',
            durationMs: 90_000, specialistVersion: '1.0.0', promptHash: 'abc',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({
        jobsDir,
        runner,
        runOptions: makeRunOptions(),
        stallDetection: { running_silence_warn_ms: 50_000, running_silence_error_ms: 80_000 },
      });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const errorEvent = lines.find((e: any) => e.type === 'stale_warning' && e.reason === 'running_silence_error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.threshold_ms).toBe(80_000);
      expect(errorEvent.silence_ms).toBeGreaterThan(80_000);
    });

    it('auto_compaction resets silence timer — no false positive warning', async () => {
      vi.useFakeTimers();

      const runner = {
        run: vi.fn().mockImplementation(async (
          _opts: any, _onProg: any, onEvent: any,
        ) => {
          onEvent?.('turn_start');
          vi.advanceTimersByTime(50_000); // below 60s threshold
          onEvent?.('auto_compaction'); // resets silence timer
          vi.advanceTimersByTime(50_000); // another 50s from reset — still below 60s
          return {
            output: 'done', model: 'haiku', backend: 'anthropic',
            durationMs: 100_000, specialistVersion: '1.0.0', promptHash: 'abc',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const silenceWarnings = lines.filter((e: any) =>
        e.type === 'stale_warning' && e.reason === 'running_silence',
      );
      expect(silenceWarnings).toHaveLength(0);
    });

    it('silence timer at exactly threshold boundary does not trigger warning (strict >)', async () => {
      vi.useFakeTimers();

      const runner = {
        run: vi.fn().mockImplementation(async (
          _opts: any, _onProg: any, onEvent: any,
        ) => {
          onEvent?.('turn_start');
          // advance to exactly the threshold — interval fires but silenceMs === threshold, not >
          vi.advanceTimersByTime(60_000);
          return {
            output: 'done', model: 'haiku', backend: 'anthropic',
            durationMs: 60_000, specialistVersion: '1.0.0', promptHash: 'abc',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const warn = lines.find((e: any) => e.type === 'stale_warning' && e.reason === 'running_silence');
      // At exactly the threshold, the interval may not have fired yet (interval is 10s),
      // so this is a boundary check — no warning should be emitted spuriously
      if (warn) {
        expect(warn.silence_ms).toBeGreaterThan(60_000);
      }
    });
  });

  describe('stale job scanning (crashRecovery)', () => {
    it('jobs in done/error state are not scanned — no stale_warning emitted', async () => {
      const doneId = 'done01';
      const errorId = 'err01';

      for (const [jobId, status] of [[doneId, 'done'], [errorId, 'error']] as const) {
        const dir = join(jobsDir, jobId);
        mkdirSync(dir, { recursive: true });
        const s: SupervisorStatus = {
          id: jobId,
          specialist: 'test',
          status,
          started_at_ms: Date.now() - 10_000_000, // very old
          last_event_at_ms: Date.now() - 10_000_000,
        };
        writeFileSync(join(dir, 'status.json'), JSON.stringify(s));
        writeFileSync(join(dir, 'events.jsonl'), ''); // empty
      }

      const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
      await sup.run();

      for (const jobId of [doneId, errorId]) {
        const eventsPath = join(jobsDir, jobId, 'events.jsonl');
        const content = readFileSync(eventsPath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        const hasWarning = lines.some(l => {
          try { return JSON.parse(l).type === 'stale_warning'; } catch { return false; }
        });
        expect(hasWarning).toBe(false);
      }
    });

    it('multiple stale waiting jobs each get an independent stale_warning event', async () => {
      const now = Date.now();
      const jobIds = ['wait01', 'wait02', 'wait03'];

      for (const jobId of jobIds) {
        const dir = join(jobsDir, jobId);
        mkdirSync(dir, { recursive: true });
        const s: SupervisorStatus = {
          id: jobId,
          specialist: 'test',
          status: 'waiting',
          started_at_ms: now - 5_000_000,
          last_event_at_ms: now - 5_000_000, // well past 3600s default
        };
        writeFileSync(join(dir, 'status.json'), JSON.stringify(s));
      }

      const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
      await sup.run();

      for (const jobId of jobIds) {
        const eventsPath = join(jobsDir, jobId, 'events.jsonl');
        expect(existsSync(eventsPath)).toBe(true);
        const lines = readFileSync(eventsPath, 'utf-8')
          .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
        const warning = lines.find((e: any) => e.type === 'stale_warning' && e.reason === 'waiting_stale');
        expect(warning).toBeDefined();
      }
    });

    it('waiting job at exactly threshold boundary does not get stale_warning (strict >)', async () => {
      const now = Date.now();
      const waitingId = 'waitbnd';
      const waitingDir = join(jobsDir, waitingId);
      mkdirSync(waitingDir, { recursive: true });

      // last_event_at_ms exactly at the threshold boundary (3_600_000ms ago)
      const waitingStatus: SupervisorStatus = {
        id: waitingId,
        specialist: 'test',
        status: 'waiting',
        started_at_ms: now - 3_600_000,
        last_event_at_ms: now - 3_600_000, // exactly at threshold — not strictly >
      };
      writeFileSync(join(waitingDir, 'status.json'), JSON.stringify(waitingStatus));

      const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
      await sup.run();

      const eventsPath = join(waitingDir, 'events.jsonl');
      if (existsSync(eventsPath)) {
        const lines = readFileSync(eventsPath, 'utf-8')
          .trim().split('\n').filter(Boolean);
        const hasWarning = lines.some(l => {
          try { return JSON.parse(l).type === 'stale_warning'; } catch { return false; }
        });
        expect(hasWarning).toBe(false);
      }
    });
  });

  describe('tmux session persistence and cleanup', () => {
    it('initial status.json includes tmux_session when SPECIALISTS_TMUX_SESSION is set', async () => {
      process.env.SPECIALISTS_TMUX_SESSION = 'specialists-job-123';
      const capturedStatuses: SupervisorStatus[] = [];
      const runner = {
        run: vi.fn().mockImplementation(async () => {
          const entries = readdirSync(jobsDir).filter(e => e !== 'latest');
          if (entries.length > 0) {
            const id = entries[0];
            try {
              capturedStatuses.push(JSON.parse(readFileSync(join(jobsDir, id, 'status.json'), 'utf-8')));
            } catch { /* ignore */ }
          }
          return {
            output: 'done',
            model: 'haiku',
            backend: 'anthropic',
            durationMs: 10,
            specialistVersion: '1.0.0',
            promptHash: 'abc123',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      await sup.run();

      expect(capturedStatuses).toHaveLength(1);
      expect(capturedStatuses[0].tmux_session).toBe('specialists-job-123');
    });

    it('initial status.json omits tmux_session when SPECIALISTS_TMUX_SESSION is not set', async () => {
      const capturedStatuses: SupervisorStatus[] = [];
      const runner = {
        run: vi.fn().mockImplementation(async () => {
          const entries = readdirSync(jobsDir).filter(e => e !== 'latest');
          if (entries.length > 0) {
            const id = entries[0];
            try {
              capturedStatuses.push(JSON.parse(readFileSync(join(jobsDir, id, 'status.json'), 'utf-8')));
            } catch { /* ignore */ }
          }
          return {
            output: 'done',
            model: 'haiku',
            backend: 'anthropic',
            durationMs: 10,
            specialistVersion: '1.0.0',
            promptHash: 'abc123',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      await sup.run();

      expect(capturedStatuses).toHaveLength(1);
      expect('tmux_session' in capturedStatuses[0]).toBe(false);
    });

    it('calls tmux kill-session in finally when tmux_session is present (idempotent exit ignored)', async () => {
      process.env.SPECIALISTS_TMUX_SESSION = 'specialists-job-456';
      const originalSpawnSync = childProcess.spawnSync;
      const spawnSyncSpy = vi.spyOn(childProcess, 'spawnSync').mockImplementation(((command: any, args: any, options: any) => {
        if (command === 'tmux') {
          return {
            pid: 0,
            output: [],
            stdout: '',
            stderr: 'no server running',
            status: 1,
            signal: null,
          } as any;
        }
        return originalSpawnSync(command, args, options as any);
      }) as any);

      const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
      await expect(sup.run()).resolves.toMatch(/^[a-z0-9]{6}$/);

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'specialists-job-456'],
        { stdio: 'ignore' },
      );
    });

    it('calls tmux kill-session even when runner errors', async () => {
      process.env.SPECIALISTS_TMUX_SESSION = 'specialists-job-789';
      const originalSpawnSync = childProcess.spawnSync;
      const spawnSyncSpy = vi.spyOn(childProcess, 'spawnSync').mockImplementation(((command: any, args: any, options: any) => {
        if (command === 'tmux') {
          return {
            pid: 0,
            output: [],
            stdout: '',
            stderr: 'session not found',
            status: 1,
            signal: null,
          } as any;
        }
        return originalSpawnSync(command, args, options as any);
      }) as any);

      const runner = {
        run: vi.fn().mockRejectedValue(new Error('backend exploded')),
      } as any;
      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });

      await expect(sup.run()).rejects.toThrow('backend exploded');
      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'specialists-job-789'],
        { stdio: 'ignore' },
      );
    });
  });

  describe('bead_id propagation (external-bead path)', () => {
    it('initial status.json has bead_id when inputBeadId is provided', async () => {
      const capturedStatuses: SupervisorStatus[] = [];
      const runner = {
        run: vi.fn().mockImplementation(async (_opts: any, _onProgress: any) => {
          // Capture what was in status.json at job start (before run returns)
          const entries = readdirSync(jobsDir).filter(e => e !== 'latest');
          if (entries.length > 0) {
            const id = entries[0];
            const statusPath = join(jobsDir, id, 'status.json');
            try {
              capturedStatuses.push(JSON.parse(readFileSync(statusPath, 'utf-8')));
            } catch { /* ignore */ }
          }
          return {
            output: 'done',
            model: 'haiku',
            backend: 'anthropic',
            durationMs: 10,
            specialistVersion: '1.0.0',
            promptHash: 'abc123',
            beadId: 'unitAI-ext-42',
          };
        }),
      } as any;

      const sup = new Supervisor({
        jobsDir,
        runner,
        runOptions: { name: 'test', prompt: 'go', inputBeadId: 'unitAI-ext-42' },
      });
      await sup.run();

      expect(capturedStatuses).toHaveLength(1);
      expect(capturedStatuses[0].bead_id).toBe('unitAI-ext-42');
    });

    it('initial status.json has no bead_id when inputBeadId is absent', async () => {
      const capturedStatuses: SupervisorStatus[] = [];
      const runner = {
        run: vi.fn().mockImplementation(async () => {
          const entries = readdirSync(jobsDir).filter(e => e !== 'latest');
          if (entries.length > 0) {
            const id = entries[0];
            try {
              capturedStatuses.push(JSON.parse(readFileSync(join(jobsDir, id, 'status.json'), 'utf-8')));
            } catch { /* ignore */ }
          }
          return {
            output: 'done',
            model: 'haiku',
            backend: 'anthropic',
            durationMs: 10,
            specialistVersion: '1.0.0',
            promptHash: 'abc123',
            beadId: undefined,
          };
        }),
      } as any;

      const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });
      await sup.run();

      expect(capturedStatuses).toHaveLength(1);
      expect(capturedStatuses[0].bead_id).toBeUndefined();
    });

    it('run_start event in events.jsonl has bead_id when inputBeadId is provided', async () => {
      const runner = makeMockRunner('out', 'haiku', 'anthropic');
      const sup = new Supervisor({
        jobsDir,
        runner,
        runOptions: { name: 'test', prompt: 'go', inputBeadId: 'unitAI-ext-99' },
      });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const runStart = lines.find((e: any) => e.type === 'run_start');

      expect(runStart).toBeDefined();
      expect(runStart.bead_id).toBe('unitAI-ext-99');
    });

    it('run_start event has no bead_id when no inputBeadId provided', async () => {
      const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
      const id = await sup.run();

      const lines = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8')
        .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const runStart = lines.find((e: any) => e.type === 'run_start');

      expect(runStart).toBeDefined();
      expect(runStart.bead_id).toBeUndefined();
    });
  });
});
