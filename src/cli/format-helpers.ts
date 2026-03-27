// src/cli/format-helpers.ts
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

// ============================================================================
// ANSI Color Helpers
// ============================================================================

export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
export const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
export const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
export const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

export type Colorizer = (s: string) => string;

/** Standard color palette for job attribution (cycled) */
export const JOB_COLORS: Colorizer[] = [cyan, yellow, magenta, green, blue, red];

// ============================================================================
// Timestamp Formatting
// ============================================================================

/**
 * Format timestamp as HH:MM:SS (compact, for event lines).
 */
export function formatTime(t: number): string {
  return new Date(t).toISOString().slice(11, 19);
}

/**
 * Format timestamp as YYYY-MM-DD HH:MM:SS (verbose, for banners).
 */
export function formatDateTime(t: number): string {
  const d = new Date(t);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

/**
 * Format elapsed seconds as compact string (e.g., "42s", "5m 30s").
 */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ============================================================================
// Event Labels
// ============================================================================

/**
 * Compact labels for event types (5 chars max, pad for alignment).
 */
export const EVENT_LABELS: Record<string, string> = {
  run_start: 'START',
  meta: 'META',
  thinking: 'THINK',
  tool: 'TOOL',
  text: 'TEXT',
  message: 'MSG',
  turn: 'TURN',
  run_complete: 'DONE',
  done: 'DONE',
  agent_end: 'DONE',
  error: 'ERR',
};

/**
 * Get compact label for an event type.
 */
export function getEventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.slice(0, 5).toUpperCase();
}

// ============================================================================
// Status Labels
// ============================================================================

/**
 * Human-readable status strings.
 */
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'done': return 'COMPLETE';
    case 'error': return 'ERROR';
    case 'starting': return 'STARTING';
    case 'running': return 'RUNNING';
    default: return status.toUpperCase();
  }
}

/**
 * Colorizer for status values.
 */
export function statusColorizer(status: string): Colorizer {
  switch (status) {
    case 'done': return green;
    case 'error': return red;
    case 'starting': return yellow;
    default: return dim;
  }
}

// ============================================================================
// Job Color Assignment
// ============================================================================

/**
 * Stable color assignment for jobs.
 * Same job ID always gets the same color across iterations.
 */
export class JobColorMap {
  private colors = new Map<string, Colorizer>();
  private nextIdx = 0;

  getColor(jobId: string): Colorizer {
    let color = this.colors.get(jobId);
    if (!color) {
      color = JOB_COLORS[this.nextIdx % JOB_COLORS.length];
      this.colors.set(jobId, color);
      this.nextIdx++;
    }
    return color;
  }

  /** Get color for a job ID, assigning a new one if needed */
  get(jobId: string): Colorizer {
    return this.getColor(jobId);
  }

  /** Check if we already have a color for this job */
  has(jobId: string): boolean {
    return this.colors.has(jobId);
  }

  /** Number of jobs with assigned colors */
  get size(): number {
    return this.colors.size;
  }
}

// ============================================================================
// Lifecycle Banners
// ============================================================================

/**
 * Format job completion banner.
 */
export function formatCompleteBanner(
  jobId: string,
  specialist: string,
  elapsed_s: number,
  colorize: Colorizer
): string {
  const label = green('COMPLETE');
  const elapsed = dim(formatElapsed(elapsed_s));
  return `${colorize(`[${jobId}]`)} ${specialist} ${label} ${elapsed}`;
}

/**
 * Format job error banner.
 */
export function formatErrorBanner(
  jobId: string,
  specialist: string,
  error: string,
  colorize: Colorizer
): string {
  const label = red('ERROR');
  return `${colorize(`[${jobId}]`)} ${specialist} ${label}: ${error}`;
}

/**
 * Format job discovery banner (new job found during follow).
 */
export function formatDiscoveryBanner(jobId: string): string {
  return cyan(`=== discovered ${jobId} ===`);
}

// ============================================================================
// Event Line Formatting
// ============================================================================

import type { TimelineEvent } from '../specialist/timeline-events.js';

/**
 * Format a single timeline event as a compact line.
 */
export function formatEventLine(
  event: TimelineEvent,
  options: { jobId: string; specialist: string; beadId?: string; colorize: Colorizer }
): string {
  const ts = dim(formatTime(event.t));
  const label = options.colorize(bold(getEventLabel(event.type).padEnd(5)));
  const prefix = `${options.colorize(`[${options.jobId}]`)} ${options.specialist}${options.beadId ? ` ${dim(`[${options.beadId}]`)}` : ''}`;

  const detailParts: string[] = [];
  if (event.type === 'meta') {
    detailParts.push(`model=${event.model}`);
    detailParts.push(`backend=${event.backend}`);
  } else if (event.type === 'tool') {
    detailParts.push(`tool=${event.tool}`);
    detailParts.push(`phase=${event.phase}`);
    if (event.phase === 'end') {
      detailParts.push(`ok=${event.is_error ? 'false' : 'true'}`);
    }
  } else if (event.type === 'run_complete') {
    detailParts.push(`status=${event.status}`);
    detailParts.push(`elapsed=${formatElapsed(event.elapsed_s)}`);
    if (event.error) {
      detailParts.push(`error=${event.error}`);
    }
  } else if (event.type === 'done' || event.type === 'agent_end') {
    detailParts.push('status=COMPLETE');
    detailParts.push(`elapsed=${formatElapsed(event.elapsed_s ?? 0)}`);
  } else if (event.type === 'run_start') {
    detailParts.push(`specialist=${event.specialist}`);
    if (event.bead_id) {
      detailParts.push(`bead=${event.bead_id}`);
    }
  } else if (event.type === 'text') {
    detailParts.push('kind=assistant');
  } else if (event.type === 'thinking') {
    detailParts.push('kind=model');
  } else if (event.type === 'message') {
    detailParts.push(`phase=${event.phase}`);
    detailParts.push(`role=${event.role}`);
  } else if (event.type === 'turn') {
    detailParts.push(`phase=${event.phase}`);
  }

  const detail = detailParts.length > 0 ? dim(detailParts.join(' ')) : '';
  return `${ts} ${prefix}  ${label}${detail ? ` ${detail}` : ''}`.trimEnd();
}