import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RuntimeOriginV1 } from '../../../src/specialist/runtime-origin.js';

const { xtmuxSpawnMock } = vi.hoisted(() => ({ xtmuxSpawnMock: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: (command: string, args: string[], options: object) => {
      if (command === 'xtmux') return xtmuxSpawnMock(command, args, options);
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
  captured_at_ms: 1_700_000_000_000,
  capture_source: 'xtmux-context',
  verified: true,
};

const DEAD_PID = 999_999_999;

function deadStatus(id: string) {
  return {
    id,
    specialist: 'executor',
    status: 'running',
    started_at_ms: Date.now() - 10_000,
    last_event_at_ms: Date.now() - 5_000,
    pid: DEAD_PID,
    spawn_origin: { kind: 'xtmux.agent_instance', runtime_origin: PARENT_ORIGIN },
  };
}

describe('status-load dead-job reconciliation', () => {
  let tmpDir: string;
  let previousCwd: string;
  let loadStatuses: typeof import('../../../src/specialist/status-load.js').loadStatuses;
  let store: { statusById: Map<string, any>; eventsById: Map<string, any[]> };
  let previousFileOutput: string | undefined;

  beforeEach(async () => {
    previousFileOutput = process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'off';
    vi.resetModules();
    xtmuxSpawnMock.mockReset().mockImplementation(() => ({
      pid: 1, output: [null, '{}', ''], stdout: '{}', stderr: '', status: 0, signal: null,
    }));

    const statusById = new Map<string, any>();
    const eventsById = new Map<string, any[]>();
    store = { statusById, eventsById };
    vi.doMock('../../../src/specialist/observability-sqlite.js', () => ({
      createObservabilitySqliteClient: () => ({
        close: vi.fn(),
        listStatuses: () => [...statusById.values()],
        readEvents: (id: string) => eventsById.get(id) ?? [],
        readLatestToolEvent: () => null,
        upsertStatus: (status: any) => statusById.set(status.id, status),
        upsertStatusWithEvent: (status: any, event: any) => {
          statusById.set(status.id, status);
          eventsById.set(status.id, [...(eventsById.get(status.id) ?? []), event]);
        },
        appendEvent: (id: string, _s: string, _b: string | undefined, event: any) => {
          eventsById.set(id, [...(eventsById.get(id) ?? []), event]);
        },
      }),
    }));

    ({ loadStatuses } = await import('../../../src/specialist/status-load.js'));
    tmpDir = mkdtempSync(join(tmpdir(), 'status-load-dead-job-'));
    previousCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    if (previousFileOutput === undefined) delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    else process.env.SPECIALISTS_JOB_FILE_OUTPUT = previousFileOutput;
    process.chdir(previousCwd);
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('transitions a dead job to error and notifies the parent', () => {
    store.statusById.set('dead01', deadStatus('dead01'));
    mkdirSync(join(tmpDir, '.specialists', 'jobs', 'dead01'), { recursive: true });

    const job = loadStatuses().find((status) => status.id === 'dead01');

    expect(job?.status).toBe('error');
    expect(job?.error).toBe('Process crashed or was killed');
    expect(store.statusById.get('dead01').status).toBe('error');

    const events = store.eventsById.get('dead01') ?? [];
    expect(events.find((event) => event.type === 'run_complete')).toMatchObject({
      status: 'ERROR',
      exit_reason: 'crashed',
    });
    expect(events.find((event) => event.data?.event === 'dead_job_detected')?.data).toMatchObject({
      previous_status: 'running',
      next_status: 'error',
    });

    expect(xtmuxSpawnMock).toHaveBeenCalledTimes(1);
    const args = xtmuxSpawnMock.mock.calls[0]![1] as string[];
    expect(args).toEqual(expect.arrayContaining(['message-send', '--to', '$parent', '--to-pane', '%parent', '--id', 'dead01:error']));
    expect(JSON.parse(args[args.indexOf('--text') + 1]!)).toMatchObject({
      event_name: 'job.failed',
      body: { transition: 'error', job_id: 'dead01' },
    });
  });

  it('writes a death artifact naming the cause', () => {
    store.statusById.set('dead02', deadStatus('dead02'));

    loadStatuses();

    const artifact = join(tmpDir, '.specialists', 'jobs', 'dead02', 'death.txt');
    expect(existsSync(artifact)).toBe(true);
    expect(readFileSync(artifact, 'utf-8')).toContain(`Process crashed or was killed (job=dead02 specialist=executor pid=${DEAD_PID}`);
  });

  it('notifies once — a reconciled job is terminal on the next load', () => {
    store.statusById.set('dead03', deadStatus('dead03'));

    loadStatuses();
    const second = loadStatuses().find((status) => status.id === 'dead03');

    expect(second?.status).toBe('error');
    expect(xtmuxSpawnMock).toHaveBeenCalledTimes(1);
  });

  it('transitions and notifies a file-only dead job with no sqlite client', async () => {
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    vi.resetModules();
    vi.doMock('../../../src/specialist/observability-sqlite.js', () => ({
      createObservabilitySqliteClient: () => null,
    }));
    const fileOnly = await import('../../../src/specialist/status-load.js');

    const jobDir = join(tmpDir, '.specialists', 'jobs', 'dead04');
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(join(jobDir, 'status.json'), JSON.stringify(deadStatus('dead04')), 'utf-8');

    const job = fileOnly.loadStatuses().find((status) => status.id === 'dead04');

    expect(job?.status).toBe('error');
    expect(JSON.parse(readFileSync(join(jobDir, 'status.json'), 'utf-8')).status).toBe('error');
    expect(readFileSync(join(jobDir, 'events.jsonl'), 'utf-8')).toContain('"status":"ERROR"');
    expect(existsSync(join(jobDir, 'death.txt'))).toBe(true);
    expect(xtmuxSpawnMock).toHaveBeenCalledTimes(1);
    expect(xtmuxSpawnMock.mock.calls[0]![1]).toEqual(expect.arrayContaining(['--id', 'dead04:error']));
  });

  it('notifies the parent when repairing an active row that already has a terminal event', () => {
    store.statusById.set('stale01', { ...deadStatus('stale01'), pid: process.pid });
    store.eventsById.set('stale01', [{
      t: Date.now(), type: 'run_complete', status: 'ERROR', elapsed_s: 12, error: 'runner threw',
    }]);

    const job = loadStatuses().find((status) => status.id === 'stale01');

    expect(job?.status).toBe('error');
    expect(xtmuxSpawnMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(xtmuxSpawnMock.mock.calls[0]![1][xtmuxSpawnMock.mock.calls[0]![1].indexOf('--text') + 1])).toMatchObject({
      event_name: 'job.failed',
      body: { transition: 'error', job_id: 'stale01' },
    });
  });

  it('keeps a live job untouched', () => {
    store.statusById.set('live01', { ...deadStatus('live01'), pid: process.pid });

    const job = loadStatuses().find((status) => status.id === 'live01');

    expect(job?.status).toBe('running');
    expect(xtmuxSpawnMock).not.toHaveBeenCalled();
    expect(store.eventsById.get('live01')).toBeUndefined();
  });

  // xtrm-5kwk2 Layer 2: keep-alive jobs emit a per-turn run_complete (COMPLETE)
  // while the session stays alive and waiting. That event must NOT reconcile the
  // active job to a terminal status. Events without the final marker predate the
  // fix and are treated as terminal for backward compatibility.
  it('keeps a waiting keep-alive job waiting when its run_complete is marked final:false', () => {
    store.statusById.set('ka01', {
      id: 'ka01',
      specialist: 'debugger',
      status: 'waiting',
      started_at_ms: Date.now() - 60_000,
      last_event_at_ms: Date.now() - 5_000,
      pid: process.pid,
    });
    store.eventsById.set('ka01', [{
      type: 'run_complete', status: 'COMPLETE', elapsed_s: 5, t: Date.now() - 5_000,
      output: 'first turn output', final: false,
    }]);

    const job = loadStatuses().find((status) => status.id === 'ka01');

    expect(job?.status).toBe('waiting');
    expect(xtmuxSpawnMock).not.toHaveBeenCalled();
  });

  it('still reconciles an unmarked run_complete to done (backward compat)', () => {
    store.statusById.set('ka02', {
      id: 'ka02',
      specialist: 'debugger',
      status: 'waiting',
      started_at_ms: Date.now() - 60_000,
      last_event_at_ms: Date.now() - 5_000,
      pid: process.pid,
    });
    store.eventsById.set('ka02', [{
      type: 'run_complete', status: 'COMPLETE', elapsed_s: 5, t: Date.now() - 5_000,
      output: 'first turn output',
    }]);

    const job = loadStatuses().find((status) => status.id === 'ka02');

    expect(job?.status).toBe('done');
  });
});
