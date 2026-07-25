import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RuntimeOriginV1 } from '../../../src/specialist/runtime-origin.js';
import { Supervisor, type SupervisorStatus } from '../../../src/specialist/supervisor.js';

const { xtmuxSpawnMock } = vi.hoisted(() => ({ xtmuxSpawnMock: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => ({ pid: 1234, unref: vi.fn() })),
    spawnSync: (command: string, args: string[], options: object) => (
      command === 'xtmux'
        ? xtmuxSpawnMock(command, args, options)
        : actual.spawnSync(command, args, options)
    ),
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
  const supervisors: Supervisor[] = [];

  beforeEach(() => {
    originalFileOutput = process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    tmpDir = mkdtempSync(join(tmpdir(), 'supervisor-parent-notification-'));
    jobsDir = join(tmpDir, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    xtmuxSpawnMock.mockReset().mockImplementation(successfulSpawn);
  });

  afterEach(async () => {
    await Promise.all(supervisors.map((supervisor) => supervisor.dispose()));
    supervisors.length = 0;
    if (originalFileOutput === undefined) delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    else process.env.SPECIALISTS_JOB_FILE_OUTPUT = originalFileOutput;
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
      '--expects-reply=false', '--message-key', `${id}:done`, '--json',
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
  });

  it('sends an error pointer without leaking the thrown error', async () => {
    const supervisor = makeSupervisor({
      run: vi.fn().mockRejectedValue(new Error('secret for private@example.com')),
    } as any);

    await expect(supervisor.run()).rejects.toThrow('secret for private@example.com');

    expect(xtmuxSpawnMock).toHaveBeenCalledTimes(1);
    const payload = payloadForCall();
    expect(payload.event_name).toBe('job.failed');
    expect(payload.body.transition).toBe('error');
    expect(payload.body.result_command).toBe(`sp result ${payload.body.job_id} --json`);
    expect(valueAfter(argsForCall(), '--text')).not.toContain('private@example.com');
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
    expect(valueAfter(argsForCall(0), '--message-key')).toBe(`${jobId}:error`);
    expect(valueAfter(argsForCall(1), '--message-key')).toBe(`${jobId}:error`);
    expect(valueAfter(argsForCall(1), '--text')).toBe(valueAfter(argsForCall(0), '--text'));
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
