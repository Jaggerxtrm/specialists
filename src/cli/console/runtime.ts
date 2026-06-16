import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { JobColorMap, bold, formatCostUsd, formatElapsed, formatEventLine, formatTokenUsageSummary, magenta } from '../format-helpers.js';
import { resolveObservabilityDbLocation } from '../../specialist/observability-db.js';
import { createObservabilitySqliteClient, createObservabilitySqliteClientAtPath, type ObservabilitySqliteClient } from '../../specialist/observability-sqlite.js';
import { resolveJobsDir } from '../../specialist/job-root.js';
import { collectProcessHealth } from '../../specialist/process-health.js';
import { isJobDead } from '../../specialist/supervisor.js';
import type { SupervisorStatus } from '../../specialist/supervisor.js';
import { compareTimelineEvents, parseTimelineEvent, type TimelineEvent } from '../../specialist/timeline-events.js';
import type { ConsoleJob, FeedEventRow, JobInspect, JobResult, ProcessFilter, ProcessRow, ProcessSnapshot, RepoRef, RuntimeClient } from './types.js';

const ACTIVE_STATES: ReadonlyArray<SupervisorStatus['status']> = ['starting', 'running', 'waiting'];
const TERMINAL_STATES: ReadonlyArray<SupervisorStatus['status']> = ['done', 'error', 'cancelled'];
const colorMap = new JobColorMap();

export function createRuntimeClient(cwd = process.cwd()): RuntimeClient {
  return new LocalRuntimeClient(cwd);
}

class LocalRuntimeClient implements RuntimeClient {
  constructor(private readonly cwd: string) {}

  async listRepos(): Promise<RepoRef[]> {
    const configured = parseConfiguredRepos();
    if (configured.length > 0) return configured;

    const current = resolveRepoRef(this.cwd, true);
    if (current) return [current];

    const repos: RepoRef[] = [];
    let entries: string[] = [];
    try {
      entries = readdirSync(this.cwd);
    } catch {
      return [{ id: 'cwd', name: basename(this.cwd), path: this.cwd, current: true }];
    }

    for (const entry of entries) {
      const root = join(this.cwd, entry);
      try {
        if (!statSync(root).isDirectory()) continue;
      } catch {
        continue;
      }
      const repo = resolveRepoRef(root, false);
      if (repo) repos.push(repo);
    }

    return repos.length > 0
      ? repos.sort((a, b) => a.name.localeCompare(b.name))
      : [{ id: 'cwd', name: basename(this.cwd), path: this.cwd, current: true }];
  }

  async listProcessSnapshot(repo: RepoRef, filter: ProcessFilter): Promise<ProcessSnapshot> {
    const statuses = readStatuses(repo).map(enrichJob);
    const visible = statuses.filter((job) => isVisible(job, filter));
    const filtered = applyTextFilter(visible, filter.textFilter);
    const rows = buildRows(filtered, filter.historyMode);
    const health = safeCollectHealth();
    const contexts = filtered.map((job) => job.context_pct).filter((pct): pct is number => Number.isFinite(pct));

    return {
      generatedAtMs: Date.now(),
      repo,
      filter,
      rows,
      jobs: filtered,
      totalJobs: statuses.length,
      visibleJobs: filtered.length,
      runningJobs: filtered.filter((job) => job.status === 'running').length,
      waitingJobs: filtered.filter((job) => job.status === 'waiting').length,
      epics: new Set(filtered.map((job) => job.epic_id).filter(Boolean)).size,
      nodes: new Set(filtered.map((job) => job.node_id).filter(Boolean)).size,
      worktrees: new Set(filtered.map((job) => job.worktree_owner_job_id ?? job.worktree_path).filter(Boolean)).size,
      maxContextPct: contexts.length > 0 ? Math.max(...contexts) : undefined,
      totalTokens: filtered.reduce((sum, job) => sum + (job.metrics?.token_usage?.total_tokens ?? 0), 0),
      health,
    };
  }

  async readFeed(args: { repo: RepoRef; jobId: string; fromSeq?: number; limit?: number }): Promise<FeedEventRow[]> {
    const job = resolveJob(args.repo, args.jobId);
    if (!job) return [];
    const events = readEvents(args.repo, job.id)
      .filter((event) => typeof args.fromSeq !== 'number' || (event.seq ?? -1) >= args.fromSeq)
      .filter(shouldRenderHumanEvent)
      .sort(compareTimelineEvents);
    const visibleEvents = dedupeHumanEvents(job.id, events);
    const limited = visibleEvents.slice(-Math.max(1, args.limit ?? 200));
    const colorize = colorMap.get(job.id);
    return limited.map((event) => ({
      jobId: job.id,
      specialist: job.specialist,
      beadId: job.bead_id,
      seq: event.seq,
      t: event.t,
      type: event.type,
      line: isWaitingStatusChangeEvent(event)
        ? formatWaitingBanner(job.id, job.specialist)
        : formatEventLine(event, {
          jobId: job.id,
          specialist: job.specialist,
          beadId: job.bead_id,
          nodeId: job.node_id,
          colorize,
        }),
    }));
  }

  async inspectJob(repo: RepoRef, jobIdPrefix: string): Promise<JobInspect> {
    const job = resolveJob(repo, jobIdPrefix);
    if (!job) throw new Error(`Job not found: ${jobIdPrefix}`);
    const tokenParts = formatTokenUsageSummary(job.metrics?.token_usage).filter((part) => !part.startsWith('cost='));
    const fields = [
      field('job', job.id),
      field('specialist', job.specialist),
      field('status', `${job.status}${job.is_dead ? ' dead' : ''}`),
      field('model', [job.model, job.backend ? `(${job.backend})` : ''].filter(Boolean).join(' ') || '--'),
      field('bead', [job.bead_id, job.bead_title ? `— ${job.bead_title}` : ''].filter(Boolean).join(' ') || '--'),
      field('epic', job.epic_id ?? '--'),
      field('node', job.node_id ?? '--'),
      field('worktree', [job.branch, job.worktree_path].filter(Boolean).join(' ') || '--'),
      field('role', job.chain_kind ?? '--'),
      field('chain_id', job.chain_id ?? job.worktree_owner_job_id ?? '--'),
      field('chain_root_job', job.chain_root_job_id ?? '--'),
      field('chain_root_bead', job.chain_root_bead_id ?? '--'),
      field('started', formatDateTime(job.started_at_ms)),
      field('elapsed', `${formatElapsed(job.elapsed_s ?? 0)} · ${job.metrics?.turns ?? 0} turns · ${job.metrics?.tool_calls ?? 0} tools`),
      field('tokens', tokenParts.join(' · ') || '--'),
      field('cost_usd', formatCostUsd(job.metrics?.token_usage?.cost_usd) ?? '--'),
      field('context', job.context_pct === undefined ? '--' : `${Math.round(job.context_pct)}% ${job.context_health ?? ''}`),
      field('current', job.current_tool ?? '--'),
      field('payload', `${job.payload_kb ?? '--'} · ${job.payload_tokens ?? '--'}`),
    ];

    return { job, fields, actions: actionsFor(job) };
  }

  async readResult(repo: RepoRef, jobIdPrefix: string): Promise<JobResult> {
    const job = resolveJob(repo, jobIdPrefix);
    if (!job) return { job: null, title: `result ${jobIdPrefix}`, output: '', footer: `Job not found: ${jobIdPrefix}` };

    const events = readEvents(repo, job.id);
    const output = readResultOutput(repo, job.id, events);
    const reason = job.error ?? deriveTerminalReason(events);
    const logHint = `feed/log replay: sp feed ${job.id} · sp log ${job.id} --limit 200`;

    if (job.status === 'running' || job.status === 'starting') {
      return {
        job,
        title: `${job.id} is ${job.status}`,
        output: output ?? 'No persisted result yet. Open feed for live timeline replay.',
        footer: output ? 'Showing last completed output while the job continues.' : `Use feed for live progress. ${logHint}`,
      };
    }

    if (job.status === 'waiting') {
      return {
        job,
        title: `${job.id} is waiting`,
        output: output ?? 'No persisted output yet.',
        footer: `Use: sp resume ${job.id} "..."`,
      };
    }

    if (job.status === 'error' || job.status === 'cancelled') {
      return {
        job,
        title: `${job.id} ${job.status}`,
        output: output ?? `${job.status}: ${reason ?? 'no persisted result'}`,
        footer: logHint,
        error: reason ?? undefined,
      };
    }

    return {
      job,
      title: `${job.id} result`,
      output: output ?? 'Result not found. Use feed/log replay for traceability.',
      footer: metricFooter(job),
    };
  }
}

function parseConfiguredRepos(): RepoRef[] {
  const raw = process.env.SPECIALISTS_CONSOLE_REPOS?.trim();
  if (!raw) return [];
  return raw.split(',').map((entry, index) => {
    const [nameRaw, pathRaw] = entry.includes('=') ? entry.split('=', 2) : ['', entry];
    const path = (pathRaw ?? '').trim();
    const name = (nameRaw || basename(path)).trim();
    return path ? resolveRepoRef(path, index === 0, name) : null;
  }).filter((repo): repo is RepoRef => repo !== null);
}

function resolveRepoRef(path: string, current: boolean, nameOverride?: string): RepoRef | null {
  const location = resolveObservabilityDbLocation(path);
  const jobsDir = resolveJobsDir(path);
  if (!existsSync(location.dbPath) && !existsSync(jobsDir)) return null;
  const name = nameOverride ?? basename(location.gitRoot || path);
  return { id: name, name, path: location.gitRoot || path, dbPath: location.dbPath, current };
}

function openClient(repo: RepoRef): ObservabilitySqliteClient | null {
  if (repo.dbPath && existsSync(repo.dbPath)) return createObservabilitySqliteClientAtPath(repo.dbPath);
  return createObservabilitySqliteClient(repo.path);
}

function readStatuses(repo: RepoRef): SupervisorStatus[] {
  const client = openClient(repo);
  try {
    const sqlite = client?.listStatuses() ?? [];
    const files = readFileStatuses(resolveJobsDir(repo.path));
    const byId = new Map<string, SupervisorStatus>();
    for (const status of files) byId.set(status.id, status);
    for (const status of sqlite) {
      const current = byId.get(status.id);
      if (!current || status.started_at_ms >= current.started_at_ms) byId.set(status.id, status);
    }
    return [...byId.values()].sort((a, b) => b.started_at_ms - a.started_at_ms);
  } finally {
    client?.close();
  }
}

function readFileStatuses(jobsDir: string): SupervisorStatus[] {
  if (!existsSync(jobsDir)) return [];
  return readdirSync(jobsDir).flatMap((entry) => {
    const path = join(jobsDir, entry, 'status.json');
    if (!existsSync(path)) return [];
    try {
      return [JSON.parse(readFileSync(path, 'utf-8')) as SupervisorStatus];
    } catch {
      return [];
    }
  });
}

function readEvents(repo: RepoRef, jobId: string): TimelineEvent[] {
  const client = openClient(repo);
  try {
    const sqlite = client?.readEvents(jobId) ?? [];
    if (sqlite.length > 0) return sqlite.sort(compareTimelineEvents);
  } catch {
    // fallback below
  } finally {
    client?.close();
  }

  const eventsPath = join(resolveJobsDir(repo.path), jobId, 'events.jsonl');
  if (!existsSync(eventsPath)) return [];
  return readFileSync(eventsPath, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseTimelineEvent(line))
    .filter((event): event is TimelineEvent => event !== null)
    .sort(compareTimelineEvents);
}

function readResultOutput(repo: RepoRef, jobId: string, events: TimelineEvent[]): string | null {
  const client = openClient(repo);
  try {
    const sqlite = client?.readResult(jobId) ?? null;
    if (sqlite) return sqlite;
  } catch {
    // fallback below
  } finally {
    client?.close();
  }

  const resultPath = join(resolveJobsDir(repo.path), jobId, 'result.txt');
  if (existsSync(resultPath)) return readFileSync(resultPath, 'utf-8');

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type === 'run_complete' && typeof event.output === 'string' && event.output.length > 0) return event.output;
  }
  return null;
}

function resolveJob(repo: RepoRef, prefix: string): ConsoleJob | null {
  return readStatuses(repo).map(enrichJob).find((job) => job.id.startsWith(prefix)) ?? null;
}

function enrichJob(status: SupervisorStatus): ConsoleJob {
  const payload = formatPayloadStats(status.startup_payload_json);
  return {
    ...status,
    is_dead: isJobDead(status),
    bead_title: typeof (status as SupervisorStatus & { bead_title?: unknown }).bead_title === 'string'
      ? String((status as SupervisorStatus & { bead_title?: string }).bead_title).replace(/\s+/g, ' ').trim()
      : undefined,
    payload_kb: payload.payload_kb,
    payload_tokens: payload.payload_tokens,
    next_action: nextAction(status),
  };
}

function isVisible(job: ConsoleJob, filter: ProcessFilter): boolean {
  const cleaned = isPsCleaned(job);
  if (filter.historyMode === 'all') return true;
  if (cleaned && !filter.includeCleaned) return false;
  if (cleaned && filter.includeCleaned && TERMINAL_STATES.includes(job.status)) return true;
  if (job.is_dead) return false;
  if (ACTIVE_STATES.includes(job.status)) return true;
  if (filter.historyMode === 'history' && TERMINAL_STATES.includes(job.status)) return true;
  return job.status === 'error' || job.status === 'cancelled';
}

function isPsCleaned(job: SupervisorStatus): boolean {
  const typed = job as SupervisorStatus & { ps_hidden_at?: number; ps_hidden_from_dashboard_at?: number };
  return Boolean(typed.ps_hidden_at ?? typed.ps_hidden_from_dashboard_at);
}

function applyTextFilter(jobs: ConsoleJob[], filter: string): ConsoleJob[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) return jobs;
  return jobs.filter((job) => [
    job.id,
    job.specialist,
    job.status,
    job.bead_id,
    job.bead_title,
    job.node_id,
    job.epic_id,
    job.chain_id,
    job.branch,
    job.worktree_path,
  ].filter(Boolean).join(' ').toLowerCase().includes(needle));
}

function buildRows(jobs: ConsoleJob[], historyMode: ProcessFilter['historyMode']): ProcessRow[] {
  if (historyMode !== 'default') return buildChronologicalRows(jobs);

  const rows: ProcessRow[] = [];
  const rendered = new Set<string>();

  const addGroup = (id: string, label: string, depth: number): void => {
    rows.push({ kind: 'group', id, label, depth });
  };
  const addJobs = (groupJobs: ConsoleJob[], depth: number): void => {
    for (const job of groupJobs.sort(compareJobs)) {
      if (rendered.has(job.id)) continue;
      rendered.add(job.id);
      rows.push({ kind: 'job', id: job.id, job, depth });
    }
  };

  const epics = groupBy(jobs.filter((job) => job.epic_id), (job) => job.epic_id!);
  for (const [epicId, epicJobs] of [...epics.entries()].sort(sortGroupByNewest)) {
    addGroup(`epic:${epicId}`, `EPIC ${epicId}`, 0);
    const chains = groupBy(epicJobs, (job) => job.chain_id ?? job.worktree_owner_job_id ?? 'prep');
    for (const [chainId, chainJobs] of [...chains.entries()].sort(sortGroupByNewest)) {
      addGroup(`chain:${epicId}:${chainId}`, chainId === 'prep' ? 'Prep' : `Chain ${chainId}`, 1);
      addJobs(chainJobs, 2);
    }
  }

  const nodeJobs = jobs.filter((job) => !rendered.has(job.id) && job.node_id);
  for (const [nodeId, groupJobs] of [...groupBy(nodeJobs, (job) => job.node_id!).entries()].sort(sortGroupByNewest)) {
    addGroup(`node:${nodeId}`, `⬢ ${nodeId}`, 0);
    addJobs(groupJobs, 1);
  }

  const worktreeJobs = jobs.filter((job) => !rendered.has(job.id) && (job.worktree_owner_job_id || job.worktree_path || job.branch));
  for (const [treeId, groupJobs] of [...groupBy(worktreeJobs, (job) => job.worktree_owner_job_id ?? job.worktree_path ?? job.branch ?? 'worktree').entries()].sort(sortGroupByNewest)) {
    const representative = groupJobs[0];
    addGroup(`worktree:${treeId}`, representative?.branch ?? representative?.worktree_path ?? treeId, 0);
    addJobs(groupJobs, 1);
  }

  const standalone = jobs.filter((job) => !rendered.has(job.id));
  if (standalone.length > 0) {
    addGroup('standalone', 'Standalone', 0);
    addJobs(standalone, 1);
  }

  return rows;
}

export function buildChronologicalRows(jobs: ConsoleJob[]): ProcessRow[] {
  return [...jobs]
    .sort((a, b) => b.started_at_ms - a.started_at_ms || a.id.localeCompare(b.id))
    .map((job) => ({ kind: 'job' as const, id: job.id, job, depth: 0 }));
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function sortGroupByNewest(a: [string, ConsoleJob[]], b: [string, ConsoleJob[]]): number {
  const newestA = Math.max(...a[1].map((job) => job.started_at_ms), 0);
  const newestB = Math.max(...b[1].map((job) => job.started_at_ms), 0);
  return newestB - newestA || a[0].localeCompare(b[0]);
}

function compareJobs(a: ConsoleJob, b: ConsoleJob): number {
  const priority = (job: ConsoleJob): number => job.status === 'waiting' ? 3 : job.status === 'running' ? 2 : job.status === 'starting' ? 1 : 0;
  return priority(b) - priority(a) || b.started_at_ms - a.started_at_ms || a.id.localeCompare(b.id);
}

function nextAction(job: SupervisorStatus): string {
  if (isJobDead(job)) return 'dead';
  if (job.status === 'running' || job.status === 'starting') return 'feed';
  if (job.status === 'waiting') return 'resume';
  if (job.status === 'done') return 'result';
  if (job.status === 'error') return 'result';
  if (job.status === 'cancelled') return 'feed';
  return '';
}

function formatPayloadStats(payloadJson: string | null | undefined): { payload_kb: string; payload_tokens: string } {
  if (!payloadJson) return { payload_kb: '--', payload_tokens: '--' };
  try {
    const payload = JSON.parse(payloadJson) as { totals?: { bytes?: number; tokens?: number } };
    const bytes = payload.totals?.bytes;
    const tokens = payload.totals?.tokens;
    if (!Number.isFinite(bytes) || !Number.isFinite(tokens)) return { payload_kb: '--', payload_tokens: '--' };
    return { payload_kb: `${((bytes ?? 0) / 1024).toFixed(1)}kb`, payload_tokens: `${Math.round(tokens ?? 0)}t` };
  } catch {
    return { payload_kb: '--', payload_tokens: '--' };
  }
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
      return event.type;
  }
}

function shouldRenderHumanEvent(event: TimelineEvent): boolean {
  if (event.type === 'message' || event.type === 'turn') return false;
  if (event.type === 'tool') {
    if (event.phase === 'update') return false;
    if (event.phase === 'end' && !event.is_error) return false;
  }
  return true;
}

export function dedupeHumanEvents(jobId: string, events: TimelineEvent[]): TimelineEvent[] {
  const visible: TimelineEvent[] = [];
  const lastPrintedEventKey = new Map<string, string>();
  const seenMetaKey = new Map<string, string>();

  for (const event of events) {
    if (event.type === 'meta') {
      const metaKey = `${event.backend}:${event.model}`;
      if (seenMetaKey.get(jobId) === metaKey) continue;
      seenMetaKey.set(jobId, metaKey);
    }

    if (event.type !== 'tool') {
      const key = getHumanEventKey(event);
      if (lastPrintedEventKey.get(jobId) === key) continue;
      lastPrintedEventKey.set(jobId, key);
    }

    visible.push(event);
  }

  return visible;
}

function isWaitingStatusChangeEvent(event: TimelineEvent): boolean {
  return event.type === 'status_change' && event.status === 'waiting';
}

function formatWaitingBanner(jobId: string, specialist: string): string {
  return `${magenta(bold('WAIT'))} ${specialist} (${jobId}) is waiting for input. Use: specialists resume ${jobId} "..."`;
}

function field(label: string, value: string): { label: string; value: string } {
  return { label, value };
}

function actionsFor(job: ConsoleJob): string[] {
  const actions: string[] = [];
  if (job.status === 'running' || job.status === 'starting') actions.push(`feed -f ${job.id}`);
  if (job.status === 'waiting') actions.push(`resume ${job.id} "..."`);
  if (job.status === 'running') actions.push(`steer ${job.id} "..."`);
  if (job.status === 'done' || job.status === 'error') actions.push(`result ${job.id}`);
  if (job.is_dead) actions.push('clean --zombies');
  return actions;
}

function deriveTerminalReason(events: TimelineEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === 'run_complete') return event.error ?? event.exit_reason ?? event.status;
    if (event?.type === 'control_signal') return event.error_message ?? event.reason ?? event.action;
    if (event?.type === 'status_change') return `status ${event.previous_status ?? '?'} -> ${event.status}`;
  }
  return null;
}

function metricFooter(job: ConsoleJob): string {
  const tokenParts = formatTokenUsageSummary(job.metrics?.token_usage).filter((part) => !part.startsWith('cost='));
  const cost = formatCostUsd(job.metrics?.token_usage?.cost_usd);
  const parts = [...tokenParts, ...(cost ? [`cost_usd=${cost}`] : [])];
  return parts.length > 0 ? `metrics: ${parts.join(' · ')}` : 'done';
}

export function formatDateTime(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '--';
  const date = new Date(ms);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function safeCollectHealth() {
  try {
    return collectProcessHealth();
  } catch {
    return null;
  }
}
