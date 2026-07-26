import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createObservabilitySqliteClientAtPath } from '../../../src/specialist/observability-sqlite.js';
import type { RuntimeOriginV1 } from '../../../src/specialist/runtime-origin.js';
import { Supervisor, type SupervisorStatus } from '../../../src/specialist/supervisor.js';

const { bdSpawnMock, xtmuxSpawnMock } = vi.hoisted(() => ({
  bdSpawnMock: vi.fn(),
  xtmuxSpawnMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => ({ pid: 1234, unref: vi.fn() })),
    spawnSync: (command: string, args: string[], options: object) => {
      if (command === 'xtmux') return xtmuxSpawnMock(command, args, options);
      if (command === 'bd') return bdSpawnMock(command, args, options);
      return actual.spawnSync(command, args, options);
    },
  };
});

const PARENT_ORIGIN: RuntimeOriginV1 = {
  schema_version: 'xtrm.runtime-origin.v1',
  kind: 'xtmux.agent_instance',
  host_id: 'host-test',
  tmux_session_id: '$parent',
  tmux_window_id: '@parent',
  tmux_pane_id: '%parent',
  agent_instance_id: 'agent-parent',
  captured_at_ms: 1_700_000_000_000,
  capture_source: 'xtmux-context',
  verified: true,
};

function successfulSpawn() {
  return {
    pid: 1,
    output: [null, '{}', ''],
    stdout: '{}',
    stderr: '',
    status: 0,
    signal: null,
  };
}

function runner(output = 'result available') {
  return {
    run: vi.fn().mockResolvedValue({
      output,
      model: 'test-model',
      backend: 'test-backend',
      durationMs: 10,
      specialistVersion: '1.0.0',
      promptHash: 'prompt-hash',
    }),
  } as any;
}

function argsForCall(index = 0): string[] {
  return xtmuxSpawnMock.mock.calls[index]?.[1] as string[];
}

function valueAfter(args: string[], flag: string): string {
  return args[args.indexOf(flag) + 1]!;
}

function payloadForCall(index = 0): any {
  return JSON.parse(valueAfter(argsForCall(index), '--text'));
}

describe('Supervisor parent terminal notification', () => {
  let tmpDir: string;
  let jobsDir: string;
  let originalFileOutput: string | undefined;
  let originalDataHome: string | undefined;
  const supervisors: Supervisor[] = [];

  beforeEach(() => {
    originalFileOutput = process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    tmpDir = mkdtempSync(join(tmpdir(), 'supervisor-parent-notification-'));
    jobsDir = join(tmpDir, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    // Supervisor throws on upsertStatus when no observability db exists. Resolution
    // falls back to <git-root>/.specialists/db, which only exists on a machine that
    // has run `sp init` — so these tests passed locally and failed on a clean CI
    // runner. Give the suite its own db instead of borrowing the developer's.
    originalDataHome = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = join(tmpDir, 'xdg-data');
    createObservabilitySqliteClientAtPath(
      join(process.env.XDG_DATA_HOME, 'specialists', 'observability.db'),
    )?.close();
    xtmuxSpawnMock.mockReset().mockImplementation(successfulSpawn);
    bdSpawnMock.mockReset().mockImplementation((_command: string, args: string[]) => ({
      ...successfulSpawn(),
      stdout: args[0] === 'show' ? JSON.stringify([{ assignee: 'pi/old12' }]) : '{}',
    }));
  });

  afterEach(async () => {
    await Promise.all(supervisors.map((supervisor) => supervisor.dispose()));
    supervisors.length = 0;
    if (originalFileOutput === undefined) delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    else process.env.SPECIALISTS_JOB_FILE_OUTPUT = originalFileOutput;
    if (originalDataHome === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = originalDataHome;
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeSupervisor(mockRunner = runner()): Supervisor {
    const supervisor = new Supervisor({
      jobsDir,
      runner: mockRunner,
      runOptions: {
        name: 'executor',
        prompt: 'do work',
        ambientRuntimeOrigin: PARENT_ORIGIN,
      } as any,
    });
    supervisors.push(supervisor);
    return supervisor;
  }

  it('sends one bounded xtrm.forensic.v1 pointer after terminal done', async () => {
    const privateResult = 'full private result for user@example.com';
    const id = await makeSupervisor(runner(privateResult)).run();

    expect(xtmuxSpawnMock).toHaveBeenCalledTimes(1);
    const args = argsForCall();
    expect(args).toEqual(expect.arrayContaining([
      'message-send', '--to', '$parent', '--to-pane', '%parent',
      '--expects-reply=false', '--id', `${id}:done`, '--json',
    ]));

    const text = valueAfter(args, '--text');
    const payload = JSON.parse(text);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(4096);
    expect(payload).toMatchObject({
      schema_version: 'xtrm.forensic.v1',
      event_family: 'job',
      event_name: 'job.completed',
      event_version: 1,
      resource: { participant_kind: 'specialist', participant_role: 'executor' },
      correlation: { job_id: id },
      body: {
        transition: 'done',
        job_id: id,
        specialist: 'executor',
        parent: {
          kind: 'xtmux.agent_instance',
          tmux_session_id: '$parent',
          tmux_pane_id: '%parent',
          agent_instance_id: 'agent-parent',
          verified: true,
        },
        result_command: `sp result ${id} --json`,
        idempotency_key: `${id}:done`,
      },
      redaction: { status: 'clean' },
    });
    expect(text).not.toContain(privateResult);
    expect(text).not.toContain('user@example.com');
    expect(existsSync(join(tmpDir, 'ready', id))).toBe(false);
  });

  it('advances a prior runtime assignee to terminal role and job lineage', async () => {
    const order: string[] = [];
    xtmuxSpawnMock.mockImplementation(() => {
      order.push('notify');
      return successfulSpawn();
    });
    bdSpawnMock.mockImplementation((_command: string, args: string[]) => {
      order.push(args[0]!);
      return {
        ...successfulSpawn(),
        stdout: args[0] === 'show' ? JSON.stringify([{ assignee: 'pi/old12' }]) : '{}',
      };
    });
    const specialistRunner = runner();
    specialistRunner.run.mockResolvedValue({
      output: 'done',
      model: 'test-model',
      backend: 'test-backend',
      durationMs: 10,
      specialistVersion: '1.0.0',
      promptHash: 'prompt-hash',
      beadId: 'bead-1',
    });

    const id = await makeSupervisor(specialistRunner).run();

    expect(order).toEqual(['notify', 'show', 'update']);
    expect(bdSpawnMock).toHaveBeenLastCalledWith(
      'bd',
      ['update', 'bead-1', `--assignee=executor/${id}`, '--json'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('keeps an active sibling as the bead assignee when another job finishes', async () => {
    bdSpawnMock.mockImplementation((_command: string, args: string[]) => ({
      ...successfulSpawn(),
      stdout: args[0] === 'show' ? JSON.stringify([{ assignee: 'executor/abc999' }]) : '{}',
    }));
    const specialistRunner = runner();
    specialistRunner.run.mockResolvedValue({
      output: 'done',
      model: 'test-model',
      backend: 'test-backend',
      durationMs: 10,
      specialistVersion: '1.0.0',
      promptHash: 'prompt-hash',
      beadId: 'bead-1',
    });
    const supervisor = makeSupervisor(specialistRunner);
    const readStatus = supervisor.readStatus.bind(supervisor);
    vi.spyOn(supervisor, 'listLiveJobsForBead').mockReturnValue(['abc123']);
    vi.spyOn(supervisor, 'readStatus').mockImplementation((id) => id === 'abc123'
      ? {
          id,
          specialist: 'reviewer',
          status: 'waiting',
          started_at_ms: 1_700_000_000_000,
          is_dead: false,
        }
      : readStatus(id));

    const completedId = await supervisor.run();

    expect(bdSpawnMock).toHaveBeenLastCalledWith(
      'bd',
      ['update', 'bead-1', '--assignee=reviewer/abc123', '--json'],
      expect.any(Object),
    );
    expect(bdSpawnMock.mock.calls.flatMap((call) => call[1] as string[])).not.toContain(`--assignee=executor/${completedId}`);
  });

  it('preserves a manual bead assignee', async () => {
    bdSpawnMock.mockImplementation((_command: string, args: string[]) => ({
      ...successfulSpawn(),
      stdout: args[0] === 'show' ? JSON.stringify([{ assignee: 'alice@example.com' }]) : '{}',
    }));
    const specialistRunner = runner();
    specialistRunner.run.mockResolvedValue({
      output: 'done',
      model: 'test-model',
      backend: 'test-backend',
      durationMs: 10,
      specialistVersion: '1.0.0',
      promptHash: 'prompt-hash',
      beadId: 'bead-1',
    });

    await makeSupervisor(specialistRunner).run();

    expect(bdSpawnMock).toHaveBeenCalledTimes(1);
    expect(bdSpawnMock).toHaveBeenCalledWith('bd', ['show', 'bead-1', '--json'], expect.any(Object));
  });

  it('keeps notification and completion when the assignee update fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    bdSpawnMock.mockImplementation((_command: string, args: string[]) => ({
      ...successfulSpawn(),
      stdout: args[0] === 'show' ? JSON.stringify([{ assignee: 'reviewer/abc123' }]) : '',
      status: args[0] === 'update' ? 1 : 0,
    }));
    const specialistRunner = runner();
    specialistRunner.run.mockResolvedValue({
      output: 'done',
      model: 'test-model',
      backend: 'test-backend',
      durationMs: 10,
      specialistVersion: '1.0.0',
      promptHash: 'prompt-hash',
      beadId: 'bead-1',
    });

    const id = await makeSupervisor(specialistRunner).run();

    expect(xtmuxSpawnMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(join(jobsDir, id, 'status.json'), 'utf-8'))).toMatchObject({ status: 'done' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('assignee update failed'));
  });

  it('persists the error handoff before sending a pointer without the thrown error', async () => {
    const order: string[] = [];
    xtmuxSpawnMock.mockImplementation(() => {
      order.push('notify');
      return successfulSpawn();
    });
    const supervisor = new Supervisor({
      jobsDir,
      runner: { run: vi.fn().mockRejectedValue(new Error('secret for private@example.com')) } as any,
      runOptions: {
        name: 'executor',
        prompt: 'do work',
        inputBeadId: 'bead-1',
        ambientRuntimeOrigin: PARENT_ORIGIN,
      } as any,
      beadsClient: {
        updateBeadNotes: vi.fn(() => {
          order.push('handoff');
          return { ok: true };
        }),
      } as any,
    });
    supervisors.push(supervisor);

    await expect(supervisor.run()).rejects.toThrow('secret for private@example.com');

    expect(order).toEqual(['handoff', 'notify']);
    expect(xtmuxSpawnMock).toHaveBeenCalledTimes(1);
    const payload = payloadForCall();
    expect(payload.event_name).toBe('job.failed');
    expect(payload.body.transition).toBe('error');
    expect(payload.body.result_command).toBe(`sp result ${payload.body.job_id} --json`);
    expect(valueAfter(argsForCall(), '--text')).not.toContain('private@example.com');
    expect(existsSync(join(tmpDir, 'ready', payload.body.job_id))).toBe(false);
  });

  it('keeps terminal completion when xtmux delivery throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    xtmuxSpawnMock.mockImplementation(() => {
      throw new Error('xtmux unavailable');
    });

    const id = await makeSupervisor().run();
    const status = JSON.parse(readFileSync(join(jobsDir, id, 'status.json'), 'utf-8')) as SupervisorStatus;
    expect(status.status).toBe('done');
  });

  it('re-sends duplicate terminal errors with the same idempotency key and payload', () => {
    const supervisor = makeSupervisor();
    const jobId = 'job-duplicate';
    const jobDir = join(jobsDir, jobId);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(join(jobDir, 'status.json'), JSON.stringify({
      id: jobId,
      specialist: 'executor',
      status: 'running',
      started_at_ms: 1_700_000_000_000,
      last_event_at_ms: 1_700_000_000_100,
      spawn_origin: { kind: 'xtmux.agent_instance', runtime_origin: PARENT_ORIGIN },
    } satisfies SupervisorStatus));

    expect(supervisor.updateJobStatus(jobId, 'error', 'first')).toMatchObject({ status: 'error' });
    expect(supervisor.updateJobStatus(jobId, 'error', 'second')).toMatchObject({ status: 'error' });

    expect(xtmuxSpawnMock).toHaveBeenCalledTimes(2);
    expect(valueAfter(argsForCall(0), '--id')).toBe(`${jobId}:error`);
    expect(valueAfter(argsForCall(1), '--id')).toBe(`${jobId}:error`);
    expect(valueAfter(argsForCall(1), '--text')).toBe(valueAfter(argsForCall(0), '--text'));
  });

  it('notifies the parent when readStatus reconciles a dead job', () => {
    const supervisor = makeSupervisor();
    const jobId = 'job-dead';
    const jobDir = join(jobsDir, jobId);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(join(jobDir, 'status.json'), JSON.stringify({
      id: jobId,
      specialist: 'executor',
      status: 'running',
      started_at_ms: Date.now() - 10_000,
      last_event_at_ms: Date.now() - 10_000,
      pid: 999_999_999,
      spawn_origin: { kind: 'xtmux.agent_instance', runtime_origin: PARENT_ORIGIN },
    } satisfies SupervisorStatus));

    expect(supervisor.readStatus(jobId)).toMatchObject({ status: 'error', is_dead: false });

    expect(xtmuxSpawnMock).toHaveBeenCalledTimes(1);
    expect(valueAfter(argsForCall(), '--id')).toBe(`${jobId}:error`);
    expect(payloadForCall()).toMatchObject({ event_name: 'job.failed', body: { transition: 'error', job_id: jobId } });
    expect(readFileSync(join(jobDir, 'death.txt'), 'utf-8')).toContain('Process crashed or was killed');
  });

  it('does not notify an unverified parent', () => {
    const supervisor = makeSupervisor();
    const jobId = 'job-unverified';
    const jobDir = join(jobsDir, jobId);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(join(jobDir, 'status.json'), JSON.stringify({
      id: jobId,
      specialist: 'executor',
      status: 'running',
      started_at_ms: 1_700_000_000_000,
      spawn_origin: {
        kind: 'xtmux.agent_instance',
        runtime_origin: { ...PARENT_ORIGIN, verified: false },
      },
    } satisfies SupervisorStatus));

    expect(supervisor.updateJobStatus(jobId, 'error')).toMatchObject({ status: 'error' });
    expect(xtmuxSpawnMock).not.toHaveBeenCalled();
  });
});
