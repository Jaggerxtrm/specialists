import type { TimelineEvent } from '../specialist/timeline-events.js';
export interface PiJsonProjectionContext {
    jobId: string;
    sessionId?: string;
    cwd?: string;
    startedAtMs?: number;
    model?: string;
    backend?: string;
}
type PiJsonEvent = Record<string, unknown> & {
    type: string;
};
/** Project the compact persisted specialist timeline into pi's documented JSON event stream. */
export declare function createPiJsonProjector(context: PiJsonProjectionContext): (event: TimelineEvent) => PiJsonEvent[];
export {};
//# sourceMappingURL=pi-json-output.d.ts.map