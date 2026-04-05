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

export function formatCostUsd(costUsd: number | undefined): string | null {
  if (costUsd === undefined || !Number.isFinite(costUsd)) return null;
  return `$${costUsd.toFixed(6)}`;
}

export function formatTokenUsageSummary(tokenUsage: {
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
} | undefined): string[] {
  if (!tokenUsage) return [];
  const parts: string[] = [];
  if (tokenUsage.total_tokens !== undefined) parts.push(`tokens=${tokenUsage.total_tokens}`);
  if (tokenUsage.input_tokens !== undefined) parts.push(`in=${tokenUsage.input_tokens}`);
  if (tokenUsage.output_tokens !== undefined) parts.push(`out=${tokenUsage.output_tokens}`);
  const cost = formatCostUsd(tokenUsage.cost_usd);
  if (cost) parts.push(`cost=${cost}`);
  return parts;
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
  token_usage: 'TOKNS',
  finish_reason: 'FINSH',
  turn_summary: 'TURN+',
  compaction: 'CMPCT',
  retry: 'RETRY',
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
function formatToolArgValue(value: unknown, maxLen = 240): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > maxLen ? `${flat.slice(0, maxLen - 3)}...` : flat;
}

function formatToolDetail(event: Extract<TimelineEvent, { type: 'tool' }>): string {
  const toolName = cyan(event.tool);

  if (event.phase === 'start') {
    if (typeof event.args?.command === 'string') {
      return `${toolName}: ${yellow(formatToolArgValue(event.args.command))}`;
    }

    if (event.args && Object.keys(event.args).length > 0) {
      const argStr = Object.entries(event.args)
        .map(([k, v]) => `${k}=${formatToolArgValue(v)}`)
        .join(' ');
      return `${toolName}: ${dim(argStr)}`;
    }

    return `${toolName}: ${dim('start')}`;
  }

  if (event.phase === 'end' && event.is_error) {
    return `${toolName}: ${red('error')}`;
  }

  return `${toolName}: ${dim(event.phase)}`;
}

export function formatEventLine(
  event: TimelineEvent,
  options: { jobId: string; specialist: string; beadId?: string; colorize: Colorizer }
): string {
  const ts = dim(formatTime(event.t));
  const job = options.colorize(`[${options.jobId}]`);
  const bead = dim(`[${options.beadId ?? '-'}]`);
  const label = options.colorize(bold(getEventLabel(event.type).padEnd(5)));

  const detailParts: string[] = [];
  let detail = '';

  if (event.type === 'meta') {
    detailParts.push(`model=${event.model}`);
    detailParts.push(`backend=${event.backend}`);
  } else if (event.type === 'tool') {
    detail = formatToolDetail(event);
  } else if (event.type === 'run_complete') {
    detailParts.push(`status=${event.status}`);
    detailParts.push(`elapsed=${formatElapsed(event.elapsed_s)}`);
    const finishReason = event.finish_reason ?? event.metrics?.finish_reason;
    if (finishReason) detailParts.push(`finish=${finishReason}`);
    const exitReason = event.exit_reason ?? event.metrics?.exit_reason;
    if (exitReason) detailParts.push(`exit=${exitReason}`);

    const tokenUsage = event.token_usage ?? event.metrics?.token_usage;
    detailParts.push(...formatTokenUsageSummary(tokenUsage));

    const turns = event.metrics?.turns;
    if (turns !== undefined) detailParts.push(`turns=${turns}`);

    const toolCalls = event.tool_calls ?? event.metrics?.tool_call_names;
    if (toolCalls && toolCalls.length > 0) {
      detailParts.push(`tools=${toolCalls.length}`);
    } else if (event.metrics?.tool_calls !== undefined) {
      detailParts.push(`tools=${event.metrics.tool_calls}`);
    }

    if (event.error) {
      detailParts.push(`error=${event.error}`);
    }
  } else if (event.type === 'run_start') {
    detailParts.push(`specialist=${event.specialist}`);
    if (event.bead_id) {
      detailParts.push(`bead=${event.bead_id}`);
    }
  } else if (event.type === 'token_usage') {
    const usage = event.token_usage;
    detailParts.push(...formatTokenUsageSummary({
      total_tokens: usage.total_tokens,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd: usage.cost_usd,
    }));
  } else if (event.type === 'finish_reason') {
    detailParts.push(`reason=${event.finish_reason}`);
    detailParts.push(`source=${event.source}`);
  } else if (event.type === 'turn_summary') {
    detailParts.push(`turn=${event.turn_index}`);
    if (event.finish_reason) detailParts.push(`reason=${event.finish_reason}`);
    if (event.token_usage?.total_tokens !== undefined) {
      detailParts.push(`total=${event.token_usage.total_tokens}`);
    }
    if (
      event.context_pct !== undefined
      && (event.context_health === 'WARN' || event.context_health === 'CRITICAL')
    ) {
      detailParts.push(`context=${event.context_pct.toFixed(2)}%`);
      detailParts.push(`health=${event.context_health}`);
    }
    if (event.text_content) {
      const preview = event.text_content.replace(/\n/g, ' ').slice(0, 80);
      detailParts.push(`"${preview}${event.text_content.length > 80 ? '…' : ''}"`);
    }
  } else if (event.type === 'compaction' || event.type === 'retry') {
    detailParts.push(`phase=${event.phase}`);
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

  if (!detail && detailParts.length > 0) {
    detail = dim(detailParts.join(' '));
  }

  return `${ts} ${job} ${bead} ${label} ${options.specialist}${detail ? ` ${detail}` : ''}`.trimEnd();
}

/**
 * Format a single timeline event as a compact inline line for run's human output mode.
 * Returns null for events that should be suppressed (noisy internals).
 */
export function formatEventInline(event: TimelineEvent): string | null {
  switch (event.type) {
    case 'meta':
      return dim(`[model] ${event.backend}/${event.model}`);
    case 'thinking':
      return dim('[thinking...]');
    case 'text':
      return dim('[response]');
    case 'tool': {
      if (event.phase !== 'start') return null;
      const firstArgVal = event.args ? Object.values(event.args)[0] : undefined;
      const argStr = firstArgVal !== undefined
        ? ': ' + (typeof firstArgVal === 'string'
            ? firstArgVal.split('\n')[0].slice(0, 80)
            : JSON.stringify(firstArgVal).slice(0, 80))
        : '';
      return `${dim('[tool]')}  ${cyan(event.tool)}${dim(argStr)}`;
    }
    case 'stale_warning':
      return yellow(`[warning] ${event.reason}: ${Math.round(event.silence_ms / 1000)}s silent`);
    default:
      return null;
  }
}

export type InlineIndicatorPhase = 'thinking' | 'text' | null;

export function formatEventInlineDebounced(
  event: TimelineEvent,
  activePhase: InlineIndicatorPhase,
): { line: string | null; nextPhase: InlineIndicatorPhase } {
  if (event.type === 'thinking' || event.type === 'text') {
    if (activePhase === event.type) {
      return { line: null, nextPhase: activePhase };
    }

    return { line: formatEventInline(event), nextPhase: event.type };
  }

  return {
    line: formatEventInline(event),
    nextPhase: null,
  };
}