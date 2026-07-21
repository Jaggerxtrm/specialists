// src/specialist/worktree.ts
// Worktree lifecycle helpers for isolated specialist sessions.
//
// Key design constraints:
//   - Shells out to `bd worktree create` exclusively — no silent git fallback.
//   - Fails loud: throws on bd error instead of degrading silently.
//   - No Pi bootstrap logic (extensions are global via ~/.pi/).
//   - No CLI argument parsing.

import { existsSync, symlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

// ── Public types ───────────────────────────────────────────────────────────────

export interface WorktreeInfo {
  /** The git branch checked out in this worktree. */
  branch: string;
  /** Absolute path to the worktree directory. */
  worktreePath: string;
  /** True when the worktree already existed and was reused; false when freshly created. */
  reused: boolean;
  /**
   * The coordinator integration branch this worktree's branch was based on,
   * when a coordinator context was present at creation time. Undefined when the
   * job was dispatched with no coordinator context (branch starts at the git
   * common root's HEAD, i.e. today's default).
   */
  baseBranch?: string;
}

export interface WorktreeOptions {
  /** Bead identifier (e.g. "hgpu.2"). Used as the slug prefix. */
  beadId: string;
  /** Specialist name in kebab-case (e.g. "explorer"). */
  specialistName: string;
  /**
   * Absolute path to the directory that will *contain* the new worktree.
   * Defaults to `<git-common-root>/.worktrees/<beadId>/`.
   */
  worktreeBase?: string;
  /**
   * Working directory for git/bd commands.
   * Defaults to `process.cwd()`.
   */
  cwd?: string;
}

// ── Name derivation ────────────────────────────────────────────────────────────

/**
 * Derive a deterministic, filesystem-safe git branch name.
 *
 * Convention: `feature/<beadId>-<specialist-slug>`
 * Example:    `feature/hgpu.2-explorer`
 */
export function deriveBranchName(beadId: string, specialistName: string): string {
  return `feature/${beadId}-${slugify(specialistName)}`;
}

/**
 * Derive a deterministic worktree *directory* name (no path prefix).
 *
 * Convention: `<beadId>-<specialist-slug>`
 * Example:    `hgpu.2-explorer`
 */
export function deriveWorktreeName(beadId: string, specialistName: string): string {
  return `${beadId}-${slugify(specialistName)}`;
}

/** Lowercase, collapse non-alphanumeric runs into hyphens, strip leading/trailing hyphens. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Git helpers ────────────────────────────────────────────────────────────────

import { resolveCommonGitRoot } from './job-root.js';

/**
 * Resolve the git common root so all worktrees converge on the same base.
 * Falls back to `cwd` when git is unavailable (non-git dirs, CI sandboxes).
 */
export function resolveCommonRoot(cwd: string): string {
  return resolveCommonGitRoot(cwd) ?? cwd;
}

/**
 * Discover all git worktrees and return a map of `branch → absolute-path`.
 * Uses `git worktree list --porcelain` which is stable and git-native.
 *
 * Detached-HEAD worktrees (no branch line) are omitted.
 */
export function listWorktrees(cwd = process.cwd()): Map<string, string> {
  const result = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return new Map();
  return parseWorktreeList(result.stdout ?? '');
}

/**
 * Find the absolute path of an existing worktree checked out on `branch`.
 * Returns `undefined` when no matching worktree exists.
 */
export function findExistingWorktree(branch: string, cwd = process.cwd()): string | undefined {
  return listWorktrees(cwd).get(branch);
}

// ── Coordinator branch ancestry ────────────────────────────────────────────────

/**
 * Resolve the dispatching coordinator's integration branch, if any.
 *
 * xtrm Core publishes the branch of every launched session two ways (see core
 * PR #465 / xtrm-6hey0.2):
 *   1. `XTMUX_AGENT_BRANCH` env var  — survives re-execs, inherited by children.
 *   2. `@agent_branch` tmux pane option — matches the xtrm.runtime-origin.v1
 *      contract shape.
 *
 * Env wins because it is inherited by the whole process tree; the pane option is
 * the fallback for callers whose env was scrubbed. `@agent_worktree` is
 * deliberately NOT consulted — the branch is the contract, the path is
 * informational.
 *
 * Returns undefined when there is no coordinator context, or when the published
 * branch does not resolve to a local branch in `cwd`'s repository. Absence is
 * benign: the caller keeps today's base.
 */
export function resolveCoordinatorBase(cwd = process.cwd()): string | undefined {
  const candidate = (process.env.XTMUX_AGENT_BRANCH ?? '').trim() || readPaneAgentBranch();
  if (!candidate) return undefined;
  return localBranchExists(candidate, cwd) ? candidate : undefined;
}

/** Read the `@agent_branch` option off the current tmux pane. */
function readPaneAgentBranch(): string | undefined {
  if (!process.env.TMUX) return undefined;
  const result = spawnSync('tmux', ['show-options', '-p', '-qv', '@agent_branch'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return undefined;
  return (result.stdout ?? '').trim() || undefined;
}

/** True when `branch` names an existing local branch head in `cwd`'s repository. */
function localBranchExists(branch: string, cwd: string): boolean {
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
    { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return result.status === 0 && (result.stdout ?? '').trim().length > 0;
}

/**
 * Point the freshly created `branch` at `base`.
 *
 * `bd worktree create` has no start-point flag, so the new branch always starts
 * at the git common root's HEAD. Re-pointing it immediately afterwards is what
 * makes `git merge-base --is-ancestor <base> <branch>` hold.
 *
 * Only ever called on a brand-new worktree that has no commits and no working
 * tree changes of its own, so `checkout -B` cannot discard work.
 *
 * Throws on failure: a coordinator asked for this ancestry, and silently
 * branching from the common root's HEAD instead would reintroduce the exact bug
 * this guards against.
 */
function rebaseNewBranchOnto(worktreePath: string, branch: string, base: string): void {
  const result = spawnSync('git', ['checkout', '-B', branch, base], {
    cwd: worktreePath,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = (result.stderr ?? '').trim() || (result.stdout ?? '').trim() || 'unknown error';
    throw new Error(
      `failed to base branch "${branch}" on coordinator branch "${base}" ` +
      `at "${worktreePath}": ${detail}`,
    );
  }
}

// ── Provisioning ───────────────────────────────────────────────────────────────

/**
 * Ensure an isolated worktree exists for the given bead + specialist pair.
 *
 * Behaviour:
 *   1. Derives the canonical branch name and worktree path.
 *   2. If a worktree for that branch already exists, returns it (reused=true).
 *   3. Otherwise calls `bd worktree create <path> --branch <branch>` from the
 *      git common root.  The call is **hard** — any non-zero exit throws rather
 *      than falling back to raw `git worktree add`.
 *
 * @throws {Error} when `bd worktree create` fails.
 */
export function provisionWorktree(options: WorktreeOptions): WorktreeInfo {
  const cwd = options.cwd ?? process.cwd();
  const commonRoot = resolveCommonRoot(cwd);
  const branch = deriveBranchName(options.beadId, options.specialistName);

  // ── 1. Reuse check ─────────────────────────────────────────────────────────
  const existingPath = findExistingWorktree(branch, cwd);
  if (existingPath) {
    return { branch, worktreePath: resolve(existingPath), reused: true };
  }

  // ── 2. Derive path ─────────────────────────────────────────────────────────
  const worktreeBase = options.worktreeBase
    ?? join(commonRoot, '.worktrees', options.beadId);
  const worktreeName = deriveWorktreeName(options.beadId, options.specialistName);
  // bd worktree create accepts a path relative to cwd or absolute.
  const worktreePath = resolve(join(worktreeBase, worktreeName));

  // ── 3. Create via bd worktree create (hard — no git fallback) ──────────────
  createWorktreeViaBd(worktreePath, branch, commonRoot);

  // ── 3z. Base the new branch on the dispatching coordinator's branch ────────
  // Must run before the .beads/ surgery below: checkout rewrites the index, and
  // the skip-worktree bits set afterwards would otherwise be dropped.
  const coordinatorBase = resolveCoordinatorBase(commonRoot);
  const baseBranch = coordinatorBase && coordinatorBase !== branch ? coordinatorBase : undefined;
  if (baseBranch) {
    rebaseNewBranchOnto(worktreePath, branch, baseBranch);
  }

  // ── 3a. Symlink .beads/ to parent so bd shares the parent's dolt server ───
  // bd's post-checkout/pre-commit/post-merge git hooks (registered via the
  // parent repo's `core.hooksPath = .beads/hooks/`) fire on any git operation
  // inside the worktree — including supervisor's auto-commit checkpoints. Each
  // hook invokes `bd hooks run …` from inside the worktree; if the worktree's
  // `.beads/` is missing, bd re-scaffolds a fresh stub there and starts its
  // own per-worktree dolt-sql-server (60–200 MB RSS each, plus a process-leak
  // vector on cleanup). Plain `rm -rf .beads/` is therefore not sufficient —
  // the next git commit re-creates everything.
  //
  // The robust fix is to replace the stub with a symlink to the parent's
  // `.beads/`. bd inside the worktree then operates on the parent's data
  // (shared dolt server, single source of truth, no orphan processes) while
  // every hook call still succeeds because the path resolves correctly.
  // Verified end-to-end: `bd kv set` from a worktree is visible from the
  // parent and triggers no new server. See unitAI-0wz2p.
  // Remove worktree-local .beads/ entirely. bd inside the worktree resolves
  // its DB via git common-dir discovery (shared-server mode + absolute
  // core.hooksPath at the parent's .beads/hooks/), so no on-disk .beads/ is
  // needed. The previous dir->symlink approach made bd happy but caused a
  // serious merge hazard: any branch carrying the .beads symlink (mode
  // 120000) wipes the parent's .beads/ on squash-merge (see projects/infra
  // PR #39, 2026-05-12). With the directory gone, the tracked .beads/* paths
  // are masked via skip-worktree so the index/worktree delta does not
  // surface in `git status` or checkpoint diffs.
  // See unitAI-yvqmf (this fix). Supersedes unitAI-u08e8 / xtrm-nsca.
  // Safety net for older bd installs: normalize parent's core.hooksPath to
  // absolute if it's still the bd relative default (see xtrm-2s44).
  normalizeParentHooksPath(commonRoot);
  try {
    rmSync(join(worktreePath, '.beads'), { recursive: true, force: true });
    markBeadsSkipWorktree(worktreePath);
  } catch {
    // Non-fatal: bd resolves the parent DB via git common-dir regardless.
  }

  // ── 4. Symlink .pi/npm to avoid redundant npm install on first pi start ────
  // Each new worktree would otherwise trigger a full npm install for project
  // packages (from .pi/settings.json), blocking the RPC channel for 30-60s.
  // Sharing the main checkout's npm cache skips that startup cost.
  symlinkPiNpmCache(commonRoot, worktreePath);

  return { branch, worktreePath, reused: false, ...(baseBranch ? { baseBranch } : {}) };
}

// ── Internal ───────────────────────────────────────────────────────────────────


/**
 * Normalize the parent repo's `core.hooksPath` to an absolute path if it is
 * currently a relative `.beads/hooks` reference. Older bd installs stored a
 * relative path which would resolve against the worktree's cwd in a worktree
 * — i.e., against the (now-missing) worktree-local `.beads/hooks/`. The fix
 * is idempotent: only rewrites the exact relative `.beads/hooks` form, never
 * touches absolute paths, project-style `.githooks` chains, or unset values.
 *
 * No-op for the vast majority of repos surveyed 2026-05-12 — but cheap
 * insurance so a fresh-install on an older bd binary cannot resurface the
 * "hooks fire from missing path" failure mode after unitAI-yvqmf lands.
 *
 * See xtrm-2s44 (xtrm-tools side audit).
 */
function normalizeParentHooksPath(mainRepoRoot: string): void {
  try {
    const result = spawnSync('git', ['-C', mainRepoRoot, 'config', '--get', 'core.hooksPath'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (result.status !== 0) return;
    const current = (result.stdout ?? '').trim();
    if (!current) return;
    if (resolve(current) === current) return; // already absolute
    if (current !== '.beads/hooks' && current !== './.beads/hooks') return;
    const absolute = join(mainRepoRoot, '.beads', 'hooks');
    spawnSync('git', ['-C', mainRepoRoot, 'config', 'core.hooksPath', absolute], { stdio: 'pipe' });
  } catch {
    // non-fatal
  }
}

/**
 * After bd worktree create, mark the parent's tracked .beads/* paths as
 * skip-worktree in the new worktree so that removing the local .beads/
 * directory does not surface as deletions in `git status` (and therefore
 * does not pollute checkpoint commits or PR diffs).
 *
 * The caller is expected to `rm -rf <worktree>/.beads` before this — bd
 * inside the worktree then resolves the DB via git common-dir without
 * needing an on-disk .beads/.
 *
 * Non-fatal on failure: the worktree still works; the only cost is that
 * the deletions reappear in `git status`.
 */
function markBeadsSkipWorktree(worktreePath: string): void {
  try {
    const trackedResult = spawnSync('git', ['-C', worktreePath, 'ls-files', '--', '.beads'], {
      cwd: worktreePath,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (trackedResult.status !== 0) return;

    const trackedPaths = (trackedResult.stdout ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (trackedPaths.length === 0) return;

    spawnSync('git', ['-C', worktreePath, 'update-index', '--skip-worktree', '--', ...trackedPaths], {
      cwd: worktreePath,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch {
    // non-fatal
  }
}

/**
 * Symlink <worktreePath>/.pi/npm → <commonRoot>/.pi/npm so new worktrees
 * reuse the main checkout's pi npm cache and skip redundant npm installs.
 *
 * No-ops when:
 *   - The main checkout has no .pi/npm (nothing to share yet)
 *   - The worktree already has its own .pi/npm (dir or link)
 */
function symlinkPiNpmCache(commonRoot: string, worktreePath: string): void {
  const source = join(commonRoot, '.pi', 'npm');
  const target = join(worktreePath, '.pi', 'npm');
  if (!existsSync(source) || existsSync(target)) return;
  try {
    mkdirSync(join(worktreePath, '.pi'), { recursive: true });
    symlinkSync(source, target);
  } catch {
    // Non-fatal: worst case pi does a fresh npm install on first run
  }
}

/**
 * Shell out to `bd worktree create <path> --branch <branch>`.
 * Throws with the stderr output when bd exits non-zero.
 */
function createWorktreeViaBd(worktreePath: string, branch: string, cwd: string): void {
  try {
    execFileSync('bd', ['worktree', 'create', worktreePath, '--branch', branch], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    const spawnErr = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    const detail = spawnErr.stderr?.trim() || spawnErr.stdout?.trim() || spawnErr.message;
    throw new Error(
      `bd worktree create failed for branch "${branch}" at "${worktreePath}": ${detail}`,
    );
  }
}

/**
 * Parse `git worktree list --porcelain` output.
 *
 * Porcelain format (one stanza per worktree, blank-line delimited):
 *   worktree /absolute/path
 *   HEAD <sha>
 *   branch refs/heads/<name>   ← absent for detached HEAD
 */
function parseWorktreeList(output: string): Map<string, string> {
  const branchToPath = new Map<string, string>();
  let currentPath: string | undefined;

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length).trim();
    } else if (line.startsWith('branch ') && currentPath) {
      const ref = line.slice('branch '.length).trim();
      const branch = ref.replace(/^refs\/heads\//, '');
      branchToPath.set(branch, currentPath);
      currentPath = undefined;
    } else if (line === '') {
      currentPath = undefined;
    }
  }

  return branchToPath;
}
