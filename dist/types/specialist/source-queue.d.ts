export declare const COALESCE_MS = 1500;
export type SourceQueueErrorHandler = (sourceKey: string, error: unknown) => void;
export declare class SourceQueue {
    private readonly onError?;
    private running;
    private queued;
    private timer;
    constructor(onError?: SourceQueueErrorHandler | undefined);
    enqueue(sourceKey: string, run: () => Promise<void>): void;
    private drain;
    cancel(): void;
}
//# sourceMappingURL=source-queue.d.ts.map