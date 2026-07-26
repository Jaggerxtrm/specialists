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
import * as epicReadiness from '../../../src/specialist/epic-readiness.js';
import { evaluateMergeWorthiness, executePublicationPlan, resolveChainEpicMembership, resolveMergeTargets, topologicallySortChains, run, checkEpicUnresolvedGuard, runMergePlan, previewBranchMergeDelta, rebaseBranchOntoMaster, runTypecheckGate } from '../../../src/cli/merge.js';

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

  it('ignores dirty paths under managed prefixes', () => {
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: readonly string[]) => {
      if (command === 'git' && args[0] === 'worktree') {
        return asSpawnResult({ status: 0, stdout: `worktree ${testRoot}\n` });
      }

      if (command === 'git' && args[0] === 'status') {
        return asSpawnResult({
          status: 0,
          stdout: ['?? .beads/issues.jsonl', '?? .xtrm/skills/active/foo/SKILL.md'].join('\n'),
        });
      }

      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    });

    expect(() => runMergePlan([], { mode: 'direct', publicationLabel: 'epic-test' })).not.toThrow();
    expect(spawnSync).not.toHaveBeenCalledWith(
      'git',
      ['stash', 'push', '--include-untracked', '--message', 'sp epic merge epic-test auto-shelve'],
      expect.any(Object),
    );
  });

  it('keeps non-ignored dirty paths visible for merge shelving', () => {
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: readonly string[]) => {
      if (command === 'git' && args[0] === 'worktree') {
        return asSpawnResult({ status: 0, stdout: `worktree ${testRoot}\n` });
      }

      if (command === 'git' && args[0] === 'status') {
        return asSpawnResult({
          status: 0,
          stdout: ['?? .beads/issues.jsonl', '?? .xtrm/skills/active/foo/SKILL.md', '?? src/cli/run.ts'].join('\n'),
        });
      }

      if (command === 'git' && args[0] === 'stash') {
        return asSpawnResult({ status: 0, stdout: 'Saved working directory and index state WIP on main: test' });
      }

      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    });

    expect(() => runMergePlan([], { mode: 'direct', publicationLabel: 'epic-test' })).not.toThrow();
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      ['stash', 'push', '--include-untracked', '--message', 'sp epic merge epic-test auto-shelve'],
      expect.any(Object),
    );
  });

  it('skips typecheck gate when no tsconfig exists', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    runTypecheckGate(testRoot);

    expect(spawnSync).not.toHaveBeenCalledWith('bunx', ['tsc', '--noEmit'], expect.any(Object));
    expect(logSpy).toHaveBeenCalledWith('TypeScript gate: skipped (no tsconfig — non-TS repo)');
  });

  it('records the temporary publication branch for PR merges', () => {
    const workerRoot = join(testRoot, 'worker');
    mkdirSync(workerRoot, { recursive: true });
    const recordBranchIntegration = vi.fn();
    const sqliteClient = {
      resolveEpicByChainRootBeadId: vi.fn().mockReturnValue(null),
      recordBranchIntegration,
      close: vi.fn(),
    };
    vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);
    vi.spyOn(Date, 'now').mockReturnValue(123);

    let mainBranch = 'main';
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[], options: { cwd?: string }) => {
      if (command === 'git' && args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
        return asSpawnResult({ stdout: `${options.cwd === workerRoot ? 'feature/executor' : mainBranch}\n` });
      }
      if (command === 'git' && args[0] === 'checkout') {
        mainBranch = args[1] === '-b' ? args[2]! : args[1]!;
        return asSpawnResult({});
      }
      if (command === 'git' && args[0] === 'worktree') {
        return asSpawnResult({ stdout: `worktree ${testRoot}\n` });
      }
      if (command === 'git' && args[0] === 'symbolic-ref') {
        return asSpawnResult({ stdout: 'origin/main\n' });
      }
      if (command === 'git' && args[0] === 'merge-base') {
        return asSpawnResult({ stdout: 'base-sha\n' });
      }
      if (command === 'git' && args[0] === 'diff' && args.includes('--name-status')) {
        return asSpawnResult({ stdout: 'M\tsrc/file.ts\n' });
      }
      if (command === 'git' && args[0] === 'diff') {
        return asSpawnResult({ stdout: 'src/file.ts\n' });
      }
      if (command === 'git' && args[0] === 'rebase') return asSpawnResult({});
      if (command === 'git' && args[0] === 'merge') return asSpawnResult({});
      if (command === 'git' && args[0] === 'rev-parse') return asSpawnResult({ stdout: '73cf0e77\n' });
      if (command === 'gh' && args[0] === 'pr') return asSpawnResult({ stdout: 'https://github.test/pr/1\n' });
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    });

    executePublicationPlan([
      { beadId: 'unitAI-chain', branch: 'feature/executor', jobId: 'job-1', jobStatus: 'done', worktreePath: workerRoot, startedAtMs: 1 },
    ], { mode: 'pr', publicationLabel: 'epic-test', rebuild: false });

    expect(recordBranchIntegration).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.objectContaining({ branch: 'sp/publish-epic-test-123' }),
    }));
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

  it('classifies empty delta as already published when branch is contained in default branch', () => {
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'symbolic-ref') {
        return asSpawnResult({ stdout: 'origin/main\n' });
      }
      if (command === 'git' && args[0] === 'merge-base' && args.includes('--is-ancestor')) {
        return asSpawnResult({ status: 0 });
      }
      if (command === 'git' && args[0] === 'diff' && args.includes('--name-status')) {
        return asSpawnResult({ stdout: '' });
      }
      return asSpawnResult({ status: 1, stderr: 'unexpected command' });
    });

    const decision = evaluateMergeWorthiness({ branch: 'feature/already-merged', files: [], substantiveFiles: [], noiseFiles: [] }, 'feature/already-merged');
    expect(decision).toEqual({ shouldMerge: false, reason: 'already-published' });
  });

  it('honors target branch override for worthiness and rebase target', () => {
    const commands: Array<{ command: string; args: string[] }> = [];
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      commands.push({ command, args: [...args] });
      if (command === 'git' && args[0] === 'rev-parse' && args.includes('--verify')) {
        return asSpawnResult({ stdout: 'abc123\n' });
      }
      if (command === 'git' && args[0] === 'symbolic-ref') {
        return asSpawnResult({ stdout: 'origin/main\n' });
      }
      if (command === 'git' && args[0] === 'merge-base' && args.includes('--is-ancestor')) {
        return asSpawnResult({ status: 0 });
      }
      if (command === 'git' && args[0] === 'diff' && args.includes('--name-status')) {
        return asSpawnResult({ stdout: 'M src/child.ts\n' });
      }
      if (command === 'git' && args[0] === 'rebase') {
        return asSpawnResult({ status: 0 });
      }
      if (command === 'git' && args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
        return asSpawnResult({ stdout: 'feature/child\n' });
      }
      return asSpawnResult({ stdout: '' });
    });

    const decision = evaluateMergeWorthiness({ branch: 'feature/child', files: [], substantiveFiles: [], noiseFiles: [] }, 'feature/child', '/tmp/repo', 'feature/base');
    expect(decision).toEqual({ shouldMerge: false, reason: 'already-published' });

    rebaseBranchOntoMaster('feature/child', '/tmp/wt', 'feature/base');

    expect(commands.some(entry => entry.command === 'git' && entry.args[0] === 'rebase' && entry.args[1] === 'feature/base')).toBe(true);
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
      if (command === 'git' && args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
        return asSpawnResult({ stdout: 'feature/conflict-branch\n' });
      }
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

  it('resolves epic target from sqlite chain membership instead of artifact children', () => {
    const jobsDir = join(testRoot, '.specialists', 'jobs');
    for (const [jobId, beadId, branch, startedAtMs] of [
      ['job-a', 'unitAI-a', 'feature/a', 3],
      ['job-b', 'unitAI-b', 'feature/b', 2],
      ['job-c', 'unitAI-c', 'feature/c', 1],
      ['job-artifact', 'unitAI-artifact-review', 'feature/artifact', 4],
    ] as const) {
      mkdirSync(join(jobsDir, jobId), { recursive: true });
      writeFileSync(
        join(jobsDir, jobId, 'status.json'),
        JSON.stringify({ id: jobId, bead_id: beadId, status: 'done', branch, worktree_path: '/tmp/wt', started_at_ms: startedAtMs }),
        'utf-8',
      );
    }

    const sqliteClient = {
      listEpicChains: vi.fn().mockReturnValue([
        { chain_id: 'job-a', epic_id: 'unitAI-epic', chain_root_bead_id: 'unitAI-a', chain_root_job_id: 'job-a', updated_at_ms: 3 },
        { chain_id: 'job-b', epic_id: 'unitAI-epic', chain_root_bead_id: 'unitAI-b', chain_root_job_id: 'job-b', updated_at_ms: 2 },
        { chain_id: 'job-c', epic_id: 'unitAI-epic', chain_root_bead_id: 'unitAI-c', chain_root_job_id: 'job-c', updated_at_ms: 1 },
      ]),
      close: vi.fn(),
    };
    vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);

    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'rev-parse') {
        return asSpawnResult({ stdout: '.git\n' });
      }

      if (command === 'bd' && args[0] === 'show' && args[1] === 'unitAI-epic') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-epic', title: 'epic', issue_type: 'epic' }]) });
      }

      if (command === 'bd' && args[0] === 'children') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-artifact-review' }]) });
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

      throw new Error(`unexpected command ${command} ${args.join(' ')}`);
    });

    const targets = resolveMergeTargets('unitAI-epic');
    expect(targets.map(target => target.branch)).toEqual(['feature/c', 'feature/b', 'feature/a']);
    expect(sqliteClient.listEpicChains).toHaveBeenCalledWith('unitAI-epic');
    expect(sqliteClient.close).toHaveBeenCalledTimes(1);
  });

  it('skips already published chains during epic merge plan', () => {
    mkdirSync(join(testRoot, '.specialists', 'jobs', 'job-1'), { recursive: true });
    writeFileSync(
      join(testRoot, '.specialists', 'jobs', 'job-1', 'status.json'),
      JSON.stringify({
        id: 'job-1',
        bead_id: 'unitAI-chain-merged',
        status: 'done',
        branch: 'feature/already-merged',
        worktree_path: '/tmp/wt',
        started_at_ms: 1,
      }),
      'utf-8',
    );

    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'worktree') {
        return asSpawnResult({ stdout: `worktree ${testRoot}\n` });
      }
      if (command === 'git' && args[0] === 'status') {
        return asSpawnResult({ stdout: '' });
      }
      if (command === 'git' && args[0] === 'symbolic-ref') {
        return asSpawnResult({ stdout: 'origin/main\n' });
      }
      if (command === 'git' && args[0] === 'merge-base' && args.includes('--is-ancestor')) {
        return asSpawnResult({ status: 0 });
      }
      if (command === 'git' && args[0] === 'merge-base') {
        return asSpawnResult({ stdout: 'base-sha\n' });
      }
      if (command === 'git' && args[0] === 'diff' && args.includes('--name-status')) {
        return asSpawnResult({ stdout: '' });
      }
      if (command === 'git' && args[0] === 'rev-list' && args.includes('--count')) {
        return asSpawnResult({ stdout: '0\n' });
      }
      if (command === 'git' && args[0] === 'merge') {
        throw new Error('merge should be skipped for already published chain');
      }
      if (command === 'bd' && args[0] === 'show') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-chain-merged', title: 'merged chain', issue_type: 'task' }]) });
      }
      return asSpawnResult({ status: 1, stderr: 'unexpected command' });
    });

    const steps = runMergePlan([
      { beadId: 'unitAI-chain-merged', branch: 'feature/already-merged', jobId: 'job-1', jobStatus: 'done', worktreePath: '/tmp/wt', startedAtMs: 1 },
    ], { rebuild: false });

    expect(steps).toEqual([
      { beadId: 'unitAI-chain-merged', branch: 'feature/already-merged', changedFiles: [] },
    ]);
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
      if (command === 'git' && args.includes('rev-parse') && args.includes('--abbrev-ref')) {
        return asSpawnResult({ stdout: 'feature/conflict-branch\n' });
      }
      if (command === 'git' && args.includes('rev-parse')) {
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
      expect(message).toContain("Unable to compute merge base for 'feature/conflict-branch' and 'feature/conflict-branch'.");
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

    it('allows merge for PASS chain inside unresolved epic', () => {
      const sqliteClient = {
        resolveEpicByChainRootBeadId: vi.fn().mockReturnValue({ epic_id: 'unitAI-epic-open', chain_id: 'chain-1' }),
        readEpicRun: vi.fn().mockReturnValue({
          epic_id: 'unitAI-epic-open',
          status: 'open',
          status_json: '{}',
          updated_at_ms: 1000,
        } as EpicRunRecord),
        listStatuses: vi.fn().mockReturnValue([]),
        listEpicChains: vi.fn().mockReturnValue([{ chain_id: 'chain-1', chain_root_bead_id: 'unitAI-chain-open' }]),
        close: vi.fn(),
      };
      vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);
      vi.spyOn(epicReadiness, 'loadEpicReadinessSummary').mockReturnValue({
        epic_id: 'unitAI-epic-open',
        persisted_state: 'open',
        readiness_state: 'merge_ready',
        next_state: 'merge_ready',
        can_transition: true,
        prep: { done: 0, running: 0, failed: 0, total: 0, blocker_job_ids: [] },
        chains: [{ chain_id: 'chain-1', chain_root_bead_id: 'unitAI-chain-open', state: 'pass', reviewer_verdict: 'pass', has_active_jobs: false, job_ids: [] }],
        blockers: [],
        summary: 'Epic unitAI-epic-open: open -> merge_ready',
      } as never);

      const result = checkEpicUnresolvedGuard('unitAI-chain-open');
      expect(result.blocked).toBe(false);
      expect(result.epicId).toBe('unitAI-epic-open');
      expect(result.epicStatus).toBe('open');
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
        listStatuses: vi.fn().mockReturnValue([]),
        listEpicChains: vi.fn().mockReturnValue([{ chain_id: 'chain-2', chain_root_bead_id: 'unitAI-chain-resolving' }]),
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
        listStatuses: vi.fn().mockReturnValue([]),
        listEpicChains: vi.fn().mockReturnValue([{ chain_id: 'chain-2', chain_root_bead_id: 'unitAI-chain-resolving' }]),
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
        listStatuses: vi.fn().mockReturnValue([]),
        listEpicChains: vi.fn().mockReturnValue([{ chain_id: 'chain-2', chain_root_bead_id: 'unitAI-chain-resolving' }]),
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
        listStatuses: vi.fn().mockReturnValue([]),
        listEpicChains: vi.fn().mockReturnValue([{ chain_id: 'chain-2', chain_root_bead_id: 'unitAI-chain-resolving' }]),
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
      expect(result.message).toContain('Warning: unable to verify epic unitAI-epic-migration readiness');
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

  it('throws on merge attempt for non-PASS chain inside unresolved epic', () => {
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
      listStatuses: vi.fn().mockReturnValue([
        { id: 'job-1', bead_id: 'unitAI-chain-blocked', status: 'done', branch: 'feature/unitAI-chain-blocked', worktree_path: '/tmp/wt', started_at_ms: 10 },
      ]),
      close: vi.fn(),
    };
    vi.spyOn(observabilitySqlite, 'createObservabilitySqliteClient').mockReturnValue(sqliteClient as never);
    vi.spyOn(epicReadiness, 'loadEpicReadinessSummary').mockReturnValue({
      epic_id: 'unitAI-epic-open',
      persisted_state: 'open',
      readiness_state: 'blocked',
      next_state: 'open',
      can_transition: false,
      prep: { done: 0, running: 0, failed: 0, total: 0, blocker_job_ids: [] },
      chains: [{ chain_id: 'chain-1', chain_root_bead_id: 'unitAI-chain-blocked', state: 'blocked', reviewer_verdict: 'missing', blocking_reason: 'No terminal reviewer verdict found (PASS/PARTIAL/FAIL).', has_active_jobs: false, job_ids: [] }],
      blockers: ['chain:chain-1'],
      summary: 'Epic unitAI-epic-open: open -> blocked',
    } as never);

    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
        return asSpawnResult({ stdout: 'feature/conflict-branch\n' });
      }
      if (command === 'git' && args[0] === 'rev-parse') {
        return asSpawnResult({ stdout: '.git\n' });
      }
      if (command === 'bd' && args[0] === 'show') {
        return asSpawnResult({ stdout: JSON.stringify([{ id: 'unitAI-chain-blocked', title: 'blocked chain', issue_type: 'task' }]) });
      }
      return asSpawnResult({ status: 1, stderr: 'unexpected command' });
    });

    expect(() => resolveMergeTargets('unitAI-chain-blocked')).toThrow(
      /blocked by derived readiness: No terminal reviewer verdict found \(PASS\/PARTIAL\/FAIL\)\./,
    );
  });
});
