// src/specialist/worktree-gc.ts
// Minimal GC for worktrees owned by terminal (done/error) hgpu jobs.
// Conservative strategy: only removes worktrees whose owning job is clearly terminal
// and whose path was recorded in persisted job metadata. Active jobs are never touched.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SupervisorStatus } from './supervisor.js';
import { createObservabilitySqliteClient } from './observability-sqlite.js';

const TERMINAL_STATUSES = new Set<SupervisorStatus['status']>(['done', 'error']);
const ACTIVE_STATUSES = new Set<SupervisorStatus['status']>(['starting', 'running', 'waiting']);

/** SupervisorStatus extended with the `branch` field persisted by hgpu.1. */
interface JobStatusWithBranch extends SupervisorStatus {
  readonly branch?: string;
}

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

function readJobStatus(jobDir: string): JobStatusWithBranch | null {
  const statusPath = join(jobDir, 'status.json');
  if (!existsSync(statusPath)) return null;
  try {
    return JSON.parse(readFileSync(statusPath, 'utf-8')) as JobStatusWithBranch;
  } catch {
    return null;
  }
}

function getFileFallbackEnabled(): boolean {
  return process.env.SPECIALISTS_JOB_FILE_OUTPUT === 'on';
}

function isTerminal(status: SupervisorStatus['status']): status is 'done' | 'error' {
  return TERMINAL_STATUSES.has(status);
}

function isActive(status: SupervisorStatus['status']): boolean {
  return ACTIVE_STATUSES.has(status);
}

/**
 * Collect worktree GC candidates from persisted job metadata.
 * Only considers jobs that are terminal AND recorded a `worktree_path`.
 * Skips any job whose status is active to prevent accidental removal.
 */
export function collectWorktreeGcCandidates(jobsDir: string): WorktreeGcCandidate[] {
  const sqliteClient = createObservabilitySqliteClient();
  const statuses = sqliteClient?.listStatuses() ?? [];
  if (statuses.length > 0) {
    return statuses
      .filter((status) => !isActive(status.status) && isTerminal(status.status))
      .map((status) => {
        const worktreePath = status.worktree_path;
        if (!worktreePath) return null;
        if (!existsSync(worktreePath)) return null;
        return {
          jobId: status.id,
          worktreePath,
          branch: status.branch,
          jobStatus: status.status as WorktreeGcCandidate['jobStatus'],
        } satisfies WorktreeGcCandidate;
      })
      .filter((candidate): candidate is WorktreeGcCandidate => candidate !== null);
  }

  if (!getFileFallbackEnabled()) return [];
  if (!existsSync(jobsDir)) return [];

  const candidates: WorktreeGcCandidate[] = [];

  for (const entry of readdirSync(jobsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const status = readJobStatus(join(jobsDir, entry.name));
    if (!status) continue;

    if (isActive(status.status)) continue;
    if (!isTerminal(status.status)) continue;

    const { worktree_path: worktreePath, branch } = status;
    if (!worktreePath) continue;

    if (!existsSync(worktreePath)) continue;

    candidates.push({
      jobId: status.id,
      worktreePath,
      branch,
      jobStatus: status.status,
    });
  }

  return candidates;
}

function removeWorktreeDirectory(worktreePath: string): { ok: boolean; reason?: string } {
  // `git worktree remove --force` both removes the directory and prunes the git
  // worktree registry entry in a single atomic operation.
  const result = spawnSync('git', ['worktree', 'remove', '--force', worktreePath], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status === 0) return { ok: true };

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
export function pruneWorktrees(
  candidates: readonly WorktreeGcCandidate[],
): WorktreeGcResult {
  const removed: WorktreeGcCandidate[] = [];
  const skipped: WorktreeGcCandidate[] = [];

  for (const candidate of candidates) {
    const { ok } = removeWorktreeDirectory(candidate.worktreePath);
    if (ok) {
      removed.push(candidate);
    } else {
      skipped.push(candidate);
    }
  }

  return { removed, skipped };
}
