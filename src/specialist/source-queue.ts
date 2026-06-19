// Verbatim port from gitboard's materializer:
//   gitboard:packages/core/src/materializer/queue.ts (~34 LoC)
//
// Adopted per unitAI-ctb4u.20 (Phase 2 of materializer adoption) so sp
// console can run one SourceQueue per repo for poll isolation. Switching
// repos cancels the prior repo's pending dispatches without waiting for
// the in-flight run to finish, and the destination repo's queue runs
// immediately rather than sharing a single global setInterval.
//
// Keep this file byte-identical to upstream — only the attribution header
// is added. If upstream gains features we need, port them; do NOT diverge.

export const COALESCE_MS = 1500;

export type SourceQueueErrorHandler = (sourceKey: string, error: unknown) => void;

export class SourceQueue {
  private running = false;
  private queued = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onError?: SourceQueueErrorHandler) {}

  enqueue(sourceKey: string, run: () => Promise<void>): void {
    this.queued = true;
    if (this.running || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain(sourceKey, run);
    }, COALESCE_MS);
  }

  private async drain(sourceKey: string, run: () => Promise<void>): Promise<void> {
    if (!this.queued || this.running) return;
    this.running = true;
    this.queued = false;
    try {
      await run();
    } catch (error) {
      this.onError?.(sourceKey, error);
    } finally {
      this.running = false;
      if (this.queued) this.enqueue(sourceKey, run);
    }
  }

  // sp console addition (NOT upstream): cancel the pending timer and
  // discard the queued flag so a stop() / repo switch cleans up without
  // waiting for the coalesce window. The in-flight run still drains to
  // completion — that's intentional; the running flag protects callers
  // from torn intermediate state.
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queued = false;
  }
}
