// src/cli/feed.ts
/**
 * Feed v2: unified chronological timeline for specialists jobs.
 *
 * Usage:
 *   specialists|sp feed [options]
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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  type TimelineEvent,
  isRunCompleteEvent,
} from '../specialist/timeline-events.js';
import {
  readAllJobEvents,
  queryTimeline,
} from '../specialist/timeline-query.js';
import {
  dim,
  JobColorMap,
  formatEventLine,
} from './format-helpers.js';

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

function getHumanEventKey(event: TimelineEvent): string {
  switch (event.type) {
    case 'meta':
      return `meta:${event.backend}:${event.model}`;
    case 'tool':
      return `tool:${event.tool}:${event.phase}:${event.is_error ? 'error' : 'ok'}`;
    case 'text':
      return 'text';
    case 'thinking':
      return 'thinking';
    case 'message':
      return `message:${event.role}:${event.phase}`;
    case 'turn':
      return `turn:${event.phase}`;
    case 'run_start':
      return `run_start:${event.specialist}:${event.bead_id ?? ''}`;
    case 'run_complete':
      return `run_complete:${event.status}:${event.error ?? ''}`;
    case 'done':
    case 'agent_end':
      return `complete:${event.type}`;
    default:
      return (event as any).type;
  }
}

function shouldSkipHumanEvent(
  event: TimelineEvent,
  jobId: string,
  lastPrintedEventKey: Map<string, string>,
  seenMetaKey: Map<string, string>
): boolean {
  if (event.type === 'meta') {
    const metaKey = `${event.backend}:${event.model}`;
    if (seenMetaKey.get(jobId) === metaKey) return true;
    seenMetaKey.set(jobId, metaKey);
  }

  const key = getHumanEventKey(event);
  if (lastPrintedEventKey.get(jobId) === key) return true;
  lastPrintedEventKey.set(jobId, key);
  return false;
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
  const colorMap = new JobColorMap();

  if (options.json) {
    for (const { jobId, specialist, beadId, event } of merged) {
      console.log(JSON.stringify({ jobId, specialist, beadId, ...event }));
    }
    return;
  }

  const lastPrintedEventKey = new Map<string, string>();
  const seenMetaKey = new Map<string, string>();

  for (const { jobId, specialist, beadId, event } of merged) {
    if (shouldSkipHumanEvent(event, jobId, lastPrintedEventKey, seenMetaKey)) continue;
    const colorize = colorMap.get(jobId);
    console.log(formatEventLine(event, { jobId, specialist, beadId, colorize }));
  }
}

// ============================================================================
// Follow Mode
// ============================================================================

type MergedEvent = { jobId: string; specialist: string; beadId?: string; event: TimelineEvent };

function isCompletionEvent(event: TimelineEvent): boolean {
  return isRunCompleteEvent(event) || event.type === 'done' || event.type === 'agent_end';
}

async function followMerged(jobsDir: string, options: FeedOptions): Promise<void> {
  const colorMap = new JobColorMap();

  // Track last seen timestamp per job
  const lastSeenT = new Map<string, number>();
  const completedJobs = new Set<string>();

  const filteredBatches = () => readAllJobEvents(jobsDir)
    .filter((batch) => !options.jobId || batch.jobId === options.jobId)
    .filter((batch) => !options.specialist || batch.specialist === options.specialist);

  // Initial snapshot
  const initial = queryTimeline(jobsDir, {
    jobId: options.jobId,
    specialist: options.specialist,
    since: options.since,
    limit: options.limit,
  });

  printSnapshot(initial, { ...options, json: options.json });

  for (const batch of filteredBatches()) {
    if (batch.events.length > 0) {
      const maxT = Math.max(...batch.events.map((event) => event.t));
      lastSeenT.set(batch.jobId, maxT);
    }

    if (batch.events.some(isCompletionEvent)) {
      completedJobs.add(batch.jobId);
    }
  }

  // Check if all jobs are complete (exit early if not forever)
  const initialBatchCount = filteredBatches().length;
  if (!options.forever && initialBatchCount > 0 && completedJobs.size === initialBatchCount) {
    if (!options.json) {
      process.stderr.write(dim('All jobs complete.\n'));
    }
    return;
  }

  if (!options.json) {
    process.stderr.write(dim('Following... (Ctrl+C to stop)\n'));
  }

  const lastPrintedEventKey = new Map<string, string>();
  const seenMetaKey = new Map<string, string>();

  // Poll for new events
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const batches = filteredBatches();

      // Filter and merge new events
      const newEvents: MergedEvent[] = [];
      for (const batch of batches) {
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
        if (batch.events.some(isCompletionEvent)) {
          completedJobs.add(batch.jobId);
        }
      }

      // Sort and print new events
      newEvents.sort((a, b) => a.event.t - b.event.t);

      for (const { jobId, specialist, beadId, event } of newEvents) {
        if (options.json) {
          console.log(JSON.stringify({ jobId, specialist, beadId, ...event }));
        } else {
          if (shouldSkipHumanEvent(event, jobId, lastPrintedEventKey, seenMetaKey)) continue;
          const colorize = colorMap.get(jobId);
          console.log(formatEventLine(event, { jobId, specialist, beadId, colorize }));
        }
      }

      // Resolve if not forever and all complete
      if (!options.forever && batches.length > 0 && completedJobs.size === batches.length) {
        clearInterval(interval);
        resolve();
      }
    }, 500);
  });
}

// ============================================================================
// Main Entry Point
// ============================================================================

function showUsage(): void {
  console.log(`Usage: specialists feed <job-id> [options]
       specialists feed -f [--forever]

Read background job events.

Modes:
  specialists feed <job-id>        Replay events for one job
  specialists feed <job-id> -f     Follow one job until completion
  specialists feed -f              Follow all jobs globally

Options:
  -f, --follow   Follow live updates
  --forever      Keep following in global mode even when all jobs complete

Examples:
  specialists feed 49adda
  specialists feed 49adda --follow
  specialists feed -f
  specialists feed -f --forever
`);
}

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