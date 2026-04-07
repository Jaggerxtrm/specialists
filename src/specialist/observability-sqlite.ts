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

function toSqlNumber(value: number | undefined): string {
  return value === undefined ? 'NULL' : String(value);
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
      Bun.sleepSync(delayMs);
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

function migrateToV3(db: BunDb): void {
  const hasV3 = db.query('SELECT 1 FROM schema_version WHERE version = 3 LIMIT 1').get() as { 1?: number } | undefined;
  if (hasV3) {
    db.run('CREATE INDEX IF NOT EXISTS idx_jobs_status ON specialist_jobs(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_jobs_node ON specialist_jobs(node_id) WHERE node_id IS NOT NULL');
    db.run('CREATE INDEX IF NOT EXISTS idx_jobs_status_updated ON specialist_jobs(status, updated_at_ms DESC)');
    return;
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS specialist_jobs_v3 (
      job_id          TEXT PRIMARY KEY,
      specialist      TEXT NOT NULL,
      worktree_column TEXT,
      bead_id         TEXT,
      node_id         TEXT,
      status          TEXT NOT NULL,
      status_json     TEXT NOT NULL,
      updated_at_ms   INTEGER NOT NULL,
      last_output     TEXT
    );
    INSERT OR IGNORE INTO specialist_jobs_v3
      SELECT
        job_id,
        specialist,
        worktree_column,
        bead_id,
        NULL,
        COALESCE(JSON_EXTRACT(status_json, '$.status'), 'starting'),
        status_json,
        updated_at_ms,
        last_output
      FROM specialist_jobs;
    DROP TABLE IF EXISTS specialist_jobs;
    ALTER TABLE specialist_jobs_v3 RENAME TO specialist_jobs;
    CREATE INDEX IF NOT EXISTS idx_jobs_bead ON specialist_jobs(bead_id) WHERE bead_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON specialist_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_node ON specialist_jobs(node_id) WHERE node_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_jobs_status_updated ON specialist_jobs(status, updated_at_ms DESC);
    INSERT OR IGNORE INTO schema_version (version, applied_at_ms)
      VALUES (3, strftime('%s', 'now') * 1000);
  `);
}

function migrateToV4(db: BunDb): void {
  const hasV4 = db.query('SELECT 1 FROM schema_version WHERE version = 4 LIMIT 1').get() as { 1?: number } | undefined;
  if (hasV4) {
    db.run('CREATE TABLE IF NOT EXISTS node_runs (id TEXT PRIMARY KEY, node_name TEXT NOT NULL, status TEXT NOT NULL, coordinator_job_id TEXT, started_at_ms INTEGER, updated_at_ms INTEGER NOT NULL, waiting_on TEXT, error TEXT, memory_namespace TEXT, status_json TEXT NOT NULL)');
    db.run('CREATE INDEX IF NOT EXISTS idx_node_runs_status ON node_runs(status)');

    db.run('CREATE TABLE IF NOT EXISTS node_members (id INTEGER PRIMARY KEY AUTOINCREMENT, node_run_id TEXT NOT NULL, member_id TEXT NOT NULL, job_id TEXT, specialist TEXT NOT NULL, model TEXT, role TEXT, status TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, generation INTEGER NOT NULL DEFAULT 0)');
    db.run('CREATE INDEX IF NOT EXISTS idx_node_members_run ON node_members(node_run_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_node_members_job ON node_members(job_id) WHERE job_id IS NOT NULL');
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_node_members_run_member ON node_members(node_run_id, member_id)');

    db.run('CREATE TABLE IF NOT EXISTS node_events (id INTEGER PRIMARY KEY AUTOINCREMENT, node_run_id TEXT NOT NULL, t INTEGER NOT NULL, type TEXT NOT NULL, event_json TEXT NOT NULL)');
    db.run('CREATE INDEX IF NOT EXISTS idx_node_events_run_t ON node_events(node_run_id, t, id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_node_events_type ON node_events(type)');

    db.run('CREATE TABLE IF NOT EXISTS node_memory (id INTEGER PRIMARY KEY AUTOINCREMENT, node_run_id TEXT NOT NULL, namespace TEXT, entry_type TEXT, entry_id TEXT, summary TEXT, source_member_id TEXT, confidence REAL, provenance_json TEXT, created_at_ms INTEGER, updated_at_ms INTEGER)');
    db.run('CREATE INDEX IF NOT EXISTS idx_node_memory_run ON node_memory(node_run_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_node_memory_entry_id ON node_memory(entry_id) WHERE entry_id IS NOT NULL');
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_node_memory_run_entry ON node_memory(node_run_id, entry_id) WHERE entry_id IS NOT NULL');
    return;
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS node_runs (
      id                 TEXT PRIMARY KEY,
      node_name          TEXT NOT NULL,
      status             TEXT NOT NULL,
      coordinator_job_id TEXT,
      started_at_ms      INTEGER,
      updated_at_ms      INTEGER NOT NULL,
      waiting_on         TEXT,
      error              TEXT,
      memory_namespace   TEXT,
      status_json        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_node_runs_status ON node_runs(status);

    CREATE TABLE IF NOT EXISTS node_members (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      node_run_id  TEXT NOT NULL,
      member_id    TEXT NOT NULL,
      job_id       TEXT,
      specialist   TEXT NOT NULL,
      model        TEXT,
      role         TEXT,
      status       TEXT NOT NULL,
      enabled      INTEGER NOT NULL DEFAULT 1,
      generation   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_node_members_run ON node_members(node_run_id);
    CREATE INDEX IF NOT EXISTS idx_node_members_job ON node_members(job_id) WHERE job_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_node_members_run_member ON node_members(node_run_id, member_id);

    CREATE TABLE IF NOT EXISTS node_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      node_run_id  TEXT NOT NULL,
      t            INTEGER NOT NULL,
      type         TEXT NOT NULL,
      event_json   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_node_events_run_t ON node_events(node_run_id, t, id);
    CREATE INDEX IF NOT EXISTS idx_node_events_type ON node_events(type);

    CREATE TABLE IF NOT EXISTS node_memory (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      node_run_id      TEXT NOT NULL,
      namespace        TEXT,
      entry_type       TEXT,
      entry_id         TEXT,
      summary          TEXT,
      source_member_id TEXT,
      confidence       REAL,
      provenance_json  TEXT,
      created_at_ms    INTEGER,
      updated_at_ms    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_node_memory_run ON node_memory(node_run_id);
    CREATE INDEX IF NOT EXISTS idx_node_memory_entry_id ON node_memory(entry_id) WHERE entry_id IS NOT NULL;

    INSERT OR IGNORE INTO schema_version (version, applied_at_ms)
      VALUES (4, strftime('%s', 'now') * 1000);
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

  const specialistJobsColumns = new Set(
    (db.query('PRAGMA table_info(specialist_jobs)').all() as Array<{ name?: string }>)
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  );

  const missingSpecialistJobsColumns: Array<{ name: string; definition: string }> = [
    { name: 'worktree_column', definition: 'TEXT' },
    { name: 'bead_id', definition: 'TEXT' },
    { name: 'node_id', definition: 'TEXT' },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'starting'" },
    { name: 'last_output', definition: 'TEXT' },
  ].filter(({ name }) => !specialistJobsColumns.has(name));

  for (const missingColumn of missingSpecialistJobsColumns) {
    db.run(`ALTER TABLE specialist_jobs ADD COLUMN ${missingColumn.name} ${missingColumn.definition}`);
  }

  // Step 2: idempotent v1 migration — rebuild specialist_jobs with a superset
  // of columns so subsequent migrations can run safely on repeated initSchema calls.
  db.run(`
    CREATE TABLE IF NOT EXISTS specialist_jobs_new (
      job_id          TEXT PRIMARY KEY,
      specialist      TEXT NOT NULL,
      worktree_column TEXT,
      bead_id         TEXT,
      node_id         TEXT,
      status          TEXT NOT NULL,
      status_json     TEXT NOT NULL,
      updated_at_ms   INTEGER NOT NULL,
      last_output     TEXT
    );
    INSERT OR IGNORE INTO specialist_jobs_new
      SELECT
        job_id,
        specialist,
        worktree_column,
        bead_id,
        node_id,
        COALESCE(status, JSON_EXTRACT(status_json, '$.status'), 'starting'),
        status_json,
        updated_at_ms,
        last_output
      FROM specialist_jobs;
    DROP TABLE IF EXISTS specialist_jobs;
    ALTER TABLE specialist_jobs_new RENAME TO specialist_jobs;
  `);
  migrateToV2(db);
  migrateToV3(db);
  migrateToV4(db);
  migrateToV5(db);
  verifyWalMode(db);
}

function migrateToV5(db: BunDb): void {
  const hasV5 = db.query('SELECT 1 FROM schema_version WHERE version = 5 LIMIT 1').get() as { 1?: number } | undefined;
  if (!hasV5) {
    const nodeMemberColumns = new Set(
      (db.query('PRAGMA table_info(node_members)').all() as Array<{ name?: string }>)
        .map((column) => column.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0),
    );
    if (!nodeMemberColumns.has('generation')) {
      db.run('ALTER TABLE node_members ADD COLUMN generation INTEGER NOT NULL DEFAULT 0');
    }

    db.run(`
      INSERT OR IGNORE INTO schema_version (version, applied_at_ms)
        VALUES (5, strftime('%s', 'now') * 1000);
    `);
  }
}

export type NodeRunStatus = 'created' | 'starting' | 'running' | 'waiting' | 'degraded' | 'error' | 'done' | 'stopped';

export type NodeEventType =
  | 'node_created'
  | 'node_started'
  | 'node_state_changed'
  | 'member_started'
  | 'member_state_changed'
  | 'member_output_received'
  | 'member_failed'
  | 'member_recovered'
  | 'member_respawned'
  | 'member_job_rebound'
  | 'coordinator_resumed'
  | 'coordinator_resume_state'
  | 'coordinator_output_received'
  | 'coordinator_output_invalid'
  | 'memory_updated'
  | 'action_dispatched'
  | 'action_queued'
  | 'action_written'
  | 'action_observed'
  | 'action_superseded'
  | 'action_completed'
  | 'action_failed'
  | 'node_recovered'
  | 'node_waiting'
  | 'node_done'
  | 'node_error'
  | 'node_stopped';

export interface NodeRunRow {
  id: string;
  node_name: string;
  status: NodeRunStatus;
  coordinator_job_id?: string;
  started_at_ms?: number;
  updated_at_ms: number;
  waiting_on?: string;
  error?: string;
  memory_namespace?: string;
  status_json: string;
}

export interface NodeMemberRow {
  node_run_id: string;
  member_id: string;
  job_id?: string;
  specialist: string;
  model?: string;
  role?: string;
  status: string;
  enabled?: boolean;
  generation?: number;
}

export interface NodeMemoryRow {
  node_run_id: string;
  namespace?: string;
  entry_type?: 'fact' | 'question' | 'decision';
  entry_id?: string;
  summary?: string;
  source_member_id?: string;
  confidence?: number;
  provenance_json?: string;
  created_at_ms?: number;
  updated_at_ms?: number;
}

export interface ObservabilitySqliteClient {
  upsertStatus(status: SupervisorStatus): void;
  upsertStatusWithEvent(status: SupervisorStatus, event: TimelineEvent): void;
  upsertStatusWithEventAndResult(status: SupervisorStatus, event: TimelineEvent, output: string): void;
  appendEvent(jobId: string, specialist: string, beadId: string | undefined, event: TimelineEvent): void;
  upsertResult(jobId: string, output: string): void;
  bootstrapNode(nodeRunId: string, nodeName: string, memoryNamespace?: string): void;
  upsertNodeRun(nodeRun: NodeRunRow): void;
  upsertNodeMember(member: NodeMemberRow): void;
  appendNodeEvent(nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void;
  upsertNodeMemory(entry: NodeMemoryRow): void;
  readNodeRun(nodeRunId: string): NodeRunRow | null;
  listNodeRuns(filter?: { status?: NodeRunStatus }): NodeRunRow[];
  readNodeMembers(nodeRunId: string): NodeMemberRow[];
  readNodeEvents(nodeRunId: string, opts?: { type?: NodeEventType; limit?: number }): Array<{ id: number; t: number; type: string; event_json: string }>;
  readNodeMemory(nodeRunId: string, opts?: { namespace?: string; entry_type?: 'fact' | 'question' | 'decision' }): NodeMemoryRow[];
  queryMemberContextHealth(jobId: string): number | null;
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
      INSERT INTO specialist_jobs (job_id, specialist, worktree_column, bead_id, node_id, status, status_json, updated_at_ms, last_output)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        specialist = excluded.specialist,
        worktree_column = excluded.worktree_column,
        bead_id = excluded.bead_id,
        node_id = excluded.node_id,
        status = excluded.status,
        status_json = excluded.status_json,
        updated_at_ms = excluded.updated_at_ms,
        last_output = COALESCE(excluded.last_output, specialist_jobs.last_output);
    `, [
      status.id,
      status.specialist,
      status.worktree_path ?? null,
      status.bead_id ?? null,
      status.node_id ?? null,
      status.status,
      statusJson,
      Date.now(),
      lastOutput ?? null,
    ]);
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

  private writeNodeRunRow(nodeRun: NodeRunRow): void {
    this.db.run(`
      INSERT INTO node_runs (
        id,
        node_name,
        status,
        coordinator_job_id,
        started_at_ms,
        updated_at_ms,
        waiting_on,
        error,
        memory_namespace,
        status_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        node_name = excluded.node_name,
        status = excluded.status,
        coordinator_job_id = excluded.coordinator_job_id,
        started_at_ms = excluded.started_at_ms,
        updated_at_ms = excluded.updated_at_ms,
        waiting_on = excluded.waiting_on,
        error = excluded.error,
        memory_namespace = excluded.memory_namespace,
        status_json = excluded.status_json;
    `, [
      nodeRun.id,
      nodeRun.node_name,
      nodeRun.status,
      nodeRun.coordinator_job_id ?? null,
      nodeRun.started_at_ms ?? null,
      nodeRun.updated_at_ms,
      nodeRun.waiting_on ?? null,
      nodeRun.error ?? null,
      nodeRun.memory_namespace ?? null,
      nodeRun.status_json,
    ]);
  }

  private writeNodeMemberRow(member: NodeMemberRow): void {
    this.db.run(`
      INSERT INTO node_members (
        node_run_id,
        member_id,
        job_id,
        specialist,
        model,
        role,
        status,
        enabled,
        generation
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(node_run_id, member_id) DO UPDATE SET
        job_id = excluded.job_id,
        specialist = excluded.specialist,
        model = excluded.model,
        role = excluded.role,
        status = excluded.status,
        enabled = excluded.enabled,
        generation = excluded.generation;
    `, [
      member.node_run_id,
      member.member_id,
      member.job_id ?? null,
      member.specialist,
      member.model ?? null,
      member.role ?? null,
      member.status,
      member.enabled === undefined ? 1 : (member.enabled ? 1 : 0),
      member.generation ?? 0,
    ]);
  }

  private writeNodeEventRow(nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void {
    this.db.run(`
      INSERT INTO node_events (node_run_id, t, type, event_json)
      VALUES (?, ?, ?, ?)
    `, [nodeRunId, t, type, JSON.stringify(eventJson)]);
  }

  private writeNodeMemoryRow(entry: NodeMemoryRow): void {
    const now = Date.now();
    const createdAtMs = entry.created_at_ms ?? now;
    const updatedAtMs = entry.updated_at_ms ?? now;

    if (entry.entry_id) {
      this.db.run(`
        INSERT INTO node_memory (
          node_run_id,
          namespace,
          entry_type,
          entry_id,
          summary,
          source_member_id,
          confidence,
          provenance_json,
          created_at_ms,
          updated_at_ms
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(node_run_id, entry_id) DO UPDATE SET
          namespace = excluded.namespace,
          entry_type = excluded.entry_type,
          summary = excluded.summary,
          source_member_id = excluded.source_member_id,
          confidence = excluded.confidence,
          provenance_json = excluded.provenance_json,
          created_at_ms = excluded.created_at_ms,
          updated_at_ms = excluded.updated_at_ms
      `, [
        entry.node_run_id,
        entry.namespace ?? null,
        entry.entry_type ?? null,
        entry.entry_id,
        entry.summary ?? null,
        entry.source_member_id ?? null,
        entry.confidence ?? null,
        entry.provenance_json ?? null,
        createdAtMs,
        updatedAtMs,
      ]);
      return;
    }

    this.db.run(`
      INSERT INTO node_memory (
        node_run_id,
        namespace,
        entry_type,
        entry_id,
        summary,
        source_member_id,
        confidence,
        provenance_json,
        created_at_ms,
        updated_at_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      entry.node_run_id,
      entry.namespace ?? null,
      entry.entry_type ?? null,
      null,
      entry.summary ?? null,
      entry.source_member_id ?? null,
      entry.confidence ?? null,
      entry.provenance_json ?? null,
      createdAtMs,
      updatedAtMs,
    ]);
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
      const transaction = this.db.transaction(() => {
        this.writeResultRow(jobId, output);
        // Also update last_output on the job row for quick access
        this.db.run(`
          UPDATE specialist_jobs SET last_output = ? WHERE job_id = ?
        `, [output, jobId]);
      });
      transaction();
    }, 'upsertResult');
  }

  bootstrapNode(nodeRunId: string, nodeName: string, memoryNamespace?: string): void {
    withRetry(() => {
      const transaction = this.db.transaction(() => {
        const now = Date.now();
        this.writeNodeRunRow({
          id: nodeRunId,
          node_name: nodeName,
          status: 'created',
          started_at_ms: now,
          updated_at_ms: now,
          memory_namespace: memoryNamespace,
          status_json: JSON.stringify({ status: 'created' }),
        });
        this.writeNodeEventRow(nodeRunId, now, 'node_created', { node_run_id: nodeRunId, node_name: nodeName });
        this.writeNodeEventRow(nodeRunId, now + 1, 'node_started', { node_run_id: nodeRunId, node_name: nodeName });
      });
      transaction();
    }, 'bootstrapNode');
  }

  upsertNodeRun(nodeRun: NodeRunRow): void {
    withRetry(() => {
      this.writeNodeRunRow(nodeRun);
    }, 'upsertNodeRun');
  }

  upsertNodeMember(member: NodeMemberRow): void {
    withRetry(() => {
      this.writeNodeMemberRow(member);
    }, 'upsertNodeMember');
  }

  appendNodeEvent(nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void {
    withRetry(() => {
      this.writeNodeEventRow(nodeRunId, t, type, eventJson);
    }, 'appendNodeEvent');
  }

  upsertNodeMemory(entry: NodeMemoryRow): void {
    withRetry(() => {
      this.writeNodeMemoryRow(entry);
    }, 'upsertNodeMemory');
  }

  readNodeRun(nodeRunId: string): NodeRunRow | null {
    return withRetry(() => {
      const row = this.db.query('SELECT * FROM node_runs WHERE id = ? LIMIT 1').get(nodeRunId) as NodeRunRow | undefined;
      if (!row) return null;
      return {
        ...row,
        status: row.status as NodeRunStatus,
      };
    }, 'readNodeRun');
  }

  listNodeRuns(filter?: { status?: NodeRunStatus }): NodeRunRow[] {
    return withRetry(() => {
      const query = filter?.status
        ? 'SELECT * FROM node_runs WHERE status = ? ORDER BY updated_at_ms DESC'
        : 'SELECT * FROM node_runs ORDER BY updated_at_ms DESC';
      const rows = filter?.status
        ? this.db.query(query).all(filter.status)
        : this.db.query(query).all();
      return (rows as NodeRunRow[]).map((row) => ({
        ...row,
        status: row.status as NodeRunStatus,
      }));
    }, 'listNodeRuns');
  }

  readNodeMembers(nodeRunId: string): NodeMemberRow[] {
    return withRetry(() => {
      const rows = this.db.query('SELECT * FROM node_members WHERE node_run_id = ? ORDER BY id ASC').all(nodeRunId) as Array<NodeMemberRow & { enabled?: number | boolean }>;
      return rows.map((row) => ({
        node_run_id: row.node_run_id,
        member_id: row.member_id,
        job_id: row.job_id ?? undefined,
        specialist: row.specialist,
        model: row.model ?? undefined,
        role: row.role ?? undefined,
        status: row.status,
        enabled: row.enabled === undefined ? undefined : Boolean(row.enabled),
        generation: row.generation ?? 0,
      }));
    }, 'readNodeMembers');
  }

  readNodeEvents(nodeRunId: string, opts?: { type?: NodeEventType; limit?: number }): Array<{ id: number; t: number; type: string; event_json: string }> {
    return withRetry(() => {
      const whereClauses = ['node_run_id = ?'];
      const params: Array<string | number> = [nodeRunId];

      if (opts?.type) {
        whereClauses.push('type = ?');
        params.push(opts.type);
      }

      let query = `
        SELECT id, t, type, event_json
        FROM node_events
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY t ASC, id ASC
      `;

      if (opts?.limit !== undefined) {
        query += ' LIMIT ?';
        params.push(opts.limit);
      }

      return this.db.query(query).all(...params) as Array<{ id: number; t: number; type: string; event_json: string }>;
    }, 'readNodeEvents');
  }

  readNodeMemory(nodeRunId: string, opts?: { namespace?: string; entry_type?: 'fact' | 'question' | 'decision' }): NodeMemoryRow[] {
    return withRetry(() => {
      const whereClauses = ['node_run_id = ?'];
      const params: Array<string> = [nodeRunId];

      if (opts?.namespace) {
        whereClauses.push('namespace = ?');
        params.push(opts.namespace);
      }

      if (opts?.entry_type) {
        whereClauses.push('entry_type = ?');
        params.push(opts.entry_type);
      }

      const query = `
        SELECT *
        FROM node_memory
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY created_at_ms ASC
      `;

      return this.db.query(query).all(...params) as NodeMemoryRow[];
    }, 'readNodeMemory');
  }

  queryMemberContextHealth(jobId: string): number | null {
    return withRetry(() => {
      const row = this.db.query(`
        SELECT json_extract(event_json, '$.context_pct') AS context_pct
        FROM specialist_events
        WHERE job_id = ? AND type = 'turn_summary'
        ORDER BY t DESC, id DESC
        LIMIT 1
      `).get(jobId) as { context_pct?: number | string | null } | undefined;

      if (!row || row.context_pct === null || row.context_pct === undefined) {
        return null;
      }

      const contextPct = typeof row.context_pct === 'number' ? row.context_pct : Number(row.context_pct);
      return Number.isFinite(contextPct) ? contextPct : null;
    }, 'queryMemberContextHealth');
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
