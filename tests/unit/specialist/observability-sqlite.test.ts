import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Database } from 'bun:sqlite';
import { rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createObservabilitySqliteClient,
  enforceWalMode,
  initSchema,
  parseJournalMode,
  verifyWalMode,
} from '../../../src/specialist/observability-sqlite.js';
import { loadEpicReadinessSummary } from '../../../src/specialist/epic-readiness.js';
import {
  OBSERVABILITY_SCHEMA_VERSION,
  ensureObservabilityDbFile,
  resolveObservabilityDbLocation,
} from '../../../src/specialist/observability-db.js';

describe('observability-sqlite', () => {
  let tempRoot: string;
  let tempDbPath: string;
  let db: Database | null = null;
  let sqliteClient: ReturnType<typeof createObservabilitySqliteClient> | null = null;

  beforeEach(() => {
    tempRoot = join(tmpdir(), `test-observability-${crypto.randomUUID()}`);
    mkdirSync(tempRoot, { recursive: true });
    tempDbPath = join(tempRoot, 'direct.db');
  });

  afterEach(() => {
    if (sqliteClient) {
      try { sqliteClient.close(); } catch { /* ignore */ }
      sqliteClient = null;
    }

    if (db) {
      try { db.close(); } catch { /* ignore */ }
      db = null;
    }

    rmSync(tempRoot, { recursive: true, force: true });
  });

  const createClient = () => {
    const location = resolveObservabilityDbLocation(tempRoot);
    ensureObservabilityDbFile(location);
    const seedDb = new Database(location.dbPath);
    seedDb.close();

    const client = createObservabilitySqliteClient(tempRoot);
    expect(client).not.toBeNull();
    sqliteClient = client;
    return client!;
  };

  describe('enforceWalMode', () => {
    it('enables WAL mode on a fresh database', () => {
      db = new Database(tempDbPath);
      expect(() => enforceWalMode(db!)).not.toThrow();

      const result = db.query('PRAGMA journal_mode').get() as { journal_mode?: string };
      expect(result.journal_mode?.toLowerCase()).toBe('wal');
    });

    it('is idempotent - can be called multiple times', () => {
      db = new Database(tempDbPath);
      expect(() => enforceWalMode(db!)).not.toThrow();
      expect(() => enforceWalMode(db!)).not.toThrow();
      expect(() => enforceWalMode(db!)).not.toThrow();
    });
  });

  describe('verifyWalMode', () => {
    it('verifies WAL mode after it has been enabled', () => {
      db = new Database(tempDbPath);
      enforceWalMode(db);
      expect(() => verifyWalMode(db!)).not.toThrow();
    });

    it('throws when WAL mode is not enabled', () => {
      db = new Database(tempDbPath);
      expect(() => verifyWalMode(db!)).toThrow(/WAL journal mode is not active/);
    });
  });

  describe('migrateToV4', () => {
    it('creates node tables, v4 schema row, and expected indexes', () => {
      db = new Database(tempDbPath);
      initSchema(db);

      const tableRows = db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('node_runs', 'node_members', 'node_events', 'node_memory') ORDER BY name").all() as Array<{ name: string }>;
      expect(tableRows.map((row) => row.name)).toEqual(['node_events', 'node_members', 'node_memory', 'node_runs']);

      expect(OBSERVABILITY_SCHEMA_VERSION).toBe(10);

      const schemaVersionRow = db.query('SELECT version FROM schema_version WHERE version = 10 LIMIT 1').get() as { version?: number };
      expect(schemaVersionRow.version).toBe(10);

      const indexRows = db.query("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_node_runs_status', 'idx_node_members_run', 'idx_node_members_job', 'idx_node_members_run_member', 'idx_node_events_run_t', 'idx_node_events_type', 'idx_node_memory_run', 'idx_node_memory_entry_id') ORDER BY name").all() as Array<{ name: string }>;
      expect(indexRows.map((row) => row.name)).toEqual([
        'idx_node_events_run_t',
        'idx_node_events_type',
        'idx_node_members_job',
        'idx_node_members_run',
        'idx_node_members_run_member',
        'idx_node_memory_entry_id',
        'idx_node_memory_run',
        'idx_node_runs_status',
      ]);
    });

    it('is idempotent when initSchema is called twice on same database', () => {
      db = new Database(tempDbPath);
      expect(() => initSchema(db!)).not.toThrow();
      expect(() => initSchema(db!)).not.toThrow();

      const schemaVersionRow = db.query('SELECT version FROM schema_version WHERE version = 10 LIMIT 1').get() as { version?: number };
      expect(schemaVersionRow.version).toBe(10);
    });
  });

  describe('bootstrapNode', () => {
    it('creates node_runs row and two bootstrap events', () => {
      const client = createClient();
      client.bootstrapNode('node-1', 'coordinator', 'mem.ns');

      const run = client.readNodeRun('node-1');
      expect(run).not.toBeNull();
      expect(run?.status).toBe('created');

      const events = client.readNodeEvents('node-1');
      expect(events.map((event) => event.type)).toEqual(['node_created', 'node_started']);
    });

    it('is atomic (failure rolls back run and events)', () => {
      const client = createClient();
      const location = resolveObservabilityDbLocation(tempRoot);
      db = new Database(location.dbPath);

      db.run("CREATE TRIGGER fail_node_started BEFORE INSERT ON node_events WHEN NEW.type = 'node_started' BEGIN SELECT RAISE(ABORT, 'fail node_started'); END;");

      expect(() => client.bootstrapNode('node-rollback', 'coordinator')).toThrow();

      const runCount = db.query("SELECT COUNT(*) AS count FROM node_runs WHERE id = 'node-rollback'").get() as { count: number };
      const eventCount = db.query("SELECT COUNT(*) AS count FROM node_events WHERE node_run_id = 'node-rollback'").get() as { count: number };
      expect(runCount.count).toBe(0);
      expect(eventCount.count).toBe(0);
    });
  });

  describe('upsertNodeRun', () => {
    it('inserts and updates node_runs rows (status/error/update fields)', () => {
      const client = createClient();

      client.upsertNodeRun({
        id: 'run-1',
        node_name: 'node-a',
        status: 'running',
        updated_at_ms: 100,
        status_json: JSON.stringify({ status: 'running', nested: { pct: 10 } }),
      });

      let row = client.readNodeRun('run-1');
      expect(row?.status).toBe('running');
      expect(row?.updated_at_ms).toBe(100);

      client.upsertNodeRun({
        id: 'run-1',
        node_name: 'node-a',
        status: 'error',
        updated_at_ms: 200,
        error: 'boom',
        status_json: JSON.stringify({ status: 'error', nested: { pct: 100, info: ['a', 'b'] } }),
      });

      row = client.readNodeRun('run-1');
      expect(row?.status).toBe('error');
      expect(row?.updated_at_ms).toBe(200);
      expect(row?.error).toBe('boom');

      const parsedStatus = JSON.parse(row?.status_json ?? '{}') as Record<string, unknown>;
      expect(parsedStatus).toEqual({ status: 'error', nested: { pct: 100, info: ['a', 'b'] } });
    });
  });

  describe('upsertNodeMember', () => {
    it('inserts, upserts by (node_run_id, member_id), and supports multiple members per run', () => {
      const client = createClient();
      client.bootstrapNode('node-members', 'coordinator');

      client.upsertNodeMember({
        node_run_id: 'node-members',
        member_id: 'member-1',
        specialist: 'alpha',
        status: 'running',
      });

      client.upsertNodeMember({
        node_run_id: 'node-members',
        member_id: 'member-1',
        specialist: 'alpha',
        status: 'done',
      });

      client.upsertNodeMember({
        node_run_id: 'node-members',
        member_id: 'member-2',
        specialist: 'beta',
        status: 'running',
      });

      const members = client.readNodeMembers('node-members');
      expect(members).toHaveLength(2);
      expect(members[0].member_id).toBe('member-1');
      expect(members[0].status).toBe('done');
      expect(members[1].member_id).toBe('member-2');
    });
  });

  describe('appendNodeEvent', () => {
    it('appends events and keeps append order for custom events', () => {
      const client = createClient();
      client.bootstrapNode('node-events', 'coordinator');

      client.appendNodeEvent('node-events', 500, 'member_started', { seq: 2 });
      client.appendNodeEvent('node-events', 500, 'member_state_changed', { seq: 3 });
      client.appendNodeEvent('node-events', 400, 'node_state_changed', { seq: 1 });

      const events = client.readNodeEvents('node-events');
      const customEvents = events.filter((event) => ['node_state_changed', 'member_started', 'member_state_changed'].includes(event.type));

      expect(customEvents.map((event) => event.type).sort()).toEqual([
        'member_started',
        'member_state_changed',
        'node_state_changed',
      ]);

      const customSeqValues = customEvents
        .map((event) => JSON.parse(event.event_json) as { seq?: number })
        .map((payload) => payload.seq);
      expect(customSeqValues).toHaveLength(3);
      expect(customSeqValues.every((seq) => typeof seq === 'number')).toBe(true);
      expect(customSeqValues).toEqual([...customSeqValues].sort((a, b) => (a ?? 0) - (b ?? 0)));
    });
  });

  describe('upsertNodeMemory', () => {
    it('inserts memory rows without entry_id and preserves sort order', () => {
      const client = createClient();
      client.bootstrapNode('node-memory', 'coordinator');

      client.upsertNodeMemory({
        node_run_id: 'node-memory',
        namespace: 'ns-1',
        entry_type: 'fact',
        summary: 'first',
        created_at_ms: 10,
        updated_at_ms: 10,
      });

      client.upsertNodeMemory({
        node_run_id: 'node-memory',
        namespace: 'ns-1',
        entry_type: 'fact',
        summary: 'second',
        created_at_ms: 20,
        updated_at_ms: 20,
      });

      const rows = client.readNodeMemory('node-memory', { namespace: 'ns-1', entry_type: 'fact' });
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.summary)).toEqual(['first', 'second']);
    });
  });

  describe('readNodeRun', () => {
    it('returns null for unknown run and parsed row for known run', () => {
      const client = createClient();

      expect(client.readNodeRun('missing')).toBeNull();

      client.upsertNodeRun({
        id: 'run-known',
        node_name: 'node-b',
        status: 'running',
        updated_at_ms: 1,
        status_json: JSON.stringify({ status: 'running' }),
      });

      const row = client.readNodeRun('run-known');
      expect(row).not.toBeNull();
      expect(row?.id).toBe('run-known');
      expect(row?.status).toBe('running');
    });
  });

  describe('listNodeRuns', () => {
    it('returns all runs without filter and only matching runs with status filter', () => {
      const client = createClient();

      client.upsertNodeRun({ id: 'run-1', node_name: 'node', status: 'running', updated_at_ms: 10, status_json: '{"status":"running"}' });
      client.upsertNodeRun({ id: 'run-2', node_name: 'node', status: 'error', updated_at_ms: 20, status_json: '{"status":"error"}' });

      const allRuns = client.listNodeRuns();
      expect(allRuns).toHaveLength(2);
      expect(allRuns.map((row) => row.id)).toEqual(['run-2', 'run-1']);

      const errorRuns = client.listNodeRuns({ status: 'error' });
      expect(errorRuns).toHaveLength(1);
      expect(errorRuns[0].id).toBe('run-2');
    });
  });

  describe('readNodeMembers', () => {
    it('returns empty array for node with no members and ordered rows otherwise', () => {
      const client = createClient();
      client.bootstrapNode('node-read-members', 'coordinator');

      expect(client.readNodeMembers('node-read-members')).toEqual([]);

      client.upsertNodeMember({ node_run_id: 'node-read-members', member_id: 'm1', specialist: 's1', status: 'running' });
      client.upsertNodeMember({ node_run_id: 'node-read-members', member_id: 'm2', specialist: 's2', status: 'running' });

      const members = client.readNodeMembers('node-read-members');
      expect(members.map((member) => member.member_id)).toEqual(['m1', 'm2']);
    });
  });

  describe('readNodeEvents', () => {
    it('supports ordering, type filter, and limit', () => {
      const client = createClient();
      client.bootstrapNode('node-read-events', 'coordinator');

      client.appendNodeEvent('node-read-events', 10, 'member_started', { marker: 'a' });
      client.appendNodeEvent('node-read-events', 20, 'member_state_changed', { marker: 'b' });
      client.appendNodeEvent('node-read-events', 30, 'member_started', { marker: 'c' });

      const ordered = client.readNodeEvents('node-read-events');

      const customEvents = ordered.filter((event) =>
        ['member_started', 'member_state_changed'].includes(event.type),
      );
      expect(customEvents.map((event) => event.type)).toEqual([
        'member_started',
        'member_state_changed',
        'member_started',
      ]);

      const typed = client.readNodeEvents('node-read-events', { type: 'member_started' });
      expect(typed.every((event) => event.type === 'member_started')).toBe(true);
      expect(
        typed
          .map((event) => JSON.parse(event.event_json) as { marker?: string })
          .map((payload) => payload.marker),
      ).toEqual(['a', 'c']);

      const limited = client.readNodeEvents('node-read-events', { limit: 2 });
      expect(limited).toHaveLength(2);
      expect(limited.map((event) => event.id)).toEqual(ordered.slice(0, 2).map((event) => event.id));
    });
  });

  describe('readNodeMemory', () => {
    it('returns memory ordered by created_at_ms and supports namespace + entry_type filters', () => {
      const client = createClient();
      client.bootstrapNode('node-read-memory', 'coordinator');

      client.upsertNodeMemory({ node_run_id: 'node-read-memory', namespace: 'ns-a', entry_type: 'fact', summary: 'a', created_at_ms: 30, updated_at_ms: 30 });
      client.upsertNodeMemory({ node_run_id: 'node-read-memory', namespace: 'ns-b', entry_type: 'question', summary: 'b', created_at_ms: 10, updated_at_ms: 10 });
      client.upsertNodeMemory({ node_run_id: 'node-read-memory', namespace: 'ns-a', entry_type: 'fact', summary: 'c', created_at_ms: 20, updated_at_ms: 20 });

      const all = client.readNodeMemory('node-read-memory');
      expect(all.map((row) => row.summary)).toEqual(['b', 'c', 'a']);

      const byNamespace = client.readNodeMemory('node-read-memory', { namespace: 'ns-a' });
      expect(byNamespace).toHaveLength(2);
      expect(byNamespace.every((row) => row.namespace === 'ns-a')).toBe(true);

      const byType = client.readNodeMemory('node-read-memory', { entry_type: 'question' });
      expect(byType).toHaveLength(1);
      expect(byType[0].entry_type).toBe('question');
    });
  });

  describe('queryMemberContextHealth', () => {
    it('returns null when no turn_summary exists for job', () => {
      const client = createClient();
      expect(client.queryMemberContextHealth('job-none')).toBeNull();
    });

    it('reads latest context_pct from specialist_events (not node_events)', () => {
      const client = createClient();
      const location = resolveObservabilityDbLocation(tempRoot);
      db = new Database(location.dbPath);

      db.run(
        `INSERT INTO specialist_events (seq, job_id, specialist, bead_id, t, type, event_json) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
        [
          1, 'job-1', 'spec-a', null, 100, 'turn_summary', JSON.stringify({ context_pct: 41 }),
          2, 'job-1', 'spec-a', null, 200, 'turn_summary', JSON.stringify({ context_pct: 77 }),
        ],
      );

      db.run(
        `INSERT INTO node_events (seq, node_run_id, t, type, event_json) VALUES (?, ?, ?, ?, ?)`,
        [1, 'node-ctx', 999, 'node_state_changed', JSON.stringify({ context_pct: 5, note: 'must be ignored' })],
      );

      expect(client.queryMemberContextHealth('job-1')).toBe(77);
    });
  });

  describe('chain identity persistence', () => {
    it('stores prep jobs with explicit prep chain_kind and no chain id', () => {
      const client = createClient();
      client.upsertStatus({
        id: 'prep-1',
        specialist: 'planner',
        status: 'done',
        started_at_ms: 1,
        chain_kind: 'prep',
      });

      expect(client.readChainIdentity('prep-1')).toEqual({ chain_kind: 'prep' });
      expect(client.resolveChainEpicLinkByJobId('prep-1')).toBeNull();
    });

    it('resolves chain membership and chain->epic linkage from sqlite', () => {
      const client = createClient();

      client.upsertStatus({
        id: 'chain-root',
        specialist: 'executor',
        status: 'done',
        started_at_ms: 1,
        bead_id: 'unitAI-100',
        worktree_path: '/tmp/worktree',
        worktree_owner_job_id: 'chain-root',
        chain_kind: 'chain',
        chain_id: 'chain-root',
        chain_root_job_id: 'chain-root',
        chain_root_bead_id: 'unitAI-100',
        epic_id: 'unitAI-epic',
      });

      client.upsertStatus({
        id: 'chain-child',
        specialist: 'reviewer',
        status: 'waiting',
        started_at_ms: 2,
        bead_id: 'unitAI-101',
        worktree_path: '/tmp/worktree',
        worktree_owner_job_id: 'chain-root',
        chain_kind: 'chain',
        chain_id: 'chain-root',
        chain_root_job_id: 'chain-root',
        chain_root_bead_id: 'unitAI-100',
      });

      client.upsertEpicChainMembership({
        chain_id: 'chain-root',
        epic_id: 'unitAI-epic',
        chain_root_bead_id: 'unitAI-100',
        chain_root_job_id: 'chain-root',
        updated_at_ms: 100,
      });

      expect(client.listChainJobIds('chain-root')).toEqual(['chain-root', 'chain-child']);
      expect(client.readChainIdentity('chain-child')).toEqual({
        chain_kind: 'chain',
        chain_id: 'chain-root',
        chain_root_job_id: 'chain-root',
        chain_root_bead_id: 'unitAI-100',
      });
      expect(client.resolveChainEpicLinkByJobId('chain-child')).toEqual({
        chain_id: 'chain-root',
        epic_id: 'unitAI-epic',
        chain_root_job_id: 'chain-root',
        chain_root_bead_id: 'unitAI-100',
      });

      const location = resolveObservabilityDbLocation(tempRoot);
      db = new Database(location.dbPath);
      const persistedRow = db.query(`
        SELECT chain_kind, chain_id, chain_root_job_id, chain_root_bead_id, epic_id
        FROM specialist_jobs
        WHERE job_id = 'chain-root'
        LIMIT 1
      `).get() as {
        chain_kind: string;
        chain_id: string;
        chain_root_job_id: string;
        chain_root_bead_id: string;
        epic_id: string;
      };

      expect(persistedRow.chain_kind).toBe('chain');
      expect(typeof persistedRow.chain_id).toBe('string');
      expect(typeof persistedRow.chain_root_job_id).toBe('string');
      expect(typeof persistedRow.chain_root_bead_id).toBe('string');
      expect(typeof persistedRow.epic_id).toBe('string');
    });

    it('handles migration-style missing metadata deterministically', () => {
      const client = createClient();
      const location = resolveObservabilityDbLocation(tempRoot);
      db = new Database(location.dbPath);

      db.run(
        `INSERT INTO specialist_jobs (job_id, specialist, status, status_json, updated_at_ms, chain_kind)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['legacy-prep', 'explorer', 'done', '{"status":"done"}', 10, ''],
      );

      db.run(
        `INSERT INTO specialist_jobs (job_id, specialist, status, status_json, updated_at_ms, chain_kind, chain_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['legacy-chain', 'executor', 'done', '{"status":"done"}', 11, 'chain', 'chain-legacy'],
      );

      expect(client.readChainIdentity('legacy-prep')).toEqual({ chain_kind: 'prep' });
      expect(client.resolveChainEpicLinkByJobId('legacy-chain')).toEqual({
        chain_id: 'chain-legacy',
        epic_id: null,
        chain_root_job_id: 'chain-legacy',
        chain_root_bead_id: null,
      });
      expect(client.resolveChainEpicLinkByJobId('legacy-prep')).toBeNull();
    });
  });

  describe('epic persistence contract', () => {
    it('persists epic run rows with lifecycle fields and reads them back', () => {
      const client = createClient();

      client.upsertEpicRun({
        epic_id: 'unitAI-epic',
        status: 'resolving',
        updated_at_ms: 100,
        status_json: JSON.stringify({
          status: 'resolving',
          owner_job_id: 'job-owner',
          required_chains: ['chain-a'],
        }),
      });

      client.upsertEpicRun({
        epic_id: 'unitAI-epic',
        status: 'merge_ready',
        updated_at_ms: 200,
        status_json: JSON.stringify({
          status: 'merge_ready',
          owner_job_id: 'job-owner',
          required_chains: ['chain-a'],
          note: 'ready',
        }),
      });

      const row = client.readEpicRun('unitAI-epic');
      expect(row).not.toBeNull();
      expect(row?.epic_id).toBe('unitAI-epic');
      expect(row?.status).toBe('merge_ready');
      expect(row?.updated_at_ms).toBe(200);

      const payload = JSON.parse(row?.status_json ?? '{}') as Record<string, unknown>;
      expect(payload.status).toBe('merge_ready');
      expect(payload.owner_job_id).toBe('job-owner');
      expect(Array.isArray(payload.required_chains)).toBe(true);
    });

    it('persists chain membership and resolves by chain id or chain-root bead id', () => {
      const client = createClient();

      client.upsertEpicChainMembership({
        chain_id: 'chain-a',
        epic_id: 'unitAI-epic',
        chain_root_bead_id: 'unitAI-chain-a',
        chain_root_job_id: 'job-a',
        updated_at_ms: 100,
      });
      client.upsertEpicChainMembership({
        chain_id: 'chain-b',
        epic_id: 'unitAI-epic',
        chain_root_bead_id: 'unitAI-chain-b',
        chain_root_job_id: 'job-b',
        updated_at_ms: 200,
      });

      const byChainId = client.resolveEpicByChainId('chain-a');
      expect(byChainId?.epic_id).toBe('unitAI-epic');
      expect(byChainId?.chain_root_bead_id).toBe('unitAI-chain-a');

      const byRootBead = client.resolveEpicByChainRootBeadId('unitAI-chain-b');
      expect(byRootBead?.chain_id).toBe('chain-b');
      expect(byRootBead?.chain_root_job_id).toBe('job-b');

      const listed = client.listEpicChains('unitAI-epic');
      expect(listed.map((row) => row.chain_id)).toEqual(['chain-b', 'chain-a']);
    });

    it('returns null/empty for unknown epic entities', () => {
      const client = createClient();

      expect(client.readEpicRun('missing-epic')).toBeNull();
      expect(client.resolveEpicByChainId('missing-chain')).toBeNull();
      expect(client.resolveEpicByChainRootBeadId('missing-root')).toBeNull();
      expect(client.listEpicChains('missing-epic')).toEqual([]);
    });
  });

  describe('loadEpicReadinessSummary', () => {
    it('reconstructs merge readiness from persisted sqlite rows after restart', () => {
      const client = createClient();

      client.upsertEpicRun({
        epic_id: 'unitAI-restart-epic',
        status: 'resolving',
        updated_at_ms: 1,
        status_json: JSON.stringify({ status: 'resolving' }),
      });

      client.upsertStatus({
        id: 'prep-done',
        specialist: 'explorer',
        status: 'done',
        started_at_ms: 1,
        epic_id: 'unitAI-restart-epic',
        chain_kind: 'prep',
      });

      client.upsertStatus({
        id: 'chain-review',
        specialist: 'reviewer',
        status: 'done',
        started_at_ms: 2,
        epic_id: 'unitAI-restart-epic',
        chain_kind: 'chain',
        chain_id: 'chain-r',
        chain_root_job_id: 'chain-r',
        chain_root_bead_id: 'unitAI-chain-r',
      });
      client.upsertResult('chain-review', '## Compliance Verdict\n- Verdict: PASS');

      client.upsertEpicChainMembership({
        chain_id: 'chain-r',
        epic_id: 'unitAI-restart-epic',
        chain_root_bead_id: 'unitAI-chain-r',
        chain_root_job_id: 'chain-r',
        updated_at_ms: 2,
      });

      const summary = loadEpicReadinessSummary(client, 'unitAI-restart-epic');

      expect(summary.readiness_state).toBe('merge_ready');
      expect(summary.next_state).toBe('merge_ready');
      expect(summary.chains).toHaveLength(1);
      expect(summary.chains[0]?.chain_id).toBe('chain-r');
      expect(summary.prep.done).toBe(1);
    });

    it('does not treat prep jobs as chain members when membership table is empty', () => {
      const client = createClient();

      client.upsertEpicRun({
        epic_id: 'unitAI-prep-only-restart',
        status: 'resolving',
        updated_at_ms: 1,
        status_json: JSON.stringify({ status: 'resolving' }),
      });
      client.upsertStatus({
        id: 'prep-1',
        specialist: 'explorer',
        status: 'done',
        started_at_ms: 1,
        epic_id: 'unitAI-prep-only-restart',
        chain_kind: 'prep',
      });

      const summary = loadEpicReadinessSummary(client, 'unitAI-prep-only-restart');

      expect(summary.chains).toEqual([]);
      expect(summary.prep.total).toBe(1);
      expect(summary.readiness_state).toBe('merge_ready');
    });
  });

  describe('memories cache ranking', () => {
    it('ranks memory with high access frequency over stale low-access memory', () => {
      const client = createClient();
      const now = Date.now();
      client.syncMemoriesCache([
        { key: 'fts ranking one', value: 'alpha retrieval' },
        { key: 'fts ranking two', value: 'alpha retrieval' },
      ], now - (10 * 24 * 60 * 60 * 1000));

      for (let i = 0; i < 25; i += 1) {
        client.queryRelevantMemories(['alpha'], 1, now - 1_000 + i);
      }

      // Refresh with same keys to keep access stats, then age one row heavily.
      client.syncMemoriesCache([
        { key: 'fts ranking one', value: 'alpha retrieval' },
        { key: 'fts ranking two', value: 'alpha retrieval' },
      ], now);

      const location = resolveObservabilityDbLocation(tempRoot);
      const directDb = new Database(location.dbPath);
      directDb.run('UPDATE memories_cache SET updated_at_ms = ? WHERE memory_key = ?', [now - (45 * 24 * 60 * 60 * 1000), 'fts ranking two']);
      directDb.run('UPDATE memories_cache SET access_count = 0 WHERE memory_key = ?', ['fts ranking two']);
      directDb.close();

      const ranked = client.queryRelevantMemories(['alpha'], 2, now);
      expect(ranked).toHaveLength(2);
      expect(ranked[0]?.key).toBe('fts ranking one');
      expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
    });

    it('returns at most requested limit (top-10 behavior)', () => {
      const client = createClient();
      const records = Array.from({ length: 30 }, (_, index) => ({
        key: `memory-key-${index}`,
        value: 'rank alpha beta',
      }));
      client.syncMemoriesCache(records, Date.now());

      const ranked = client.queryRelevantMemories(['rank'], 10, Date.now());
      expect(ranked.length).toBeLessThanOrEqual(10);
    });
  });

  describe('parseJournalMode', () => {
    it('normalizes journal mode to lowercase', () => {
      expect(parseJournalMode('WAL')).toBe('wal');
      expect(parseJournalMode('wal')).toBe('wal');
      expect(parseJournalMode('WaL')).toBe('wal');
      expect(parseJournalMode(null)).toBe(null);
      expect(parseJournalMode(undefined)).toBe(null);
      expect(parseJournalMode('')).toBe(null);
    });
  });
});
