import type { SupervisorStatus } from '../specialist/supervisor.js';
/**
 * Compact "spawned-by" line for `sp ps` human output (spec §13.7). Returns
 * undefined when the job has no origin — no misleading "unknown" line.
 */
export declare function formatSpawnedByLine(job: SupervisorStatus): string | undefined;
export declare function run(): Promise<void>;
//# sourceMappingURL=ps.d.ts.map