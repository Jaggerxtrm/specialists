// src/cli/log.ts
// Runtime-oriented specialist log stream. Unlike feed, this does not suppress
// lifecycle/control rows and always prefixes rows with job/bead/repo/path data.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createObservabilitySqliteClientAtPath } from '../specialist/observability-sqlite.js';
import { resolveObservabilityDbLocation } from '../specialist/observability-db.js';
import type { SupervisorStatus } from '../specialist/supervisor.js';
import type { TimelineEvent } from '../specialist/timeline-events.js';
import { forensicEventFromTimelineEvent, type ForensicEvent } from '../specialist/forensic-events.js';
import { forensicEventToRow, formatRenderedRowColumns, type RenderedRow } from '../specialist/forensic-renderer.js';
import type { ForensicEventRecord, ListForensicEventsFilters } from '../specialist/observability-sqlite.js';
import {
  bold,
  cyan,
  dim,
  formatDateTime,
  formatElapsed,
  formatTokenUsageSummary,
  green,
  red,
  yellow,
  type Colorizer,
} from './format-helpers.js';

interface LogOptions {
  jobId?: string;
  specialist?: string;
  beadId?: string;
  nodeId?: string;
  repo?: string;
  since?: number;
  limit: number;
  follow: boolean;
  json: boolean;
  allEvents: boolean;
  legacy: boolean;
}

const DISPLAY_DUPLICATE_WINDOW_MS = 2000;

const RUNTIME_EVENT_TYPES = new Set<string>([
  'run_start',
  'run_complete',
  'status_change',
  'control_signal',
  'stale_warning',
  'error',
  'extension_error',
  'model_change',
  'retry',
  'compaction',
  'auto_commit_success',
  'auto_commit_skipped',
  'auto_commit_failed',
  'status_snapshot',
]);

interface LogRow {
  jobId: string;
  specialist: string;
  beadId?: string;
  nodeId?: string;
  repo?: string;
  path?: string;
  dbPath?: string;
  branch?: string;
  status?: string;
  pid?: number;
  model?: string;
  backend?: string;
  chainId?: string;
  chainRootJobId?: string;
  chainRootBeadId?: string;
  sessionId?: string;
  conversationId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  event: TimelineEvent;
}

function parseSince(value: string): number | undefined {
  if (value.includes('T') || value.includes('-')) return new Date(value).getTime();
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return undefined;
  const n = Number(match[1]);
  const unit = match[2];
  const ms: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Date.now() - n * ms[unit];
}

function parseArgs(argv: readonly string[]): LogOptions {
  let jobId: string | undefined;
  let specialist: string | undefined;
  let beadId: string | undefined;
  let nodeId: string | undefined;
  let repo: string | undefined;
  let since: number | undefined;
  let limit = 200;
  let follow = false;
  let json = false;
  let allEvents = false;
  let legacy = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if ((token === '--job' || token === '--job-id') && argv[i + 1]) { jobId = argv[++i]; continue; }
    if (token === '--specialist' && argv[i + 1]) { specialist = argv[++i]; continue; }
    if ((token === '--bead' || token === '--bead-id') && argv[i + 1]) { beadId = argv[++i]; continue; }
    if (token === '--node' && argv[i + 1]) { nodeId = argv[++i]; continue; }
    if (token === '--repo' && argv[i + 1]) { repo = argv[++i]; continue; }
    if (token === '--since' && argv[i + 1]) { since = parseSince(argv[++i]); continue; }
    if (token === '--limit' && argv[i + 1]) { limit = Math.max(1, Number(argv[++i]) || limit); continue; }
    if (token === '--follow' || token === '-f') { follow = true; continue; }
    if (token === '--json') { json = true; continue; }
    if (token === '--all-events' || token === '--verbose') { allEvents = true; continue; }
    if (token === '--legacy') { legacy = true; continue; }
    if (!token.startsWith('-') && !jobId) { jobId = token; continue; }
    throw new Error(`Unknown option: ${token}`);
  }

  return { jobId, specialist, beadId, nodeId, repo, since, limit, follow, json, allEvents, legacy };
}

interface DbTarget {
  repo: string;
  root: string;
  dbPath: string;
  source: 'cwd' | 'child';
}

function discoverDbTargets(cwd: string, repoFilter?: string): DbTarget[] {
  const cwdLocation = resolveObservabilityDbLocation(cwd);
  if (existsSync(cwdLocation.dbPath)) {
    const repo = basename(cwdLocation.gitRoot);
    if (!repoFilter || repo === repoFilter) {
      return [{ repo, root: cwdLocation.gitRoot, dbPath: cwdLocation.dbPath, source: 'cwd' }];
    }
    return [];
  }

  const targets: DbTarget[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(cwd);
  } catch {
    return [];
  }

  for (const entry of entries) {
    const root = join(cwd, entry);
    try {
      if (!statSync(root).isDirectory()) continue;
    } catch {
      continue;
    }

    const dbPath = join(root, '.specialists', 'db', 'observability.db');
    if (!existsSync(dbPath)) continue;
    if (repoFilter && entry !== repoFilter) continue;
    targets.push({ repo: entry, root, dbPath, source: 'child' });
  }

  return targets.sort((a, b) => a.repo.localeCompare(b.repo));
}

function matches(status: SupervisorStatus, options: LogOptions): boolean {
  if (options.jobId && status.id !== options.jobId) return false;
  if (options.specialist && status.specialist !== options.specialist) return false;
  if (options.beadId && status.bead_id !== options.beadId) return false;
  if (options.nodeId && status.node_id !== options.nodeId) return false;
  return true;
}

function isRuntimeEvent(event: TimelineEvent): boolean {
  if (RUNTIME_EVENT_TYPES.has(event.type)) return true;
  if (event.type === 'meta') {
    return Boolean(
      event.model.startsWith('gitnexus_')
      || event.model.startsWith('bead_')
      || event.backend === 'supervisor',
    );
  }
  return false;
}

function toRows(target: DbTarget, statuses: SupervisorStatus[], options: LogOptions, readEvents: (jobId: string) => TimelineEvent[]): LogRow[] {
  const rows: LogRow[] = [];
  for (const status of statuses) {
    if (!matches(status, options)) continue;
    const rowPath = status.worktree_path ?? target.root;
    const events = readEvents(status.id).filter((event) => {
      if (options.since !== undefined && event.t < options.since) return false;
      if (options.allEvents) return true;
      return isRuntimeEvent(event);
    });
    for (const event of events) {
      rows.push({
        jobId: status.id,
        specialist: status.specialist,
        beadId: status.bead_id,
        nodeId: status.node_id,
        repo: target.repo,
        path: rowPath,
        dbPath: target.dbPath,
        branch: status.branch,
        status: status.status,
        pid: status.pid,
        model: status.model,
        backend: status.backend,
        chainId: status.chain_id,
        chainRootJobId: status.chain_root_job_id,
        chainRootBeadId: status.chain_root_bead_id,
        sessionId: status.session_id,
        conversationId: status.conversation_id,
        traceId: status.trace_id,
        spanId: status.span_id,
        parentSpanId: status.parent_span_id,
        event,
      });
    }

    if (events.length === 0 && (options.jobId || options.beadId || options.specialist || options.nodeId)) {
      rows.push({
        jobId: status.id,
        specialist: status.specialist,
        beadId: status.bead_id,
        nodeId: status.node_id,
        repo: target.repo,
        path: rowPath,
        dbPath: target.dbPath,
        branch: status.branch,
        status: status.status,
        pid: status.pid,
        model: status.model,
        backend: status.backend,
        chainId: status.chain_id,
        chainRootJobId: status.chain_root_job_id,
        chainRootBeadId: status.chain_root_bead_id,
        sessionId: status.session_id,
        conversationId: status.conversation_id,
        traceId: status.trace_id,
        spanId: status.span_id,
        parentSpanId: status.parent_span_id,
        event: { t: status.last_event_at_ms ?? status.started_at_ms, type: 'status_snapshot' } as unknown as TimelineEvent,
      });
    }
  }

  rows.sort((a, b) => a.event.t - b.event.t || a.jobId.localeCompare(b.jobId) || ((a.event.seq ?? 0) - (b.event.seq ?? 0)));
  const displayRows = options.json ? rows : collapseDisplayDuplicates(rows);
  return displayRows.slice(Math.max(0, displayRows.length - options.limit));
}

function normalizedEventForDisplay(event: TimelineEvent): Record<string, unknown> {
  const normalized = { ...(event as unknown as Record<string, unknown>) };
  delete normalized.t;
  delete normalized.seq;
  if (event.type === 'run_complete') delete normalized.elapsed_s;
  return normalized;
}

function displayDuplicateKey(row: LogRow): string {
  return JSON.stringify({
    jobId: row.jobId,
    event: normalizedEventForDisplay(row.event),
  });
}

function collapseDisplayDuplicates(rows: LogRow[]): LogRow[] {
  const collapsed: LogRow[] = [];
  const lastByKey = new Map<string, LogRow>();

  for (const row of rows) {
    const key = displayDuplicateKey(row);
    const previous = lastByKey.get(key);
    if (previous && row.event.t - previous.event.t <= DISPLAY_DUPLICATE_WINDOW_MS) continue;
    collapsed.push(row);
    lastByKey.set(key, row);
  }

  return collapsed;
}

function compact(value: unknown, max = 240): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const flat = (raw ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function eventDetail(event: TimelineEvent): string {
  if (event.type === 'run_start') return 'started';
  if (event.type === 'control_signal') {
    return [
      `action=${event.action}`,
      `source=${event.source}`,
      event.previous_status || event.next_status ? `status=${event.previous_status ?? '?'}->${event.next_status ?? '?'}` : null,
      event.pid !== undefined ? `pid=${event.pid}` : null,
      event.signal ? `signal=${event.signal}` : null,
      event.force !== undefined ? `force=${event.force}` : null,
      event.reason ? `reason=${compact(event.reason, 160)}` : null,
      event.message_preview ? `message="${compact(event.message_preview, 180)}"` : null,
      event.task_preview ? `task="${compact(event.task_preview, 180)}"` : null,
      event.error_message ? `error=${compact(event.error_message, 180)}` : null,
    ].filter(Boolean).join(' ');
  }
  if (event.type === 'status_change') {
    return `status=${event.previous_status ?? '?'}->${event.status}`;
  }
  if (event.type === 'run_complete') {
    return [
      `status=${event.status}`,
      `elapsed=${formatElapsed(event.elapsed_s)}`,
      event.exit_reason ? `exit=${event.exit_reason}` : null,
      event.finish_reason ? `finish=${event.finish_reason}` : null,
      event.error ? `error=${compact(event.error, 500)}` : null,
      ...formatTokenUsageSummary(event.token_usage ?? event.metrics?.token_usage),
      event.tool_calls ? `tools=${event.tool_calls.length}` : null,
    ].filter(Boolean).join(' ');
  }
  if (event.type === 'tool') {
    const args = event.args ? ` args=${compact(event.args, 300)}` : '';
    const result = event.result_summary ? ` result=${compact(event.result_summary, 300)}` : '';
    return `tool=${event.tool} phase=${event.phase}${event.is_error ? ' error=true' : ''}${args}${result}`;
  }
  if (event.type === 'error') return `source=${event.source} error=${compact(event.error_message, 500)}`;
  if (event.type === 'meta') return `model=${event.model} backend=${event.backend}${event.source ? ` source=${event.source}` : ''}`;
  if (event.type === 'stale_warning') return `reason=${event.reason} silence_ms=${event.silence_ms} threshold_ms=${event.threshold_ms}${event.tool ? ` tool=${event.tool}` : ''}`;
  if (event.type === 'token_usage') return `${formatTokenUsageSummary(event.token_usage).join(' ')} source=${event.source}`;
  if (event.type === 'turn_summary') return `turn=${event.turn_index}${event.finish_reason ? ` finish=${event.finish_reason}` : ''}${event.context_pct !== undefined ? ` context=${event.context_pct.toFixed(2)}%` : ''}${event.text_content ? ` text="${compact(event.text_content, 160)}"` : ''}`;
  if (event.type === 'auto_commit_success' || event.type === 'auto_commit_skipped' || event.type === 'auto_commit_failed') return `reason=${event.reason ?? ''}${event.commit_sha ? ` commit=${event.commit_sha}` : ''}${event.committed_files ? ` files=${event.committed_files.join(',')}` : ''}`.trim();
  if (event.type === 'finish_reason') return `reason=${event.finish_reason} source=${event.source}`;
  if (event.type === 'compaction' || event.type === 'retry') return `phase=${event.phase}`;
  if (event.type === 'message') return `phase=${event.phase} role=${event.role}`;
  if (event.type === 'turn') return `phase=${event.phase}`;
  return compact(event, 500);
}

function eventColor(event: TimelineEvent): Colorizer {
  switch (event.type) {
    case 'run_complete':
      return event.status === 'ERROR' ? red : event.status === 'CANCELLED' ? yellow : green;
    case 'stale_warning':
    case 'control_signal':
    case 'auto_commit_skipped':
      return yellow;
    case 'error':
    case 'extension_error':
    case 'auto_commit_failed':
      return red;
    case 'auto_commit_success':
      return green;
    default:
      return dim;
  }
}

function eventLabel(event: TimelineEvent): string {
  const rawType = (event as { type: string }).type;
  if (rawType === 'status_snapshot') return 'SNAP';
  switch (event.type) {
    case 'run_start': return 'START';
    case 'run_complete': return event.status;
    case 'status_change': return 'STATUS';
    case 'control_signal': return 'CTRL';
    case 'stale_warning': return 'WARN';
    case 'auto_commit_success': return 'AUTO+';
    case 'auto_commit_skipped': return 'AUTO-';
    case 'auto_commit_failed': return 'AUTO!';
    default: return rawType.toUpperCase().slice(0, 6);
  }
}

function formatWorktree(row: LogRow): string {
  const base = row.path ? basename(row.path) : row.repo ?? '-';
  if (!row.repo || base === row.repo) return base;
  return `${row.repo}/${base}`;
}

function statusColor(status: string | undefined): Colorizer {
  switch (status) {
    case 'done': return green;
    case 'error': return red;
    case 'cancelled': return yellow;
    case 'running': return cyan;
    case 'waiting': return yellow;
    case 'starting': return yellow;
    default: return dim;
  }
}

function printRow(row: LogRow, json: boolean): void {
  if (json) {
    console.log(JSON.stringify({
      timestamp: new Date(row.event.t).toISOString(),
      job_id: row.jobId,
      specialist: row.specialist,
      bead_id: row.beadId ?? null,
      node_id: row.nodeId ?? null,
      repo: row.repo ?? null,
      path: row.path ?? null,
      db_path: row.dbPath ?? null,
      branch: row.branch ?? null,
      worktree: formatWorktree(row),
      status: row.status ?? null,
      pid: row.pid ?? null,
      model: row.model ?? null,
      backend: row.backend ?? null,
      chain_id: row.chainId ?? null,
      chain_root_job_id: row.chainRootJobId ?? null,
      chain_root_bead_id: row.chainRootBeadId ?? null,
      event: row.event,
      forensic_event: forensicEventFromTimelineEvent(row.event as unknown as { t: number; seq?: number; type: string; [key: string]: unknown }, {
        jobId: row.jobId,
        specialist: row.specialist,
        beadId: row.beadId,
        nodeId: row.nodeId,
        repo: row.repo,
        serviceComponent: 'cli.log',
        model: row.model,
        backend: row.backend,
        chainId: row.chainId,
        chainRootJobId: row.chainRootJobId,
        chainRootBeadId: row.chainRootBeadId,
        sessionId: row.sessionId,
        conversationId: row.conversationId,
        traceId: row.traceId,
        spanId: row.spanId,
        parentSpanId: row.parentSpanId,
      }),
    }));
    return;
  }

  const color = eventColor(row.event);
  const label = color(bold(eventLabel(row.event).padEnd(6)));
  const status = row.status ?? '-';
  const statusSegment = statusColor(row.status)(`status=${status}`);
  const head = [
    dim(formatDateTime(row.event.t)),
    label,
    row.jobId,
    bold(row.specialist),
    dim(`bead=${row.beadId ?? '-'}`),
    row.nodeId ? dim(`node=${row.nodeId}`) : null,
    dim(`worktree=${formatWorktree(row)}`),
    statusSegment,
    row.pid !== undefined ? dim(`pid=${row.pid}`) : null,
  ].filter(Boolean).join(' ');

  console.log(`${head} ${eventDetail(row.event)}`.trim());
}

export async function run(argv: readonly string[] = process.argv.slice(3)): Promise<void> {
  let options: LogOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Usage: specialists|sp log [job-id] [--specialist <name>] [--bead <id>] [--node <id>] [--since <5m|iso>] [--limit <n>] [-f|--follow] [--json] [--all-events] [--legacy]');
    console.error('  Default: renders xtrm.forensic.v1 events. --legacy falls back to TimelineEvent filtering (deprecated, removed next minor release).');
    process.exit(1);
  }

  const targets = discoverDbTargets(process.cwd(), options.repo);
  if (targets.length === 0) {
    const suffix = options.repo ? ` for repo '${options.repo}'` : '';
    console.error(`No specialists observability DB found${suffix}. Run from a repo root or a parent containing repos with .specialists/db/observability.db.`);
    process.exit(1);
  }

  const clients = targets.map((target) => ({ target, client: createObservabilitySqliteClientAtPath(target.dbPath) }));
  if (clients.every((entry) => !entry.client)) {
    console.error('Observability SQLite DB is unavailable. Run: specialists db setup');
    process.exit(1);
  }

  const printed = new Set<string>();
  const printSnapshot = (): void => {
    const rows = clients.flatMap(({ target, client }) => {
      if (!client) return [];
      return toRows(target, client.listStatuses(), options, (jobId) => client.readEvents(jobId));
    });
    rows.sort((a, b) => a.event.t - b.event.t || (a.repo ?? '').localeCompare(b.repo ?? '') || a.jobId.localeCompare(b.jobId) || ((a.event.seq ?? 0) - (b.event.seq ?? 0)));
    const limitedRows = rows.slice(Math.max(0, rows.length - options.limit));
    for (const row of limitedRows) {
      const key = `${row.repo ?? ''}:${row.jobId}:${row.event.seq ?? row.event.t}:${row.event.type}`;
      if (printed.has(key)) continue;
      printed.add(key);
      printRow(row, options.json);
    }
    if (limitedRows.length === 0 && !options.json && printed.size === 0) console.error('No matching specialist log rows.');
  };

  const printForensicSnapshot = (): void => {
    const records = clients.flatMap(({ target, client }) => {
      if (!client) return [];
      try {
        const filters: ListForensicEventsFilters = {
          jobId: options.jobId,
          sinceMs: options.since,
          // Over-fetch then post-filter by specialist/bead/node since those live
          // inside the event payload.
          limit: options.limit * 4,
        };
        return client.readForensicEvents(filters).map((r) => ({ target, record: r }));
      } catch (error) {
        logForensicReadError(target.repo, error);
        return [];
      }
    });

    type ForensicRow = {
      target: DbTarget;
      record: ForensicEventRecord;
      event: ForensicEvent;
      row: RenderedRow;
    };

    const rows: ForensicRow[] = [];
    for (const { target, record } of records) {
      let event: ForensicEvent;
      try {
        event = JSON.parse(record.event_json) as ForensicEvent;
      } catch (error) {
        logForensicReadError(target.repo, error);
        continue;
      }
      const correlation = event.correlation ?? {};
      if (options.specialist && event.resource?.participant_role !== options.specialist) continue;
      if (options.beadId && correlation.bead_id !== options.beadId) continue;
      if (options.nodeId && correlation.node_id !== options.nodeId) continue;
      rows.push({ target, record, event, row: forensicEventToRow(event) });
    }

    rows.sort((a, b) =>
      a.row.ts - b.row.ts
      || a.target.repo.localeCompare(b.target.repo)
      || a.row.jobId.localeCompare(b.row.jobId)
      || ((a.row.seq ?? 0) - (b.row.seq ?? 0))
    );
    const limitedRows = rows.slice(Math.max(0, rows.length - options.limit));
    for (const fr of limitedRows) {
      const key = `${fr.target.repo}:${fr.row.jobId}:${fr.row.seq ?? fr.row.ts}:${fr.row.type}`;
      if (printed.has(key)) continue;
      printed.add(key);
      printForensicRow(fr.target, fr.event, fr.row, options.json);
    }
    if (limitedRows.length === 0 && !options.json && printed.size === 0) {
      console.error('No matching specialist log rows.');
    }
  };

  const snapshotFn = options.legacy ? printSnapshot : printForensicSnapshot;

  try {
    snapshotFn();
    if (!options.follow) return;

    if (!options.json) {
      const mode = options.legacy ? 'legacy timeline' : 'xtrm.forensic.v1';
      console.error(`Following specialist runtime logs (${mode}) across ${targets.length} repo${targets.length === 1 ? '' : 's'}... (Ctrl+C to stop)`);
    }
    await new Promise<void>((resolve) => {
      const interval = setInterval(snapshotFn, 750);
      const stop = () => { clearInterval(interval); resolve(); };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
  } finally {
    for (const { client } of clients) client?.close();
  }
}

function printForensicRow(
  target: DbTarget,
  event: ForensicEvent,
  row: RenderedRow,
  json: boolean,
): void {
  if (json) {
    console.log(JSON.stringify({
      timestamp: new Date(row.ts).toISOString(),
      job_id: row.jobId || null,
      bead_id: row.beadId ?? null,
      repo: target.repo,
      db_path: target.dbPath,
      forensic_event: event,
    }));
    return;
  }

  const cols = formatRenderedRowColumns(row);
  const severityFn = severityColor(row.severity);
  const head = [
    dim(formatDateTime(row.ts)),
    severityFn(bold(cols.type.trimEnd().padEnd(18))),
    row.jobId || '-',
    dim(`bead=${row.beadId ?? '-'}`),
    dim(`repo=${target.repo}`),
  ].join(' ');
  const tail = `${cols.actor.trimEnd()} ${cols.payload}`;
  console.log(`${head} ${tail}`.trim());

  if (row.schemaWarning) {
    console.log(dim(`  ⚠ ${row.schemaWarning}`));
  }
}

function severityColor(s: ForensicEvent['severity']): Colorizer {
  switch (s) {
    case 'critical':
    case 'error': return red;
    case 'warn': return yellow;
    case 'info': return cyan;
    case 'debug': return dim;
    default: return dim;
  }
}

function logForensicReadError(repo: string, error: unknown): void {
  try {
    process.stderr.write(JSON.stringify({
      ts: new Date().toISOString(),
      component: 'sp-log',
      op: 'read_forensic',
      repo,
      errorClass: error instanceof Error ? error.name : 'unknown',
    }) + '\n');
  } catch {
    // swallow
  }
}
