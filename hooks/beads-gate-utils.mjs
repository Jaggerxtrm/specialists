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
  } catch {
    process.exit(0);
  }
}
