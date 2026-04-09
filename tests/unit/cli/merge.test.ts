import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { resolveMergeTargets, topologicallySortChains, run } from '../../../src/cli/merge.js';

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
});
