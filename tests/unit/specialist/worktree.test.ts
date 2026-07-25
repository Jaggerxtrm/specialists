// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
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
  resolveCoordinatorBase,
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

  it('removes worktree .beads/ and marks tracked .beads paths skip-worktree (unitAI-yvqmf)', () => {
    // Skip if bd is not available
    try {
      execSync('which bd', { stdio: 'ignore' });
    } catch {
      console.log('[SKIP] bd not available - skipping .beads provisioning test');
      return;
    }

    // Initialize bd in the temp directory so .beads/ has tracked files
    spawnSync('bd', ['init'], { cwd: tempDir, stdio: 'ignore' });

    const options: WorktreeOptions = {
      beadId: 'hgpu.2',
      specialistName: 'explorer',
      worktreeBase: join(tempDir, '.worktrees', 'hgpu.2'),
      cwd: tempDir,
    };

    const result = provisionWorktree(options);

    // The new contract: worktree-local .beads/ must be removed entirely,
    // and `git status` inside the worktree must be clean (the tracked
    // .beads/* paths must be masked via skip-worktree). No info/exclude
    // write is required — that existed only for the previous symlink path.
    expect(existsSync(join(result.worktreePath, '.beads'))).toBe(false);

    const status = spawnSync('git', ['-C', result.worktreePath, 'status', '-s'], {
      encoding: 'utf8',
    }).stdout.trim();
    expect(status).toBe('');

    // Verify the tracked .beads/* files are marked skip-worktree.
    // `git ls-files -v` prefixes each path with a single-letter flag —
    // 'S' indicates skip-worktree is set (vs 'H' for plain cached).
    const lsFiles = spawnSync('git', ['-C', result.worktreePath, 'ls-files', '-v', '--', '.beads'], {
      encoding: 'utf8',
    }).stdout.trim();
    if (lsFiles.length > 0) {
      for (const line of lsFiles.split('\n')) {
        expect(line[0]).toBe('S');
      }
    }

    // Idempotence: re-running provisionWorktree returns reused=true and
    // does not re-create .beads/.
    const second = provisionWorktree(options);
    expect(second.reused).toBe(true);
    expect(existsSync(join(result.worktreePath, '.beads'))).toBe(false);
  }, 15000);
});

// ── Coordinator branch ancestry (core xtrm-6hey0.6 / audit P1-03) ─────────────
//
// Core publishes the dispatching coordinator's integration branch as both the
// XTMUX_AGENT_BRANCH env var and the @agent_branch tmux pane option. These
// tests pin the consumption contract: present → the job branch descends from
// the coordinator branch; absent → today's behaviour is unchanged.

/** Snapshot + restore the two env vars these tests manipulate. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function bdAvailable(): boolean {
  try {
    execSync('which bd', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('resolveCoordinatorBase', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wt-coord-base-'));
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['branch', 'xt/coordinator'], { cwd: tempDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads the branch from XTMUX_AGENT_BRANCH', () => {
    withEnv({ XTMUX_AGENT_BRANCH: 'xt/coordinator' }, () => {
      expect(resolveCoordinatorBase(tempDir)).toBe('xt/coordinator');
    });
  });

  it('returns undefined with no coordinator context', () => {
    withEnv({ XTMUX_AGENT_BRANCH: undefined, TMUX: undefined }, () => {
      expect(resolveCoordinatorBase(tempDir)).toBeUndefined();
    });
  });

  it('returns undefined when the published branch does not exist locally', () => {
    withEnv({ XTMUX_AGENT_BRANCH: 'xt/never-created' }, () => {
      expect(resolveCoordinatorBase(tempDir)).toBeUndefined();
    });
  });

  it('ignores a blank XTMUX_AGENT_BRANCH and falls through to the pane option', () => {
    withEnv({ XTMUX_AGENT_BRANCH: '   ', TMUX: undefined }, () => {
      expect(resolveCoordinatorBase(tempDir)).toBeUndefined();
    });
  });

  it('reads the branch from the @agent_branch pane option when env is absent', () => {
    if (!process.env.TMUX) {
      console.log('[SKIP] not running under tmux - skipping pane-option path');
      return;
    }
    const saved = spawnSync('tmux', ['show-options', '-p', '-qv', '@agent_branch'], {
      encoding: 'utf-8',
    }).stdout.trim();
    spawnSync('tmux', ['set-option', '-p', '@agent_branch', 'xt/coordinator'], { stdio: 'ignore' });
    try {
      withEnv({ XTMUX_AGENT_BRANCH: undefined }, () => {
        expect(resolveCoordinatorBase(tempDir)).toBe('xt/coordinator');
      });
    } finally {
      if (saved) spawnSync('tmux', ['set-option', '-p', '@agent_branch', saved], { stdio: 'ignore' });
      else spawnSync('tmux', ['set-option', '-p', '-u', '@agent_branch'], { stdio: 'ignore' });
    }
  });

  it('prefers the env var over the pane option', () => {
    if (!process.env.TMUX) {
      console.log('[SKIP] not running under tmux - skipping env-precedence check');
      return;
    }
    const saved = spawnSync('tmux', ['show-options', '-p', '-qv', '@agent_branch'], {
      encoding: 'utf-8',
    }).stdout.trim();
    spawnSync('git', ['branch', 'xt/from-pane'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('tmux', ['set-option', '-p', '@agent_branch', 'xt/from-pane'], { stdio: 'ignore' });
    try {
      withEnv({ XTMUX_AGENT_BRANCH: 'xt/coordinator' }, () => {
        expect(resolveCoordinatorBase(tempDir)).toBe('xt/coordinator');
      });
    } finally {
      if (saved) spawnSync('tmux', ['set-option', '-p', '@agent_branch', saved], { stdio: 'ignore' });
      else spawnSync('tmux', ['set-option', '-p', '-u', '@agent_branch'], { stdio: 'ignore' });
    }
  });
});

describe('provisionWorktree coordinator ancestry', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wt-ancestry-test-'));
    originalCwd = process.cwd();
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  /** Create a coordinator branch carrying one commit the default HEAD lacks. */
  function createCoordinatorBranch(name: string): string {
    spawnSync('git', ['checkout', '-b', name], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['commit', '--allow-empty', '-m', 'coordinator work'], {
      cwd: tempDir,
      stdio: 'ignore',
    });
    const sha = spawnSync('git', ['rev-parse', name], { cwd: tempDir, encoding: 'utf8' })
      .stdout.trim();
    spawnSync('git', ['checkout', '-'], { cwd: tempDir, stdio: 'ignore' });
    return sha;
  }

  function isAncestor(ancestor: string, descendant: string): boolean {
    return spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: tempDir,
      stdio: 'ignore',
    }).status === 0;
  }

  it('bases the job branch on the coordinator branch from XTMUX_AGENT_BRANCH', () => {
    if (!bdAvailable()) {
      console.log('[SKIP] bd not available');
      return;
    }
    spawnSync('bd', ['init'], { cwd: tempDir, stdio: 'ignore' });
    createCoordinatorBranch('xt/coordinator');

    const options: WorktreeOptions = {
      beadId: 'anc.1',
      specialistName: 'executor',
      worktreeBase: join(tempDir, '.worktrees', 'anc.1'),
      cwd: tempDir,
    };

    withEnv({ XTMUX_AGENT_BRANCH: 'xt/coordinator' }, () => {
      const result = provisionWorktree(options);
      expect(result.reused).toBe(false);
      expect(result.baseBranch).toBe('xt/coordinator');
      // The success criterion straight out of the bead.
      expect(isAncestor('xt/coordinator', result.branch)).toBe(true);
    });
  }, 15000);

  it('keeps the existing behaviour when no coordinator context is published', () => {
    if (!bdAvailable()) {
      console.log('[SKIP] bd not available');
      return;
    }
    spawnSync('bd', ['init'], { cwd: tempDir, stdio: 'ignore' });
    const coordinatorSha = createCoordinatorBranch('xt/coordinator');
    const headSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: tempDir, encoding: 'utf8' })
      .stdout.trim();

    const options: WorktreeOptions = {
      beadId: 'anc.2',
      specialistName: 'executor',
      worktreeBase: join(tempDir, '.worktrees', 'anc.2'),
      cwd: tempDir,
    };

    withEnv({ XTMUX_AGENT_BRANCH: undefined, TMUX: undefined }, () => {
      const result = provisionWorktree(options);
      expect(result.baseBranch).toBeUndefined();
      const branchSha = spawnSync('git', ['rev-parse', result.branch], {
        cwd: tempDir,
        encoding: 'utf8',
      }).stdout.trim();
      expect(branchSha).toBe(headSha);
      expect(branchSha).not.toBe(coordinatorSha);
      expect(isAncestor('xt/coordinator', result.branch)).toBe(false);
    });
  }, 15000);

  it('does not re-base a reused worktree', () => {
    if (!bdAvailable()) {
      console.log('[SKIP] bd not available');
      return;
    }
    spawnSync('bd', ['init'], { cwd: tempDir, stdio: 'ignore' });

    const options: WorktreeOptions = {
      beadId: 'anc.3',
      specialistName: 'executor',
      worktreeBase: join(tempDir, '.worktrees', 'anc.3'),
      cwd: tempDir,
    };

    let firstSha = '';
    withEnv({ XTMUX_AGENT_BRANCH: undefined, TMUX: undefined }, () => {
      const first = provisionWorktree(options);
      firstSha = spawnSync('git', ['rev-parse', first.branch], { cwd: tempDir, encoding: 'utf8' })
        .stdout.trim();
    });

    // A coordinator appears only on the second dispatch; the existing worktree
    // must be handed back untouched rather than reset onto the new base.
    createCoordinatorBranch('xt/late-coordinator');
    withEnv({ XTMUX_AGENT_BRANCH: 'xt/late-coordinator' }, () => {
      const second = provisionWorktree(options);
      expect(second.reused).toBe(true);
      expect(second.baseBranch).toBeUndefined();
      const secondSha = spawnSync('git', ['rev-parse', second.branch], {
        cwd: tempDir,
        encoding: 'utf8',
      }).stdout.trim();
      expect(secondSha).toBe(firstSha);
    });
  }, 15000);
});
