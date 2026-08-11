import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import { SpecialistLoader } from '../../../src/specialist/loader.js';
import { SpecialistRunner } from '../../../src/specialist/runner.js';
import { Supervisor } from '../../../src/specialist/supervisor.js';
import {
  buildInjectedObligationsDiffVariables,
  buildInjectedReviewerDiffVariables,
  buildInjectedWriterDiffVariables,
  run,
} from '../../../src/cli/run.js';

function createStackedBranchRepo(): { repoDir: string; priorTaskSha: string; headSha: string } {
  const remoteDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
  const repoDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
  childProcess.execSync('git init --bare', { cwd: remoteDir });
  childProcess.execSync('git init -b main', { cwd: repoDir });
  childProcess.execSync('git config user.email test@example.com', { cwd: repoDir });
  childProcess.execSync('git config user.name Test User', { cwd: repoDir });
  childProcess.execSync('mkdir -p src', { cwd: repoDir, shell: '/bin/bash' as never });
  fs.writeFileSync(`${repoDir}/src/base.ts`, 'base\n');
  childProcess.execSync('git add src/base.ts && git commit -m base', { cwd: repoDir, shell: '/bin/bash' as never });
  childProcess.execSync(`git remote add origin ${remoteDir}`, { cwd: repoDir, shell: '/bin/bash' as never });
  childProcess.execSync('git push -u origin main', { cwd: repoDir, shell: '/bin/bash' as never });
  childProcess.execSync('git fetch origin main', { cwd: repoDir, shell: '/bin/bash' as never });
  childProcess.execSync('git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main', { cwd: repoDir });

  childProcess.execSync('git checkout -b task-1', { cwd: repoDir, shell: '/bin/bash' as never });
  fs.writeFileSync(`${repoDir}/src/prior-task.ts`, 'prior task\n');
  childProcess.execSync('git add src/prior-task.ts && git commit -m task-1', { cwd: repoDir, shell: '/bin/bash' as never });
  const priorTaskSha = childProcess.execSync('git rev-parse HEAD', { cwd: repoDir, encoding: 'utf8' }).trim();

  childProcess.execSync('git checkout -b task-2', { cwd: repoDir, shell: '/bin/bash' as never });
  fs.writeFileSync(`${repoDir}/src/current-task.ts`, 'current task\n');
  childProcess.execSync('git add src/current-task.ts && git commit -m task-2', { cwd: repoDir, shell: '/bin/bash' as never });
  const headSha = childProcess.execSync('git rev-parse HEAD', { cwd: repoDir, encoding: 'utf8' }).trim();

  return { repoDir, priorTaskSha, headSha };
}

describe('run explicit-base diff injection', () => {
  it('uses recorded base sha instead of merge-base for stacked task deltas', () => {
    const { repoDir, priorTaskSha, headSha } = createStackedBranchRepo();

    const mergeBaseVariables = buildInjectedReviewerDiffVariables(repoDir);
    const reviewerVariables = buildInjectedReviewerDiffVariables(repoDir, 20, priorTaskSha);
    const writerVariables = buildInjectedWriterDiffVariables(repoDir, 20, priorTaskSha);
    const obligationsVariables = buildInjectedObligationsDiffVariables(repoDir, 20, priorTaskSha);

    expect(mergeBaseVariables.reviewer_diff_files).toContain('src/prior-task.ts');
    expect(mergeBaseVariables.reviewer_diff_files).toContain('src/current-task.ts');

    expect(reviewerVariables.reviewer_diff_source).toContain(`recorded-base diff (${priorTaskSha}..${headSha})`);
    expect(reviewerVariables.reviewer_diff_source).toContain(`reviewed-head: ${headSha}`);
    expect(reviewerVariables.reviewer_diff_source).toContain('worktree-state: clean');
    expect(reviewerVariables.reviewer_diff_files).toBe('src/current-task.ts');
    expect(reviewerVariables.reviewer_diff_hunks).toContain('Hunk evidence completeness: complete');
    expect(reviewerVariables.reviewer_diff_hunks).toContain('src/current-task.ts — hunks: complete');
    expect(reviewerVariables.reviewer_diff_hunks).not.toContain('src/prior-task.ts');

    expect(writerVariables.writer_diff).toContain(`Source: injected diff context (recorded-base diff (${priorTaskSha}..${headSha}))`);
    expect(writerVariables.writer_diff).toContain(`Reviewed head: ${headSha}`);
    expect(writerVariables.writer_diff).toContain('Worktree state: clean');
    expect(writerVariables.writer_diff).toContain('Changed path coverage:\nsrc/current-task.ts — hunks: complete');
    expect(writerVariables.writer_diff).toContain('src/current-task.ts');
    expect(writerVariables.writer_diff).not.toContain('src/prior-task.ts');

    expect(obligationsVariables.obligations_diff).toContain(`- source: injected diff context (recorded-base diff (${priorTaskSha}..${headSha}))`);
    expect(obligationsVariables.obligations_diff).toContain(`- reviewed-head: ${headSha}`);
    expect(obligationsVariables.obligations_diff).toContain('- worktree-state: clean');
    expect(obligationsVariables.obligations_diff).toContain('added-marker inventory: COMPLETE');
    expect(obligationsVariables.obligations_diff).toContain('src/current-task.ts');
    expect(obligationsVariables.obligations_diff).not.toContain('src/prior-task.ts');
  });
});

describe('run reused-job explicit-base plumbing', () => {
  const originalArgv = process.argv;
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.spyOn(Supervisor.prototype, 'run').mockImplementation(async function (this: any) {
      const runner = this.opts?.runner;
      const runOptions = this.opts?.runOptions ?? {};
      if (runner && typeof runner.run === 'function') {
        await runner.run(runOptions);
      }
      return 'job-test';
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    vi.restoreAllMocks();
  });

  it('feeds reviewer, seconder, and obligations variables from reused job base_sha_pinned', async () => {
    const { repoDir, priorTaskSha, headSha } = createStackedBranchRepo();
    const loaderGet = vi.spyOn(SpecialistLoader.prototype, 'get');
    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });

    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-writer') {
        return {
          id,
          specialist: 'executor',
          status: 'done',
          started_at_ms: Date.now(),
          worktree_path: repoDir,
          worktree_owner_job_id: 'job-root-owner',
          base_sha_pinned: priorTaskSha,
        } as any;
      }
      return {
        id,
        specialist: 'reviewer',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const cases = [
      {
        specialist: 'reviewer',
        taskTemplate: 'Do $prompt\n$reviewer_diff_source\n$reviewer_diff_files\n$reviewer_diff_hunks',
        assertVariables: (variables: Record<string, string> | undefined) => {
          expect(variables?.reviewer_diff_source).toContain(`recorded-base diff (${priorTaskSha}..${headSha})`);
          expect(variables?.reviewer_diff_source).toContain(`reviewed-head: ${headSha}`);
          expect(variables?.reviewer_diff_source).toContain('worktree-state: clean');
          expect(variables?.reviewer_diff_files).toBe('src/current-task.ts');
          expect(variables?.reviewer_diff_hunks).toContain('src/current-task.ts — hunks: complete');
          expect(variables?.reviewer_diff_hunks).not.toContain('src/prior-task.ts');
        },
      },
      {
        specialist: 'seconder',
        taskTemplate: 'Do $prompt\n$writer_diff',
        assertVariables: (variables: Record<string, string> | undefined) => {
          expect(variables?.writer_diff).toContain(`Source: injected diff context (recorded-base diff (${priorTaskSha}..${headSha}))`);
          expect(variables?.writer_diff).toContain(`Reviewed head: ${headSha}`);
          expect(variables?.writer_diff).toContain('Worktree state: clean');
          expect(variables?.writer_diff).toContain('Changed path coverage:\nsrc/current-task.ts — hunks: complete');
          expect(variables?.writer_diff).toContain('src/current-task.ts');
          expect(variables?.writer_diff).not.toContain('src/prior-task.ts');
        },
      },
      {
        specialist: 'obligations-scanner',
        taskTemplate: 'Do $prompt\n$obligations_diff',
        assertVariables: (variables: Record<string, string> | undefined) => {
          expect(variables?.obligations_diff).toContain(`- source: injected diff context (recorded-base diff (${priorTaskSha}..${headSha}))`);
          expect(variables?.obligations_diff).toContain(`- reviewed-head: ${headSha}`);
          expect(variables?.obligations_diff).toContain('- worktree-state: clean');
          expect(variables?.obligations_diff).toContain('added-marker inventory: COMPLETE');
          expect(variables?.obligations_diff).toContain('src/current-task.ts');
          expect(variables?.obligations_diff).not.toContain('src/prior-task.ts');
        },
      },
    ] as const;

    for (const testCase of cases) {
      runnerRun.mockClear();
      loaderGet.mockResolvedValue({
        specialist: {
          metadata: { name: testCase.specialist, version: '1.0.0' },
          execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
          prompt: { task_template: testCase.taskTemplate },
        },
      } as any);

      process.argv = ['node', 'specialists', 'run', testCase.specialist, '--prompt', 'review writer', '--job', 'job-writer'];
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      await run();

      const runArgs = runnerRun.mock.calls[0]?.[0];
      expect(runArgs.variables).toEqual(expect.objectContaining({ reviewed_job_id: 'job-writer' }));
      testCase.assertVariables(runArgs.variables);
    }
  });
});
