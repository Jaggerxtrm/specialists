/**
 * Returns the git common root — the directory that contains the shared `.git/` dir.
 * In a regular checkout this is the repo root. In a worktree it is still the main
 * repo root, not the worktree directory, so all worktrees converge on the same root.
 *
 * `git rev-parse --git-common-dir` emits the path to the shared object store
 * (e.g. `/repo/.git` from a worktree vs. `.git` from the main checkout). Taking
 * `dirname` of its resolved form gives us the common project root in both cases.
 */
export declare function resolveCommonGitRoot(cwd: string): string | undefined;
/**
 * Returns the absolute path to `.specialists/jobs/` rooted at the git common root.
 * Falls back to `cwd/.specialists/jobs/` when git is unavailable (e.g. non-git dirs).
 */
export declare function resolveJobsDir(cwd?: string): string;
/**
 * Returns the current branch name from `cwd`, or `undefined` when git is unavailable
 * or HEAD is detached.
 */
export declare function resolveCurrentBranch(cwd?: string): string | undefined;
//# sourceMappingURL=job-root.d.ts.map