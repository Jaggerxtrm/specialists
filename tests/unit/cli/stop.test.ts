import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supervisorState = {
  liveJobs: [] as string[],
  status: { status: 'running', pid: 1234, bead_id: 'bead-x', tmux_session: undefined, started_at_ms: Date.now() - 1000 },
  metaEvents: [] as Array<{ jobId: string; model: string; backend: string }>,
  controlEvents: [] as Array<{ jobId: string; action: string; options: Record<string, unknown> }>,
  finalizeCalls: [] as string[],
  constructorOpts: [] as Array<Record<string, unknown>>,
};

const beadsState = {
  closeCalls: [] as Array<{ beadId: string; reason: string }>,
  closeBeadIfInProgress: vi.fn((beadId: string, reason: string) => {
    beadsState.closeCalls.push({ beadId, reason });
    return true;
  }),
};

vi.mock('../../../src/specialist/supervisor.js', () => ({
  Supervisor: class {
    constructor(opts: Record<string, unknown>) {
      supervisorState.constructorOpts.push(opts);
    }
    readStatus() {
      return supervisorState.status;
    }
    updateJobStatus() {
      return supervisorState.status;
    }
    aggregateJobMetricsBestEffort() {}
    finalizeWaitingJob(jobId: string) {
      supervisorState.finalizeCalls.push(jobId);
      supervisorState.status = { ...supervisorState.status, status: 'done' } as any;
      return supervisorState.status;
    }
    listLiveJobsForBead() {
      return supervisorState.liveJobs;
    }
    emitMetaEvent(jobId: string, model: string, backend: string) {
      supervisorState.metaEvents.push({ jobId, model, backend });
    }
    emitControlEvent(jobId: string, action: string, options: Record<string, unknown>) {
      supervisorState.controlEvents.push({ jobId, action, options });
    }
    async dispose() {}
  },
}));

vi.mock('../../../src/specialist/beads.js', () => ({
  BeadsClient: class {
    closeBeadIfInProgress(...args: [string, string]) {
      return beadsState.closeBeadIfInProgress(...args);
    }
  },
}));

vi.mock('../../../src/cli/tmux-utils.js', () => ({
  killTmuxSession: vi.fn(),
}));

describe('stop CLI', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    process.argv = ['node', 'specialists', 'stop', 'job-a'];
    supervisorState.liveJobs = [];
    supervisorState.metaEvents = [];
    supervisorState.controlEvents = [];
    supervisorState.status = { status: 'running', pid: 1234, bead_id: 'bead-x', tmux_session: undefined, started_at_ms: Date.now() - 1000 };
    beadsState.closeCalls = [];
    beadsState.closeBeadIfInProgress.mockClear();
    supervisorState.finalizeCalls = [];
    supervisorState.constructorOpts = [];
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it('skips bead close when sibling live jobs stay active', async () => {
    supervisorState.liveJobs = ['job-a', 'job-b', 'job-c'];

    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true as never);

    const { run } = await import('../../../src/cli/stop.js');
    await run();

    expect(beadsState.closeBeadIfInProgress).not.toHaveBeenCalled();
    expect(supervisorState.metaEvents).toEqual([
      { jobId: 'job-a', model: 'bead_close_skipped: sibling-jobs-active [job-b, job-c]', backend: 'supervisor' },
    ]);
    expect(stdoutWrites.join('')).toContain('bead_close_skipped: sibling-jobs-active [job-b, job-c]');
  });

  it('closes bead on last live job', async () => {
    supervisorState.liveJobs = ['job-a'];

    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true as never);

    const { run } = await import('../../../src/cli/stop.js');
    await run();

    expect(beadsState.closeBeadIfInProgress).toHaveBeenCalledWith('bead-x', 'Job job-a stopped (running)');
    expect(supervisorState.metaEvents).toEqual([]);
    expect(stdoutWrites.join('')).toContain('auto-closed');
  });

  it('labels already finalized job with terminal wording when PID is genuinely dead', async () => {
    supervisorState.status = { status: 'done', pid: 1234, bead_id: 'bead-x', tmux_session: undefined, started_at_ms: Date.now() - 1000 };

    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stderrWrites.push(String(chunk));
      return true;
    });
    // Model a dead PID: signal=0 (liveness probe) throws ESRCH, everything else no-ops.
    vi.spyOn(process, 'kill').mockImplementation((_pid: number, signal?: string | number) => {
      if (signal === 0) {
        const err = new Error('kill ESRCH') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      }
      return true as never;
    });

    const { run } = await import('../../../src/cli/stop.js');
    await run();

    expect(stderrWrites.join('')).toContain('already finalized');
  });

  it('reaps orphaned PID when registry is terminal but process still alive (unitAI-yme9q)', async () => {
    supervisorState.status = { status: 'done', pid: 1234, bead_id: 'bead-x', tmux_session: undefined, started_at_ms: Date.now() - 1000 };

    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    const killCalls: Array<{ pid: number; signal: string | number | undefined }> = [];
    // Model an alive PID: signal=0 succeeds; SIGTERM to -pid (process group) succeeds; record all.
    vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
      killCalls.push({ pid, signal });
      return true as never;
    });

    const { run } = await import('../../../src/cli/stop.js');
    await run();

    expect(stdoutWrites.join('')).toContain('Reaped orphaned PID 1234');
    // Group SIGTERM to -pid must have been attempted for the detached pi child.
    expect(killCalls.some(call => call.pid === -1234 && call.signal === 'SIGTERM')).toBe(true);
    // A stop_terminal_alive_reaped control event should be emitted for observability.
    expect(supervisorState.controlEvents.some(event => event.action === 'stop_terminal_alive_reaped')).toBe(true);
  });

  it('finalizes waiting keep-alive before stop bead auto-close path', async () => {
    supervisorState.status = { status: 'waiting', pid: 1234, bead_id: 'bead-x', tmux_session: undefined, started_at_ms: Date.now() - 1000 } as any;

    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true as never);

    const { run } = await import('../../../src/cli/stop.js');
    await run();

    expect(supervisorState.finalizeCalls).toEqual(['job-a']);
    expect(supervisorState.constructorOpts[0]?.beadsClient).toBeTruthy();
    expect(beadsState.closeBeadIfInProgress).toHaveBeenCalledWith('bead-x', 'Job job-a stopped (done)');
  });

  it('forces bead close anyway with override', async () => {
    supervisorState.liveJobs = ['job-a', 'job-b'];
    process.argv = ['node', 'specialists', 'stop', 'job-a', '--close-bead-anyway'];

    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true as never);

    const { run } = await import('../../../src/cli/stop.js');
    await run();

    expect(beadsState.closeBeadIfInProgress).toHaveBeenCalledWith('bead-x', 'Job job-a stopped (running)');
    expect(supervisorState.metaEvents).toEqual([]);
    expect(stdoutWrites.join('')).toContain('auto-closed');
  });
});
