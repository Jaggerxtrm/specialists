import { existsSync } from 'node:fs';

// bun:sqlite is Bun-only — lazy-load to avoid breaking Node/vitest imports.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BunDb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _BunDatabase: (new (path: string) => BunDb) | null = null;
let _probed = false;
function loadBunDatabase(): (new (path: string) => BunDb) | null {
  if (_probed) return _BunDatabase;
  _probed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _BunDatabase = require('bun:sqlite').Database;
  } catch {
    _BunDatabase = null;
  }
  return _BunDatabase;
}
import { resolveObservabilityDbLocation } from './observability-db.js';
import type { TimelineEvent } from './timeline-events.js';
import type { SupervisorStatus } from './supervisor.js';

const BUSY_TIMEOUT_MS = 5000;
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 50;

function quoteSql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function toSqlNumber(value: number | undefined): string {
  return value === undefined ? 'NULL' : String(value);
}

function toSqlText(value: string | undefined): string {
  return value === undefined ? 'NULL' : quoteSql(value);
}

/**
 * Calculate retry delay with exponential backoff and jitter.
 * Formula: min(baseDelay * 2^attempt + random(0, baseDelay), busyTimeout)
 */
function calculateRetryDelay(attempt: number): number {
  const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_RETRY_DELAY_MS;
  return Math.min(exponentialDelay + jitter, BUSY_TIMEOUT_MS);
}

/**
 * Execute a database operation with bounded retry logic.
 * Retries on SQLITE_BUSY (5) and SQLITE_LOCKED (6) errors.
 */
function withRetry<T>(operation: () => T, context: string): T {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a retryable SQLite error
      const isRetryable = 
        lastError.message.includes('SQLITE_BUSY') ||
        lastError.message.includes('SQLITE_LOCKED') ||
        lastError.message.includes('database is locked') ||
        lastError.message.includes('database is busy');
      
      if (!isRetryable || attempt === MAX_RETRY_ATTEMPTS - 1) {
        break;
      }
      
      const delayMs = calculateRetryDelay(attempt);
      // Synchronous sleep for retry delay
      const start = Date.now();
      while (Date.now() - start < delayMs) {
        // Busy wait - acceptable for short delays in retry scenarios
      }
    }
  }
  
  throw new Error(`Failed after ${MAX_RETRY_ATTEMPTS} attempts (${context}): ${lastError?.message ?? 'unknown error'}`);
}

export function parseJournalMode(mode: string | null | undefined): string | null {
  if (!mode) return null;
  return mode.toLowerCase();
}

export function enforceWalMode(db: BunDb): void {
  const result = db.query('PRAGMA journal_mode=WAL').get() as { journal_mode?: string };
  const mode = parseJournalMode(result?.journal_mode);
  if (mode !== 'wal') {
    throw new Error(`Failed to enable WAL journal mode (got: ${mode ?? 'null'})`);
  }
}

export function verifyWalMode(db: BunDb): void {
  const result = db.query('PRAGMA journal_mode').get() as { journal_mode?: string };
  const mode = parseJournalMode(result?.journal_mode);
  if (mode !== 'wal') {
    throw new Error(`WAL journal mode is not active (got: ${mode ?? 'null'})`);
  }
}

function migrateToV2(db: BunDb): void {
  const hasV2 = db.query('SELECT 1 FROM schema_version WHERE version = 2 LIMIT 1').get() as { 1?: number } | undefined;
  if (hasV2) {
    db.run('CREATE INDEX IF NOT EXISTS idx_jobs_bead ON specialist_jobs(bead_id) WHERE bead_id IS NOT NULL');
    return;
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS specialist_jobs_v2 (
      job_id          TEXT PRIMARY KEY,
      specialist      TEXT NOT NULL,
      worktree_column TEXT,
      status_json     TEXT NOT NULL,
      bead_id         TEXT,
      updated_at_ms   INTEGER NOT NULL,
      last_output     TEXT
    );
    INSERT OR IGNORE INTO specialist_jobs_v2
      SELECT
        job_id,
        specialist,
        worktree_column,
        status_json,
        JSON_EXTRACT(status_json, '$.bead_id'),
        updated_at_ms,
        last_output
      FROM specialist_jobs;
    DROP TABLE IF EXISTS specialist_jobs;
    ALTER TABLE specialist_jobs_v2 RENAME TO specialist_jobs;
    CREATE INDEX IF NOT EXISTS idx_jobs_bead ON specialist_jobs(bead_id) WHERE bead_id IS NOT NULL;
    INSERT OR IGNORE INTO schema_version (version, applied_at_ms)
      VALUES (2, strftime('%s', 'now') * 1000);
  `);
}

export function initSchema(db: BunDb): void {
  enforceWalMode(db);

  // Step 1: core tables + schema_version (must run before migration)
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER PRIMARY KEY,
      applied_at_ms INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO schema_version (version, applied_at_ms)
      VALUES (1, strftime('%s', 'now') * 1000);

    -- Ensure specialist_jobs exists with at least the base columns so the
    -- migration INSERT below can always SELECT from it.
    CREATE TABLE IF NOT EXISTS specialist_jobs (
      job_id       TEXT PRIMARY KEY,
      specialist   TEXT NOT NULL,
      status_json  TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS specialist_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id       TEXT NOT NULL,
      specialist   TEXT NOT NULL,
      bead_id      TEXT,
      t            INTEGER NOT NULL,
      type         TEXT NOT NULL,
      event_json   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_specialist_events_job_t
      ON specialist_events(job_id, t, id);

    CREATE TABLE IF NOT EXISTS specialist_results (
      job_id        TEXT PRIMARY KEY,
      output        TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
  `);

  // Step 2: idempotent v1 migration — rebuild specialist_jobs with new columns.
  db.run(`
    CREATE TABLE IF NOT EXISTS specialist_jobs_new (
      job_id         TEXT PRIMARY KEY,
      specialist     TEXT NOT NULL,
      worktree_column TEXT,
      status_json    TEXT NOT NULL,
      updated_at_ms  INTEGER NOT NULL,
      last_output    TEXT
    );
    INSERT OR IGNORE INTO specialist_jobs_new
      SELECT job_id, specialist, NULL, status_json, updated_at_ms, NULL
      FROM specialist_jobs;
    DROP TABLE IF EXISTS specialist_jobs;
    ALTER TABLE specialist_jobs_new RENAME TO specialist_jobs;
  `);

  migrateToV2(db);
  verifyWalMode(db);
}

export interface ObservabilitySqliteClient {
  upsertStatus(status: SupervisorStatus): void;
  upsertStatusWithEvent(status: SupervisorStatus, event: TimelineEvent): void;
  upsertStatusWithEventAndResult(status: SupervisorStatus, event: TimelineEvent, output: string): void;
  appendEvent(jobId: string, specialist: string, beadId: string | undefined, event: TimelineEvent): void;
  upsertResult(jobId: string, output: string): void;
  readStatus(jobId: string): SupervisorStatus | null;
  listStatuses(): SupervisorStatus[];
  readEvents(jobId: string): TimelineEvent[];
  readResult(jobId: string): string | null;
  close(): void;
}

class SqliteClient implements ObservabilitySqliteClient {
  private readonly db: BunDb;

  constructor(dbPath: string) {
    // Open persistent connection with WAL mode and busy_timeout
    const Ctor = loadBunDatabase()!;
    this.db = new Ctor(dbPath);
    
    // Set busy_timeout for connection-level locking handling
    this.db.run(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
    
    // Ensure WAL mode is set (will be no-op if already set by initSchema)
    this.db.run('PRAGMA journal_mode=WAL');
  }

  private writeStatusRow(status: SupervisorStatus, lastOutput?: string): void {
    const statusJson = JSON.stringify(status);
    this.db.run(`
      INSERT INTO specialist_jobs (job_id, specialist, status_json, bead_id, worktree_column, updated_at_ms, last_output)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        specialist = excluded.specialist,
        status_json = excluded.status_json,
        bead_id = excluded.bead_id,
        worktree_column = excluded.worktree_column,
        updated_at_ms = excluded.updated_at_ms,
        last_output = COALESCE(excluded.last_output, specialist_jobs.last_output);
    `, [status.id, status.specialist, statusJson, status.bead_id ?? null, status.worktree_path ?? null, Date.now(), lastOutput ?? null]);
  }

  private writeEventRow(jobId: string, specialist: string, beadId: string | undefined, event: TimelineEvent): void {
    const eventJson = JSON.stringify(event);
    this.db.run(`
      INSERT INTO specialist_events (job_id, specialist, bead_id, t, type, event_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [jobId, specialist, beadId ?? null, event.t, event.type, eventJson]);
  }

  private writeResultRow(jobId: string, output: string): void {
    this.db.run(`
      INSERT INTO specialist_results (job_id, output, updated_at_ms)
      VALUES (?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        output = excluded.output,
        updated_at_ms = excluded.updated_at_ms;
    `, [jobId, output, Date.now()]);
  }

  upsertStatus(status: SupervisorStatus): void {
    withRetry(() => {
      this.writeStatusRow(status);
    }, 'upsertStatus');
  }

  upsertStatusWithEvent(status: SupervisorStatus, event: TimelineEvent): void {
    withRetry(() => {
      const transaction = this.db.transaction(() => {
        this.writeStatusRow(status);
        this.writeEventRow(status.id, status.specialist, status.bead_id, event);
      });
      transaction();
    }, 'upsertStatusWithEvent');
  }

  upsertStatusWithEventAndResult(status: SupervisorStatus, event: TimelineEvent, output: string): void {
    withRetry(() => {
      const transaction = this.db.transaction(() => {
        this.writeStatusRow(status, output);
        this.writeEventRow(status.id, status.specialist, status.bead_id, event);
        this.writeResultRow(status.id, output);
      });
      transaction();
    }, 'upsertStatusWithEventAndResult');
  }

  appendEvent(jobId: string, specialist: string, beadId: string | undefined, event: TimelineEvent): void {
    withRetry(() => {
      this.writeEventRow(jobId, specialist, beadId, event);
    }, 'appendEvent');
  }

  upsertResult(jobId: string, output: string): void {
    withRetry(() => {
      this.writeResultRow(jobId, output);
      // Also update last_output on the job row for quick access
      this.db.run(`
        UPDATE specialist_jobs SET last_output = ? WHERE job_id = ?
      `, [output, jobId]);
    }, 'upsertResult');
  }

  readStatus(jobId: string): SupervisorStatus | null {
    return withRetry(() => {
      const row = this.db.query('SELECT status_json FROM specialist_jobs WHERE job_id = ? LIMIT 1').get(jobId) as { status_json?: string } | undefined;
      if (!row?.status_json) return null;
      return JSON.parse(row.status_json) as SupervisorStatus;
    }, 'readStatus');
  }

  listStatuses(): SupervisorStatus[] {
    return withRetry(() => {
      const rows = this.db.query('SELECT status_json FROM specialist_jobs ORDER BY updated_at_ms DESC').all() as Array<{ status_json?: string }>;
      const statuses: SupervisorStatus[] = [];
      for (const row of rows) {
        if (!row.status_json) continue;
        try { statuses.push(JSON.parse(row.status_json) as SupervisorStatus); } catch { /* ignore malformed rows */ }
      }
      return statuses;
    }, 'listStatuses');
  }

  readEvents(jobId: string): TimelineEvent[] {
    return withRetry(() => {
      const rows = this.db.query(`
        SELECT event_json FROM specialist_events
        WHERE job_id = ?
        ORDER BY t ASC, id ASC;
      `).all(jobId) as Array<{ event_json?: string }>;
      const events: TimelineEvent[] = [];
      for (const row of rows) {
        if (!row.event_json) continue;
        try { events.push(JSON.parse(row.event_json) as TimelineEvent); } catch { /* ignore malformed rows */ }
      }
      return events;
    }, 'readEvents');
  }

  readResult(jobId: string): string | null {
    return withRetry(() => {
      const row = this.db.query('SELECT output FROM specialist_results WHERE job_id = ? LIMIT 1').get(jobId) as { output?: string } | undefined;
      return row?.output ?? null;
    }, 'readResult');
  }

  close(): void {
    this.db.close();
  }
}

export function createObservabilitySqliteClient(cwd: string = process.cwd()): ObservabilitySqliteClient | null {
  if (!loadBunDatabase()) return null; // Not running under Bun
  const location = resolveObservabilityDbLocation(cwd);
  if (!existsSync(location.dbPath)) return null;

  try {
    // Open DB for schema initialization (temporary connection)
    const Ctor = loadBunDatabase()!;
    const initDb = new Ctor(location.dbPath);
    initDb.run(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
    initSchema(initDb);
    initDb.close();

    // Create persistent client connection
    return new SqliteClient(location.dbPath);
  } catch {
    return null;
  }
}
