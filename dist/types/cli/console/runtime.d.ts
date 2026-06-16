import { type TimelineEvent } from '../../specialist/timeline-events.js';
import type { ConsoleJob, ProcessRow, RuntimeClient } from './types.js';
export declare function createRuntimeClient(cwd?: string): RuntimeClient;
export declare function buildChronologicalRows(jobs: ConsoleJob[]): ProcessRow[];
export declare function dedupeHumanEvents(jobId: string, events: TimelineEvent[]): TimelineEvent[];
export declare function formatDateTime(ms: number | undefined): string;
//# sourceMappingURL=runtime.d.ts.map