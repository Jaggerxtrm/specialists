// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

interface FakeStatus {
  id: string;
  specialist: string;
  status: 'waiting' | 'done' | 'error' | 'cancelled' | 'running' | 'starting';
  chain_id?: string;
  fifo_path?: string;
  started_at_ms: number;
}

const state = {
  jobs: new Map<string, FakeStatus>(),
  results: new Map<string, string>(),
  finalizedIds: [] as string[],
};

vi.mock('../../../src/specialist/supervisor.js', () => ({
  Supervisor: class {
    readStatus(id: string) {
      return state.jobs.get(id) ?? null;
    }
    readResult(id: string) {
      return state.results.get(id) ?? null;
    }
    listChainJobIds(chainId: string) {
      return Array.from(state.jobs.values())
        .filter((s) => s.chain_id === chainId)
        .map((s) => s.id);
    }
    finalizeWaitingJob(id: string) {
      const status = state.jobs.get(id);
      if (!status) return null;
      state.finalizedIds.push(id);
      const next: FakeStatus = { ...status, status: 'done' };
      state.jobs.set(id, next);
      return next;
    }
    async dispose() {}
  },
}));

function seedChain(opts: { reviewerVerdict: string | null; executorWaiting: boolean; reviewerWaiting: boolean }): void {
  const now = Date.now() - 1000;
  state.jobs.clear();
  state.results.clear();
  state.finalizedIds = [];

  state.jobs.set('exec-1', {
    id: 'exec-1',
    specialist: 'executor',
    status: opts.executorWaiting ? 'waiting' : 'done',
    chain_id: 'chain-A',
    fifo_path: '/tmp/exec-fifo',
    started_at_ms: now,
  });
  state.jobs.set('rev-1', {
    id: 'rev-1',
    specialist: 'reviewer',
    status: opts.reviewerWaiting ? 'waiting' : 'done',
    chain_id: 'chain-A',
    fifo_path: '/tmp/rev-fifo',
    started_at_ms: now + 100,
  });
  if (opts.reviewerVerdict) {
    state.results.set('rev-1', `## Compliance Verdict\n- Verdict: ${opts.reviewerVerdict}\n`);
  }
}

describe('finalize CLI', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    process.argv = ['node', 'specialists', 'finalize', 'exec-1'];
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it('cascades to finalize ALL waiting keep-alive members of a PASS chain', async () => {
    seedChain({ reviewerVerdict: 'PASS', executorWaiting: true, reviewerWaiting: true });
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });

    const { run } = await import('../../../src/cli/finalize.js');
    await run();

    expect(state.finalizedIds.sort()).toEqual(['exec-1', 'rev-1']);
    const out = stdoutWrites.join('');
    expect(out).toContain('Finalized chain chain-A');
    expect(out).toContain('rev-1');
  });

  it('finalizes the chain even when the named job is the executor (not the reviewer)', async () => {
    seedChain({ reviewerVerdict: 'PASS', executorWaiting: true, reviewerWaiting: false });
    process.argv = ['node', 'specialists', 'finalize', 'exec-1'];
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { run } = await import('../../../src/cli/finalize.js');
    await run();

    expect(state.finalizedIds).toEqual(['exec-1']);
  });

  it('refuses chain with no PASS reviewer verdict', async () => {
    seedChain({ reviewerVerdict: 'PARTIAL', executorWaiting: true, reviewerWaiting: true });
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stderrWrites.push(String(chunk));
      return true;
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`exit:${code}`); }) as never);

    const { run } = await import('../../../src/cli/finalize.js');
    await expect(run()).rejects.toThrow('exit:1');

    expect(state.finalizedIds).toEqual([]);
    expect(stderrWrites.join('')).toContain('No reviewer with PASS');
    exitSpy.mockRestore();
  });

  it('matches markdown-bold verdict (- Verdict: **PASS**)', async () => {
    seedChain({ reviewerVerdict: 'PASS', executorWaiting: true, reviewerWaiting: true });
    state.results.set('rev-1', '## Compliance Verdict\n- Verdict: **PASS**\n');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { run } = await import('../../../src/cli/finalize.js');
    await run();

    expect(state.finalizedIds.sort()).toEqual(['exec-1', 'rev-1']);
  });

  it('refuses when chain has no waiting jobs (already finalized)', async () => {
    seedChain({ reviewerVerdict: 'PASS', executorWaiting: false, reviewerWaiting: false });
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stderrWrites.push(String(chunk));
      return true;
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`exit:${code}`); }) as never);

    const { run } = await import('../../../src/cli/finalize.js');
    await expect(run()).rejects.toThrow('exit:1');

    expect(state.finalizedIds).toEqual([]);
    expect(stderrWrites.join('')).toContain('No waiting keep-alive jobs');
    exitSpy.mockRestore();
  });
});
