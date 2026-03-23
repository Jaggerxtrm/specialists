// src/cli/feed.ts
/**
 * Feed v2: unified chronological timeline for specialists jobs.
 *
 * Usage:
 *   specialists feed [options]
 *
 * Options:
 *   --job <id>         Filter to a specific job
 *   --specialist <name> Filter by specialist name
 *   --since <timestamp> Start time (ISO 8601 or milliseconds ago like '5m', '1h')
 *   --limit <n>        Max events to show (default: 100)
 *   --follow, -f       Live follow mode (append new events at bottom)
 *   --forever          Stay open even when all jobs complete
 *   --json             Output as NDJSON
 */

import { existsSync, readdirSync, watch, watchFile, unwatchFile } from 'node:fs';
import { join } from 'node:path';
import { Supervisor, type SupervisorStatus } from '../specialist/supervisor.js';
import {
  type TimelineEvent,
  isRunCompleteEvent,
  isToolEvent,
  TIMELINE_EVENT_TYPES,
} from '../specialist/timeline-events.js';
import {
  readAllJobEvents,
  queryTimeline,
  getRecentEvents,
  type JobEventsBatch,
} from '../specialist/timeline-query.js';

// ============================================================================
// ANSI Formatting
// ============================================================================

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

type Colorizer = (s: string) => string;
const COLORS: Colorizer[] = [cyan, yellow, magenta, green, blue, red];

// ============================================================================
// Event Formatting
// ============================================================================

const EVENT_LABELS: Record<string, string> = {
  run_start: 'START',
  meta: 'META',
  thinking: 'THINK',
  tool: 'TOOL',
  text: 'TEXT',
  run_complete: 'DONE',
};

function formatTimestamp(t: number): string {
  return new Date(t).toISOString().slice(11, 19);
}

function formatLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.slice(0, 5).toUpperCase();
}

function formatEventCompact(event: TimelineEvent, colorize: Colorizer): string {
  const ts = dim(formatTimestamp(event.t));
  const label = formatLabel(event.type).padEnd(5);

  let detail = '';
  if (event.type === 'meta') {
    detail = `${event.model} ${dim(event.backend)}`;
  } else if (event.type === 'tool') {
    detail = event.tool + (event.phase === 'end' ? dim(' ✓') : '');
  } else if (event.type === 'run_complete') {
    detail = `${event.status} ${dim(`${event.elapsed_s}s`)}`;
    if (event.error) detail += ` ${red(event.error)}`;
  }

  return `${ts} ${colorize(bold(label))} ${detail}`;
}

// ============================================================================
// CLI Options
// ============================================================================

interface FeedOptions {
  jobId?: string;
  specialist?: string;
  since?: number;
  limit: number;
  follow: boolean;
  forever: boolean;
  json: boolean;
}

function parseSince(value: string): number | undefined {
  // ISO 8601 timestamp
  if (value.includes('T') || value.includes('-')) {
    return new Date(value).getTime();
  }
  // Relative time like '5m', '1h', '30s'
  const match = value.match(/^(\d+)([smhd])$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return Date.now() - num * multipliers[unit];
  }
  return undefined;
}

function parseArgs(argv: string[]): FeedOptions {
  let jobId: string | undefined;
  let specialist: string | undefined;
  let since: number | undefined;
  let limit = 100;
  let follow = false;
  let forever = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--job' && argv[i + 1]) { jobId = argv[++i]; continue; }
    if (argv[i] === '--specialist' && argv[i + 1]) { specialist = argv[++i]; continue; }
    if (argv[i] === '--since' && argv[i + 1]) { since = parseSince(argv[++i]); continue; }
    if (argv[i] === '--limit' && argv[i + 1]) { limit = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--follow' || argv[i] === '-f') { follow = true; continue; }
    if (argv[i] === '--forever') { forever = true; continue; }
    if (argv[i] === '--json') { json = true; continue; }
    if (!jobId && !argv[i].startsWith('--')) jobId = argv[i];
  }

  return { jobId, specialist, since, limit, follow, forever, json };
}

// ============================================================================
// Snapshot Mode
// ============================================================================

function printSnapshot(
  merged: Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }>,
  options: FeedOptions
): void {
  if (merged.length === 0) {
    if (!options.json) console.log(dim('No events found.'));
    return;
  }

  // Build color map for jobs
  const jobColors = new Map<string, Colorizer>();
  let colorIdx = 0;
  for (const { jobId } of merged) {
    if (!jobColors.has(jobId)) {
      jobColors.set(jobId, COLORS[colorIdx % COLORS.length]);
      colorIdx++;
    }
  }

  if (options.json) {
    for (const { jobId, specialist, beadId, event } of merged) {
      console.log(JSON.stringify({ jobId, specialist, beadId, ...event }));
    }
    return;
  }

  // Compact format
  for (const { jobId, event } of merged) {
    const colorize = jobColors.get(jobId) ?? dim;
    console.log(formatEventCompact(event, colorize));
  }
}

// ============================================================================
// Follow Mode
// ============================================================================

type MergedEvent = { jobId: string; specialist: string; beadId?: string; event: TimelineEvent };

async function followMerged(jobsDir: string, options: FeedOptions): Promise<void> {
  const jobColors = new Map<string, Colorizer>();
  let colorIdx = 0;
  const getColor = (jobId: string): Colorizer => {
    if (!jobColors.has(jobId)) {
      jobColors.set(jobId, COLORS[colorIdx % COLORS.length]);
      colorIdx++;
    }
    return jobColors.get(jobId)!;
  };

  // Track last seen timestamp per job
  const lastSeenT = new Map<string, number>();
  const completedJobs = new Set<string>();

  // Initial snapshot
  const initial = queryTimeline(jobsDir, {
    jobId: options.jobId,
    specialist: options.specialist,
    since: options.since,
    limit: options.limit,
  });

  printSnapshot(initial, { ...options, json: options.json });

  // Track last timestamp per job
  for (const { jobId, event } of initial) {
    lastSeenT.set(jobId, event.t);
  }

  // Check if all jobs are complete (exit early if not forever)
  if (initial.length > 0) {
    const allComplete = initial.every(({ event }) => isRunCompleteEvent(event));
    if (!options.forever && allComplete) {
      if (!options.json) {
        process.stderr.write(dim('All jobs complete.\n'));
      }
      return;
    }
  }

  if (!options.json) {
    process.stderr.write(dim('Following... (Ctrl+C to stop)\n'));
  }

  // Poll for new events
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const batches = readAllJobEvents(jobsDir);

      // Filter and merge new events
      const newEvents: MergedEvent[] = [];
      for (const batch of batches) {
        if (options.jobId && batch.jobId !== options.jobId) continue;
        if (options.specialist && batch.specialist !== options.specialist) continue;
        if (completedJobs.has(batch.jobId)) continue;

        const lastT = lastSeenT.get(batch.jobId) ?? 0;
        for (const event of batch.events) {
          if (event.t > lastT) {
            newEvents.push({
              jobId: batch.jobId,
              specialist: batch.specialist,
              beadId: batch.beadId,
              event,
            });
          }
        }

        // Update last seen
        if (batch.events.length > 0) {
          const maxT = Math.max(...batch.events.map((e) => e.t));
          lastSeenT.set(batch.jobId, maxT);
        }

        // Check completion
        if (batch.events.some((e) => e.type === 'run_complete')) {
          completedJobs.add(batch.jobId);
        }
      }

      // Sort and print new events
      newEvents.sort((a, b) => a.event.t - b.event.t);

      for (const { jobId, event } of newEvents) {
        if (options.json) {
          console.log(JSON.stringify({ jobId, event }));
        } else {
          const colorize = getColor(jobId);
          console.log(formatEventCompact(event, colorize));
        }
      }

      // Resolve if not forever and all complete
      if (!options.forever && completedJobs.size === batches.length && batches.length > 0) {
        clearInterval(interval);
        resolve();
      }
    }, 500);
  });
}

// ============================================================================
// Main Entry Point
// ============================================================================

export async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(3));
  const jobsDir = join(process.cwd(), '.specialists', 'jobs');

  if (!existsSync(jobsDir)) {
    console.log(dim('No jobs directory found.'));
    return;
  }

  if (options.follow) {
    await followMerged(jobsDir, options);
    return;
  }

  // Snapshot mode
  const merged = queryTimeline(jobsDir, {
    jobId: options.jobId,
    specialist: options.specialist,
    since: options.since,
    limit: options.limit,
  });

  printSnapshot(merged, options);
}