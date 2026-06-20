import { type TimelineEvent } from '../../specialist/timeline-events.js';
import type { BeadDoc, ConsoleJob, ProcessRow, RepoRef, RuntimeClient } from './types.js';
export declare function createRuntimeClient(cwd?: string): RuntimeClient;
export interface ListReposResult {
    repos: RepoRef[];
    message?: string;
}
export declare function parseBdShowJson(beadId: string, stdout: string): BeadDoc;
export declare function buildChronologicalRows(jobs: ConsoleJob[]): ProcessRow[];
export declare function dedupeHumanEvents(jobId: string, events: TimelineEvent[]): TimelineEvent[];
export declare function formatDateTime(ms: number | undefined): string;
//# sourceMappingURL=runtime.d.ts.map