/**
 * Epic lifecycle is independent from node lifecycle:
 * - epic: merge-gated publication lifecycle for wave-bound chain groups
 * - chain: worktree lineage rooted at worktree_owner_job_id
 * - job: one specialist run
 * - node: coordinator/member runtime lifecycle
 */
export const EPIC_STATES = ['open', 'resolving', 'merge_ready', 'merged', 'failed', 'abandoned'];
export const EPIC_TERMINAL_STATES = ['merged', 'failed', 'abandoned'];
export const VALID_EPIC_TRANSITIONS = {
    open: ['resolving', 'abandoned'],
    resolving: ['merge_ready', 'failed', 'abandoned'],
    merge_ready: ['merged', 'failed', 'abandoned', 'resolving'],
    merged: [],
    failed: [],
    abandoned: [],
};
export function isEpicTerminalState(status) {
    return EPIC_TERMINAL_STATES.includes(status);
}
export function isEpicUnresolvedState(status) {
    return !isEpicTerminalState(status);
}
export function canTransitionEpicState(from, to) {
    return VALID_EPIC_TRANSITIONS[from].includes(to);
}
export function transitionEpicState(from, to) {
    if (!canTransitionEpicState(from, to)) {
        throw new Error(`Invalid epic transition: ${from} -> ${to}`);
    }
    return to;
}
export function resolveChainId(status) {
    if (status.chain_id)
        return status.chain_id;
    if (status.worktree_owner_job_id)
        return status.worktree_owner_job_id;
    if (status.worktree_path)
        return status.id;
    return undefined;
}
export function evaluateEpicMergeReadiness(input) {
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
export function appendEpicTransitionAudit(statusJson, entry) {
    const fallback = {
        transitions: [],
    };
    let parsed = fallback;
    if (statusJson) {
        try {
            const candidate = JSON.parse(statusJson);
            if (candidate && typeof candidate === 'object') {
                parsed = candidate;
            }
        }
        catch {
            parsed = fallback;
        }
    }
    const previous = Array.isArray(parsed.transitions)
        ? parsed.transitions.filter((item) => Boolean(item) && typeof item === 'object')
        : [];
    return JSON.stringify({
        ...parsed,
        transitions: [...previous, entry],
    });
}
export function summarizeEpicTransition(epicId, from, to) {
    return `Epic ${epicId}: ${from} -> ${to}`;
}
//# sourceMappingURL=epic-lifecycle.js.map