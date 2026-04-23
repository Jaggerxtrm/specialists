// src/specialist/worktree-gc.ts
// Minimal GC for worktrees owned by terminal (done/error) hgpu jobs.
// Conservative strategy: only removes worktrees whose owning job is clearly terminal
// and whose path was recorded in persisted job metadata. Active jobs are never touched.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const TERMINAL_STATUSES = new Set(['done', 'error']);
const ACTIVE_STATUSES = new Set(['starting', 'running', 'waiting']);
function readJobStatus(jobDir) {
    const statusPath = join(jobDir, 'status.json');
    if (!existsSync(statusPath))
        return null;
    try {
        return JSON.parse(readFileSync(statusPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function isTerminal(status) {
    return TERMINAL_STATUSES.has(status);
}
function isActive(status) {
    return ACTIVE_STATUSES.has(status);
}
/**
 * Collect worktree GC candidates from persisted job metadata.
 * Only considers jobs that are terminal AND recorded a `worktree_path`.
 * Skips any job whose status is active to prevent accidental removal.
 */
export function collectWorktreeGcCandidates(jobsDir) {
    if (!existsSync(jobsDir))
        return [];
    const candidates = [];
    for (const entry of readdirSync(jobsDir, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const status = readJobStatus(join(jobsDir, entry.name));
        if (!status)
            continue;
        // Skip active jobs unconditionally — safety guard against data races.
        if (isActive(status.status))
            continue;
        if (!isTerminal(status.status))
            continue;
        const { worktree_path: worktreePath, branch } = status;
        if (!worktreePath)
            continue;
        // Skip if the directory no longer exists — already cleaned up.
        if (!existsSync(worktreePath))
            continue;
        candidates.push({
            jobId: status.id,
            worktreePath,
            branch,
            jobStatus: status.status,
        });
    }
    return candidates;
}
function removeWorktreeDirectory(worktreePath) {
    // `git worktree remove --force` both removes the directory and prunes the git
    // worktree registry entry in a single atomic operation.
    const result = spawnSync('git', ['worktree', 'remove', '--force', worktreePath], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status === 0)
        return { ok: true };
    // Fall back: git worktree remove may fail if path was already removed or is not a
    // registered git worktree (e.g. plain temp dirs used in tests). Either way, skip.
    const reason = result.stderr?.trim() || 'git worktree remove failed';
    return { ok: false, reason };
}
/**
 * Prune the provided worktree candidates.
 * Each removal uses `git worktree remove --force` so the git registry stays consistent.
 * Failures are silently skipped — prefer missing cleanup over accidental data loss.
 * Never throws.
 */
export function pruneWorktrees(candidates) {
    const removed = [];
    const skipped = [];
    for (const candidate of candidates) {
        const { ok } = removeWorktreeDirectory(candidate.worktreePath);
        if (ok) {
            removed.push(candidate);
        }
        else {
            skipped.push(candidate);
        }
    }
    return { removed, skipped };
}
//# sourceMappingURL=worktree-gc.js.map