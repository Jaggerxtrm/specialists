import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveObservabilityDbLocation } from '../../src/specialist/observability-db.js';
import { initSchema } from '../../src/specialist/observability-sqlite.js';

export type ObservabilityJobStatus = Record<string, unknown> & {
  id: string;
  specialist?: string;
  status?: string;
  started_at_ms?: number;
};

export type ObservabilityEvent = Record<string, unknown> & {
  t?: number;
  type?: string;
  seq?: number;
};

export function createObservabilityJobsDir(rootDir: string): string {
  return join(rootDir, '.specialists', 'jobs');
}

export function createObservabilityJobDir(rootDir: string, jobId: string): string {
  const jobDir = join(createObservabilityJobsDir(rootDir), jobId);
  mkdirSync(jobDir, { recursive: true });
  return jobDir;
}

export function openObservabilityTestDb(rootDir: string): Database {
  const location = resolveObservabilityDbLocation(rootDir);
  mkdirSync(location.dbDirectory, { recursive: true });
  const db = new Database(location.dbPath);
  initSchema(db);
  return db;
}

export function seedObservabilityStatus(db: Database, jobId: string, status: ObservabilityJobStatus): void {
  db.run(
    `INSERT INTO specialist_jobs (job_id, specialist, status, status_json, updated_at_ms)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET
       specialist = excluded.specialist,
       status = excluded.status,
       status_json = excluded.status_json,
       updated_at_ms = excluded.updated_at_ms`,
    [jobId, String(status.specialist ?? 'unknown'), String(status.status ?? 'running'), JSON.stringify(status), Date.now()],
  );
}

export function seedObservabilityEvents(db: Database, jobId: string, specialist: string, events: ObservabilityEvent[], beadId: string | null = null): void {
  events.forEach((event, index) => {
    const seq = Number(event.seq ?? index + 1);
    db.run(
      `INSERT INTO specialist_events (job_id, seq, specialist, bead_id, t, type, event_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [jobId, seq, specialist, beadId, Number(event.t ?? Date.now()), String(event.type ?? 'text'), JSON.stringify({ ...event, seq })],
    );
  });
}

export function seedObservabilityResult(db: Database, jobId: string, output: string, updatedAtMs = Date.now()): void {
  db.run(
    `INSERT INTO specialist_results (job_id, output, updated_at_ms)
     VALUES (?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET
       output = excluded.output,
       updated_at_ms = excluded.updated_at_ms`,
    [jobId, output, updatedAtMs],
  );
}

export function seedObservabilityFullJob(
  db: Database,
  jobId: string,
  status: ObservabilityJobStatus,
  events: ObservabilityEvent[] = [],
  resultOutput?: string,
): void {
  const specialist = String(status.specialist ?? 'unknown');
  seedObservabilityStatus(db, jobId, status);
  seedObservabilityEvents(db, jobId, specialist, events, (status.bead_id as string | undefined) ?? null);
  if (resultOutput !== undefined) {
    seedObservabilityResult(db, jobId, resultOutput);
  }
}

export function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}
