import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  beforeEach(async () => {
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

  it('keeps a live job untouched', () => {
    store.statusById.set('live01', { ...deadStatus('live01'), pid: process.pid });

    const job = loadStatuses().find((status) => status.id === 'live01');

    expect(job?.status).toBe('running');
    expect(xtmuxSpawnMock).not.toHaveBeenCalled();
    expect(store.eventsById.get('live01')).toBeUndefined();
  });
});
