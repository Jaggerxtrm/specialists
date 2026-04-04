// tests/unit/specialist/worktree.test.ts
// Contract tests for bd worktree helper module

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  deriveBranchName,
  deriveWorktreeName,
  resolveCommonRoot,
  listWorktrees,
  findExistingWorktree,
  provisionWorktree,
  type WorktreeInfo,
  type WorktreeOptions,
} from '../../../src/specialist/worktree.js';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('deriveBranchName', () => {
  it('creates canonical branch name from beadId and specialist', () => {
    const branch = deriveBranchName('hgpu.2', 'explorer');
    expect(branch).toBe('feature/hgpu.2-explorer');
  });

  it('slugifies the specialist name', () => {
    const branch = deriveBranchName('hgpu.2', 'Deep_Research');
    expect(branch).toBe('feature/hgpu.2-deep-research');
  });

  it('handles special characters in beadId', () => {
    const branch = deriveBranchName('unitAI-hgpu.1', 'test-specialist');
    expect(branch).toBe('feature/unitAI-hgpu.1-test-specialist');
  });
});

describe('deriveWorktreeName', () => {
  it('creates deterministic worktree directory name', () => {
    const name = deriveWorktreeName('hgpu.2', 'explorer');
    expect(name).toBe('hgpu.2-explorer');
  });

  it('slugifies the specialist name', () => {
    const name = deriveWorktreeName('hgpu.2', 'Code_Review!');
    expect(name).toBe('hgpu.2-code-review');
  });
});

describe('resolveCommonRoot', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'worktree-root-test-'));
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns the git common root from main checkout', () => {
    const root = resolveCommonRoot(tempDir);
    expect(root).toBe(tempDir);
  });

  it('returns the same root from a subdirectory', () => {
    const subDir = join(tempDir, 'src');
    spawnSync('mkdir', ['-p', subDir], { stdio: 'ignore' });
    const root = resolveCommonRoot(subDir);
    expect(root).toBe(tempDir);
  });

  it('falls back to cwd when git is unavailable', () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-wt-'));
    try {
      const root = resolveCommonRoot(nonGitDir);
      expect(root).toBe(nonGitDir);
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

describe('listWorktrees', () => {
  let tempDir: string;
  let worktreePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wt-list-test-'));
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    // Create an initial commit (required for worktree)
    spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
    worktreePath = join(tempDir, 'worktrees', 'test-wt');
    spawnSync('git', ['worktree', 'add', worktreePath, '-b', 'feature/test-worktree'], { cwd: tempDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns a map of branch names to worktree paths', () => {
    const worktrees = listWorktrees(tempDir);
    expect(worktrees.has('feature/test-worktree')).toBe(true);
    expect(worktrees.get('feature/test-worktree')).toBe(worktreePath);
  });

  it('includes the main checkout worktree', () => {
    const worktrees = listWorktrees(tempDir);
    // git init creates either 'main' or 'master' depending on git config
    const hasMainOrMaster = worktrees.has('main') || worktrees.has('master');
    expect(hasMainOrMaster).toBe(true);
  });

  it('returns empty map when git is unavailable', () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-wt-list-'));
    try {
      const worktrees = listWorktrees(nonGitDir);
      expect(worktrees.size).toBe(0);
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

describe('findExistingWorktree', () => {
  let tempDir: string;
  let worktreePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wt-find-test-'));
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
    worktreePath = join(tempDir, 'worktrees', 'test-wt');
    spawnSync('git', ['worktree', 'add', worktreePath, '-b', 'feature/find-test'], { cwd: tempDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns the path when branch exists', () => {
    const path = findExistingWorktree('feature/find-test', tempDir);
    expect(path).toBe(worktreePath);
  });

  it('returns undefined when branch does not exist', () => {
    const path = findExistingWorktree('feature/nonexistent', tempDir);
    expect(path).toBeUndefined();
  });
});

describe('provisionWorktree', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wt-provision-test-'));
    originalCwd = process.cwd();
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
    // Change to tempDir so bd worktree create works correctly
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a new worktree via bd worktree create', () => {
    // Skip if bd is not available
    try {
      execSync('which bd', { stdio: 'ignore' });
    } catch {
      console.log('[SKIP] bd not available - skipping provisionWorktree test');
      return;
    }

    // Initialize bd in the temp directory
    spawnSync('bd', ['init'], { cwd: tempDir, stdio: 'ignore' });

    const options: WorktreeOptions = {
      beadId: 'hgpu.2',
      specialistName: 'explorer',
      worktreeBase: join(tempDir, '.worktrees', 'hgpu.2'),
      cwd: tempDir,
    };

    const result = provisionWorktree(options);

    expect(result.branch).toBe('feature/hgpu.2-explorer');
    expect(result.worktreePath).toContain('hgpu.2-explorer');
    expect(result.reused).toBe(false);
    expect(existsSync(result.worktreePath)).toBe(true);
  }, 15000);

  it('reuses existing worktree when branch already exists', () => {
    try {
      execSync('which bd', { stdio: 'ignore' });
    } catch {
      console.log('[SKIP] bd not available - skipping provisionWorktree reuse test');
      return;
    }

    // Initialize bd in the temp directory
    spawnSync('bd', ['init'], { cwd: tempDir, stdio: 'ignore' });

    const options: WorktreeOptions = {
      beadId: 'hgpu.2',
      specialistName: 'explorer',
      worktreeBase: join(tempDir, '.worktrees', 'hgpu.2'),
      cwd: tempDir,
    };

    // First call - creates
    const first = provisionWorktree(options);
    expect(first.reused).toBe(false);

    // Second call - reuses
    const second = provisionWorktree(options);
    expect(second.reused).toBe(true);
    expect(second.worktreePath).toBe(first.worktreePath);
    expect(second.branch).toBe(first.branch);
  }, 15000);

  it('throws when bd worktree create fails', () => {
    try {
      execSync('which bd', { stdio: 'ignore' });
    } catch {
      console.log('[SKIP] bd not available - skipping provisionWorktree error test');
      return;
    }

    // Try to create with invalid branch name that bd will reject
    const options: WorktreeOptions = {
      beadId: 'hgpu.2',
      specialistName: 'explorer',
      worktreeBase: '/nonexistent/path/that/does/not/exist',
      cwd: tempDir,
    };

    expect(() => provisionWorktree(options)).toThrow();
  }, 15000);
});
