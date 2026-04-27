export interface WorktreeInfo {
    /** The git branch checked out in this worktree. */
    branch: string;
    /** Absolute path to the worktree directory. */
    worktreePath: string;
    /** True when the worktree already existed and was reused; false when freshly created. */
    reused: boolean;
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
/**
 * Derive a deterministic, filesystem-safe git branch name.
 *
 * Convention: `feature/<beadId>-<specialist-slug>`
 * Example:    `feature/hgpu.2-explorer`
 */
export declare function deriveBranchName(beadId: string, specialistName: string): string;
/**
 * Derive a deterministic worktree *directory* name (no path prefix).
 *
 * Convention: `<beadId>-<specialist-slug>`
 * Example:    `hgpu.2-explorer`
 */
export declare function deriveWorktreeName(beadId: string, specialistName: string): string;
/**
 * Resolve the git common root so all worktrees converge on the same base.
 * Falls back to `cwd` when git is unavailable (non-git dirs, CI sandboxes).
 */
export declare function resolveCommonRoot(cwd: string): string;
/**
 * Discover all git worktrees and return a map of `branch → absolute-path`.
 * Uses `git worktree list --porcelain` which is stable and git-native.
 *
 * Detached-HEAD worktrees (no branch line) are omitted.
 */
export declare function listWorktrees(cwd?: string): Map<string, string>;
/**
 * Find the absolute path of an existing worktree checked out on `branch`.
 * Returns `undefined` when no matching worktree exists.
 */
export declare function findExistingWorktree(branch: string, cwd?: string): string | undefined;
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
export declare function provisionWorktree(options: WorktreeOptions): WorktreeInfo;
//# sourceMappingURL=worktree.d.ts.map