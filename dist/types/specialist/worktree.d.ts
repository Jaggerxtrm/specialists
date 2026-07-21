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
export declare function resolveCoordinatorBase(cwd?: string): string | undefined;
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