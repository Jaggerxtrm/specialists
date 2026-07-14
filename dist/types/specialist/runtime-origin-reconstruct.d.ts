import type { ForensicEvent, ForensicSpawnedByLink, ForensicRootRuntimeOrigin } from './forensic-events.js';
export interface ReconstructedJobNode {
    job_id: string;
    parent_job_id?: string;
    spawned_by?: ForensicSpawnedByLink;
    root_runtime_origin?: ForensicRootRuntimeOrigin;
    root_agent_instance_id?: string;
    spawned_at_ms: number;
}
export type ReconstructedLineage = Map<string, ReconstructedJobNode>;
/** Extract the lineage map from a chronologically-ordered forensic event stream. */
export declare function reconstructLineage(events: ForensicEvent[]): ReconstructedLineage;
/**
 * Redaction sweep — scans every event for forbidden identifiers used as
 * top-level Prometheus labels or for prompt/command/terminal payloads that
 * should never leak (spec §16).
 */
export interface RedactionSweepResult {
    forbidden_label_hits: Array<{
        event: string;
        label: string;
        where: string;
    }>;
    payload_leaks: Array<{
        event: string;
        field: string;
        snippet: string;
    }>;
}
/**
 * Prometheus labels live only at `resource.labels`-shaped surfaces. Nothing in
 * the current forensic emission attaches a `labels` object at the event root,
 * so this sweep primarily protects against future regressions. It checks
 * `resource` for any forbidden key (which would be a promotion error).
 */
export declare function redactionSweep(events: ForensicEvent[]): RedactionSweepResult;
//# sourceMappingURL=runtime-origin-reconstruct.d.ts.map