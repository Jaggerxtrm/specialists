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
 *   --node <node-ref>  Filter by node id (unique prefix allowed)
 *   --since <timestamp> Start time (ISO 8601 or milliseconds ago like '5m', '1h')
 *   --from <job:seq>   Show only events at/after cursor tuple (job_id:seq)
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
import { resolveNodeRefWithClient } from '../specialist/node-resolve.js';
import { queryTimeline } from '../specialist/timeline-query.js';
import { formatSpecialistModel } from '../specialist/model-display.js';
import {
  bold,
  dim,
  magenta,
  JobColorMap,
  formatEventLine,
} from './format-helpers.js';

// ============================================================================
// CLI Options
// ============================================================================

interface FeedCursor {
  jobId: string;
  seq: number;
}

interface FeedOptions {
  jobId?: string;
  nodeId?: string;
  specialist?: string;
  since?: number;
  from?: FeedCursor;
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
    case 'status_change':
      return `status_change:${event.previous_status ?? ''}:${event.status}`;
    case 'run_start':
      return `run_start:${event.specialist}:${event.bead_id ?? ''}`;
    case 'run_complete':
      return `run_complete:${event.status}:${event.error ?? ''}`;
    case 'error':
      return `error:${event.source}:${event.error_message}`;
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

function isWaitingStatusChangeEvent(event: TimelineEvent): event is Extract<TimelineEvent, { type: 'status_change' }> {
  return event.type === 'status_change' && event.status === 'waiting';
}

function formatWaitingBanner(jobId: string, specialist: string): string {
  const prefix = magenta(bold('WAIT'));
  return `${prefix} ${specialist} (${jobId}) is waiting for input. Use: specialists resume ${jobId} "..."`;
}

function formatStartupContextLine(event: TimelineEvent): string | null {
  if (event.type === 'run_start') {
    const snapshot = event.startup_snapshot;
    if (!snapshot) return null;

    const parts: string[] = [];
    if (snapshot.job_id) parts.push(`job=${snapshot.job_id}`);
    if (snapshot.specialist_name) parts.push(`specialist=${snapshot.specialist_name}`);
    if (snapshot.bead_id) parts.push(`bead=${snapshot.bead_id}`);
    if (snapshot.reused_from_job_id) parts.push(`reused=${snapshot.reused_from_job_id}`);
    if (snapshot.worktree_owner_job_id) parts.push(`owner=${snapshot.worktree_owner_job_id}`);
    if (snapshot.chain_id) parts.push(`chain=${snapshot.chain_id}`);
    if (snapshot.chain_root_job_id) parts.push(`chain_root_job=${snapshot.chain_root_job_id}`);
    if (snapshot.chain_root_bead_id) parts.push(`chain_root_bead=${snapshot.chain_root_bead_id}`);
    if (snapshot.worktree_path) parts.push(`worktree=${snapshot.worktree_path}`);
    if (snapshot.branch) parts.push(`branch=${snapshot.branch}`);
    if (snapshot.variables_keys) parts.push(`vars=[${snapshot.variables_keys.join(',')}]`);
    if (snapshot.reviewed_job_id_present !== undefined) parts.push(`reviewed_present=${snapshot.reviewed_job_id_present}`);
    if (snapshot.reused_worktree_awareness_present !== undefined) parts.push(`reuse_awareness_present=${snapshot.reused_worktree_awareness_present}`);
    if (snapshot.bead_context_present !== undefined) parts.push(`bead_context_present=${snapshot.bead_context_present}`);
    if (snapshot.skills) parts.push(`skills=${snapshot.skills.count}`);

    return parts.length > 0 ? dim(`  ↳ startup ${parts.join(' ')}`) : null;
  }

  if (event.type === 'meta' && event.memory_injection) {
    const mem = event.memory_injection;
    return dim(
      `  ↳ memory static=${mem.static_tokens} dynamic=${mem.memory_tokens} gitnexus=${mem.gitnexus_tokens} total=${mem.total_tokens}`,
    );
  }

  return null;
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

function parseCursor(value: string, defaultJobId?: string): FeedCursor | undefined {
  const tupleMatch = value.match(/^([^:]+):(\d+)$/);
  if (tupleMatch) {
    return { jobId: tupleMatch[1], seq: Number(tupleMatch[2]) };
  }

  const seq = Number(value);
  if (!Number.isFinite(seq) || seq < 0 || !defaultJobId) return undefined;
  return { jobId: defaultJobId, seq };
}

// ============================================================================
// Job metadata cache (status.json) — read once per job, merged into JSON envelope
// ============================================================================

interface JobMeta {
  model?: string;
  backend?: string;
  beadId?: string;
  nodeId?: string;
  metrics?: Record<string, unknown>;
  contextPct?: number;
  startedAtMs: number;
}

type ObservabilitySqliteClient = ReturnType<typeof createObservabilitySqliteClient>;

function readFileFresh(filePath: string): string | null {
  let fd: number | null = null;

  try {
    fd = openSync(filePath, 'r');
    return readFileSync(fd, 'utf-8');
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      closeSync(fd);
    }
  }
}

function readStatusJson(
  sqliteClient: ObservabilitySqliteClient,
  jobsDir: string,
  jobId: string
): Record<string, unknown> | null {
  try {
    const sqliteStatus = sqliteClient?.readStatus(jobId);
    if (sqliteStatus) return sqliteStatus as unknown as Record<string, unknown>;
  } catch (error) {
    console.warn(`SQLite status read failed for job ${jobId}; falling back to status.json`, error);
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


function isTerminalJobStatus(
  sqliteClient: ObservabilitySqliteClient,
  jobsDir: string,
  jobId: string
): boolean {
  const status = readStatusJson(sqliteClient, jobsDir, jobId);
  return status?.status === 'done' || status?.status === 'error' || status?.status === 'cancelled';
}

function isKeepAliveJobStatus(status: Record<string, unknown> | null): boolean {
  return status?.status === 'waiting';
}

function isJobCompleteForFollow(
  sqliteClient: ObservabilitySqliteClient,
  jobsDir: string,
  jobId: string,
  events: TimelineEvent[]
): boolean {
  const status = readStatusJson(sqliteClient, jobsDir, jobId);

  // Keep-alive jobs emit run_complete at the end of each turn, so only terminal
  // status transitions should close follow mode for them.
  if (isKeepAliveJobStatus(status)) {
    return false;
  }

  // Single-turn jobs emit one terminal run_complete event.
  if (events.some(isRunCompleteEvent)) {
    return true;
  }

  return status?.status === 'done' || status?.status === 'error' || status?.status === 'cancelled';
}

function readJobMeta(
  sqliteClient: ObservabilitySqliteClient,
  jobsDir: string,
  jobId: string
): JobMeta {
  const status = readStatusJson(sqliteClient, jobsDir, jobId);
  if (!status) return { startedAtMs: Date.now() };

  const rawContextPct = status.context_pct;
  const contextPct = typeof rawContextPct === 'number'
    ? rawContextPct
    : (typeof rawContextPct === 'string' ? Number(rawContextPct) : undefined);

  return {
    model: typeof status.model === 'string' ? status.model : undefined,
    backend: typeof status.backend === 'string' ? status.backend : undefined,
    beadId: typeof status.bead_id === 'string' ? status.bead_id : undefined,
    nodeId: typeof status.node_id === 'string' && status.node_id.trim() !== '' ? status.node_id : undefined,
    metrics: typeof status.metrics === 'object' && status.metrics !== null
      ? status.metrics as Record<string, unknown>
      : undefined,
    contextPct: Number.isFinite(contextPct) ? contextPct : undefined,
    startedAtMs: typeof status.started_at_ms === 'number' ? status.started_at_ms : Date.now(),
  };
}

function makeJobMetaReader(
  sqliteClient: ObservabilitySqliteClient,
  jobsDir: string,
  options: { useCache?: boolean } = {}
): (jobId: string) => JobMeta {
  const useCache = options.useCache ?? true;
  if (!useCache) {
    return (jobId: string): JobMeta => readJobMeta(sqliteClient, jobsDir, jobId);
  }

  const cache = new Map<string, JobMeta>();
  return (jobId: string): JobMeta => {
    const cached = cache.get(jobId);
    if (cached) return cached;

    const meta = readJobMeta(sqliteClient, jobsDir, jobId);
    cache.set(jobId, meta);
    return meta;
  };
}

function parseArgs(argv: string[]): FeedOptions {
  let jobId: string | undefined;
  let specialist: string | undefined;
  let nodeId: string | undefined;
  let since: number | undefined;
  let fromRaw: string | undefined;
  let limit = 100;
  let follow = false;
  let forever = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--job' && argv[i + 1]) { jobId = argv[++i]; continue; }
    if (argv[i] === '--specialist' && argv[i + 1]) { specialist = argv[++i]; continue; }
    if (argv[i] === '--node' && argv[i + 1]) { nodeId = argv[++i]; continue; }
    if (argv[i] === '--since' && argv[i + 1]) { since = parseSince(argv[++i]); continue; }
    if (argv[i] === '--from' && argv[i + 1]) {
      fromRaw = argv[++i];
      continue;
    }
    if (argv[i] === '--limit' && argv[i + 1]) { limit = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--follow' || argv[i] === '-f') { follow = true; continue; }
    if (argv[i] === '--forever') { forever = true; continue; }
    if (argv[i] === '--json') { json = true; continue; }
    if (!jobId && !argv[i].startsWith('--')) jobId = argv[i];
  }

  return {
    jobId,
    specialist,
    nodeId,
    since,
    from: fromRaw ? parseCursor(fromRaw, jobId) : undefined,
    limit,
    follow,
    forever,
    json,
  };
}

// ============================================================================
// Snapshot Mode
// ============================================================================

function printSnapshot(
  sqliteClient: ObservabilitySqliteClient,
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
    const getJobMeta = jobsDir
      ? makeJobMetaReader(sqliteClient, jobsDir)
      : (): JobMeta => ({ startedAtMs: Date.now() });
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
  const getJobMeta = jobsDir
    ? makeJobMetaReader(sqliteClient, jobsDir)
    : (): JobMeta => ({ startedAtMs: Date.now() });

  for (const { jobId, specialist, beadId, event } of merged) {
    if (!shouldRenderHumanEvent(event)) continue;
    if (shouldSkipHumanEvent(event, jobId, lastPrintedEventKey, seenMetaKey)) continue;
    const colorize = colorMap.get(jobId);
    const meta = getJobMeta(jobId);
    const specialistDisplay = formatSpecialistModel(specialist, meta.model ?? (event.type === 'meta' ? event.model : undefined));

    if (isWaitingStatusChangeEvent(event)) {
      console.log(formatWaitingBanner(jobId, specialistDisplay));
      continue;
    }

    console.log(formatEventLine(event, {
      jobId,
      specialist: specialistDisplay,
      beadId,
      nodeId: meta.nodeId,
      contextPct: meta.contextPct,
      colorize,
    }));

    const startupContextLine = formatStartupContextLine(event);
    if (startupContextLine) console.log(startupContextLine);
  }
}

// ============================================================================
// Follow Mode
// ============================================================================

type MergedEvent = { jobId: string; specialist: string; beadId?: string; event: TimelineEvent };

function compareMergedEvents(a: MergedEvent, b: MergedEvent): number {
  const timeDiff = a.event.t - b.event.t;
  if (timeDiff !== 0) return timeDiff;
  const jobDiff = a.jobId.localeCompare(b.jobId);
  if (jobDiff !== 0) return jobDiff;
  return (a.event.seq ?? 0) - (b.event.seq ?? 0);
}

function isEventAtOrAfterCursor(jobId: string, event: TimelineEvent, from?: FeedCursor): boolean {
  if (!from) return true;
  if (jobId !== from.jobId) return false;

  const seq = event.seq;
  if (typeof seq !== 'number') {
    return false;
  }

  return seq >= from.seq;
}

function filterMergedEventsByCursor(
  merged: Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }>,
  from?: FeedCursor
): Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }> {
  if (!from) return merged;
  return merged.filter(({ jobId, event }) => isEventAtOrAfterCursor(jobId, event, from));
}

function filterMergedEventsByNode(
  sqliteClient: ObservabilitySqliteClient,
  jobsDir: string,
  merged: Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }>,
  nodeId?: string,
): Array<{ jobId: string; specialist: string; beadId?: string; event: TimelineEvent }> {
  if (!nodeId) return merged;

  return merged.filter(({ jobId }) => {
    const status = readStatusJson(sqliteClient, jobsDir, jobId);
    return typeof status?.node_id === 'string' && status.node_id === nodeId;
  });
}

function listMatchingJobIds(
  sqliteClient: ObservabilitySqliteClient,
  jobsDir: string,
  options: FeedOptions
): string[] {
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

    const status = readStatusJson(sqliteClient, jobsDir, entry);

    if (options.nodeId) {
      const currentNodeId = typeof status?.node_id === 'string' ? status.node_id : '';
      if (currentNodeId !== options.nodeId) continue;
    }

    if (options.specialist) {
      const specialist = typeof status?.specialist === 'string' ? status.specialist : undefined;
      if (specialist !== options.specialist) continue;
    }

    jobIds.push(entry);
  }

  return jobIds;
}

function readJobEventsFresh(
  sqliteClient: ObservabilitySqliteClient,
  jobsDir: string,
  jobId: string
): TimelineEvent[] {
  try {
    const sqliteEvents = sqliteClient?.readEvents(jobId) ?? [];
    if (sqliteEvents.length > 0) {
      sqliteEvents.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.t - b.t);
      return sqliteEvents;
    }
  } catch (error) {
    console.warn(`SQLite events read failed for job ${jobId}; falling back to events.jsonl`, error);
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

  events.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.t - b.t);
  return events;
}

function readFilteredBatchesFresh(
  sqliteClient: ObservabilitySqliteClient,
  jobsDir: string,
  options: FeedOptions
): Array<{ jobId: string; specialist: string; beadId?: string; events: TimelineEvent[] }> {
  const batches: Array<{ jobId: string; specialist: string; beadId?: string; events: TimelineEvent[] }> = [];

  for (const jobId of listMatchingJobIds(sqliteClient, jobsDir, options)) {
    const status = readStatusJson(sqliteClient, jobsDir, jobId);
    const specialist = typeof status?.specialist === 'string' ? status.specialist : 'unknown';
    const beadId = typeof status?.bead_id === 'string' ? status.bead_id : undefined;
    const events = readJobEventsFresh(sqliteClient, jobsDir, jobId);
    if (events.length === 0) continue;
    batches.push({ jobId, specialist, beadId, events });
  }

  return batches;
}

async function followMerged(
  sqliteClient: ObservabilitySqliteClient,
  jobsDir: string,
  options: FeedOptions
): Promise<void> {
  const colorMap = new JobColorMap();
  const getJobMeta = makeJobMetaReader(sqliteClient, jobsDir, { useCache: false });

  // Track last seen timestamp per job
  const lastSeenT = new Map<string, number>();
  const initialMatchingJobIds = listMatchingJobIds(sqliteClient, jobsDir, options);
  const hasInitialMatchingJobs = initialMatchingJobIds.length > 0;
  const trackedJobs = new Set<string>(
    initialMatchingJobIds.filter((jobId) => !isTerminalJobStatus(sqliteClient, jobsDir, jobId))
  );
  const completedJobs = new Set<string>();

  const filteredBatches = () => readFilteredBatchesFresh(sqliteClient, jobsDir, options);

  // Initial snapshot
  const initial = filterMergedEventsByCursor(
    filterMergedEventsByNode(
      sqliteClient,
      jobsDir,
      queryTimeline(jobsDir, {
        jobId: options.jobId,
        specialist: options.specialist,
        since: options.since,
        limit: options.limit,
      }),
      options.nodeId,
    ),
    options.from,
  );

  printSnapshot(sqliteClient, initial, { ...options, json: options.json }, jobsDir);

  for (const batch of filteredBatches()) {
    if (batch.events.length > 0) {
      const maxT = Math.max(...batch.events.map((event) => event.t));
      lastSeenT.set(batch.jobId, maxT);
    }

    if (trackedJobs.has(batch.jobId) && isJobCompleteForFollow(sqliteClient, jobsDir, batch.jobId, batch.events)) {
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
      for (const jobId of listMatchingJobIds(sqliteClient, jobsDir, options)) {
        if (!isTerminalJobStatus(sqliteClient, jobsDir, jobId)) {
          trackedJobs.add(jobId);
        }
      }
      for (const jobId of trackedJobs) {
        if (isTerminalJobStatus(sqliteClient, jobsDir, jobId)) {
          completedJobs.add(jobId);
        }
      }

      // Filter and merge new events
      const newEvents: MergedEvent[] = [];
      for (const batch of batches) {
        const lastT = lastSeenT.get(batch.jobId) ?? 0;
        const maxT = batch.events.length > 0
          ? Math.max(...batch.events.map((event) => event.t))
          : null;

        if (maxT !== null) {
          lastSeenT.set(batch.jobId, maxT);
        }

        for (const event of batch.events) {
          if (event.t > lastT && isEventAtOrAfterCursor(batch.jobId, event, options.from)) {
            newEvents.push({
              jobId: batch.jobId,
              specialist: batch.specialist,
              beadId: batch.beadId,
              event,
            });
          }
        }

        // Check completion for jobs that were active during follow.
        if (trackedJobs.has(batch.jobId) && isJobCompleteForFollow(sqliteClient, jobsDir, batch.jobId, batch.events)) {
          completedJobs.add(batch.jobId);
        }
      }

      // Sort and print new events
      newEvents.sort(compareMergedEvents);

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

          if (isWaitingStatusChangeEvent(event)) {
            console.log(formatWaitingBanner(jobId, specialistDisplay));
            continue;
          }

          console.log(formatEventLine(event, {
            jobId,
            specialist: specialistDisplay,
            beadId,
            nodeId: meta.nodeId,
            contextPct: meta.contextPct,
            colorize,
          }));

          const startupContextLine = formatStartupContextLine(event);
          if (startupContextLine) console.log(startupContextLine);
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
  --node <node-ref> Filter jobs by node id
  --from <job:seq> Show only events at/after cursor tuple
  -f, --follow   Follow live updates
  --forever      Keep following in global mode even when all jobs complete

Node refs accept any unique prefix.

Examples:
  specialists feed 49adda
  specialists feed 49adda --from 49adda:15
  specialists feed 49adda --follow
  specialists feed -f
  specialists feed -f --forever
`);
}

export async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(3));
  const sqliteClient = createObservabilitySqliteClient();

  try {
    const jobsDir = join(process.cwd(), '.specialists', 'jobs');

    if (!existsSync(jobsDir)) {
      console.log(dim('No jobs directory found.'));
      return;
    }

    const resolvedOptions = {
      ...options,
      nodeId: options.nodeId && sqliteClient ? resolveNodeRefWithClient(options.nodeId, sqliteClient) : options.nodeId,
    };

    if (resolvedOptions.from && !resolvedOptions.json) {
      console.log(dim(`Showing events from cursor ${resolvedOptions.from.jobId}:${resolvedOptions.from.seq}`));
    }

    if (resolvedOptions.follow) {
      await followMerged(sqliteClient, jobsDir, resolvedOptions);
      return;
    }

    // Snapshot mode
    const merged = filterMergedEventsByCursor(
      filterMergedEventsByNode(
        sqliteClient,
        jobsDir,
        queryTimeline(jobsDir, {
          jobId: resolvedOptions.jobId,
          specialist: resolvedOptions.specialist,
          since: resolvedOptions.since,
          limit: resolvedOptions.limit,
        }),
        resolvedOptions.nodeId,
      ),
      resolvedOptions.from,
    );

    printSnapshot(sqliteClient, merged, resolvedOptions, jobsDir);
  } finally {
    sqliteClient?.close();
  }
}
