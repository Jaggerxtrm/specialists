// src/specialist/job-root.ts
// Resolves the canonical .specialists/jobs/ directory anchored to the git common root.
// Works from both the main checkout and any git worktree — both see the same path.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
/**
 * Returns the git common root — the directory that contains the shared `.git/` dir.
 * In a regular checkout this is the repo root. In a worktree it is still the main
 * repo root, not the worktree directory, so all worktrees converge on the same root.
 *
 * `git rev-parse --git-common-dir` emits the path to the shared object store
 * (e.g. `/repo/.git` from a worktree vs. `.git` from the main checkout). Taking
 * `dirname` of its resolved form gives us the common project root in both cases.
 */
export function resolveCommonGitRoot(cwd) {
    const result = spawnSync('git', ['rev-parse', '--git-common-dir'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status !== 0)
        return undefined;
    const gitCommonDir = result.stdout?.trim();
    if (!gitCommonDir)
        return undefined;
    // git may return a relative path (e.g. `.git`) — resolve against cwd first.
    return dirname(resolve(cwd, gitCommonDir));
}
/**
 * Returns the absolute path to `.specialists/jobs/` rooted at the git common root.
 * Falls back to `cwd/.specialists/jobs/` when git is unavailable (e.g. non-git dirs).
 */
export function resolveJobsDir(cwd = process.cwd()) {
    const commonRoot = resolveCommonGitRoot(cwd) ?? cwd;
    return join(commonRoot, '.specialists', 'jobs');
}
/**
 * Returns the current branch name from `cwd`, or `undefined` when git is unavailable
 * or HEAD is detached.
 */
export function resolveCurrentBranch(cwd = process.cwd()) {
    const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status !== 0)
        return undefined;
    const branch = result.stdout?.trim();
    // `HEAD` is the detached-head sentinel — treat as undefined
    return branch && branch !== 'HEAD' ? branch : undefined;
}
//# sourceMappingURL=job-root.js.map