import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Database } from 'bun:sqlite';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('observability-sqlite', () => {
  let tempDbPath: string;
  let db: Database | null = null;

  beforeEach(() => {
    tempDbPath = join(tmpdir(), `test-observability-${crypto.randomUUID()}.db`);
  });

  afterEach(() => {
    // Clean up db and WAL/SHM files
    if (db) {
      try { db.close(); } catch { /* ignore */ }
      db = null;
    }
    rmSync(tempDbPath, { force: true });
    rmSync(`${tempDbPath}-wal`, { force: true });
    rmSync(`${tempDbPath}-shm`, { force: true });
  });

  describe('enforceWalMode', () => {
    it('enables WAL mode on a fresh database', async () => {
      const { enforceWalMode } = await import('../../../src/specialist/observability-sqlite.js');
      
      db = new Database(tempDbPath);
      expect(() => enforceWalMode(db)).not.toThrow();
      
      // Verify WAL mode is active
      const result = db.query('PRAGMA journal_mode').get() as { journal_mode?: string };
      expect(result.journal_mode?.toLowerCase()).toBe('wal');
    });

    it('is idempotent - can be called multiple times', async () => {
      const { enforceWalMode } = await import('../../../src/specialist/observability-sqlite.js');
      
      db = new Database(tempDbPath);
      expect(() => enforceWalMode(db)).not.toThrow();
      expect(() => enforceWalMode(db)).not.toThrow();
      expect(() => enforceWalMode(db)).not.toThrow();
    });
  });

  describe('verifyWalMode', () => {
    it('verifies WAL mode after it has been enabled', async () => {
      const { enforceWalMode, verifyWalMode } = await import('../../../src/specialist/observability-sqlite.js');
      
      db = new Database(tempDbPath);
      enforceWalMode(db);
      expect(() => verifyWalMode(db)).not.toThrow();
    });

    it('throws when WAL mode is not enabled', async () => {
      const { verifyWalMode } = await import('../../../src/specialist/observability-sqlite.js');
      
      db = new Database(tempDbPath);
      // Don't enable WAL mode first - default is DELETE mode
      expect(() => verifyWalMode(db)).toThrow(/WAL journal mode is not active/);
    });
  });

  describe('initSchema', () => {
    it('initializes schema with WAL mode enabled', async () => {
      const { initSchema } = await import('../../../src/specialist/observability-sqlite.js');
      
      db = new Database(tempDbPath);
      expect(() => initSchema(db)).not.toThrow();
      
      // Verify WAL mode
      const modeResult = db.query('PRAGMA journal_mode').get() as { journal_mode?: string };
      expect(modeResult.journal_mode?.toLowerCase()).toBe('wal');
      
      // Verify schema_version table exists
      const schemaResult = db.query('SELECT version FROM schema_version').get() as { version?: number };
      expect(schemaResult.version).toBe(1);
      
      // Verify specialist_jobs table has worktree_column
      const tableInfo = db.query('PRAGMA table_info(specialist_jobs)').all() as Array<{ name?: string }>;
      const columnNames = tableInfo.map(c => c.name);
      expect(columnNames).toContain('worktree_column');
      expect(columnNames).toContain('last_output');
    });

    it('is idempotent - can be run multiple times', async () => {
      const { initSchema } = await import('../../../src/specialist/observability-sqlite.js');
      
      db = new Database(tempDbPath);
      expect(() => initSchema(db)).not.toThrow();
      expect(() => initSchema(db)).not.toThrow();
      
      // Verify data is preserved
      const result = db.query('SELECT version FROM schema_version').get() as { version?: number };
      expect(result.version).toBe(1);
    });
  });

  describe('parseJournalMode', () => {
    it('normalizes journal mode to lowercase', async () => {
      const { parseJournalMode } = await import('../../../src/specialist/observability-sqlite.js');
      
      expect(parseJournalMode('WAL')).toBe('wal');
      expect(parseJournalMode('wal')).toBe('wal');
      expect(parseJournalMode('WaL')).toBe('wal');
      expect(parseJournalMode(null)).toBe(null);
      expect(parseJournalMode(undefined)).toBe(null);
      expect(parseJournalMode('')).toBe(null);
    });
  });
});
