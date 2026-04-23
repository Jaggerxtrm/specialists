/**
 * Shared formatting primitives for specialists observability surfaces.
 *
 * Used by:
 * - `feed.ts` — timeline event rendering
 * - `status.ts` — job table rendering
 * - future dashboard/UI surfaces
 *
 * ## Design goals
 *
 * - Compact, information-dense output
 * - Stable color assignment across refresh/follow iterations
 * - Consistent labels and timestamps
 * - Clear lifecycle banners
 */
export declare const dim: (s: string) => string;
export declare const bold: (s: string) => string;
export declare const cyan: (s: string) => string;
export declare const yellow: (s: string) => string;
export declare const red: (s: string) => string;
export declare const green: (s: string) => string;
export declare const blue: (s: string) => string;
export declare const magenta: (s: string) => string;
export type Colorizer = (s: string) => string;
/** Standard color palette for job attribution (cycled) */
export declare const JOB_COLORS: Colorizer[];
/**
 * Format timestamp as HH:MM:SS (compact, for event lines).
 */
export declare function formatTime(t: number): string;
/**
 * Format timestamp as YYYY-MM-DD HH:MM:SS (verbose, for banners).
 */
export declare function formatDateTime(t: number): string;
/**
 * Format elapsed seconds as compact string (e.g., "42s", "5m 30s").
 */
export declare function formatElapsed(seconds: number): string;
export declare function formatCostUsd(costUsd: number | undefined): string | null;
export declare function formatTokenUsageSummary(tokenUsage: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    cost_usd?: number;
} | undefined): string[];
/**
 * Compact labels for event types (5 chars max, pad for alignment).
 */
export declare const EVENT_LABELS: Record<string, string>;
/**
 * Get compact label for an event type.
 */
export declare function getEventLabel(type: string): string;
/**
 * Human-readable status strings.
 */
export declare function getStatusLabel(status: string): string;
/**
 * Colorizer for status values.
 */
export declare function statusColorizer(status: string): Colorizer;
/**
 * Stable color assignment for jobs.
 * Same job ID always gets the same color across iterations.
 */
export declare class JobColorMap {
    private colors;
    private nextIdx;
    getColor(jobId: string): Colorizer;
    /** Get color for a job ID, assigning a new one if needed */
    get(jobId: string): Colorizer;
    /** Check if we already have a color for this job */
    has(jobId: string): boolean;
    /** Number of jobs with assigned colors */
    get size(): number;
}
/**
 * Format job completion banner.
 */
export declare function formatCompleteBanner(jobId: string, specialist: string, elapsed_s: number, colorize: Colorizer): string;
/**
 * Format job error banner.
 */
export declare function formatErrorBanner(jobId: string, specialist: string, error: string, colorize: Colorizer): string;
/**
 * Format job discovery banner (new job found during follow).
 */
export declare function formatDiscoveryBanner(jobId: string): string;
import type { TimelineEvent } from '../specialist/timeline-events.js';
export declare function formatEventLine(event: TimelineEvent, options: {
    jobId: string;
    specialist: string;
    beadId?: string;
    nodeId?: string;
    contextPct?: number;
    colorize: Colorizer;
}): string;
/**
 * Format a single timeline event as a compact inline line for run's human output mode.
 * Returns null for events that should be suppressed (noisy internals).
 */
export declare function formatEventInline(event: TimelineEvent): string | null;
export type InlineIndicatorPhase = 'thinking' | 'text' | null;
export declare function formatEventInlineDebounced(event: TimelineEvent, activePhase: InlineIndicatorPhase): {
    line: string | null;
    nextPhase: InlineIndicatorPhase;
};
//# sourceMappingURL=format-helpers.d.ts.map