#!/usr/bin/env node
// beads-memory-gate — Claude Code Stop hook
// At session end, checks if the session's claimed issue was closed.
// If so, hard-blocks until the agent persists insights via `bd remember`.
// Self-contained: queries claim kv + bd show directly (no PostToolUse dependency).
// Exit 0: allow stop  |  Exit 2: block stop (stderr shown to Claude)
//
// Installed by: xtrm install

import { execSync } from 'node:child_process';
import { readHookInput } from './beads-gate-core.mjs';
import { resolveCwd, resolveSessionId, isBeadsProject, clearSessionClaim } from './beads-gate-utils.mjs';
import { memoryPromptMessage } from './beads-gate-messages.mjs';
import { logEvent } from './xtrm-logger.mjs';

const input = readHookInput();
if (!input) process.exit(0);

const cwd = resolveCwd(input);
if (!cwd || !isBeadsProject(cwd)) process.exit(0);

const sessionId = resolveSessionId(input);

// ── Fast path: agent already acked the memory gate ──────────────────────────
let memoryGateDone = false;
try {
  execSync(`bd kv get "memory-gate-done:${sessionId}"`, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 5000,
  });
  memoryGateDone = true;
} catch { /* key not set → not done */ }

if (memoryGateDone) {
  // Clean up session markers EXCEPT memory-gate-done (must persist as sentinel
  // to prevent re-triggering — claimed:<sessionId> or branch inference can
  // re-discover the issue ID after cleanup, causing an infinite loop).
  for (const key of [`claimed:${sessionId}`, `closed-this-session:${sessionId}`]) {
    try { execSync(`bd kv clear "${key}"`, { cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }); } catch { /* ignore */ }
  }
  clearSessionClaim(sessionId, cwd);
  logEvent({ cwd, runtime: 'claude', sessionId, layer: 'gate', kind: 'gate.memory.acked', outcome: 'allow' });
  process.exit(0);
}

function getKvValue(key) {
  try {
    return execSync(`bd kv get "${key}"`, {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function inferIssueIdFromBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    if (!branch || branch === 'HEAD') return null;

    // Matches issue IDs in common branch naming schemes:
    // feature/xtrm-86z0-foo, fix/xtrm-ab12, xtrm-86z0
    const match = branch.match(/(?:^|\/)([a-z][a-z0-9]*-[a-z0-9]{3,})(?:-|$)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// ── Resolve candidate issue for session-end memory gate ───────────────────────
// 1) claimed:<sessionId> (normal path)
// 2) closed-this-session:<sessionId> (PostToolUse close marker)
// 3) branch-derived issue ID (defense-in-depth when hooks were bypassed)
const claimedIssueId =
  getKvValue(`claimed:${sessionId}`) ??
  getKvValue(`closed-this-session:${sessionId}`) ??
  inferIssueIdFromBranch();

if (!claimedIssueId) process.exit(0);

// Query bd to check if the claimed issue is closed
let issueStatus = null;
try {
  const raw = execSync(`bd show ${claimedIssueId} --json`, {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 5000,
  });
  const parsed = JSON.parse(raw);
  const issue = Array.isArray(parsed) ? parsed[0] : parsed;
  issueStatus = issue?.status;
} catch {
  process.exit(0); // fail open
}

if (issueStatus !== 'closed') process.exit(0);

// ── Issue was closed — hard-block until agent acks ──────────────────────────
const memoryMessage = memoryPromptMessage(claimedIssueId, sessionId);
logEvent({
  cwd,
  runtime: 'claude',
  sessionId,
  layer: 'gate',
  kind: 'gate.memory.blocked',
  outcome: 'block',
  issueId: claimedIssueId,
  message: memoryMessage,
});
process.stderr.write(memoryMessage + '\n');
process.exit(2);
