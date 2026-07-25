import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createObservabilitySqliteClientAtPath,
  type ObservabilitySqliteClient,
} from '../../../src/specialist/observability-sqlite.js';
import {
  BRANCH_INTEGRATION_SCHEMA_VERSION,
  createBranchIntegrationEvent,
} from '../../../src/specialist/branch-integration-events.js';
import { parseIntegrationListArgs, renderIntegrationRows } from '../../../src/cli/integration.js';

const originalArgv = [...process.argv];

let tempRoot: string;
let client: ObservabilitySqliteClient | null = null;
let stdout: string[] = [];
let stderr: string[] = [];

/** `sp integration record ...` — argv[0..1] are runtime + entry, argv[2..3] the verb pair. */
function argv(...args: string[]): void {
  process.argv = ['node', 'specialists', 'integration', 'record', ...args];
}

function mkDb(): { dbPath: string; cwd: string } {
  // resolveObservabilityDbLocation walks to the git root; tempRoot is not a repo,
  // so it resolves to <tempRoot>/.specialists/db/observability.db.
  const cwd = tempRoot;
  const dbPath = join(cwd, '.specialists', 'db', 'observability.db');
  client = createObservabilitySqliteClientAtPath(dbPath);
  return { dbPath, cwd };
}

async function record(...args: string[]): Promise<void> {
  argv(...args);
  const { runRecord } = await import('../../../src/cli/integration.js');
  runRecord();
}

const REQUIRED = [
  '--source-branch', 'feature/unitAI-55d',
  '--source-worktree', '/repo/.worktrees/unitAI-55d',
  '--target-branch', 'master',
  '--target-worktree', '/repo',
  '--commit', '73cf0e77',
];

beforeEach(() => {
  tempRoot = join(tmpdir(), `test-sp-integration-${crypto.randomUUID()}`);
  mkdirSync(tempRoot, { recursive: true });
  stdout = [];
  stderr = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => { stdout.push(parts.join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => { stderr.push(parts.join(' ')); });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number | string) => {
    throw new Error(`exit:${code}`);
  }) as never);
});

afterEach(() => {
  if (client) {
    try { client.close(); } catch { /* ignore */ }
    client = null;
  }
  process.argv = [...originalArgv];
  vi.restoreAllMocks();
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('sp integration record', () => {
  it('records one xtrm.branch.integration.v1 event readable through the client', async () => {
    const { cwd } = mkDb();
    await record(...REQUIRED, '--cwd', cwd, '--json');

    const rows = client!.listBranchIntegrations();
    expect(rows).toHaveLength(1);
    expect(rows[0].event.schema_version).toBe('xtrm.branch.integration.v1');
    expect(rows[0].event.source.branch).toBe('feature/unitAI-55d');
    expect(rows[0].event.target.branch).toBe('master');
    expect(rows[0].event.status).toBe('merged');
    expect(rows[0].event.commit).toBe('73cf0e77');

    const emitted = JSON.parse(stdout.join(''));
    expect(emitted.ok).toBe(true);
    expect(emitted.event.commit).toBe('73cf0e77');
  });

  it('defaults source.job_id to `manual` and omits target.role when unset', async () => {
    const { cwd } = mkDb();
    await record(...REQUIRED, '--cwd', cwd, '--json');

    const [row] = client!.listBranchIntegrations();
    expect(row.event.source.job_id).toBe('manual');
    expect('role' in row.event.target).toBe(false);
  });

  it('carries an explicit job id and coordinator role through to the event', async () => {
    const { cwd } = mkDb();
    await record(
      ...REQUIRED, '--cwd', cwd, '--json',
      '--source-job-id', 'a1b2c3',
      '--target-role', 'chain-coordinator',
    );

    const [row] = client!.listBranchIntegrations();
    expect(row.event.source.job_id).toBe('a1b2c3');
    expect(row.event.target.role).toBe('chain-coordinator');
  });

  it('resolves worktree paths to absolute', async () => {
    const { cwd } = mkDb();
    await record(
      '--source-branch', 'feature/x', '--source-worktree', 'relative/wt',
      '--target-branch', 'master', '--target-worktree', '/repo',
      '--commit', 'abc1234', '--cwd', cwd, '--json',
    );

    const [row] = client!.listBranchIntegrations();
    expect(row.event.source.worktree.startsWith('/')).toBe(true);
    expect(row.event.source.worktree.endsWith('relative/wt')).toBe(true);
  });

  it('is idempotent — the same (source-branch, commit) pair records once', async () => {
    const { cwd } = mkDb();
    await record(...REQUIRED, '--cwd', cwd, '--json');
    await record(...REQUIRED, '--cwd', cwd, '--json');

    expect(client!.listBranchIntegrations()).toHaveLength(1);
  });

  it('prints a one-line confirmation without --json', async () => {
    const { cwd } = mkDb();
    await record(...REQUIRED, '--cwd', cwd);

    expect(stdout.join('')).toContain('recorded xtrm.branch.integration.v1: feature/unitAI-55d → master @ 73cf0e77');
    expect(stdout.join('')).not.toContain('"ok"');
  });

  it('fails with `usage` when a required flag is missing', async () => {
    const { cwd } = mkDb();
    argv('--source-branch', 'feature/x', '--cwd', cwd, '--json');
    const { runRecord } = await import('../../../src/cli/integration.js');
    expect(() => runRecord()).toThrow('exit:1');

    const emitted = JSON.parse(stdout.join(''));
    expect(emitted.ok).toBe(false);
    expect(emitted.error.code).toBe('usage');
    expect(emitted.error.message).toContain('is required');
    expect(emitted.error.message).toContain('Usage: specialists integration record');
  });

  it('rejects a flag-shaped required value as missing', async () => {
    const { cwd } = mkDb();
    argv(
      '--source-branch', 'feature/x', '--source-worktree', '/wt',
      '--target-branch', 'master', '--target-worktree', '/repo',
      '--commit', '--branch', 'main', '--cwd', cwd, '--json',
    );
    const { runRecord } = await import('../../../src/cli/integration.js');
    expect(() => runRecord()).toThrow('exit:1');
    expect(JSON.parse(stdout.join('')).error.message).toContain('--commit is required');
  });

  it('rejects an empty required value as missing', async () => {
    const { cwd } = mkDb();
    argv(
      '--source-branch', 'feature/x', '--source-worktree', '/wt',
      '--target-branch', 'master', '--target-worktree', '/repo',
      '--commit', '', '--cwd', cwd, '--json',
    );
    const { runRecord } = await import('../../../src/cli/integration.js');
    expect(() => runRecord()).toThrow('exit:1');
    expect(JSON.parse(stdout.join('')).error.message).toContain('--commit is required');
  });

  it('rejects a commit that is not a 7-40 char hex sha', async () => {
    const { cwd } = mkDb();
    argv(
      '--source-branch', 'feature/x', '--source-worktree', '/wt',
      '--target-branch', 'master', '--target-worktree', '/repo',
      '--commit', 'HEAD~1', '--cwd', cwd, '--json',
    );
    const { runRecord } = await import('../../../src/cli/integration.js');
    expect(() => runRecord()).toThrow('exit:1');
    expect(JSON.parse(stdout.join('')).error.code).toBe('usage');
  });

  it('rejects a --status other than merged', async () => {
    const { cwd } = mkDb();
    argv(...REQUIRED, '--status', 'reverted', '--cwd', cwd, '--json');
    const { runRecord } = await import('../../../src/cli/integration.js');
    expect(() => runRecord()).toThrow('exit:1');
    expect(JSON.parse(stdout.join('')).error.message).toContain("--status must be 'merged'");
  });

  it('fails with `observability_db_missing` instead of creating the DB', async () => {
    // No mkDb() — an observation verb must not provision the runtime's database.
    argv(...REQUIRED, '--cwd', tempRoot, '--json');
    const { runRecord } = await import('../../../src/cli/integration.js');
    expect(() => runRecord()).toThrow('exit:1');
    expect(JSON.parse(stdout.join('')).error.code).toBe('observability_db_missing');
  });

  it('reports errors on stderr rather than stdout without --json', async () => {
    argv('--source-branch', 'feature/x', '--cwd', tempRoot);
    const { runRecord } = await import('../../../src/cli/integration.js');
    expect(() => runRecord()).toThrow('exit:1');
    expect(stderr.join('')).toContain('error (usage)');
    expect(stdout.join('')).toBe('');
  });
});

// ── list (core xtrm-vtqlg.6) ─────────────────────────────────────────────────
//
// The store's query layer (listBranchIntegrations filters, idempotence) is
// covered in tests/unit/specialist/observability-sqlite.test.ts. What is new
// here is the CLI glue: flags -> ListBranchIntegrationFilters, and rows -> output.

const listEvent = createBranchIntegrationEvent({
  source: { job_id: 'job-exec', branch: 'sp/exec-1', worktree: '/wt/sp-exec-1' },
  target: { branch: 'xt/coord-epic', worktree: '/wt/coord', role: 'chain-coordinator' },
  commit: 'deadbeefcafe1234',
  t_unix_ms: 1_700_000_000_000,
});
const listRows = [{ t: listEvent.t_unix_ms, event: listEvent }];

describe('sp integration list — arg parsing', () => {
  it('defaults to human output with a bounded limit and no filters', () => {
    expect(parseIntegrationListArgs([])).toEqual({ json: false, limit: 100 });
  });

  it('maps every flag onto a ListBranchIntegrationFilters field', () => {
    expect(parseIntegrationListArgs(['--target-branch', 'master', '--job', '49adda', '--limit', '5', '--json']))
      .toEqual({ json: true, limit: 5, targetBranch: 'master', sourceJobId: '49adda' });
  });

  it.each([
    [['--target-branch'], /--target-branch requires a value/],
    [['--job'], /--job requires a value/],
    [['--limit'], /--limit requires a value/],
    [['--limit', '0'], /Invalid --limit value/],
    [['--limit', 'abc'], /Invalid --limit value/],
    [['--nope'], /Unknown integration list option/],
  ])('rejects %j', (args, message) => {
    expect(() => parseIntegrationListArgs(args)).toThrow(message);
  });
});

describe('sp integration list — rendering', () => {
  it('emits the stored xtrm.branch.integration.v1 payload verbatim under --json', () => {
    const [line, ...rest] = renderIntegrationRows(listRows, { json: true });
    expect(rest).toEqual([]);
    expect(JSON.parse(line)).toEqual(listEvent);
    expect(JSON.parse(line).schema_version).toBe(BRANCH_INTEGRATION_SCHEMA_VERSION);
  });

  it('renders the job -> commit lineage git cannot answer on its own', () => {
    const [line] = renderIntegrationRows(listRows, { json: false });
    expect(line).toContain('merged sp/exec-1 -> xt/coord-epic');
    expect(line).toContain('role=chain-coordinator');
    expect(line).toContain('commit=deadbeefcafe');
    expect(line).toContain('job=job-exec');
  });

  it('says so plainly when the store is empty', () => {
    expect(renderIntegrationRows([], { json: false })).toEqual(['No branch integrations recorded.']);
    expect(renderIntegrationRows([], { json: true })).toEqual([]);
  });
});
