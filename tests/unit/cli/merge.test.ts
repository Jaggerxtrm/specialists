import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';

import type { EpicRunRecord } from '../../../src/specialist/epic-lifecycle.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import * as observabilitySqlite from '../../../src/specialist/observability-sqlite.js';
import { resolveChainEpicMembership, resolveMergeTargets, topologicallySortChains, run, checkEpicUnresolvedGuard } from '../../../src/cli/merge.js';

function asSpawnResult(partial: Partial<SpawnSyncReturns<string>>): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [],
    stdout: '',
    stderr: '',
    status: 0,
    signal: null,
    error: undefined,
    ...partial,
  } as SpawnSyncReturns<string>;
}

describe('merge CLI', () => {
  const originalArgv = [...process.argv];
  const originalCwd = process.cwd();
  let testRoot = '';

  beforeEach(() => {
    testRoot = join(tmpdir(), `merge-cli-${crypto.randomUUID()}`);
    mkdirSync(join(testRoot, '.specialists', 'jobs'), { recursive: true });
    process.chdir(testRoot);
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    process.chdir(originalCwd);
    rmSync(testRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('sorts chains in dependency order', () => {
    const sorted = topologicallySortChains(
      [
        { beadId: 'unitAI-a', branch: 'feature/a', jobId: 'a', jobStatus: 'done', startedAtMs: 3 },
        { beadId: 'unitAI-b', branch: 'feature/b', jobId: 'b', jobStatus: 'done', startedAtMs: 2 },
        { beadId: 'unitAI-c', branch: 'feature/c', jobId: 'c', jobStatus: 'done', startedAtMs: 1 },
      ],
      new Map([
        ['unitAI-a', ['unitAI-b']],
        ['unitAI-b', ['unitAI-c']],
      ]),
    );

    expect(sorted.map(chain => chain.beadId)).toEqual(['unitAI-c', 'unitAI-b', 'unitAI-a']);
  });

  it('prefers sqlite chain->epic membership when available', () => {
    const sqliteClient = {
      resolveEpicByChainRootBeadId: vi.fn().mockReturnValue({ epic_id: 'unitAI-epic-from-sqlite' }),
      close: vi.fn(),
    };
    vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);

    const membership = resolveChainEpicMembership('unitAI-chain');
    expect(membership).toEqual({ epicId: 'unitAI-epic-from-sqlite', source: 'sqlite' });
    expect(sqliteClient.resolveEpicByChainRootBeadId).toHaveBeenCalledWith('unitAI-chain');
    expect(sqliteClient.close).toHaveBeenCalledTimes(1);
  });

  it('falls back to bead parent when sqlite membership is unavailable', () => {
    vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(null);

    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      if (command === 'bd' && args[0] === 'show') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-chain', title: 'chain', parent: 'unitAI-epic-parent' }]) });
      }
      return asSpawnResult({ status: 1, stderr: 'unexpected command' });
    });

    expect(resolveChainEpicMembership('unitAI-chain')).toEqual({ epicId: 'unitAI-epic-parent', source: 'bead-parent' });
  });

  it('returns none when sqlite and bead-parent resolution both fail', () => {
    vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(null);

    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      if (command === 'bd' && args[0] === 'show') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-chain', title: 'chain' }]) });
      }
      return asSpawnResult({ status: 1, stderr: 'unexpected command' });
    });

    expect(resolveChainEpicMembership('unitAI-chain')).toEqual({ source: 'none' });
  });

  it('resolves chain-root target to one branch', () => {
    mkdirSync(join(testRoot, '.specialists', 'jobs', 'job-1'), { recursive: true });
    writeFileSync(
      join(testRoot, '.specialists', 'jobs', 'job-1', 'status.json'),
      JSON.stringify({
        id: 'job-1',
        bead_id: 'unitAI-chain',
        status: 'done',
        branch: 'feature/unitAI-chain-executor',
        worktree_path: '/tmp/wt',
        started_at_ms: 10,
      }),
      'utf-8',
    );

    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'rev-parse') {
        return asSpawnResult({ stdout: '.git\n' });
      }
      if (command === 'bd' && args[0] === 'show') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-chain', title: 'chain', issue_type: 'task' }]) });
      }
      return asSpawnResult({ status: 1, stderr: 'unexpected command' });
    });

    const targets = resolveMergeTargets('unitAI-chain');
    expect(targets).toHaveLength(1);
    expect(targets[0]?.branch).toBe('feature/unitAI-chain-executor');
  });

  it('resolves epic target and sorts child branches topologically', () => {
    const jobsDir = join(testRoot, '.specialists', 'jobs');
    for (const [jobId, beadId, branch, startedAtMs] of [
      ['job-a', 'unitAI-a', 'feature/a', 3],
      ['job-b', 'unitAI-b', 'feature/b', 2],
      ['job-c', 'unitAI-c', 'feature/c', 1],
    ] as const) {
      mkdirSync(join(jobsDir, jobId), { recursive: true });
      writeFileSync(
        join(jobsDir, jobId, 'status.json'),
        JSON.stringify({ id: jobId, bead_id: beadId, status: 'done', branch, worktree_path: '/tmp/wt', started_at_ms: startedAtMs }),
        'utf-8',
      );
    }

    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'rev-parse') {
        return asSpawnResult({ stdout: '.git\n' });
      }

      if (command === 'bd' && args[0] === 'show' && args[1] === 'unitAI-epic') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-epic', title: 'epic', issue_type: 'epic' }]) });
      }

      if (command === 'bd' && args[0] === 'children') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-a' }, { id: 'unitAI-b' }, { id: 'unitAI-c' }]) });
      }

      if (command === 'bd' && args[0] === 'show' && args[1] === 'unitAI-a') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-a', title: 'a', dependencies: [{ id: 'unitAI-b' }] }]) });
      }

      if (command === 'bd' && args[0] === 'show' && args[1] === 'unitAI-b') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-b', title: 'b', dependencies: [{ id: 'unitAI-c' }] }]) });
      }

      if (command === 'bd' && args[0] === 'show' && args[1] === 'unitAI-c') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-c', title: 'c', dependencies: [] }]) });
      }

      return asSpawnResult({ status: 1, stderr: 'unexpected command' });
    });

    const targets = resolveMergeTargets('unitAI-epic');
    expect(targets.map(target => target.branch)).toEqual(['feature/c', 'feature/b', 'feature/a']);
  });

  it('stops on merge conflict and reports conflicting files', async () => {
    mkdirSync(join(testRoot, '.specialists', 'jobs', 'job-1'), { recursive: true });
    writeFileSync(
      join(testRoot, '.specialists', 'jobs', 'job-1', 'status.json'),
      JSON.stringify({
        id: 'job-1',
        bead_id: 'unitAI-chain',
        status: 'done',
        branch: 'feature/conflict-branch',
        worktree_path: '/tmp/wt',
        started_at_ms: 1,
      }),
      'utf-8',
    );

    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'rev-parse') {
        return asSpawnResult({ stdout: '.git\n' });
      }
      if (command === 'bd' && args[0] === 'show') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-chain', title: 'chain', issue_type: 'task' }]) });
      }
      if (command === 'git' && args[0] === 'merge') {
        return asSpawnResult({ status: 1, stderr: 'CONFLICT' });
      }
      if (command === 'git' && args[0] === 'diff' && args.includes('--diff-filter=U')) {
        return asSpawnResult({ stdout: 'src/conflict.ts\n' });
      }
      return asSpawnResult({ stdout: '' });
    });

    process.argv = ['node', 'specialists', 'merge', 'unitAI-chain'];
    try {
      await run();
      throw new Error('expected merge to fail');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("Merge conflict while merging 'feature/conflict-branch'");
      expect(message).toContain('src/conflict.ts');
    }
  });

  describe('checkEpicUnresolvedGuard', () => {
    it('returns not blocked for standalone chains without epic', () => {
      vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(null);

      (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
        if (command === 'bd' && args[0] === 'show') {
          return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-standalone', title: 'standalone chain' }]) });
        }
        return asSpawnResult({ status: 1 });
      });

      const result = checkEpicUnresolvedGuard('unitAI-standalone');
      expect(result.blocked).toBe(false);
      expect(result.epicId).toBeUndefined();
    });

    it('blocks merge for chains owned by unresolved epic (open)', () => {
      const sqliteClient = {
        resolveEpicByChainRootBeadId: vi.fn().mockReturnValue({ epic_id: 'unitAI-epic-open', chain_id: 'chain-1' }),
        readEpicRun: vi.fn().mockReturnValue({
          epic_id: 'unitAI-epic-open',
          status: 'open',
          status_json: '{}',
          updated_at_ms: 1000,
        } as EpicRunRecord),
        close: vi.fn(),
      };
      vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);

      const result = checkEpicUnresolvedGuard('unitAI-chain-open');
      expect(result.blocked).toBe(true);
      expect(result.epicId).toBe('unitAI-epic-open');
      expect(result.epicStatus).toBe('open');
      expect(result.message).toContain("Chain unitAI-chain-open belongs to unresolved epic unitAI-epic-open");
      expect(result.message).toContain('sp epic merge unitAI-epic-open');
      expect(result.message).toContain('sp epic status unitAI-epic-open');
    });

    it('blocks merge for chains owned by resolving epic', () => {
      const sqliteClient = {
        resolveEpicByChainRootBeadId: vi.fn().mockReturnValue({ epic_id: 'unitAI-epic-resolving', chain_id: 'chain-2' }),
        readEpicRun: vi.fn().mockReturnValue({
          epic_id: 'unitAI-epic-resolving',
          status: 'resolving',
          status_json: '{}',
          updated_at_ms: 1000,
        } as EpicRunRecord),
        close: vi.fn(),
      };
      vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);

      const result = checkEpicUnresolvedGuard('unitAI-chain-resolving');
      expect(result.blocked).toBe(true);
      expect(result.epicStatus).toBe('resolving');
    });

    it('blocks merge for chains owned by merge_ready epic', () => {
      const sqliteClient = {
        resolveEpicByChainRootBeadId: vi.fn().mockReturnValue({ epic_id: 'unitAI-epic-ready', chain_id: 'chain-3' }),
        readEpicRun: vi.fn().mockReturnValue({
          epic_id: 'unitAI-epic-ready',
          status: 'merge_ready',
          status_json: '{}',
          updated_at_ms: 1000,
        } as EpicRunRecord),
        close: vi.fn(),
      };
      vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);

      const result = checkEpicUnresolvedGuard('unitAI-chain-ready');
      expect(result.blocked).toBe(true);
      expect(result.epicStatus).toBe('merge_ready');
    });

    it('allows merge for chains owned by merged epic', () => {
      const sqliteClient = {
        resolveEpicByChainRootBeadId: vi.fn().mockReturnValue({ epic_id: 'unitAI-epic-merged', chain_id: 'chain-4' }),
        readEpicRun: vi.fn().mockReturnValue({
          epic_id: 'unitAI-epic-merged',
          status: 'merged',
          status_json: '{}',
          updated_at_ms: 1000,
        } as EpicRunRecord),
        close: vi.fn(),
      };
      vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);

      const result = checkEpicUnresolvedGuard('unitAI-chain-merged');
      expect(result.blocked).toBe(false);
      expect(result.epicId).toBe('unitAI-epic-merged');
      expect(result.epicStatus).toBe('merged');
    });

    it('allows merge for chains owned by failed epic', () => {
      const sqliteClient = {
        resolveEpicByChainRootBeadId: vi.fn().mockReturnValue({ epic_id: 'unitAI-epic-failed', chain_id: 'chain-5' }),
        readEpicRun: vi.fn().mockReturnValue({
          epic_id: 'unitAI-epic-failed',
          status: 'failed',
          status_json: '{}',
          updated_at_ms: 1000,
        } as EpicRunRecord),
        close: vi.fn(),
      };
      vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);

      const result = checkEpicUnresolvedGuard('unitAI-chain-failed');
      expect(result.blocked).toBe(false);
      expect(result.epicStatus).toBe('failed');
    });

    it('allows merge for chains owned by abandoned epic', () => {
      const sqliteClient = {
        resolveEpicByChainRootBeadId: vi.fn().mockReturnValue({ epic_id: 'unitAI-epic-abandoned', chain_id: 'chain-6' }),
        readEpicRun: vi.fn().mockReturnValue({
          epic_id: 'unitAI-epic-abandoned',
          status: 'abandoned',
          status_json: '{}',
          updated_at_ms: 1000,
        } as EpicRunRecord),
        close: vi.fn(),
      };
      vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);

      const result = checkEpicUnresolvedGuard('unitAI-chain-abandoned');
      expect(result.blocked).toBe(false);
      expect(result.epicStatus).toBe('abandoned');
    });

    it('allows merge with warning when SQLite is unavailable', () => {
      vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(null);

      (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
        if (command === 'bd' && args[0] === 'show') {
          return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-chain', title: 'chain', parent: 'unitAI-epic-migration' }]) });
        }
        return asSpawnResult({ status: 1 });
      });

      const result = checkEpicUnresolvedGuard('unitAI-chain');
      expect(result.blocked).toBe(false);
      expect(result.epicId).toBe('unitAI-epic-migration');
      expect(result.message).toContain('Warning: unable to verify epic unitAI-epic-migration status');
    });

    it('allows merge with warning when epic has no run record', () => {
      const sqliteClient = {
        resolveEpicByChainRootBeadId: vi.fn().mockReturnValue({ epic_id: 'unitAI-epic-norun', chain_id: 'chain-7' }),
        readEpicRun: vi.fn().mockReturnValue(null),
        close: vi.fn(),
      };
      vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);

      const result = checkEpicUnresolvedGuard('unitAI-chain-norun');
      expect(result.blocked).toBe(false);
      expect(result.epicId).toBe('unitAI-epic-norun');
      expect(result.message).toContain('Warning: epic unitAI-epic-norun has no run record');
    });
  });

  it('throws on merge attempt for chain owned by unresolved epic', () => {
    mkdirSync(join(testRoot, '.specialists', 'jobs', 'job-1'), { recursive: true });
    writeFileSync(
      join(testRoot, '.specialists', 'jobs', 'job-1', 'status.json'),
      JSON.stringify({
        id: 'job-1',
        bead_id: 'unitAI-chain-blocked',
        status: 'done',
        branch: 'feature/unitAI-chain-blocked',
        worktree_path: '/tmp/wt',
        started_at_ms: 10,
      }),
      'utf-8',
    );

    const sqliteClient = {
      resolveEpicByChainRootBeadId: vi.fn().mockReturnValue({ epic_id: 'unitAI-epic-open', chain_id: 'job-1' }),
      readEpicRun: vi.fn().mockReturnValue({
        epic_id: 'unitAI-epic-open',
        status: 'open',
        status_json: '{}',
        updated_at_ms: 1000,
      } as EpicRunRecord),
      close: vi.fn(),
    };
    vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);

    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'rev-parse') {
        return asSpawnResult({ stdout: '.git\n' });
      }
      if (command === 'bd' && args[0] === 'show') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-chain-blocked', title: 'blocked chain', issue_type: 'task' }]) });
      }
      return asSpawnResult({ status: 1, stderr: 'unexpected command' });
    });

    expect(() => resolveMergeTargets('unitAI-chain-blocked')).toThrow(
      /Chain unitAI-chain-blocked belongs to unresolved epic unitAI-epic-open/,
    );
  });
});
