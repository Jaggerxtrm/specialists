import type { ObservabilitySqliteClient } from './observability-sqlite.js';

export interface DeadJobAuditFinding {
  job_id: string;
  pid: number;
  reason: string;
  age_ms: number;
}

export interface DeadJobAuditResult {
  dryRun: boolean;
  found: DeadJobAuditFinding[];
  cancelled: number;
}

function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ESRCH') {
      return false;
    }
    return true;
  }
}

export function auditDeadJobs(opts: {
  client: ObservabilitySqliteClient;
  dryRun?: boolean;
  nowMs?: number;
  isPidAlive?: (pid: number) => boolean;
  minAgeMs?: number;
}): DeadJobAuditResult {
  const dryRun = opts.dryRun ?? false;
  const nowMs = opts.nowMs ?? Date.now();
  const isPidAlive = opts.isPidAlive ?? defaultIsPidAlive;
  const minAgeMs = opts.minAgeMs ?? 60_000;

  const rows = opts.client.listStaleSpecialistJobs({ minAgeMs, nowMs });
  const found: DeadJobAuditFinding[] = [];
  let cancelled = 0;

  for (const row of rows) {
    if (isPidAlive(row.pid)) continue;

    const age_ms = Math.max(0, nowMs - row.updated_at_ms);
    found.push({
      job_id: row.job_id,
      pid: row.pid,
      reason: 'container-restart-orphan',
      age_ms,
    });

    if (!dryRun) {
      opts.client.markSpecialistJobCancelled(row.job_id, 'container-restart-orphan');
      cancelled += 1;
    }
  }

  return { dryRun, found, cancelled };
}
