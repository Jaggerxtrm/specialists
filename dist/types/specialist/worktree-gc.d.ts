export interface WorktreeGcCandidate {
    readonly jobId: string;
    readonly worktreePath: string;
    readonly branch: string | undefined;
    readonly jobStatus: 'done' | 'error';
}
export interface WorktreeGcResult {
    readonly removed: readonly WorktreeGcCandidate[];
    readonly skipped: readonly WorktreeGcCandidate[];
}
/**
 * Collect worktree GC candidates from persisted job metadata.
 * Only considers jobs that are terminal AND recorded a `worktree_path`.
 * Skips any job whose status is active to prevent accidental removal.
 */
export declare function collectWorktreeGcCandidates(jobsDir: string): WorktreeGcCandidate[];
/**
 * Prune the provided worktree candidates.
 * Each removal uses `git worktree remove --force` so the git registry stays consistent.
 * Failures are silently skipped — prefer missing cleanup over accidental data loss.
 * Never throws.
 */
export declare function pruneWorktrees(candidates: readonly WorktreeGcCandidate[]): WorktreeGcResult;
//# sourceMappingURL=worktree-gc.d.ts.map