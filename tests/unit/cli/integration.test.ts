import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createObservabilitySqliteClientAtPath,
  type ObservabilitySqliteClient,
} from '../../../src/specialist/observability-sqlite.js';

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
  const { run } = await import('../../../src/cli/integration.js');
  run();
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
    const { run } = await import('../../../src/cli/integration.js');
    expect(() => run()).toThrow('exit:1');

    const emitted = JSON.parse(stdout.join(''));
    expect(emitted.ok).toBe(false);
    expect(emitted.error.code).toBe('usage');
    expect(emitted.error.message).toContain('is required');
    expect(emitted.error.message).toContain('Usage: specialists integration record');
  });

  it('rejects a commit that is not a 7-40 char hex sha', async () => {
    const { cwd } = mkDb();
    argv(
      '--source-branch', 'feature/x', '--source-worktree', '/wt',
      '--target-branch', 'master', '--target-worktree', '/repo',
      '--commit', 'HEAD~1', '--cwd', cwd, '--json',
    );
    const { run } = await import('../../../src/cli/integration.js');
    expect(() => run()).toThrow('exit:1');
    expect(JSON.parse(stdout.join('')).error.code).toBe('usage');
  });

  it('rejects a --status other than merged', async () => {
    const { cwd } = mkDb();
    argv(...REQUIRED, '--status', 'reverted', '--cwd', cwd, '--json');
    const { run } = await import('../../../src/cli/integration.js');
    expect(() => run()).toThrow('exit:1');
    expect(JSON.parse(stdout.join('')).error.message).toContain("--status must be 'merged'");
  });

  it('fails with `observability_db_missing` instead of creating the DB', async () => {
    // No mkDb() — an observation verb must not provision the runtime's database.
    argv(...REQUIRED, '--cwd', tempRoot, '--json');
    const { run } = await import('../../../src/cli/integration.js');
    expect(() => run()).toThrow('exit:1');
    expect(JSON.parse(stdout.join('')).error.code).toBe('observability_db_missing');
  });

  it('reports errors on stderr rather than stdout without --json', async () => {
    argv('--source-branch', 'feature/x', '--cwd', tempRoot);
    const { run } = await import('../../../src/cli/integration.js');
    expect(() => run()).toThrow('exit:1');
    expect(stderr.join('')).toContain('error (usage)');
    expect(stdout.join('')).toBe('');
  });
});
