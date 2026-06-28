import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createObservabilitySqliteClientAtPath,
  initSchema,
} from '../../../src/specialist/observability-sqlite.js';

describe('observability-sqlite — listJobsNeedingPrDriftRefresh', () => {
  let tempDbPath: string;
  let db: Database | null = null;
  let sqliteClient: ReturnType<typeof createObservabilitySqliteClientAtPath> | null = null;

  beforeEach(() => {
    tempDbPath = join(mkdtempSync(join(tmpdir(), 'obs-')), 'obs.db');
  });

  afterEach(() => {
    sqliteClient?.close();
    db?.close();
    rmSync(tempDbPath, { force: true });
  });

  function seedJob(client: NonNullable<typeof sqliteClient>, jobId: string, overrides: Record<string, unknown>): void {
    client.upsertStatus({
      id: jobId,
      specialist: 'executor',
      status: 'running',
      started_at_ms: 1,
      ...overrides,
    } as import('../../../src/specialist/supervisor.js').SupervisorStatus);
    if (overrides.pr_url) {
      client.updatePrDriftState(jobId, {
        pr_url: String(overrides.pr_url),
        pr_drift_checked_at_ms: typeof overrides.pr_drift_checked_at_ms === 'number' ? overrides.pr_drift_checked_at_ms : null,
      });
    }
  }

  it('returns jobs with pr_url ordered by pr_drift_checked_at_ms ASC NULLS FIRST', () => {
    db = new Database(tempDbPath);
    initSchema(db);
    const client = createObservabilitySqliteClientAtPath(tempDbPath)!;
    sqliteClient = client;

    seedJob(client, 'job-a', { pr_url: 'https://github.com/o/r/pull/1', pr_drift_checked_at_ms: 2000 });
    seedJob(client, 'job-b', { pr_url: 'https://github.com/o/r/pull/2', pr_drift_checked_at_ms: null });
    seedJob(client, 'job-c', { pr_url: 'https://github.com/o/r/pull/3', pr_drift_checked_at_ms: 1000 });
    seedJob(client, 'job-d', { pr_url: null, pr_drift_checked_at_ms: null });

    const rows = client.listJobsNeedingPrDriftRefresh();
    expect(rows).toHaveLength(3);
    expect(rows[0]!.job_id).toBe('job-b');
    expect(rows[1]!.job_id).toBe('job-c');
    expect(rows[2]!.job_id).toBe('job-a');
  });

  it('includes branch extracted from status_json', () => {
    db = new Database(tempDbPath);
    initSchema(db);
    const client = createObservabilitySqliteClientAtPath(tempDbPath)!;
    sqliteClient = client;

    seedJob(client, 'job-branch', { pr_url: 'https://github.com/o/r/pull/5', branch: 'feature/x' });

    const rows = client.listJobsNeedingPrDriftRefresh();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.branch).toBe('feature/x');
  });

  it('limits to 50 rows', () => {
    db = new Database(tempDbPath);
    initSchema(db);
    const client = createObservabilitySqliteClientAtPath(tempDbPath)!;
    sqliteClient = client;

    for (let i = 0; i < 55; i++) {
      seedJob(client, `job-${i}`, { pr_url: `https://github.com/o/r/pull/${i}` });
    }

    const rows = client.listJobsNeedingPrDriftRefresh();
    expect(rows).toHaveLength(50);
  });
});
