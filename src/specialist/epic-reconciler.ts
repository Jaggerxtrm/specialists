import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendEpicTransitionAudit, type EpicRunRecord, type EpicState } from './epic-lifecycle.js';
import { loadEpicReadinessSummary, syncEpicStateFromReadiness, type EpicReadinessSummary } from './epic-readiness.js';
import { resolveObservabilityDbLocation } from './observability-db.js';
import type { ObservabilitySqliteClient } from './observability-sqlite.js';
import { isJobDead, type SupervisorStatus } from './supervisor.js';

const ACTIVE_JOB_STATUSES = new Set<SupervisorStatus['status']>(['starting', 'running', 'waiting']);

interface DriftReport {
  stale_chain_refs: string[];
  dead_jobs_blocking_readiness: string[];
  integrity_flags: string[];
  stale_redirect_markers: string[];
}

export interface EpicSyncResult {
  epic_id: string;
  apply: boolean;
  drift: DriftReport;
  repairs: {
    dead_jobs_marked_error: string[];
    readiness_resynced: boolean;
    redirect_markers_cleared: boolean;
  };
  readiness_before: EpicReadinessSummary;
  readiness_after: EpicReadinessSummary;
}

export interface EpicAbandonResult {
  epic_id: string;
  from_state: EpicState;
  to_state: 'abandoned';
  forced: boolean;
  reason: string;
  live_member_job_ids: string[];
}

function buildEpicLockPath(epicId: string): string {
  const location = resolveObservabilityDbLocation();
  const lockDir = join(location.dbDirectory, 'locks');
  mkdirSync(lockDir, { recursive: true });
  return join(lockDir, `epic-${epicId}.lock`);
}

export function withEpicAdvisoryLock<T>(epicId: string, action: () => T): T {
  const lockPath = buildEpicLockPath(epicId);
  let lockFd: number | null = null;

  try {
    lockFd = openSync(lockPath, 'wx');
    writeFileSync(lockPath, JSON.stringify({ epic_id: epicId, pid: process.pid, created_at_ms: Date.now() }));
  } catch {
    let holder = 'unknown';
    try {
      holder = readFileSync(lockPath, 'utf-8');
    } catch {
      holder = 'unknown';
    }
    throw new Error(`Epic advisory lock busy for ${epicId}. Holder: ${holder}`);
  }

  try {
    return action();
  } finally {
    if (lockFd !== null) {
      try {
        rmSync(lockPath, { force: true });
      } catch {
        // noop
      }
    }
  }
}

function hasRedirectMarkers(statusJson: string | undefined): boolean {
  if (!statusJson) return false;
  try {
    const parsed = JSON.parse(statusJson) as Record<string, unknown>;
    return Object.keys(parsed).some((key) => key.toLowerCase().includes('redirect'));
  } catch {
    return false;
  }
}

function clearRedirectMarkers(statusJson: string | undefined): string | undefined {
  if (!statusJson) return statusJson;
  try {
    const parsed = JSON.parse(statusJson) as Record<string, unknown>;
    const cleanedEntries = Object.entries(parsed).filter(([key]) => !key.toLowerCase().includes('redirect'));
    return JSON.stringify(Object.fromEntries(cleanedEntries));
  } catch {
    return statusJson;
  }
}

function collectEpicJobs(sqlite: ObservabilitySqliteClient, epicId: string): SupervisorStatus[] {
  const chainIds = new Set(sqlite.listEpicChains(epicId).map((chain) => chain.chain_id));
  return sqlite
    .listStatuses()
    .filter((status) => status.epic_id === epicId || (status.chain_id ? chainIds.has(status.chain_id) : false));
}

function detectStaleChainRefs(sqlite: ObservabilitySqliteClient, epicId: string): string[] {
  return sqlite
    .listEpicChains(epicId)
    .map((chain) => chain.chain_id)
    .filter((chainId) => sqlite.listChainJobIds(chainId).length === 0);
}

function detectDeadBlockingJobs(jobs: readonly SupervisorStatus[]): string[] {
  return jobs
    .filter((job) => ACTIVE_JOB_STATUSES.has(job.status) && isJobDead(job))
    .map((job) => job.id);
}

function detectIntegrityFlags(sqlite: ObservabilitySqliteClient, epicId: string, jobs: readonly SupervisorStatus[]): string[] {
  const chainIds = new Set(sqlite.listEpicChains(epicId).map((chain) => chain.chain_id));
  const flags: string[] = [];

  for (const job of jobs) {
    if (job.chain_kind === 'chain' && !job.chain_id) {
      flags.push(`job:${job.id}:chain_kind=chain missing chain_id`);
    }

    if (job.chain_id && !chainIds.has(job.chain_id) && job.epic_id === epicId) {
      flags.push(`job:${job.id}:references chain ${job.chain_id} missing from epic membership`);
    }

    if (job.chain_id && chainIds.has(job.chain_id) && job.epic_id && job.epic_id !== epicId) {
      flags.push(`job:${job.id}:chain ${job.chain_id} linked to epic ${job.epic_id}, expected ${epicId}`);
    }
  }

  return flags;
}

function markDeadJobsAsError(sqlite: ObservabilitySqliteClient, jobs: readonly SupervisorStatus[]): string[] {
  const deadBlockingIds = detectDeadBlockingJobs(jobs);
  const now = Date.now();

  for (const jobId of deadBlockingIds) {
    const current = jobs.find((job) => job.id === jobId);
    if (!current) continue;
    sqlite.upsertStatus({
      ...current,
      status: 'error',
      error: current.error ?? 'epic reconciler: detected dead pid/tmux for active job',
      last_event_at_ms: now,
    });
  }

  return deadBlockingIds;
}

export function syncEpicState(sqlite: ObservabilitySqliteClient, epicId: string, apply: boolean): EpicSyncResult {
  const epicRun = sqlite.readEpicRun(epicId);
  const jobs = collectEpicJobs(sqlite, epicId);
  const readinessBefore = loadEpicReadinessSummary(sqlite, epicId);
  const drift: DriftReport = {
    stale_chain_refs: detectStaleChainRefs(sqlite, epicId),
    dead_jobs_blocking_readiness: detectDeadBlockingJobs(jobs),
    integrity_flags: detectIntegrityFlags(sqlite, epicId, jobs),
    stale_redirect_markers: epicRun && hasRedirectMarkers(epicRun.status_json) ? [epicId] : [],
  };

  let deadJobsMarkedError: string[] = [];
  let readinessResynced = false;
  let redirectMarkersCleared = false;

  if (apply) {
    if (drift.dead_jobs_blocking_readiness.length > 0) {
      deadJobsMarkedError = markDeadJobsAsError(sqlite, jobs);
    }

    const readinessNext = loadEpicReadinessSummary(sqlite, epicId);
    const synced = syncEpicStateFromReadiness(sqlite, readinessNext);
    readinessResynced = synced.status !== readinessNext.persisted_state;

    if (epicRun && drift.stale_redirect_markers.length > 0) {
      const cleaned = clearRedirectMarkers(epicRun.status_json);
      if (cleaned && cleaned !== epicRun.status_json) {
        sqlite.upsertEpicRun({
          ...epicRun,
          status_json: cleaned,
          updated_at_ms: Date.now(),
        });
        redirectMarkersCleared = true;
      }
    }
  }

  const readinessAfter = loadEpicReadinessSummary(sqlite, epicId);

  return {
    epic_id: epicId,
    apply,
    drift,
    repairs: {
      dead_jobs_marked_error: deadJobsMarkedError,
      readiness_resynced: readinessResynced,
      redirect_markers_cleared: redirectMarkersCleared,
    },
    readiness_before: readinessBefore,
    readiness_after: readinessAfter,
  };
}

function listLiveMemberJobIds(sqlite: ObservabilitySqliteClient, epicId: string): string[] {
  return collectEpicJobs(sqlite, epicId)
    .filter((job) => ACTIVE_JOB_STATUSES.has(job.status) && !isJobDead(job))
    .map((job) => job.id);
}

function buildAbandonedStatusJson(epic: EpicRunRecord | null, epicId: string, fromState: EpicState, reason: string, forced: boolean): string {
  const base = appendEpicTransitionAudit(epic?.status_json, {
    from: fromState,
    to: 'abandoned',
    at_ms: Date.now(),
    reason,
    trigger: 'sp epic abandon',
    forced,
  });

  try {
    const parsed = JSON.parse(base) as Record<string, unknown>;
    return JSON.stringify({
      ...parsed,
      epic_id: epicId,
      status: 'abandoned',
      reason,
      forced,
    });
  } catch {
    return base;
  }
}

export function abandonEpic(sqlite: ObservabilitySqliteClient, epicId: string, reason: string, force: boolean): EpicAbandonResult {
  const epic = sqlite.readEpicRun(epicId);
  const fromState: EpicState = epic?.status ?? 'open';

  if (fromState === 'merged') {
    throw new Error(`Epic ${epicId} already merged. Abandon blocked.`);
  }

  if (fromState === 'failed' || fromState === 'abandoned') {
    throw new Error(`Epic ${epicId} already terminal in state '${fromState}'.`);
  }

  const liveMemberJobIds = listLiveMemberJobIds(sqlite, epicId);
  if (!force && liveMemberJobIds.length > 0) {
    throw new Error(`Epic ${epicId} has live members: ${liveMemberJobIds.join(', ')}. Retry with --force to abandon anyway.`);
  }

  const statusJson = buildAbandonedStatusJson(epic, epicId, fromState, reason, force);
  sqlite.upsertEpicRun({
    epic_id: epicId,
    status: 'abandoned',
    status_json: statusJson,
    updated_at_ms: Date.now(),
  });

  return {
    epic_id: epicId,
    from_state: fromState,
    to_state: 'abandoned',
    forced: force,
    reason,
    live_member_job_ids: liveMemberJobIds,
  };
}
