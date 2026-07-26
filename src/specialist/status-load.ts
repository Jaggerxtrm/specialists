import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createObservabilitySqliteClient } from './observability-sqlite.js';
import { resolveJobsDir } from './job-root.js';
import type { SupervisorStatus } from './supervisor.js';
import { buildDeadJobRecovery, emitParentNotification, isJobDead, writeDeadJobArtifact } from './supervisor.js';
import type { TimelineEvent, TimelineEventRunComplete, TimelineEventTool, TimelineRunMetrics } from './timeline-events.js';
import { parseTimelineEvent } from './timeline-events.js';

function hasStatusId(status: SupervisorStatus): status is SupervisorStatus & { id: string } {
  return typeof status.id === 'string' && status.id.trim().length > 0;
}

function readStatusesFromFiles(jobsDir: string): SupervisorStatus[] {
  if (!existsSync(jobsDir)) return [];

  const statuses: SupervisorStatus[] = [];
  for (const entry of readdirSync(jobsDir)) {
    const statusPath = join(jobsDir, entry, 'status.json');
    if (!existsSync(statusPath)) continue;
    try {
      const status = JSON.parse(readFileSync(statusPath, 'utf-8')) as SupervisorStatus;
      if (hasStatusId(status)) statuses.push(status);
    } catch {
      // ignore malformed status files
    }
  }

  return statuses.sort((a, b) => b.started_at_ms - a.started_at_ms);
}

function readLastToolEventFromFile(jobsDir: string, jobId: string): TimelineEventTool | undefined {
  const eventsPath = join(jobsDir, jobId, 'events.jsonl');
  if (!existsSync(eventsPath)) return undefined;

  try {
    const lines = readFileSync(eventsPath, 'utf-8').split('\n');
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]?.trim();
      if (!line) continue;
      const parsed = parseTimelineEvent(line);
      if (!parsed || parsed.type !== 'tool') continue;
      return parsed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function resolveDerivedCurrentTool(
  status: SupervisorStatus,
  jobsDir: string,
  sqliteClient: ReturnType<typeof createObservabilitySqliteClient>,
): string | undefined {
  let lastToolEvent: TimelineEventTool | undefined;

  try {
    lastToolEvent = sqliteClient?.readLatestToolEvent(status.id) ?? undefined;
  } catch {
    lastToolEvent = undefined;
  }

  if (!lastToolEvent) {
    lastToolEvent = readLastToolEventFromFile(jobsDir, status.id);
  }

  if (!lastToolEvent) return status.current_tool;
  if (lastToolEvent.phase === 'start') return lastToolEvent.tool;
  return undefined;
}

function enrichStatusesWithDerivedCurrentTool(
  statuses: SupervisorStatus[],
  jobsDir: string,
  sqliteClient: ReturnType<typeof createObservabilitySqliteClient>,
): SupervisorStatus[] {
  return statuses.map((status) => ({
    ...status,
    current_tool: resolveDerivedCurrentTool(status, jobsDir, sqliteClient),
  }));
}

function statusFreshnessMs(status: SupervisorStatus): number {
  return Math.max(status.last_event_at_ms ?? 0, status.started_at_ms ?? 0);
}

function mergeStatuses(fileStatuses: SupervisorStatus[], sqliteStatuses: SupervisorStatus[]): SupervisorStatus[] {
  const merged = new Map<string, SupervisorStatus>();
  for (const status of fileStatuses) {
    if (hasStatusId(status)) merged.set(status.id, status);
  }
  for (const status of sqliteStatuses) {
    if (!hasStatusId(status)) continue;
    const current = merged.get(status.id);
    if (!current || statusFreshnessMs(status) >= statusFreshnessMs(current)) {
      merged.set(status.id, status);
    }
  }
  return [...merged.values()];
}

function isActiveStatus(status: SupervisorStatus): boolean {
  return status.status === 'starting' || status.status === 'running' || status.status === 'waiting';
}

function statusFromRunComplete(status: TimelineEventRunComplete['status'] | undefined): SupervisorStatus['status'] | undefined {
  if (status === 'COMPLETE') return 'done';
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'ERROR') return 'error';
  return undefined;
}

function latestRunComplete(events: readonly TimelineEvent[]): TimelineEventRunComplete | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === 'run_complete') return event as TimelineEventRunComplete;
  }
  return undefined;
}

function mergedMetrics(status: SupervisorStatus, complete: TimelineEventRunComplete): TimelineRunMetrics | undefined {
  const tokenUsage = complete.token_usage ?? complete.metrics?.token_usage;
  const metrics = {
    ...(status.metrics ?? {}),
    ...(complete.metrics ?? {}),
    ...(tokenUsage ? { token_usage: tokenUsage } : {}),
    ...(complete.finish_reason ? { finish_reason: complete.finish_reason } : {}),
    ...(complete.tool_calls ? { tool_call_names: complete.tool_calls, tool_calls: complete.tool_calls.length } : {}),
    ...(complete.exit_reason ? { exit_reason: complete.exit_reason } : {}),
  };

  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

function hasStatusLoadEvidence(events: readonly TimelineEvent[], eventName: string): boolean {
  return events.some((event) => {
    if (event.type !== 'meta') return false;
    const meta = event as TimelineEvent & { source?: string; data?: { event?: unknown; component?: unknown } };
    return meta.source === 'status-load'
      && meta.data?.component === 'status-load'
      && meta.data?.event === eventName;
  });
}

function statusLoadEvent(
  eventName: 'status_reconciled' | 'dead_job_detected',
  status: SupervisorStatus,
  nextStatus: SupervisorStatus['status'],
  reason: string,
): TimelineEvent {
  return {
    t: Date.now(),
    type: 'meta',
    model: eventName,
    backend: 'status-load',
    source: 'status-load',
    data: {
      component: 'status-load',
      event: eventName,
      job_id: status.id,
      previous_status: status.status,
      next_status: nextStatus,
      pid: status.pid,
      tmux_session: status.tmux_session,
      reason,
    },
  } as TimelineEvent;
}

function persistReconciledStatus(
  sqliteClient: ReturnType<typeof createObservabilitySqliteClient>,
  previous: SupervisorStatus,
  next: SupervisorStatus,
  events: readonly TimelineEvent[],
  reason: string,
): void {
  if (!sqliteClient) return;
  try {
    const evidence = statusLoadEvent('status_reconciled', previous, next.status, reason);
    if (hasStatusLoadEvidence(events, 'status_reconciled')) {
      sqliteClient.upsertStatus(next);
      return;
    }
    sqliteClient.upsertStatusWithEvent(next, evidence);
  } catch {
    // Reconciliation is best-effort; callers still receive the repaired snapshot.
  }
}

function persistDeadJobEvidence(
  sqliteClient: ReturnType<typeof createObservabilitySqliteClient>,
  status: SupervisorStatus,
  nextStatus: SupervisorStatus['status'],
  events: readonly TimelineEvent[],
): void {
  if (!sqliteClient || hasStatusLoadEvidence(events, 'dead_job_detected')) return;
  try {
    sqliteClient.appendEvent(
      status.id,
      status.specialist,
      status.bead_id,
      statusLoadEvent('dead_job_detected', status, nextStatus, 'active status has dead pid or tmux session'),
    );
  } catch {
    // best-effort telemetry only
  }
}

/**
 * Dead pid/tmux session detected: transition the job to the canonical terminal status
 * and fire the normal parent notification. Detecting the death without transitioning
 * leaves the row active forever, and `emitParentNotification` only fires on done/error,
 * so the parent is never told the job is gone (xtrm-wiy5n.4.13).
 */
function reconcileDeadJob(
  status: SupervisorStatus,
  sqliteClient: ReturnType<typeof createObservabilitySqliteClient>,
  jobsDir: string,
  events: readonly TimelineEvent[],
): SupervisorStatus {
  const recovery = buildDeadJobRecovery(status);
  if (!recovery) {
    persistDeadJobEvidence(sqliteClient, status, status.status, events);
    return status;
  }

  persistDeadJobEvidence(sqliteClient, status, recovery.status.status, events);
  try {
    sqliteClient?.upsertStatusWithEvent(recovery.status, recovery.event);
  } catch {
    // The parent still gets notified below; the row is repaired on the next read.
  }

  writeDeadJobArtifact(jobsDir, recovery.status);
  emitParentNotification(recovery.status);

  return recovery.status;
}

function reconcileStatusFromEvents(
  status: SupervisorStatus,
  sqliteClient: ReturnType<typeof createObservabilitySqliteClient>,
  jobsDir: string,
): SupervisorStatus {
  if (!isActiveStatus(status) || !sqliteClient) return status;

  let events: TimelineEvent[] = [];
  try {
    events = sqliteClient.readEvents(status.id);
  } catch {
    events = [];
  }

  const complete = latestRunComplete(events);
  const terminalStatus = statusFromRunComplete(complete?.status);
  if (complete && terminalStatus && terminalStatus !== status.status) {
    const reconciled: SupervisorStatus = {
      ...status,
      status: terminalStatus,
      elapsed_s: complete.elapsed_s ?? status.elapsed_s,
      last_event_at_ms: complete.t,
      model: complete.model ?? status.model,
      backend: complete.backend ?? status.backend,
      bead_id: complete.bead_id ?? status.bead_id,
      metrics: mergedMetrics(status, complete),
      ...(complete.metrics?.output_type ? { output_type: complete.metrics.output_type } : {}),
      ...(complete.error ? { error: complete.error } : {}),
    };
    persistReconciledStatus(sqliteClient, status, reconciled, events, `terminal run_complete ${complete.status}`);
    return reconciled;
  }

  if (isJobDead(status)) {
    return reconcileDeadJob(status, sqliteClient, jobsDir, events);
  }

  return status;
}

function reconcileStatuses(
  statuses: SupervisorStatus[],
  sqliteClient: ReturnType<typeof createObservabilitySqliteClient>,
  jobsDir: string,
): SupervisorStatus[] {
  return statuses.map((status) => reconcileStatusFromEvents(status, sqliteClient, jobsDir));
}

export function loadStatuses(): SupervisorStatus[] {
  const sqliteClient = createObservabilitySqliteClient();
  const jobsDir = resolveJobsDir();
  const fileStatuses = readStatusesFromFiles(jobsDir);

  try {
    const sqliteStatuses = (sqliteClient?.listStatuses() ?? []).filter(hasStatusId);
    const merged = sqliteStatuses.length === 0
      ? fileStatuses
      : mergeStatuses(fileStatuses, sqliteStatuses);

    return enrichStatusesWithDerivedCurrentTool(reconcileStatuses(merged, sqliteClient, jobsDir), jobsDir, sqliteClient)
      .sort((a, b) => b.started_at_ms - a.started_at_ms);
  } catch {
    return enrichStatusesWithDerivedCurrentTool(fileStatuses.filter(hasStatusId), jobsDir, sqliteClient)
      .sort((a, b) => b.started_at_ms - a.started_at_ms);
  } finally {
    sqliteClient?.close();
  }
}
