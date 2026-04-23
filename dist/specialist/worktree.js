// src/specialist/worktree.ts
// Worktree lifecycle helpers for isolated specialist sessions.
//
// Key design constraints:
//   - Shells out to `bd worktree create` exclusively — no silent git fallback.
//   - Fails loud: throws on bd error instead of degrading silently.
//   - No Pi bootstrap logic (extensions are global via ~/.pi/).
//   - No CLI argument parsing.
import { existsSync, symlinkSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
// ── Name derivation ────────────────────────────────────────────────────────────
/**
 * Derive a deterministic, filesystem-safe git branch name.
 *
 * Convention: `feature/<beadId>-<specialist-slug>`
 * Example:    `feature/hgpu.2-explorer`
 */
export function deriveBranchName(beadId, specialistName) {
    return `feature/${beadId}-${slugify(specialistName)}`;
}
/**
 * Derive a deterministic worktree *directory* name (no path prefix).
 *
 * Convention: `<beadId>-<specialist-slug>`
 * Example:    `hgpu.2-explorer`
 */
export function deriveWorktreeName(beadId, specialistName) {
    return `${beadId}-${slugify(specialistName)}`;
}
/** Lowercase, collapse non-alphanumeric runs into hyphens, strip leading/trailing hyphens. */
function slugify(s) {
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
export function resolveCommonRoot(cwd) {
    return resolveCommonGitRoot(cwd) ?? cwd;
}
/**
 * Discover all git worktrees and return a map of `branch → absolute-path`.
 * Uses `git worktree list --porcelain` which is stable and git-native.
 *
 * Detached-HEAD worktrees (no branch line) are omitted.
 */
export function listWorktrees(cwd = process.cwd()) {
    const result = spawnSync('git', ['worktree', 'list', '--porcelain'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status !== 0)
        return new Map();
    return parseWorktreeList(result.stdout ?? '');
}
/**
 * Find the absolute path of an existing worktree checked out on `branch`.
 * Returns `undefined` when no matching worktree exists.
 */
export function findExistingWorktree(branch, cwd = process.cwd()) {
    return listWorktrees(cwd).get(branch);
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
export function provisionWorktree(options) {
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
    // ── 4. Symlink .pi/npm to avoid redundant npm install on first pi start ────
    // Each new worktree would otherwise trigger a full npm install for project
    // packages (from .pi/settings.json), blocking the RPC channel for 30-60s.
    // Sharing the main checkout's npm cache skips that startup cost.
    symlinkPiNpmCache(commonRoot, worktreePath);
    return { branch, worktreePath, reused: false };
}
// ── Internal ───────────────────────────────────────────────────────────────────
/**
 * Symlink <worktreePath>/.pi/npm → <commonRoot>/.pi/npm so new worktrees
 * reuse the main checkout's pi npm cache and skip redundant npm installs.
 *
 * No-ops when:
 *   - The main checkout has no .pi/npm (nothing to share yet)
 *   - The worktree already has its own .pi/npm (dir or link)
 */
function symlinkPiNpmCache(commonRoot, worktreePath) {
    const source = join(commonRoot, '.pi', 'npm');
    const target = join(worktreePath, '.pi', 'npm');
    if (!existsSync(source) || existsSync(target))
        return;
    try {
        mkdirSync(join(worktreePath, '.pi'), { recursive: true });
        symlinkSync(source, target);
    }
    catch {
        // Non-fatal: worst case pi does a fresh npm install on first run
    }
}
/**
 * Shell out to `bd worktree create <path> --branch <branch>`.
 * Throws with the stderr output when bd exits non-zero.
 */
function createWorktreeViaBd(worktreePath, branch, cwd) {
    try {
        execFileSync('bd', ['worktree', 'create', worktreePath, '--branch', branch], {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    catch (err) {
        const spawnErr = err;
        const detail = spawnErr.stderr?.trim() || spawnErr.stdout?.trim() || spawnErr.message;
        throw new Error(`bd worktree create failed for branch "${branch}" at "${worktreePath}": ${detail}`);
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
function parseWorktreeList(output) {
    const branchToPath = new Map();
    let currentPath;
    for (const line of output.split('\n')) {
        if (line.startsWith('worktree ')) {
            currentPath = line.slice('worktree '.length).trim();
        }
        else if (line.startsWith('branch ') && currentPath) {
            const ref = line.slice('branch '.length).trim();
            const branch = ref.replace(/^refs\/heads\//, '');
            branchToPath.set(branch, currentPath);
            currentPath = undefined;
        }
        else if (line === '') {
            currentPath = undefined;
        }
    }
    return branchToPath;
}
//# sourceMappingURL=worktree.js.map