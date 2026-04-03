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
 *   --from <n>         Show only events with seq >= n
 *   --limit <n>        Max recent events to show (default: 100)
 *   --follow, -f       Live follow mode (append new events at bottom)
 *   --forever          Stay open even when all jobs complete
 *   --json             Output as NDJSON
 */

import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  type TimelineEvent,
  isRunCompleteEvent,
  parseTimelineEvent,
} from '../specialist/timeline-events.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { queryTimeline } from '../specialist/timeline-query.js';
import { formatSpecialistModel } from '../specialist/model-display.js';
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
  from: number;
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
      return `tool:${event.tool}:${event.phase}:${event.tool_call_id ?? event.t}`;
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
    case 'token_usage':
      return `token_usage:${event.token_usage.total_tokens ?? ''}:${event.source}`;
    case 'finish_reason':
      return `finish_reason:${event.finish_reason}:${event.source}`;
    case 'turn_summary':
      return `turn_summary:${event.turn_index}`;
    case 'compaction':
    case 'retry':
      return `${event.type}:${event.phase}`;
    default:
      return (event as any).type;
  }
}

function shouldRenderHumanEvent(event: TimelineEvent): boolean {
  if (event.type === 'message' || event.type === 'turn') return false;

  if (event.type === 'tool') {
    // Show actionable tool activity only:
    // - start: includes arguments (often command/path)
    // - end errors: surfaces failures
    // Hide update and successful end events to reduce noise.
    if (event.phase === 'update') return false;
    if (event.phase === 'end' && !event.is_error) return false;
  }

  return true;
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

  if (event.type === 'tool') {
    // Tool events are often repeated calls to the same tool (e.g. many bash recalls)
    // with different arguments. Keep all of them for full observability.
    return false;
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

// ============================================================================
// Job metadata cache (status.json) — read once per job, merged into JSON envelope
// ============================================================================

interface JobMeta {
  model?: string;
  backend?: string;
  beadId?: string;
  metrics?: Record<string, unknown>;
  startedAtMs: number;
}

const sqliteClient = createObservabilitySqliteClient();

function readFileFresh(filePath: string): string | null {
  try {
    const fd = openSync(filePath, 'r');
    try {
      return readFileSync(fd, 'utf-8');
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

function readStatusJson(jobsDir: string, jobId: string): Record<string, unknown> | null {
  try {
    const sqliteStatus = sqliteClient?.readStatus(jobId);
    if (sqliteStatus) return sqliteStatus as unknown as Record<string, unknown>;
  } catch {
    // fallback to status.json
  }

  const statusPath = join(jobsDir, jobId, 'status.json');
  const raw = readFileFresh(statusPath);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTerminalJobStatus(jobsDir: string, jobId: string): boolean {
  const status = readStatusJson(jobsDir, jobId);
  return status?.status === 'done' || status?.status === 'error';
}

function readJobMeta(jobsDir: string, jobId: string): JobMeta {
  const status = readStatusJson(jobsDir, jobId);
  if (!status) return { startedAtMs: Date.now() };

  return {
    model: typeof status.model === 'string' ? status.model : undefined,
    backend: typeof status.backend === 'string' ? status.backend : undefined,
    beadId: typeof status.bead_id === 'string' ? status.bead_id : undefined,
    metrics: typeof status.metrics === 'object' && status.metrics !== null
      ? status.metrics as Record<string, unknown>
      : undefined,
    startedAtMs: typeof status.started_at_ms === 'number' ? status.started_at_ms : Date.now(),
  };
}

function makeJobMetaReader(
  jobsDir: string,
  options: { useCache?: boolean } = {}
): (jobId: string) => JobMeta {
  const useCache = options.useCache ?? true;
  if (!useCache) {
    return (jobId: string): JobMeta => readJobMeta(jobsDir, jobId);
  }

  const cache = new Map<string, JobMeta>();
  return (jobId: string): JobMeta => {
    const cached = cache.get(jobId);
    if (cached) return cached;

    const meta = readJobMeta(jobsDir, jobId);
    cache.set(jobId, meta);
    return meta;
  };
}

function parseArgs(argv: string[]): FeedOptions {
  let jobId: string | undefined;
  let specialist: string | undefined;
  let since: number | undefined;
  let from = 0;
  let limit = 100;
  let follow = false;
  let forever = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--job' && argv[i + 1]) { jobId = argv[++i]; continue; }
    if (argv[i] === '--specialist' && argv[i + 1]) { specialist = argv[++i]; continue; }
    if (argv[i] === '--since' && argv[i + 1]) { since = parseSince(argv[++i]); continue; }
    if (argv[i] === '--from' && argv[i + 1]) {
      const parsedFrom = parseInt(argv[++i], 10);
      from = Number.isFinite(parsedFrom) && parsedFrom >= 0 ? parsedFrom : 0;
      continue;
    }
    if (argv[i] === '--limit' && argv[i + 1]) { limit = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--follow' || argv[i] === '-f') { follow = true; continue; }
    if (argv[i] === '--forever') { forever = true; continue; }
    if (argv[i] === '--json') { json = true; continue; }
    if (!jobId && !argv[i].startsWith('--')) jobId = argv[i];
  }

  return { jobId, specialist, since, from, limit, follow, forever, json };
}

// ============================================================================
// Snapshot Mode
// ============================================================================

function printSnapshot(
  merged: Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }>,
  options: FeedOptions,
  jobsDir?: string
): void {
  if (merged.length === 0) {
    if (!options.json) console.log(dim('No events found.'));
    return;
  }

  // Build color map for jobs
  const colorMap = new JobColorMap();

  if (options.json) {
    const getJobMeta = jobsDir ? makeJobMetaReader(jobsDir) : (): JobMeta => ({ startedAtMs: Date.now() });
    for (const { jobId, specialist, beadId, event } of merged) {
      const meta = getJobMeta(jobId);
      const model = meta.model ?? (event.type === 'meta' ? event.model : undefined);
      const backend = meta.backend ?? (event.type === 'meta' ? event.backend : undefined);
      console.log(JSON.stringify({
        jobId,
        specialist,
        specialist_model: formatSpecialistModel(specialist, model),
        model,
        backend,
        beadId: meta.beadId ?? beadId,
        metrics: meta.metrics,
        elapsed_ms: Date.now() - meta.startedAtMs,
        ...event,
      }));
    }
    return;
  }

  const lastPrintedEventKey = new Map<string, string>();
  const seenMetaKey = new Map<string, string>();
  const getJobMeta = jobsDir ? makeJobMetaReader(jobsDir) : (): JobMeta => ({ startedAtMs: Date.now() });

  for (const { jobId, specialist, beadId, event } of merged) {
    if (!shouldRenderHumanEvent(event)) continue;
    if (shouldSkipHumanEvent(event, jobId, lastPrintedEventKey, seenMetaKey)) continue;
    const colorize = colorMap.get(jobId);
    const meta = getJobMeta(jobId);
    const specialistDisplay = formatSpecialistModel(specialist, meta.model ?? (event.type === 'meta' ? event.model : undefined));
    console.log(formatEventLine(event, { jobId, specialist: specialistDisplay, beadId, colorize }));
  }
}

// ============================================================================
// Follow Mode
// ============================================================================

type MergedEvent = { jobId: string; specialist: string; beadId?: string; event: TimelineEvent };

function isCompletionEvent(event: TimelineEvent): boolean {
  return isRunCompleteEvent(event);
}

function isEventAtOrAfterCursor(event: TimelineEvent, from: number): boolean {
  if (from <= 0) return true;

  const seq = (event as { seq?: unknown }).seq;
  if (typeof seq !== 'number') return true;
  return seq >= from;
}

function filterMergedEventsByCursor(
  merged: Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }>,
  from: number
): Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }> {
  if (from <= 0) return merged;
  return merged.filter(({ event }) => isEventAtOrAfterCursor(event, from));
}

function listMatchingJobIds(jobsDir: string, options: FeedOptions): string[] {
  if (!existsSync(jobsDir)) return [];

  const jobIds: string[] = [];
  for (const entry of readdirSync(jobsDir)) {
    const jobDir = join(jobsDir, entry);

    try {
      if (!statSync(jobDir).isDirectory()) continue;
    } catch {
      continue;
    }

    if (options.jobId && entry !== options.jobId) continue;

    if (options.specialist) {
      const status = readStatusJson(jobsDir, entry);
      const specialist = typeof status?.specialist === 'string' ? status.specialist : undefined;
      if (specialist !== options.specialist) continue;
    }

    jobIds.push(entry);
  }

  return jobIds;
}

function readJobEventsFresh(jobsDir: string, jobId: string): TimelineEvent[] {
  try {
    const sqliteEvents = sqliteClient?.readEvents(jobId) ?? [];
    if (sqliteEvents.length > 0) {
      sqliteEvents.sort((a, b) => a.t - b.t);
      return sqliteEvents;
    }
  } catch {
    // fallback to events.jsonl
  }

  const eventsPath = join(jobsDir, jobId, 'events.jsonl');
  const content = readFileFresh(eventsPath);
  if (!content) return [];

  const events: TimelineEvent[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const parsed = parseTimelineEvent(line);
    if (parsed) events.push(parsed);
  }

  events.sort((a, b) => a.t - b.t);
  return events;
}

function readFilteredBatchesFresh(
  jobsDir: string,
  options: FeedOptions
): Array<{ jobId: string; specialist: string; beadId?: string; events: TimelineEvent[] }> {
  const batches: Array<{ jobId: string; specialist: string; beadId?: string; events: TimelineEvent[] }> = [];

  for (const jobId of listMatchingJobIds(jobsDir, options)) {
    const status = readStatusJson(jobsDir, jobId);
    const specialist = typeof status?.specialist === 'string' ? status.specialist : 'unknown';
    const beadId = typeof status?.bead_id === 'string' ? status.bead_id : undefined;
    const events = readJobEventsFresh(jobsDir, jobId);
    if (events.length === 0) continue;
    batches.push({ jobId, specialist, beadId, events });
  }

  return batches;
}

async function followMerged(jobsDir: string, options: FeedOptions): Promise<void> {
  const colorMap = new JobColorMap();
  const getJobMeta = makeJobMetaReader(jobsDir, { useCache: false });

  // Track last seen timestamp per job
  const lastSeenT = new Map<string, number>();
  const initialMatchingJobIds = listMatchingJobIds(jobsDir, options);
  const hasInitialMatchingJobs = initialMatchingJobIds.length > 0;
  const trackedJobs = new Set<string>(
    initialMatchingJobIds.filter((jobId) => !isTerminalJobStatus(jobsDir, jobId))
  );
  const completedJobs = new Set<string>();

  const filteredBatches = () => readFilteredBatchesFresh(jobsDir, options);

  // Initial snapshot
  const initial = filterMergedEventsByCursor(queryTimeline(jobsDir, {
    jobId: options.jobId,
    specialist: options.specialist,
    since: options.since,
    limit: options.limit,
  }), options.from);

  printSnapshot(initial, { ...options, json: options.json }, jobsDir);

  for (const batch of filteredBatches()) {
    if (batch.events.length > 0) {
      const maxT = Math.max(...batch.events.map((event) => event.t));
      lastSeenT.set(batch.jobId, maxT);
    }

    if (trackedJobs.has(batch.jobId) && batch.events.some(isCompletionEvent)) {
      completedJobs.add(batch.jobId);
    }
  }

  // Exit early only when there are no active jobs at follow start.
  if (!options.forever && trackedJobs.size === 0) {
    if (!options.json) {
      const message = hasInitialMatchingJobs ? 'All jobs complete.\n' : 'No jobs found.\n';
      process.stderr.write(dim(message));
    }
    return;
  }

  // If all tracked jobs already completed during the initial snapshot/seed pass,
  // there is nothing left to follow.
  if (!options.forever && hasInitialMatchingJobs && trackedJobs.size > 0 && completedJobs.size === trackedJobs.size) {
    if (!options.json) {
      process.stderr.write('All jobs complete.\n');
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
      for (const jobId of listMatchingJobIds(jobsDir, options)) {
        if (!isTerminalJobStatus(jobsDir, jobId)) {
          trackedJobs.add(jobId);
        }
      }
      for (const jobId of trackedJobs) {
        if (isTerminalJobStatus(jobsDir, jobId)) {
          completedJobs.add(jobId);
        }
      }

      // Filter and merge new events
      const newEvents: MergedEvent[] = [];
      for (const batch of batches) {
        const lastT = lastSeenT.get(batch.jobId) ?? 0;
        for (const event of batch.events) {
          if (event.t > lastT && isEventAtOrAfterCursor(event, options.from)) {
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

        // Check completion for jobs that were active during follow.
        if (trackedJobs.has(batch.jobId) && (batch.events.some(isCompletionEvent) || isTerminalJobStatus(jobsDir, batch.jobId))) {
          completedJobs.add(batch.jobId);
        }
      }

      // Sort and print new events
      newEvents.sort((a, b) => a.event.t - b.event.t);

      for (const { jobId, specialist, beadId, event } of newEvents) {
        const meta = getJobMeta(jobId);
        const model = meta.model ?? (event.type === 'meta' ? event.model : undefined);
        const backend = meta.backend ?? (event.type === 'meta' ? event.backend : undefined);

        if (options.json) {
          console.log(JSON.stringify({
            jobId,
            specialist,
            specialist_model: formatSpecialistModel(specialist, model),
            model,
            backend,
            beadId: meta.beadId ?? beadId,
            metrics: meta.metrics,
            elapsed_ms: Date.now() - meta.startedAtMs,
            ...event,
          }));
        } else {
          if (!shouldRenderHumanEvent(event)) continue;
          if (shouldSkipHumanEvent(event, jobId, lastPrintedEventKey, seenMetaKey)) continue;
          const colorize = colorMap.get(jobId);
          const specialistDisplay = formatSpecialistModel(specialist, model);
          console.log(formatEventLine(event, { jobId, specialist: specialistDisplay, beadId, colorize }));
        }
      }

      // Resolve if not forever and all tracked jobs are complete.
      if (!options.forever && trackedJobs.size > 0 && completedJobs.size === trackedJobs.size) {
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
  specialists feed <job-id>        Show recent events for one job
  specialists feed <job-id> -f     Follow one job until completion
  specialists feed -f              Follow all jobs globally

Options:
  --from <n>     Show only events with seq >= <n>
  -f, --follow   Follow live updates
  --forever      Keep following in global mode even when all jobs complete

Examples:
  specialists feed 49adda
  specialists feed 49adda --from 15
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

  if (options.from > 0 && !options.json) {
    console.log(dim(`Showing events from seq ${options.from}`));
  }

  if (options.follow) {
    await followMerged(jobsDir, options);
    return;
  }

  // Snapshot mode
  const merged = filterMergedEventsByCursor(queryTimeline(jobsDir, {
    jobId: options.jobId,
    specialist: options.specialist,
    since: options.since,
    limit: options.limit,
  }), options.from);

  printSnapshot(merged, options, jobsDir);
}
