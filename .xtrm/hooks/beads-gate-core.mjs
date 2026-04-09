#!/usr/bin/env node
// beads-gate-core.mjs — pure decision functions for beads gate hooks
// Import from sibling hooks using: import { ... } from './beads-gate-core.mjs';
//
// All functions are pure: they return decision objects, never call process.exit()
// or write to stdout/stderr. Side effects belong in entrypoint wrappers.
//
// Dependencies: beads-gate-utils.mjs (adapters)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveCwd,
  resolveSessionId,
  isBeadsProject,
  getSessionClaim,
  getBeadClaim,
  getTotalWork,
  getInProgress,
  isIssueInProgress,
  resolveWorktreeRoot,
} from './beads-gate-utils.mjs';

// ── Input parsing ────────────────────────────────────────────────────────────

/**
 * Read and parse hook input from stdin. Returns null on parse error.
 * Entrypoints should exit 0 if this returns null (fail-open).
 */
export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

// ── Session context resolution ───────────────────────────────────────────────

/**
 * Resolve session context from hook input.
 * Returns { cwd, sessionId, isBeadsProject } or null if cwd can't be resolved.
 */
export function resolveSessionContext(input) {
  const cwd = resolveCwd(input);
  if (!cwd) return null;
  return {
    cwd,
    sessionId: resolveSessionId(input),
    isBeadsProject: isBeadsProject(cwd),
  };
}

// ── Claim and work state resolution ──────────────────────────────────────────

/**
 * Resolve the claim and work state for a session.
 * Returns { claimed, claimId, totalWork, inProgress } or null if bd unavailable.
 */
export function resolveClaimAndWorkState(ctx) {
  if (!ctx.isBeadsProject) {
    return { claimed: false, claimId: null, totalWork: 0, inProgress: null };
  }

  const totalWork = getTotalWork(ctx.cwd);
  if (totalWork === null) return null; // bd unavailable

  const inProgress = getInProgress(ctx.cwd);

  if (ctx.sessionId) {
    const claimId = getSessionClaim(ctx.sessionId, ctx.cwd);
    if (claimId === null) return null; // bd kv unavailable
    if (claimId) {
      return {
        claimed: true,
        claimId,
        claimInProgress: isIssueInProgress(claimId, ctx.cwd),
        totalWork,
        inProgress,
      };
    }
  }

  // No session claim — check for bead-based claim (set by specialist runner)
  const beadClaimId = getBeadClaim(ctx.cwd);
  if (beadClaimId) {
    return {
      claimed: true,
      claimId: beadClaimId,
      claimInProgress: isIssueInProgress(beadClaimId, ctx.cwd),
      totalWork,
      inProgress,
    };
  }

  // No session_id and no bead claim: fallback to global in_progress check
  return {
    claimed: false,
    claimId: null,
    claimInProgress: false,
    totalWork,
    inProgress,
  };
}

// ── Decision functions ───────────────────────────────────────────────────────

/**
 * Decide whether a file edit is within the active worktree boundary.
 * If the session cwd is inside .xtrm/worktrees/<name>, block any edit whose
 * resolved path falls outside that worktree root.
 * Returns { allow: boolean, filePath?: string, worktreeRoot?: string }
 */
export function decideWorktreeBoundary(input, cwd) {
  const filePath = input?.tool_input?.file_path;
  if (!filePath) return { allow: true };

  const worktreeRoot = resolveWorktreeRoot(cwd);
  if (!worktreeRoot) return { allow: true }; // not in a worktree — no constraint

  const abs = resolve(cwd, filePath);
  if (abs === worktreeRoot || abs.startsWith(worktreeRoot + '/')) return { allow: true };

  return { allow: false, filePath: abs, worktreeRoot };
}

/**
 * Decide whether to allow or block an edit operation.
 * Returns { allow: boolean, reason?: string, sessionId?: string }
 */
export function decideEditGate(ctx, state) {
  // Not a beads project → allow
  if (!ctx.isBeadsProject) {
    return { allow: true };
  }

  // bd unavailable → fail open
  if (state === null) {
    return { allow: true };
  }

  // Session has an active claim → allow
  if (state.claimed) {
    return { allow: true };
  }

  // No trackable work → allow (clean-start state)
  if (state.totalWork === 0) {
    return { allow: true };
  }

  // Has session_id but no claim + has work → block
  if (ctx.sessionId) {
    return {
      allow: false,
      reason: 'no_claim_with_work',
      sessionId: ctx.sessionId,
    };
  }

  // Fallback: no session_id, check global in_progress
  if (state.inProgress && state.inProgress.count > 0) {
    return { allow: true };
  }

  // No session_id, no in_progress, but has open work → block
  if (state.totalWork > 0) {
    return {
      allow: false,
      reason: 'no_claim_fallback',
    };
  }

  return { allow: true };
}

/**
 * Decide whether to allow or block a git commit operation.
 * Returns { allow: boolean, reason?: string, summary?: string, claimed?: string }
 */
export function decideCommitGate(ctx, state) {
  // Not a beads project → allow
  if (!ctx.isBeadsProject) {
    return { allow: true };
  }

  // bd unavailable → fail open
  if (state === null) {
    return { allow: true };
  }

  // No active claim → allow (nothing to close)
  if (!state.claimed) {
    return { allow: true };
  }

  // Claimed issue is no longer in_progress → allow (closed or transferred to another agent)
  if (!state.claimInProgress) {
    return { allow: true };
  }

  // Session's own claimed issue is still in_progress → block (need to close first)
  return {
    allow: false,
    reason: 'unclosed_claim',
    summary: `  Claimed: ${state.claimId} (still in_progress)`,
    claimed: state.claimId,
  };
}

/**
 * Decide whether to allow or block a stop operation.
 * Returns { allow: boolean, reason?: string, summary?: string, claimed?: string }
 */
export function decideStopGate(ctx, state) {
  // Not a beads project → allow
  if (!ctx.isBeadsProject) {
    return { allow: true };
  }

  // bd unavailable → fail open
  if (state === null) {
    return { allow: true };
  }

  // No active claim → allow
  if (!state.claimed) {
    // But check for global in_progress (no session_id fallback)
    if (!ctx.sessionId && state.inProgress && state.inProgress.count > 0) {
      return {
        allow: false,
        reason: 'global_in_progress',
        summary: state.inProgress.summary,
      };
    }
    return { allow: true };
  }

  // Claimed issue is no longer in_progress → allow (stale claim)
  if (!state.claimInProgress) {
    return { allow: true };
  }

  // Session's own claimed issue is still in_progress → block
  return {
    allow: false,
    reason: 'unclosed_claim',
    summary: `  Claimed: ${state.claimId} (still in_progress)`,
    claimed: state.claimId,
  };
}
