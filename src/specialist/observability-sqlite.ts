import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
import { resolveJobsDir } from './job-root.js';
import type { TimelineEvent, TimelineEventTool } from './timeline-events.js';
import type { SupervisorStatus } from './supervisor.js';
import type { EpicChainRecord, EpicRunRecord } from './epic-lifecycle.js';
import type { PersistedChainIdentity } from './chain-identity.js';

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
      
      if (lastError.message.includes('Cannot use a closed database')) {
        throw new Error(`[observability-sqlite] SQLite client is closed (${context})`);
      }

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

    db.run('CREATE TABLE IF NOT EXISTS node_events (id INTEGER PRIMARY KEY AUTOINCREMENT, node_run_id TEXT NOT NULL, seq INTEGER NOT NULL, t INTEGER NOT NULL, type TEXT NOT NULL, event_json TEXT NOT NULL)');
    // seq-dependent indexes handled by migrateToV6 for existing DBs without seq column
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
      seq          INTEGER NOT NULL,
      t            INTEGER NOT NULL,
      type         TEXT NOT NULL,
      event_json   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_node_events_run_seq ON node_events(node_run_id, seq);
    CREATE INDEX IF NOT EXISTS idx_node_events_run_t ON node_events(node_run_id, t, seq, id);
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
      seq          INTEGER NOT NULL,
      specialist   TEXT NOT NULL,
      bead_id      TEXT,
      t            INTEGER NOT NULL,
      type         TEXT NOT NULL,
      event_json   TEXT NOT NULL
    );
    -- seq-dependent indexes are created/maintained by migrateToV6 to handle
    -- existing DBs where specialist_events was created without the seq column.
    CREATE INDEX IF NOT EXISTS idx_specialist_events_type ON specialist_events(type);

    CREATE TABLE IF NOT EXISTS specialist_results (
      job_id        TEXT PRIMARY KEY,
      output        TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories_cache (
      memory_key           TEXT PRIMARY KEY,
      memory_value         TEXT NOT NULL,
      updated_at_ms        INTEGER NOT NULL,
      last_accessed_at_ms  INTEGER,
      access_count         INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS memories_cache_meta (
      singleton_key    INTEGER PRIMARY KEY CHECK (singleton_key = 1),
      last_sync_at_ms  INTEGER NOT NULL,
      memory_count     INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      key,
      content,
      tokenize='porter ascii'
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
    { name: 'chain_kind', definition: "TEXT NOT NULL DEFAULT 'prep'" },
    { name: 'chain_id', definition: 'TEXT' },
    { name: 'chain_root_job_id', definition: 'TEXT' },
    { name: 'chain_root_bead_id', definition: 'TEXT' },
    { name: 'epic_id', definition: 'TEXT' },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'starting'" },
    { name: 'last_output', definition: 'TEXT' },
  ].filter(({ name }) => !specialistJobsColumns.has(name));

  for (const missingColumn of missingSpecialistJobsColumns) {
    db.run(`ALTER TABLE specialist_jobs ADD COLUMN ${missingColumn.name} ${missingColumn.definition}`);
  }

  const shouldRebuildSpecialistJobs = missingSpecialistJobsColumns.length > 0;

  // Step 2: idempotent v1 migration — rebuild specialist_jobs with a superset
  // of columns. Only run when upgrading legacy schemas to avoid DROP/RENAME churn
  // on already-migrated DBs.
  if (shouldRebuildSpecialistJobs) {
    db.run(`
      CREATE TABLE IF NOT EXISTS specialist_jobs_new (
        job_id          TEXT PRIMARY KEY,
        specialist      TEXT NOT NULL,
        worktree_column TEXT,
        bead_id         TEXT,
        node_id         TEXT,
        chain_kind      TEXT NOT NULL DEFAULT 'prep',
        chain_id        TEXT,
        chain_root_job_id TEXT,
        chain_root_bead_id TEXT,
        epic_id         TEXT,
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
          COALESCE(chain_kind, CASE WHEN chain_id IS NOT NULL OR worktree_column IS NOT NULL THEN 'chain' ELSE 'prep' END),
          chain_id,
          COALESCE(chain_root_job_id, chain_id),
          chain_root_bead_id,
          epic_id,
          COALESCE(status, JSON_EXTRACT(status_json, '$.status'), 'starting'),
          status_json,
          updated_at_ms,
          last_output
        FROM specialist_jobs;
      DROP TABLE IF EXISTS specialist_jobs;
      ALTER TABLE specialist_jobs_new RENAME TO specialist_jobs;
    `);
  }
  migrateToV2(db);
  migrateToV3(db);
  migrateToV4(db);
  migrateToV5(db);
  migrateToV6(db);
  migrateToV7(db);
  migrateToV8(db);
  migrateToV9(db);
  migrateToV10(db);
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

function migrateToV6(db: BunDb): void {
  const hasV6 = db.query('SELECT 1 FROM schema_version WHERE version = 6 LIMIT 1').get() as { 1?: number } | undefined;
  if (hasV6) {
    db.run('CREATE INDEX IF NOT EXISTS idx_specialist_events_job_seq ON specialist_events(job_id, seq)');
    db.run('CREATE INDEX IF NOT EXISTS idx_specialist_events_job_t ON specialist_events(job_id, t, seq, id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_node_events_run_seq ON node_events(node_run_id, seq)');
    db.run('CREATE INDEX IF NOT EXISTS idx_node_events_run_t ON node_events(node_run_id, t, seq, id)');
    return;
  }

  const specialistEventColumns = new Set(
    (db.query('PRAGMA table_info(specialist_events)').all() as Array<{ name?: string }>)
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  );

  if (!specialistEventColumns.has('seq')) {
    db.run('ALTER TABLE specialist_events ADD COLUMN seq INTEGER');
  }
  db.run(`
    UPDATE specialist_events
    SET seq = (
      SELECT COUNT(*)
      FROM specialist_events prior
      WHERE prior.job_id = specialist_events.job_id
        AND prior.id <= specialist_events.id
    )
    WHERE seq IS NULL OR seq <= 0
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_specialist_events_job_seq ON specialist_events(job_id, seq)');
  db.run('CREATE INDEX IF NOT EXISTS idx_specialist_events_job_t ON specialist_events(job_id, t, seq, id)');

  const nodeEventColumns = new Set(
    (db.query('PRAGMA table_info(node_events)').all() as Array<{ name?: string }>)
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  );

  if (!nodeEventColumns.has('seq')) {
    db.run('ALTER TABLE node_events ADD COLUMN seq INTEGER');
  }
  db.run(`
    UPDATE node_events
    SET seq = (
      SELECT COUNT(*)
      FROM node_events prior
      WHERE prior.node_run_id = node_events.node_run_id
        AND prior.id <= node_events.id
    )
    WHERE seq IS NULL OR seq <= 0
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_node_events_run_seq ON node_events(node_run_id, seq)');
  db.run('CREATE INDEX IF NOT EXISTS idx_node_events_run_t ON node_events(node_run_id, t, seq, id)');

  db.run(`
    INSERT OR IGNORE INTO schema_version (version, applied_at_ms)
      VALUES (6, strftime('%s', 'now') * 1000);
  `);
}

function migrateToV7(db: BunDb): void {
  const hasV7 = db.query('SELECT 1 FROM schema_version WHERE version = 7 LIMIT 1').get() as { 1?: number } | undefined;

  const nodeRunColumns = new Set(
    (db.query('PRAGMA table_info(node_runs)').all() as Array<{ name?: string }>)
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  );

  for (const column of [
    { name: 'pr_number', definition: 'INTEGER' },
    { name: 'pr_url', definition: 'TEXT' },
    { name: 'pr_head_sha', definition: 'TEXT' },
    { name: 'gate_results', definition: 'TEXT' },
    { name: 'completion_strategy', definition: 'TEXT' },
  ]) {
    if (!nodeRunColumns.has(column.name)) {
      db.run(`ALTER TABLE node_runs ADD COLUMN ${column.name} ${column.definition}`);
    }
  }

  const nodeMemberColumns = new Set(
    (db.query('PRAGMA table_info(node_members)').all() as Array<{ name?: string }>)
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  );

  for (const column of [
    { name: 'worktree_path', definition: 'TEXT' },
    { name: 'parent_member_id', definition: 'TEXT' },
    { name: 'replaced_member_id', definition: 'TEXT' },
    { name: 'phase_id', definition: 'TEXT' },
  ]) {
    if (!nodeMemberColumns.has(column.name)) {
      db.run(`ALTER TABLE node_members ADD COLUMN ${column.name} ${column.definition}`);
    }
  }

  if (hasV7) {
    return;
  }

  db.run(`
    INSERT OR IGNORE INTO schema_version (version, applied_at_ms)
      VALUES (7, strftime('%s', 'now') * 1000);
  `);
}

function migrateToV8(db: BunDb): void {
  const hasV8 = db.query('SELECT 1 FROM schema_version WHERE version = 8 LIMIT 1').get() as { 1?: number } | undefined;

  const specialistJobsColumns = new Set(
    (db.query('PRAGMA table_info(specialist_jobs)').all() as Array<{ name?: string }>)
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  );

  for (const column of [
    { name: 'chain_id', definition: 'TEXT' },
    { name: 'epic_id', definition: 'TEXT' },
  ]) {
    if (!specialistJobsColumns.has(column.name)) {
      db.run(`ALTER TABLE specialist_jobs ADD COLUMN ${column.name} ${column.definition}`);
    }
  }

  db.run('CREATE INDEX IF NOT EXISTS idx_jobs_chain ON specialist_jobs(chain_id) WHERE chain_id IS NOT NULL');
  db.run('CREATE INDEX IF NOT EXISTS idx_jobs_epic ON specialist_jobs(epic_id) WHERE epic_id IS NOT NULL');

  db.run(`
    CREATE TABLE IF NOT EXISTS epic_runs (
      epic_id         TEXT PRIMARY KEY,
      status          TEXT NOT NULL,
      status_json     TEXT NOT NULL,
      updated_at_ms   INTEGER NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS epic_chain_membership (
      chain_id            TEXT PRIMARY KEY,
      epic_id             TEXT NOT NULL,
      chain_root_bead_id  TEXT,
      chain_root_job_id   TEXT,
      updated_at_ms       INTEGER NOT NULL
    );
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_epic_runs_status ON epic_runs(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_epic_chain_membership_epic ON epic_chain_membership(epic_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_epic_chain_membership_bead ON epic_chain_membership(chain_root_bead_id) WHERE chain_root_bead_id IS NOT NULL');

  if (hasV8) {
    return;
  }

  db.run(`
    INSERT OR IGNORE INTO schema_version (version, applied_at_ms)
      VALUES (8, strftime('%s', 'now') * 1000);
  `);
}

function migrateToV9(db: BunDb): void {
  const hasV9 = db.query('SELECT 1 FROM schema_version WHERE version = 9 LIMIT 1').get() as { 1?: number } | undefined;

  const specialistJobsColumns = new Set(
    (db.query('PRAGMA table_info(specialist_jobs)').all() as Array<{ name?: string }>)
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  );

  for (const column of [
    { name: 'chain_kind', definition: "TEXT NOT NULL DEFAULT 'prep'" },
    { name: 'chain_root_job_id', definition: 'TEXT' },
    { name: 'chain_root_bead_id', definition: 'TEXT' },
  ]) {
    if (!specialistJobsColumns.has(column.name)) {
      db.run(`ALTER TABLE specialist_jobs ADD COLUMN ${column.name} ${column.definition}`);
    }
  }

  db.run(`
    UPDATE specialist_jobs
    SET chain_kind = CASE
      WHEN chain_id IS NOT NULL OR worktree_column IS NOT NULL THEN 'chain'
      ELSE 'prep'
    END
    WHERE chain_kind IS NULL OR chain_kind = ''
  `);

  db.run(`
    UPDATE specialist_jobs
    SET chain_root_job_id = COALESCE(chain_root_job_id, chain_id)
    WHERE chain_kind = 'chain' AND chain_root_job_id IS NULL
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_jobs_chain_kind ON specialist_jobs(chain_kind)');
  db.run('CREATE INDEX IF NOT EXISTS idx_jobs_chain_root_job ON specialist_jobs(chain_root_job_id) WHERE chain_root_job_id IS NOT NULL');

  if (hasV9) {
    return;
  }

  db.run(`
    INSERT OR IGNORE INTO schema_version (version, applied_at_ms)
      VALUES (9, strftime('%s', 'now') * 1000);
  `);
}

function migrateToV10(db: BunDb): void {
  const hasV10 = db.query('SELECT 1 FROM schema_version WHERE version = 10 LIMIT 1').get() as { 1?: number } | undefined;

  db.run(`
    CREATE TABLE IF NOT EXISTS memories_cache (
      memory_key           TEXT PRIMARY KEY,
      memory_value         TEXT NOT NULL,
      updated_at_ms        INTEGER NOT NULL,
      last_accessed_at_ms  INTEGER,
      access_count         INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS memories_cache_meta (
      singleton_key    INTEGER PRIMARY KEY CHECK (singleton_key = 1),
      last_sync_at_ms  INTEGER NOT NULL,
      memory_count     INTEGER NOT NULL
    );
  `);

  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      key,
      content,
      tokenize='porter ascii'
    );
  `);

  if (hasV10) {
    return;
  }

  db.run(`
    INSERT OR IGNORE INTO schema_version (version, applied_at_ms)
      VALUES (10, strftime('%s', 'now') * 1000);
  `);
}

export type NodeRunStatus = 'created' | 'starting' | 'running' | 'waiting' | 'degraded' | 'awaiting_merge' | 'fixing_after_review' | 'failed' | 'error' | 'done' | 'stopped';

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
  | 'member_disabled'
  | 'coordinator_resumed'
  | 'coordinator_resume_state'
  | 'coordinator_resume_skipped'
  | 'coordinator_first_turn_context_built'
  | 'coordinator_output_received'
  | 'coordinator_output_invalid'
  | 'coordinator_repair_requested'
  | 'memory_updated'
  | 'memory_patch_rejected'
  | 'memory_patch_deduplicated'
  // action_written is the canonical "dispatched to member" event.
  | 'action_queued'
  | 'action_written'
  | 'action_observed'
  | 'action_superseded'
  | 'action_completed'
  | 'action_failed'
  | 'action_dropped'
  | 'node_recovered'
  | 'node_waiting'
  | 'node_done'
  | 'node_error'
  | 'node_stopped'
  | 'phase_started'
  | 'phase_completed'
  | 'bead_created'
  | 'worktree_provisioned'
  | 'member_spawned_dynamic'
  | 'member_replaced'
  | 'coordinator_restarted'
  | 'pr_created'
  | 'pr_updated'
  | 'node_completed';

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
  pr_number?: number;
  pr_url?: string;
  pr_head_sha?: string;
  gate_results?: string;
  completion_strategy?: string;
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
  worktree_path?: string;
  parent_member_id?: string;
  replaced_member_id?: string;
  phase_id?: string;
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

export interface ChainEpicLinkRecord {
  chain_id: string;
  epic_id?: string;
  chain_root_job_id?: string;
  chain_root_bead_id?: string;
}

export interface MemoryCacheState {
  lastSyncAtMs: number;
  memoryCount: number;
}

export interface MemoryCacheInputRecord {
  key: string;
  value: string;
}

export interface RelevantMemoryRecord {
  key: string;
  value: string;
  bm25: number;
  recency: number;
  accessFrequency: number;
  score: number;
}

export interface EpicChainLatestJobRecord {
  chain_id: string;
  epic_id: string;
  chain_root_bead_id?: string;
  chain_root_job_id?: string;
  job_id: string;
  status?: string;
  branch?: string;
  updated_at_ms: number;
}

export interface ObservabilitySqliteClient {
  upsertStatus(status: SupervisorStatus): void;
  upsertEpicRun(epic: EpicRunRecord): void;
  upsertEpicChainMembership(chain: EpicChainRecord): void;
  upsertStatusWithEvent(status: SupervisorStatus, event: TimelineEvent): void;
  upsertStatusWithEventAndResult(status: SupervisorStatus, event: TimelineEvent, output: string): void;
  appendEvent(jobId: string, specialist: string, beadId: string | undefined, event: TimelineEvent): void;
  upsertResult(jobId: string, output: string): void;
  bootstrapNode(nodeRunId: string, nodeName: string, memoryNamespace?: string): void;
  upsertNodeRun(nodeRun: NodeRunRow): void;
  upsertNodeMember(member: NodeMemberRow): void;
  appendNodeEvent(nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void;
  upsertNodeMemory(entry: NodeMemoryRow): void;
  upsertNodeRunWithEvent(nodeRun: NodeRunRow, t: number, type: NodeEventType, eventJson: unknown): void;
  upsertNodeMemberWithEvent(member: NodeMemberRow, nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void;
  upsertNodeMemoryWithEvent(entry: NodeMemoryRow, nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void;
  readNodeRun(nodeRunId: string): NodeRunRow | null;
  listNodeRuns(filter?: { status?: NodeRunStatus }): NodeRunRow[];
  listNodeRunsByRef(partialRef: string, statuses: readonly NodeRunStatus[]): NodeRunRow[];
  listNodeRunsByStatuses(statuses: readonly NodeRunStatus[]): NodeRunRow[];
  readNodeMembers(nodeRunId: string): NodeMemberRow[];
  readNodeEvents(nodeRunId: string, opts?: { type?: NodeEventType; limit?: number }): Array<{ id: number; seq: number; t: number; type: string; event_json: string }>;
  readNodeMemory(nodeRunId: string, opts?: { namespace?: string; entry_type?: 'fact' | 'question' | 'decision' }): NodeMemoryRow[];
  queryMemberContextHealth(jobId: string): number | null;
  readStatus(jobId: string): SupervisorStatus | null;
  listStatuses(): SupervisorStatus[];
  readEpicRun(epicId: string): EpicRunRecord | null;
  listEpicRuns(): EpicRunRecord[];
  resolveEpicByChainId(chainId: string): EpicChainRecord | null;
  resolveEpicByChainRootBeadId(chainRootBeadId: string): EpicChainRecord | null;
  listEpicChains(epicId: string): EpicChainRecord[];
  listEpicChainsWithLatestJob(epicId: string): EpicChainLatestJobRecord[];
  readChainIdentity(jobId: string): PersistedChainIdentity | null;
  listChainJobIds(chainId: string): string[];
  resolveChainEpicLinkByJobId(jobId: string): ChainEpicLinkRecord | null;
  readEvents(jobId: string): TimelineEvent[];
  readLatestToolEvent(jobId: string): TimelineEventTool | null;
  readResult(jobId: string): string | null;
  syncMemoriesCache(memories: readonly MemoryCacheInputRecord[], syncedAtMs?: number): void;
  getMemoriesCacheState(): MemoryCacheState | null;
  queryRelevantMemories(keywords: readonly string[], limit?: number, nowMs?: number): RelevantMemoryRecord[];
  invalidateMemoriesCache(): void;
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
      INSERT INTO specialist_jobs (job_id, specialist, worktree_column, bead_id, node_id, chain_kind, chain_id, chain_root_job_id, chain_root_bead_id, epic_id, status, status_json, updated_at_ms, last_output)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        specialist = excluded.specialist,
        worktree_column = excluded.worktree_column,
        bead_id = excluded.bead_id,
        node_id = excluded.node_id,
        chain_kind = excluded.chain_kind,
        chain_id = excluded.chain_id,
        chain_root_job_id = excluded.chain_root_job_id,
        chain_root_bead_id = excluded.chain_root_bead_id,
        epic_id = excluded.epic_id,
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
      status.chain_kind ?? (status.chain_id ? 'chain' : 'prep'),
      status.chain_id ?? null,
      status.chain_root_job_id ?? null,
      status.chain_root_bead_id ?? null,
      status.epic_id ?? null,
      status.status,
      statusJson,
      Date.now(),
      lastOutput ?? null,
    ]);
  }

  private writeEpicRunRow(epic: EpicRunRecord): void {
    this.db.run(`
      INSERT INTO epic_runs (epic_id, status, status_json, updated_at_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(epic_id) DO UPDATE SET
        status = excluded.status,
        status_json = excluded.status_json,
        updated_at_ms = excluded.updated_at_ms;
    `, [epic.epic_id, epic.status, epic.status_json, epic.updated_at_ms]);
  }

  private writeEpicChainMembershipRow(chain: EpicChainRecord): void {
    this.db.run(`
      INSERT INTO epic_chain_membership (chain_id, epic_id, chain_root_bead_id, chain_root_job_id, updated_at_ms)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chain_id) DO UPDATE SET
        epic_id = excluded.epic_id,
        chain_root_bead_id = excluded.chain_root_bead_id,
        chain_root_job_id = excluded.chain_root_job_id,
        updated_at_ms = excluded.updated_at_ms;
    `, [
      chain.chain_id,
      chain.epic_id,
      chain.chain_root_bead_id ?? null,
      chain.chain_root_job_id ?? null,
      chain.updated_at_ms,
    ]);
  }

  private getNextSpecialistEventSeq(jobId: string): number {
    const row = this.db.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM specialist_events WHERE job_id = ?').get(jobId) as { next_seq?: number } | undefined;
    return row?.next_seq ?? 1;
  }

  private getNextNodeEventSeq(nodeRunId: string): number {
    const row = this.db.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM node_events WHERE node_run_id = ?').get(nodeRunId) as { next_seq?: number } | undefined;
    return row?.next_seq ?? 1;
  }

  private writeEventRow(jobId: string, specialist: string, beadId: string | undefined, event: TimelineEvent): void {
    const seq = typeof event.seq === 'number' && event.seq > 0 ? event.seq : this.getNextSpecialistEventSeq(jobId);
    const eventJson = JSON.stringify({ ...event, seq });
    this.db.run(`
      INSERT INTO specialist_events (job_id, seq, specialist, bead_id, t, type, event_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [jobId, seq, specialist, beadId ?? null, event.t, event.type, eventJson]);
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
        status_json,
        pr_number,
        pr_url,
        pr_head_sha,
        gate_results,
        completion_strategy
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        node_name = excluded.node_name,
        status = excluded.status,
        coordinator_job_id = excluded.coordinator_job_id,
        started_at_ms = excluded.started_at_ms,
        updated_at_ms = excluded.updated_at_ms,
        waiting_on = excluded.waiting_on,
        error = excluded.error,
        memory_namespace = excluded.memory_namespace,
        status_json = excluded.status_json,
        pr_number = excluded.pr_number,
        pr_url = excluded.pr_url,
        pr_head_sha = excluded.pr_head_sha,
        gate_results = excluded.gate_results,
        completion_strategy = excluded.completion_strategy;
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
      nodeRun.pr_number ?? null,
      nodeRun.pr_url ?? null,
      nodeRun.pr_head_sha ?? null,
      nodeRun.gate_results ?? null,
      nodeRun.completion_strategy ?? null,
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
        generation,
        worktree_path,
        parent_member_id,
        replaced_member_id,
        phase_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(node_run_id, member_id) DO UPDATE SET
        job_id = excluded.job_id,
        specialist = excluded.specialist,
        model = excluded.model,
        role = excluded.role,
        status = excluded.status,
        enabled = excluded.enabled,
        generation = excluded.generation,
        worktree_path = excluded.worktree_path,
        parent_member_id = excluded.parent_member_id,
        replaced_member_id = excluded.replaced_member_id,
        phase_id = excluded.phase_id;
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
      member.worktree_path ?? null,
      member.parent_member_id ?? null,
      member.replaced_member_id ?? null,
      member.phase_id ?? null,
    ]);
  }

  private writeNodeEventRow(nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void {
    const seq = this.getNextNodeEventSeq(nodeRunId);
    const payload = typeof eventJson === 'object' && eventJson !== null
      ? { ...(eventJson as Record<string, unknown>), seq }
      : { value: eventJson, seq };
    this.db.run(`
      INSERT INTO node_events (node_run_id, seq, t, type, event_json)
      VALUES (?, ?, ?, ?, ?)
    `, [nodeRunId, seq, t, type, JSON.stringify(payload)]);
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

  upsertEpicRun(epic: EpicRunRecord): void {
    withRetry(() => {
      this.writeEpicRunRow(epic);
    }, 'upsertEpicRun');
  }

  upsertEpicChainMembership(chain: EpicChainRecord): void {
    withRetry(() => {
      this.writeEpicChainMembershipRow(chain);
    }, 'upsertEpicChainMembership');
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

  upsertNodeRunWithEvent(nodeRun: NodeRunRow, t: number, type: NodeEventType, eventJson: unknown): void {
    withRetry(() => {
      const transaction = this.db.transaction(() => {
        this.writeNodeRunRow(nodeRun);
        this.writeNodeEventRow(nodeRun.id, t, type, eventJson);
      });
      transaction();
    }, 'upsertNodeRunWithEvent');
  }

  upsertNodeMemberWithEvent(member: NodeMemberRow, nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void {
    withRetry(() => {
      const transaction = this.db.transaction(() => {
        this.writeNodeMemberRow(member);
        this.writeNodeEventRow(nodeRunId, t, type, eventJson);
      });
      transaction();
    }, 'upsertNodeMemberWithEvent');
  }

  upsertNodeMemoryWithEvent(entry: NodeMemoryRow, nodeRunId: string, t: number, type: NodeEventType, eventJson: unknown): void {
    withRetry(() => {
      const transaction = this.db.transaction(() => {
        this.writeNodeMemoryRow(entry);
        this.writeNodeEventRow(nodeRunId, t, type, eventJson);
      });
      transaction();
    }, 'upsertNodeMemoryWithEvent');
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

  listNodeRunsByRef(partialRef: string, statuses: readonly NodeRunStatus[]): NodeRunRow[] {
    return withRetry(() => {
      if (statuses.length === 0) return [];
      const placeholders = statuses.map(() => '?').join(', ');
      const query = `
        SELECT *
        FROM node_runs
        WHERE status IN (${placeholders})
          AND (id LIKE ? OR node_name LIKE ?)
        ORDER BY updated_at_ms DESC
      `;
      const prefix = `${partialRef}%`;
      const rows = this.db.query(query).all(...statuses, prefix, prefix) as NodeRunRow[];
      return rows.map((row) => ({
        ...row,
        status: row.status as NodeRunStatus,
      }));
    }, 'listNodeRunsByRef');
  }

  listNodeRunsByStatuses(statuses: readonly NodeRunStatus[]): NodeRunRow[] {
    return withRetry(() => {
      if (statuses.length === 0) return [];
      const placeholders = statuses.map(() => '?').join(', ');
      const query = `
        SELECT *
        FROM node_runs
        WHERE status IN (${placeholders})
        ORDER BY updated_at_ms DESC
      `;
      const rows = this.db.query(query).all(...statuses) as NodeRunRow[];
      return rows.map((row) => ({
        ...row,
        status: row.status as NodeRunStatus,
      }));
    }, 'listNodeRunsByStatuses');
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
        worktree_path: row.worktree_path ?? undefined,
        parent_member_id: row.parent_member_id ?? undefined,
        replaced_member_id: row.replaced_member_id ?? undefined,
        phase_id: row.phase_id ?? undefined,
      }));
    }, 'readNodeMembers');
  }

  readNodeEvents(nodeRunId: string, opts?: { type?: NodeEventType; limit?: number }): Array<{ id: number; seq: number; t: number; type: string; event_json: string }> {
    return withRetry(() => {
      const whereClauses = ['node_run_id = ?'];
      const params: Array<string | number> = [nodeRunId];

      if (opts?.type) {
        whereClauses.push('type = ?');
        params.push(opts.type);
      }

      let query = `
        SELECT id, seq, t, type, event_json
        FROM node_events
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY seq ASC, id ASC
      `;

      if (opts?.limit !== undefined) {
        query += ' LIMIT ?';
        params.push(opts.limit);
      }

      return this.db.query(query).all(...params) as Array<{ id: number; seq: number; t: number; type: string; event_json: string }>;
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
        ORDER BY seq DESC, id DESC
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

  readEpicRun(epicId: string): EpicRunRecord | null {
    return withRetry(() => {
      const row = this.db.query('SELECT epic_id, status, status_json, updated_at_ms FROM epic_runs WHERE epic_id = ? LIMIT 1').get(epicId) as EpicRunRecord | undefined;
      return row ?? null;
    }, 'readEpicRun');
  }

  listEpicRuns(): EpicRunRecord[] {
    return withRetry(() => {
      return this.db.query('SELECT epic_id, status, status_json, updated_at_ms FROM epic_runs ORDER BY updated_at_ms DESC').all() as EpicRunRecord[];
    }, 'listEpicRuns');
  }

  resolveEpicByChainId(chainId: string): EpicChainRecord | null {
    return withRetry(() => {
      const row = this.db.query('SELECT chain_id, epic_id, chain_root_bead_id, chain_root_job_id, updated_at_ms FROM epic_chain_membership WHERE chain_id = ? LIMIT 1').get(chainId) as EpicChainRecord | undefined;
      return row ?? null;
    }, 'resolveEpicByChainId');
  }

  resolveEpicByChainRootBeadId(chainRootBeadId: string): EpicChainRecord | null {
    return withRetry(() => {
      const row = this.db.query('SELECT chain_id, epic_id, chain_root_bead_id, chain_root_job_id, updated_at_ms FROM epic_chain_membership WHERE chain_root_bead_id = ? LIMIT 1').get(chainRootBeadId) as EpicChainRecord | undefined;
      return row ?? null;
    }, 'resolveEpicByChainRootBeadId');
  }

  listEpicChains(epicId: string): EpicChainRecord[] {
    return withRetry(() => {
      return this.db.query('SELECT chain_id, epic_id, chain_root_bead_id, chain_root_job_id, updated_at_ms FROM epic_chain_membership WHERE epic_id = ? ORDER BY updated_at_ms DESC').all(epicId) as EpicChainRecord[];
    }, 'listEpicChains');
  }

  listEpicChainsWithLatestJob(epicId: string): EpicChainLatestJobRecord[] {
    return withRetry(() => {
      const rows = this.db.query(`
        WITH ranked_jobs AS (
          SELECT
            jobs.chain_id AS chain_id,
            membership.epic_id AS epic_id,
            membership.chain_root_bead_id AS chain_root_bead_id,
            membership.chain_root_job_id AS chain_root_job_id,
            jobs.job_id AS job_id,
            jobs.status AS status,
            json_extract(jobs.status_json, '$.branch') AS branch,
            jobs.updated_at_ms AS updated_at_ms,
            ROW_NUMBER() OVER (
              PARTITION BY jobs.chain_id
              ORDER BY jobs.updated_at_ms DESC, jobs.rowid DESC
            ) AS row_rank
          FROM epic_chain_membership membership
          INNER JOIN specialist_jobs jobs ON jobs.chain_id = membership.chain_id
          WHERE membership.epic_id = ?
            AND jobs.chain_kind = 'chain'
        )
        SELECT
          chain_id,
          epic_id,
          chain_root_bead_id,
          chain_root_job_id,
          job_id,
          status,
          branch,
          updated_at_ms
        FROM ranked_jobs
        WHERE row_rank = 1
        ORDER BY updated_at_ms DESC, job_id DESC
      `).all(epicId) as Array<{
        chain_id: string;
        epic_id: string;
        chain_root_bead_id?: string | null;
        chain_root_job_id?: string | null;
        job_id: string;
        status?: string | null;
        branch?: string | null;
        updated_at_ms: number;
      }>;

      return rows.map((row) => ({
        chain_id: row.chain_id,
        epic_id: row.epic_id,
        chain_root_bead_id: row.chain_root_bead_id ?? undefined,
        chain_root_job_id: row.chain_root_job_id ?? undefined,
        job_id: row.job_id,
        status: row.status ?? undefined,
        branch: row.branch ?? undefined,
        updated_at_ms: row.updated_at_ms,
      }));
    }, 'listEpicChainsWithLatestJob');
  }

  readChainIdentity(jobId: string): PersistedChainIdentity | null {
    return withRetry(() => {
      const row = this.db.query(`
        SELECT chain_kind, chain_id, chain_root_job_id, chain_root_bead_id
        FROM specialist_jobs
        WHERE job_id = ?
        LIMIT 1
      `).get(jobId) as { chain_kind?: string; chain_id?: string | null; chain_root_job_id?: string | null; chain_root_bead_id?: string | null } | undefined;

      if (!row?.chain_kind) return null;

      return {
        chain_kind: row.chain_kind === 'chain' ? 'chain' : 'prep',
        chain_id: row.chain_id ?? undefined,
        chain_root_job_id: row.chain_root_job_id ?? undefined,
        chain_root_bead_id: row.chain_root_bead_id ?? undefined,
      };
    }, 'readChainIdentity');
  }

  listChainJobIds(chainId: string): string[] {
    return withRetry(() => {
      const rows = this.db.query(`
        SELECT job_id
        FROM specialist_jobs
        WHERE chain_id = ?
        ORDER BY updated_at_ms ASC
      `).all(chainId) as Array<{ job_id?: string | null }>;

      return rows
        .map((row) => row.job_id)
        .filter((jobId): jobId is string => typeof jobId === 'string' && jobId.length > 0);
    }, 'listChainJobIds');
  }

  resolveChainEpicLinkByJobId(jobId: string): ChainEpicLinkRecord | null {
    return withRetry(() => {
      const row = this.db.query(`
        SELECT
          jobs.chain_id AS chain_id,
          COALESCE(membership.epic_id, jobs.epic_id) AS epic_id,
          COALESCE(jobs.chain_root_job_id, membership.chain_root_job_id, jobs.chain_id) AS chain_root_job_id,
          COALESCE(jobs.chain_root_bead_id, membership.chain_root_bead_id) AS chain_root_bead_id
        FROM specialist_jobs jobs
        LEFT JOIN epic_chain_membership membership ON membership.chain_id = jobs.chain_id
        WHERE jobs.job_id = ?
          AND jobs.chain_kind = 'chain'
          AND jobs.chain_id IS NOT NULL
        LIMIT 1
      `).get(jobId) as ChainEpicLinkRecord | undefined;

      return row ?? null;
    }, 'resolveChainEpicLinkByJobId');
  }

  readEvents(jobId: string): TimelineEvent[] {
    return withRetry(() => {
      const rows = this.db.query(`
        SELECT seq, event_json FROM specialist_events
        WHERE job_id = ?
        ORDER BY seq ASC, id ASC;
      `).all(jobId) as Array<{ seq?: number; event_json?: string }>;
      const events: TimelineEvent[] = [];
      for (const row of rows) {
        if (!row.event_json) continue;
        try {
          const parsed = JSON.parse(row.event_json) as TimelineEvent;
          events.push(typeof parsed.seq === 'number' ? parsed : { ...parsed, seq: row.seq });
        } catch {
          /* ignore malformed rows */
        }
      }
      return events;
    }, 'readEvents');
  }

  readLatestToolEvent(jobId: string): TimelineEventTool | null {
    return withRetry(() => {
      const row = this.db.query(`
        SELECT seq, event_json FROM specialist_events
        WHERE job_id = ? AND type = 'tool'
        ORDER BY seq DESC, id DESC
        LIMIT 1;
      `).get(jobId) as { seq?: number; event_json?: string } | undefined;

      if (!row?.event_json) return null;

      try {
        const parsed = JSON.parse(row.event_json) as TimelineEvent;
        if (parsed.type !== 'tool') return null;
        return typeof parsed.seq === 'number' ? parsed : { ...parsed, seq: row.seq };
      } catch {
        return null;
      }
    }, 'readLatestToolEvent');
  }

  readResult(jobId: string): string | null {
    return withRetry(() => {
      const row = this.db.query('SELECT output FROM specialist_results WHERE job_id = ? LIMIT 1').get(jobId) as { output?: string } | undefined;
      return row?.output ?? null;
    }, 'readResult');
  }

  syncMemoriesCache(memories: readonly MemoryCacheInputRecord[], syncedAtMs: number = Date.now()): void {
    withRetry(() => {
      const transaction = this.db.transaction(() => {
        this.db.run('DELETE FROM memories_fts');

        const upsertMemory = this.db.query(`
          INSERT INTO memories_cache (memory_key, memory_value, updated_at_ms)
          VALUES (?, ?, ?)
          ON CONFLICT(memory_key) DO UPDATE SET
            memory_value = excluded.memory_value,
            updated_at_ms = excluded.updated_at_ms
        `);

        const insertFts = this.db.query('INSERT INTO memories_fts (key, content) VALUES (?, ?)');
        const seen = new Set<string>();

        for (const memory of memories) {
          if (!memory.key || seen.has(memory.key)) continue;
          seen.add(memory.key);
          upsertMemory.run(memory.key, memory.value, syncedAtMs);
          insertFts.run(memory.key, `${memory.key} ${memory.value}`);
        }

        if (seen.size > 0) {
          const placeholders = [...seen].map(() => '?').join(', ');
          this.db.query(`DELETE FROM memories_cache WHERE memory_key NOT IN (${placeholders})`).run(...seen);
        } else {
          this.db.run('DELETE FROM memories_cache');
        }

        this.db.query(`
          INSERT INTO memories_cache_meta (singleton_key, last_sync_at_ms, memory_count)
          VALUES (1, ?, ?)
          ON CONFLICT(singleton_key) DO UPDATE SET
            last_sync_at_ms = excluded.last_sync_at_ms,
            memory_count = excluded.memory_count
        `).run(syncedAtMs, seen.size);
      });
      transaction();
    }, 'syncMemoriesCache');
  }

  getMemoriesCacheState(): MemoryCacheState | null {
    return withRetry(() => {
      const row = this.db.query(`
        SELECT last_sync_at_ms, memory_count
        FROM memories_cache_meta
        WHERE singleton_key = 1
        LIMIT 1
      `).get() as { last_sync_at_ms?: number; memory_count?: number } | undefined;

      if (!row || typeof row.last_sync_at_ms !== 'number' || typeof row.memory_count !== 'number') {
        return null;
      }

      return { lastSyncAtMs: row.last_sync_at_ms, memoryCount: row.memory_count };
    }, 'getMemoriesCacheState');
  }

  queryRelevantMemories(keywords: readonly string[], limit: number = 10, nowMs: number = Date.now()): RelevantMemoryRecord[] {
    return withRetry(() => {
      const cleanedKeywords = [...new Set(keywords.map(keyword => keyword.trim()).filter(keyword => keyword.length > 0))];
      if (cleanedKeywords.length === 0) return [];

      const matchQuery = cleanedKeywords.map(keyword => `"${keyword.replace(/"/g, '""')}"`).join(' OR ');

      const rows = this.db.query(`
        SELECT
          cache.memory_key,
          cache.memory_value,
          bm25(memories_fts) AS bm25_score,
          COALESCE((? - cache.updated_at_ms) / 3600000.0, 999999.0) AS age_hours,
          cache.access_count
        FROM memories_fts
        JOIN memories_cache cache ON cache.memory_key = memories_fts.key
        WHERE memories_fts MATCH ?
        ORDER BY bm25_score ASC
        LIMIT ?
      `).all(nowMs, matchQuery, Math.max(1, limit * 3)) as Array<{
        memory_key: string;
        memory_value: string;
        bm25_score: number;
        age_hours: number;
        access_count: number;
      }>;

      const ranked = rows.map((row) => {
        const bm25 = Number.isFinite(row.bm25_score) ? row.bm25_score : 100;
        const bm25Norm = 1 / (1 + Math.max(0, bm25));
        const recency = Math.exp(-Math.max(0, row.age_hours) / 72);
        const accessFrequency = Math.min(1, Math.log1p(Math.max(0, row.access_count)) / Math.log(10));
        const score = (0.5 * bm25Norm) + (0.3 * recency) + (0.2 * accessFrequency);

        return {
          key: row.memory_key,
          value: row.memory_value,
          bm25,
          recency,
          accessFrequency,
          score,
        };
      });

      ranked.sort((left, right) => right.score - left.score);
      const selected = ranked.slice(0, Math.max(1, limit));
      if (selected.length === 0) return [];

      const accessStmt = this.db.query(`
        UPDATE memories_cache
        SET access_count = access_count + 1,
            last_accessed_at_ms = ?
        WHERE memory_key = ?
      `);
      for (const memory of selected) {
        accessStmt.run(nowMs, memory.key);
      }

      return selected;
    }, 'queryRelevantMemories');
  }

  invalidateMemoriesCache(): void {
    withRetry(() => {
      const transaction = this.db.transaction(() => {
        this.db.run('DELETE FROM memories_fts');
        this.db.run('DELETE FROM memories_cache');
        this.db.run('DELETE FROM memories_cache_meta');
      });
      transaction();
    }, 'invalidateMemoriesCache');
  }

  close(): void {
    this.db.close();
  }
}

export function hasRunCompleteEvent(jobId: string, cwd: string = process.cwd()): boolean {
  const sqliteClient = createObservabilitySqliteClient(cwd);

  try {
    if (sqliteClient) {
      const events = sqliteClient.readEvents(jobId);
      return events.some((event) => event.type === 'run_complete');
    }
  } finally {
    sqliteClient?.close();
  }

  const eventsPath = join(resolveJobsDir(cwd), jobId, 'events.jsonl');
  if (!existsSync(eventsPath)) return false;

  try {
    const lines = readFileSync(eventsPath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      const event = JSON.parse(line) as { type?: string };
      if (event.type === 'run_complete') return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function createObservabilitySqliteClient(cwd: string = process.cwd()): ObservabilitySqliteClient | null {
  if (!loadBunDatabase()) return null;
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
