// tests/unit/specialist/job-root.test.ts
// Contract tests for common-root resolution and branch detection

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveCommonGitRoot, resolveJobsDir, resolveCurrentBranch } from '../../../src/specialist/job-root.js';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('resolveCommonGitRoot', () => {
  let tempDir: string;
  let gitDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'job-root-test-'));
    gitDir = join(tempDir, '.git');
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns the repo root from main checkout', () => {
    const root = resolveCommonGitRoot(tempDir);
    expect(root).toBe(tempDir);
  });

  it('returns the same root from a subdirectory', () => {
    const subDir = join(tempDir, 'src', 'specialist');
    spawnSync('mkdir', ['-p', subDir], { stdio: 'ignore' });
    const root = resolveCommonGitRoot(subDir);
    expect(root).toBe(tempDir);
  });

  it('returns undefined when git is unavailable', () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-'));
    try {
      const root = resolveCommonGitRoot(nonGitDir);
      expect(root).toBeUndefined();
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

describe('resolveJobsDir', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'jobs-dir-test-'));
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns .specialists/jobs/ under the git common root', () => {
    const jobsDir = resolveJobsDir(tempDir);
    expect(jobsDir).toBe(join(tempDir, '.specialists', 'jobs'));
  });

  it('works from a subdirectory', () => {
    const subDir = join(tempDir, 'src');
    spawnSync('mkdir', ['-p', subDir], { stdio: 'ignore' });
    const jobsDir = resolveJobsDir(subDir);
    expect(jobsDir).toBe(join(tempDir, '.specialists', 'jobs'));
  });

  it('falls back to cwd/.specialists/jobs when git is unavailable', () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-jobs-'));
    try {
      const jobsDir = resolveJobsDir(nonGitDir);
      expect(jobsDir).toBe(join(nonGitDir, '.specialists', 'jobs'));
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

describe('resolveCurrentBranch', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'branch-test-'));
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns the current branch name', () => {
    // Create an initial commit so git has a branch
    spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
    const branch = resolveCurrentBranch(tempDir);
    // git init typically creates main or master
    expect(branch).toMatch(/^(main|master)$/);
  });

  it('returns the branch name after checkout', () => {
    // Create an initial commit first
    spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['checkout', '-b', 'feature/test'], { cwd: tempDir, stdio: 'ignore' });
    const branch = resolveCurrentBranch(tempDir);
    expect(branch).toBe('feature/test');
  });

  it('returns undefined in detached HEAD state', () => {
    // Create an initial commit
    spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
    // Detach HEAD
    spawnSync('git', ['checkout', '--detach', 'HEAD'], { cwd: tempDir, stdio: 'ignore' });
    const branch = resolveCurrentBranch(tempDir);
    expect(branch).toBeUndefined();
  });

  it('returns undefined when git is unavailable', () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-branch-'));
    try {
      const branch = resolveCurrentBranch(nonGitDir);
      expect(branch).toBeUndefined();
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});
