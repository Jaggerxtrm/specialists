import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolveObservabilityDbLocation } from './observability-db.js';
import type { TimelineEvent } from './timeline-events.js';
import type { SupervisorStatus } from './supervisor.js';

function quoteSql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function toSqlNumber(value: number | undefined): string {
  return value === undefined ? 'NULL' : String(value);
}

function toSqlText(value: string | undefined): string {
  return value === undefined ? 'NULL' : quoteSql(value);
}

function hasSqlite3Binary(): boolean {
  const probe = spawnSync('which', ['sqlite3'], { stdio: 'ignore' });
  return probe.status === 0;
}

function runSql(dbPath: string, sql: string): string {
  return execFileSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function initSchema(dbPath: string): void {
  runSql(dbPath, `
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS specialist_jobs (
      job_id TEXT PRIMARY KEY,
      specialist TEXT NOT NULL,
      status_json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS specialist_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      specialist TEXT NOT NULL,
      bead_id TEXT,
      t INTEGER NOT NULL,
      type TEXT NOT NULL,
      event_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_specialist_events_job_t ON specialist_events(job_id, t, id);
    CREATE TABLE IF NOT EXISTS specialist_results (
      job_id TEXT PRIMARY KEY,
      output TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
  `);
}

export interface ObservabilitySqliteClient {
  upsertStatus(status: SupervisorStatus): void;
  appendEvent(jobId: string, specialist: string, beadId: string | undefined, event: TimelineEvent): void;
  upsertResult(jobId: string, output: string): void;
  readStatus(jobId: string): SupervisorStatus | null;
  listStatuses(): SupervisorStatus[];
  readEvents(jobId: string): TimelineEvent[];
  readResult(jobId: string): string | null;
}

class SqliteClient implements ObservabilitySqliteClient {
  constructor(private readonly dbPath: string) {}

  upsertStatus(status: SupervisorStatus): void {
    const statusJson = quoteSql(JSON.stringify(status));
    const specialist = quoteSql(status.specialist);
    const sql = `
      INSERT INTO specialist_jobs (job_id, specialist, status_json, updated_at_ms)
      VALUES (${quoteSql(status.id)}, ${specialist}, ${statusJson}, ${Date.now()})
      ON CONFLICT(job_id) DO UPDATE SET
        specialist = excluded.specialist,
        status_json = excluded.status_json,
        updated_at_ms = excluded.updated_at_ms;
    `;
    runSql(this.dbPath, sql);
  }

  appendEvent(jobId: string, specialist: string, beadId: string | undefined, event: TimelineEvent): void {
    const eventJson = quoteSql(JSON.stringify(event));
    const sql = `
      INSERT INTO specialist_events (job_id, specialist, bead_id, t, type, event_json)
      VALUES (
        ${quoteSql(jobId)},
        ${quoteSql(specialist)},
        ${toSqlText(beadId)},
        ${toSqlNumber(event.t)},
        ${quoteSql(event.type)},
        ${eventJson}
      );
    `;
    runSql(this.dbPath, sql);
  }

  upsertResult(jobId: string, output: string): void {
    const sql = `
      INSERT INTO specialist_results (job_id, output, updated_at_ms)
      VALUES (${quoteSql(jobId)}, ${quoteSql(output)}, ${Date.now()})
      ON CONFLICT(job_id) DO UPDATE SET
        output = excluded.output,
        updated_at_ms = excluded.updated_at_ms;
    `;
    runSql(this.dbPath, sql);
  }

  readStatus(jobId: string): SupervisorStatus | null {
    const rowsRaw = runSql(this.dbPath, `SELECT status_json FROM specialist_jobs WHERE job_id = ${quoteSql(jobId)} LIMIT 1;`).trim();
    if (!rowsRaw) return null;

    const rows = JSON.parse(rowsRaw) as Array<{ status_json?: string }>;
    const encoded = rows[0]?.status_json;
    if (!encoded) return null;
    return JSON.parse(encoded) as SupervisorStatus;
  }

  listStatuses(): SupervisorStatus[] {
    const rowsRaw = runSql(this.dbPath, 'SELECT status_json FROM specialist_jobs ORDER BY updated_at_ms DESC;').trim();
    if (!rowsRaw) return [];
    const rows = JSON.parse(rowsRaw) as Array<{ status_json?: string }>;
    const statuses: SupervisorStatus[] = [];
    for (const row of rows) {
      if (!row.status_json) continue;
      try { statuses.push(JSON.parse(row.status_json) as SupervisorStatus); } catch { /* ignore malformed rows */ }
    }
    return statuses;
  }

  readEvents(jobId: string): TimelineEvent[] {
    const rowsRaw = runSql(this.dbPath, `
      SELECT event_json FROM specialist_events
      WHERE job_id = ${quoteSql(jobId)}
      ORDER BY t ASC, id ASC;
    `).trim();
    if (!rowsRaw) return [];

    const rows = JSON.parse(rowsRaw) as Array<{ event_json?: string }>;
    const events: TimelineEvent[] = [];
    for (const row of rows) {
      if (!row.event_json) continue;
      try { events.push(JSON.parse(row.event_json) as TimelineEvent); } catch { /* ignore malformed rows */ }
    }
    return events;
  }

  readResult(jobId: string): string | null {
    const rowsRaw = runSql(this.dbPath, `SELECT output FROM specialist_results WHERE job_id = ${quoteSql(jobId)} LIMIT 1;`).trim();
    if (!rowsRaw) return null;
    const rows = JSON.parse(rowsRaw) as Array<{ output?: string }>;
    return rows[0]?.output ?? null;
  }
}

export function createObservabilitySqliteClient(cwd: string = process.cwd()): ObservabilitySqliteClient | null {
  if (!hasSqlite3Binary()) return null;

  const location = resolveObservabilityDbLocation(cwd);
  if (!existsSync(location.dbPath)) return null;

  try {
    initSchema(location.dbPath);
    return new SqliteClient(location.dbPath);
  } catch {
    return null;
  }
}
