import type { SupervisorStatus } from './supervisor.js';

/**
 * Epic lifecycle is independent from node lifecycle:
 * - epic: merge-gated publication lifecycle for wave-bound chain groups
 * - chain: worktree lineage rooted at worktree_owner_job_id
 * - job: one specialist run
 * - node: coordinator/member runtime lifecycle
 */
export const EPIC_STATES = ['open', 'resolving', 'merge_ready', 'merged', 'failed', 'abandoned'] as const;

export type EpicState = (typeof EPIC_STATES)[number];

export const EPIC_TERMINAL_STATES = ['merged', 'failed', 'abandoned'] as const;

export const VALID_EPIC_TRANSITIONS: Record<EpicState, readonly EpicState[]> = {
  open: ['resolving', 'abandoned'],
  resolving: ['merge_ready', 'failed', 'abandoned'],
  merge_ready: ['merged', 'failed', 'abandoned', 'resolving'],
  merged: [],
  failed: [],
  abandoned: [],
};

export interface EpicRunRecord {
  epic_id: string;
  status: EpicState;
  updated_at_ms: number;
  status_json: string;
}

export interface EpicChainRecord {
  chain_id: string;
  epic_id: string;
  chain_root_bead_id?: string;
  chain_root_job_id?: string;
  updated_at_ms: number;
}

export interface EpicReadinessInput {
  epicId: string;
  epicStatus: EpicState;
  chainStatuses: ReadonlyArray<{ chainId: string; hasRunningJob: boolean }>;
}

export interface EpicReadinessResult {
  epicId: string;
  epicStatus: EpicState;
  isReady: boolean;
  blockingChains: string[];
  summary: string;
}

export function isEpicTerminalState(status: EpicState): boolean {
  return EPIC_TERMINAL_STATES.includes(status as (typeof EPIC_TERMINAL_STATES)[number]);
}

export function isEpicUnresolvedState(status: EpicState): boolean {
  return !isEpicTerminalState(status);
}

export function canTransitionEpicState(from: EpicState, to: EpicState): boolean {
  return VALID_EPIC_TRANSITIONS[from].includes(to);
}

export function transitionEpicState(from: EpicState, to: EpicState): EpicState {
  if (!canTransitionEpicState(from, to)) {
    throw new Error(`Invalid epic transition: ${from} -> ${to}`);
  }
  return to;
}

export function resolveChainId(status: Pick<SupervisorStatus, 'id' | 'worktree_path' | 'worktree_owner_job_id' | 'chain_id'>): string | undefined {
  if (status.chain_id) return status.chain_id;
  if (status.worktree_owner_job_id) return status.worktree_owner_job_id;
  if (status.worktree_path) return status.id;
  return undefined;
}

export function evaluateEpicMergeReadiness(input: EpicReadinessInput): EpicReadinessResult {
  const isEligibleState = input.epicStatus === 'merge_ready';
  const blockingChains = input.chainStatuses
    .filter((chain) => chain.hasRunningJob)
    .map((chain) => chain.chainId);
  const isReady = isEligibleState && blockingChains.length === 0;

  if (!isEligibleState) {
    return {
      epicId: input.epicId,
      epicStatus: input.epicStatus,
      isReady,
      blockingChains,
      summary: `Epic ${input.epicId} is ${input.epicStatus}; expected merge_ready before publication.`,
    };
  }

  if (blockingChains.length > 0) {
    return {
      epicId: input.epicId,
      epicStatus: input.epicStatus,
      isReady,
      blockingChains,
      summary: `Epic ${input.epicId} is blocked by active chains: ${blockingChains.join(', ')}.`,
    };
  }

  return {
    epicId: input.epicId,
    epicStatus: input.epicStatus,
    isReady,
    blockingChains,
    summary: `Epic ${input.epicId} is merge-ready and all chains are terminal.`,
  };
}

export interface EpicTransitionAuditEntry {
  from: EpicState;
  to: EpicState;
  at_ms: number;
  reason?: string;
  trigger?: string;
  forced?: boolean;
}

export function appendEpicTransitionAudit(statusJson: string | undefined, entry: EpicTransitionAuditEntry): string {
  const fallback = {
    transitions: [],
  } as { transitions: EpicTransitionAuditEntry[] };

  let parsed: Record<string, unknown> = fallback;
  if (statusJson) {
    try {
      const candidate = JSON.parse(statusJson) as Record<string, unknown>;
      if (candidate && typeof candidate === 'object') {
        parsed = candidate;
      }
    } catch {
      parsed = fallback;
    }
  }

  const previous = Array.isArray(parsed.transitions)
    ? parsed.transitions.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];

  return JSON.stringify({
    ...parsed,
    transitions: [...previous, entry],
  });
}

export function summarizeEpicTransition(epicId: string, from: EpicState, to: EpicState): string {
  return `Epic ${epicId}: ${from} -> ${to}`;
}
