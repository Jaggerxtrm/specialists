// Regression for the gitboard SourceQueue port (unitAI-ctb4u.20).
//
// Strategy: replace the real timer with vi.useFakeTimers so we can step
// time deterministically. SourceQueue's COALESCE_MS=1500 default means we
// only need to advance the clock past the coalesce window to inspect
// drain behavior.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COALESCE_MS, SourceQueue } from '../../../src/specialist/source-queue.js';

describe('SourceQueue (unitAI-ctb4u.20)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('single enqueue → exactly one run', async () => {
    const q = new SourceQueue();
    const run = vi.fn().mockResolvedValue(undefined);

    q.enqueue('repoA', run);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('burst enqueue within the coalesce window → still one run', async () => {
    const q = new SourceQueue();
    const run = vi.fn().mockResolvedValue(undefined);

    for (let i = 0; i < 50; i += 1) q.enqueue('repoA', run);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('trailing enqueue during an in-flight run → second run scheduled', async () => {
    const q = new SourceQueue();
    let resolveFirst: (() => void) | null = null;
    let firstStarted = false;
    const run = vi.fn().mockImplementation(() => {
      firstStarted = true;
      return new Promise<void>((resolve) => { resolveFirst = resolve; });
    });

    q.enqueue('repoA', run);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(firstStarted).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);

    // While the first run is in flight, re-enqueue.
    q.enqueue('repoA', run);
    // Resolve the in-flight run; the trailing enqueue should now drain.
    resolveFirst!();
    // Flush microtasks for finally + recursive enqueue, then advance the
    // newly-armed coalesce timer.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('errors thrown by run route to onError, not unhandled', async () => {
    const onError = vi.fn();
    const q = new SourceQueue(onError);
    const boom = new Error('boom');
    const run = vi.fn().mockRejectedValue(boom);

    q.enqueue('repoA', run);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    expect(run).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('repoA', boom);
  });

  it('error during one run does not prevent a trailing run', async () => {
    const onError = vi.fn();
    const q = new SourceQueue(onError);
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce(undefined);

    q.enqueue('repoA', run);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    q.enqueue('repoA', run);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('cancel() drops the pending coalesce timer without running', async () => {
    const q = new SourceQueue();
    const run = vi.fn().mockResolvedValue(undefined);

    q.enqueue('repoA', run);
    q.cancel();
    await vi.advanceTimersByTimeAsync(COALESCE_MS * 2);
    expect(run).not.toHaveBeenCalled();
  });

  it('cancel() during an in-flight run still allows that run to finish, but drops the trailing queued flag', async () => {
    const q = new SourceQueue();
    let resolveFirst: (() => void) | null = null;
    const run = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveFirst = resolve; }));

    q.enqueue('repoA', run);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);

    // Operator enqueues again while run is in flight, then cancels.
    q.enqueue('repoA', run);
    q.cancel();
    resolveFirst!();
    await vi.advanceTimersByTimeAsync(COALESCE_MS * 2);
    // No second run because cancel cleared the queued flag.
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('two SourceQueues are independent (per-repo isolation)', async () => {
    const qA = new SourceQueue();
    const qB = new SourceQueue();
    const runA = vi.fn().mockResolvedValue(undefined);
    const runB = vi.fn().mockResolvedValue(undefined);

    qA.enqueue('repoA', runA);
    qB.enqueue('repoB', runB);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(runA).toHaveBeenCalledTimes(1);
    expect(runB).toHaveBeenCalledTimes(1);

    // Cancel A; B's next enqueue still works.
    qA.cancel();
    qB.enqueue('repoB', runB);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(runA).toHaveBeenCalledTimes(1);
    expect(runB).toHaveBeenCalledTimes(2);
  });
});
