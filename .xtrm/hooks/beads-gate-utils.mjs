#!/usr/bin/env node
// beads-gate-utils.mjs — shared infrastructure for beads gate hooks
// Import from sibling hooks using: import { ... } from './beads-gate-utils.mjs';
// Static ES module imports resolve relative to the importing file's location,
// not CWD, so this works regardless of the project directory.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Resolve project cwd from hook input JSON. */
export function resolveCwd(input) {
  return input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

/**
 * Resolve a stable session key for beads hooks.
 * Priority: explicit hook session id -> cwd fallback.
 */
export function resolveSessionId(input) {
  return input?.session_id ?? input?.sessionId ?? resolveCwd(input);
}

/** Return true if the directory contains a .beads project. */
export function isBeadsProject(cwd) {
  return existsSync(join(cwd, '.beads'));
}

/**
 * Get the claimed issue ID for a session from bd kv.
 * Returns: issue ID string if claimed, '' if not set, null if bd kv unavailable.
 * Note: bd kv get exits 1 for missing keys — execSync throws, so we check err.status.
 */
export function getSessionClaim(sessionId, cwd) {
  try {
    return execSync(`bd kv get "claimed:${sessionId}"`, {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
  } catch (err) {
    if (err.status === 1) return ''; // key not found — no claim
    return null;                     // command failed — bd kv unavailable
  }
}

/**
 * Check for a bead-based claim set by specialist runner.
 * Used as a fallback when session-scoped claim (claimed:<sessionId>) is not available.
 * Returns: issue ID string if claimed, '' if not set, null if bd kv unavailable.
 */
export function getBeadClaim(cwd) {
  try {
    const listOutput = execSync('bd kv list', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    const match = listOutput.match(/bead-claim:([A-Za-z0-9-]+)\s*=\s*(.+)/);
    if (match) return match[1];
    return '';
  } catch (err) {
    if (err.status === 1) return '';
    return null;
  }
}

/**
 * Parse work counts from a bd list output string.
 * Reads the "Total: N issues (X open, Y in progress)" summary line.
 * Returns { open, inProgress } or null if the line is absent.
 *
 * This is more reliable than counting symbols or tokens: the Total line is
 * a structured summary that doesn't depend on status-legend text or box-drawing
 * characters, and it's present in all non-empty bd list outputs.
 */
function parseCounts(output) {
  const m = output.match(/Total:\s*\d+\s+issues?\s*\((\d+)\s+open,\s*(\d+)\s+in progress\)/);
  if (!m) return null;
  return { open: parseInt(m[1], 10), inProgress: parseInt(m[2], 10) };
}

/**
 * Get in_progress issues as { count, summary }.
 * Returns null if bd is unavailable.
 */
export function getInProgress(cwd) {
  try {
    const output = execSync('bd list --status=in_progress', {
      encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 8000,
    });
    const counts = parseCounts(output);
    return {
      count: counts?.inProgress ?? 0,
      summary: output.trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Return true if a specific issue ID is currently in in_progress status.
 * Used by commit/stop gates to scope the check to the session's own claimed issue.
 * Returns false (fail open) if bd is unavailable.
 */
export function isIssueInProgress(issueId, cwd) {
  if (!issueId) return false;
  try {
    const output = execSync('bd list --status=in_progress', {
      encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 8000,
    });
    return output.includes(issueId);
  } catch {
    return false;
  }
}

/**
 * Count total trackable work (open + in_progress issues) using a single bd list call.
 * Returns the count, or null if bd is unavailable.
 */
export function getTotalWork(cwd) {
  try {
    // Use default status filter (non-closed) and parse Total summary.
    // Repeating --status is not additive in bd CLI and can collapse to one status.
    const output = execSync('bd list', {
      encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 8000,
    });
    const counts = parseCounts(output);
    if (!counts) return 0; // "No issues found." — nothing to track
    return counts.open + counts.inProgress;
  } catch {
    return null;
  }
}

/**
 * Get the closed-this-session issue ID for a session from bd kv.
 * Returns: issue ID string if set, '' if not set, null if bd kv unavailable.
 */
export function getClosedThisSession(sessionId, cwd) {
  try {
    return execSync(`bd kv get "closed-this-session:${sessionId}"`, {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
  } catch (err) {
    if (err.status === 1) return ''; // key not found
    return null;                     // bd kv unavailable
  }
}

/**
 * If cwd is inside a .xtrm/worktrees/<name> directory, return the worktree root path.
 * Returns null if not in a worktree.
 */
export function resolveWorktreeRoot(cwd) {
  const m = cwd.match(/^(.+\/\.xtrm\/worktrees\/[^/]+)/);
  return m ? m[1] : null;
}

/**
 * Clear the session claim key from bd kv. Non-fatal — best-effort cleanup.
 */
export function clearSessionClaim(sessionId, cwd) {
  try {
    execSync(`bd kv clear "claimed:${sessionId}"`, {
      encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000,
    });
  } catch {
    // non-fatal
  }
}

/**
 * Option C: wrap hook body with uniform fail-open error handling.
 * Any unexpected top-level throw exits 0 (allow) rather than crashing visibly.
 *
 * Usage:
 *   withSafeBdContext(() => {
 *     // hook logic here — call process.exit() to set exit code
 *   });
 */
export function withSafeBdContext(fn) {
  try {
    fn();
  } catch (err) {
    if (err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError) {
      throw err;
    }
    process.exit(0);
  }
}
