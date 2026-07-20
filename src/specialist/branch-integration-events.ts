// src/specialist/branch-integration-events.ts
//
// `xtrm.branch.integration.v1` — a RESULT record describing a specialist
// branch that merged into an integration/target branch (audit 11.md §P2-04).
//
// This is an observation, NOT a second Git authority. Git remains the source
// of truth for what merged; this event only records that the merge happened so
// the operator interface can reconstruct worktree/branch lineage after the
// fact. It carries no mutation semantics and is never read back to drive merges.

export const BRANCH_INTEGRATION_SCHEMA_VERSION = 'xtrm.branch.integration.v1' as const;

/** The specialist chain branch that was merged. */
export interface BranchIntegrationSource {
  job_id: string;
  branch: string;
  worktree: string;
}

/** The branch the source was merged into (a coordinator integration branch, or the default branch). */
export interface BranchIntegrationTarget {
  branch: string;
  worktree: string;
  // Coordinator role when the target is a coordinator integration branch.
  // Left undefined for plain merges into the default branch; the
  // coordinator-launch semantics that would populate this reliably are owned
  // by Core (xtrm-3xgs5, Cluster B).
  role?: string;
}

export type BranchIntegrationStatus = 'merged';

export interface BranchIntegrationEvent {
  schema_version: typeof BRANCH_INTEGRATION_SCHEMA_VERSION;
  timestamp: string;
  t_unix_ms: number;
  source: BranchIntegrationSource;
  target: BranchIntegrationTarget;
  status: BranchIntegrationStatus;
  commit: string;
}

export interface CreateBranchIntegrationEventOptions {
  source: BranchIntegrationSource;
  target: BranchIntegrationTarget;
  commit: string;
  status?: BranchIntegrationStatus;
  t_unix_ms?: number;
  timestamp?: string;
}

export function createBranchIntegrationEvent(
  options: CreateBranchIntegrationEventOptions,
): BranchIntegrationEvent {
  const tUnixMs = options.t_unix_ms ?? Date.now();
  const target: BranchIntegrationTarget = {
    branch: options.target.branch,
    worktree: options.target.worktree,
  };
  if (options.target.role) target.role = options.target.role;

  return {
    schema_version: BRANCH_INTEGRATION_SCHEMA_VERSION,
    timestamp: options.timestamp ?? new Date(tUnixMs).toISOString(),
    t_unix_ms: tUnixMs,
    source: {
      job_id: options.source.job_id,
      branch: options.source.branch,
      worktree: options.source.worktree,
    },
    target,
    status: options.status ?? 'merged',
    commit: options.commit,
  };
}
