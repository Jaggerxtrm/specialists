#!/usr/bin/env node
// beads-gate-messages.mjs — centralized message templates for beads gate hooks
// Import from sibling hooks using: import { ... } from './beads-gate-messages.mjs';
//
// All user-facing strings live here. Edit this file to change messaging.
// Policy logic lives in beads-gate-core.mjs.

// ── Shared workflow steps ────────────────────────────────────────────

export const SESSION_CLOSE_PROTOCOL =
  '  bd close <id> --reason="..."\n' +
  '  xt end\n';

export const COMMIT_NEXT_STEPS =
  '  bd close <id> --reason="..."   ← closes issue\n' +
  '  xt end                          ← push, PR, merge, worktree cleanup\n';

// ── Edit gate messages ───────────────────────────────────────────

export function editBlockMessage(_sessionId) {
  return (
    '🚫 No active claim — claim an issue first.\n' +
    '  bd update <id> --claim\n'
  );
}

export function editBlockFallbackMessage() {
  return (
    '🚫 No active issue — create one before editing.\n' +
    '  bd create --title="<task>" --type=task --priority=2\n' +
    '  bd update <id> --claim\n'
  );
}

// ── Commit gate messages ─────────────────────────────────────────

export function commitBlockMessage(summary, claimed) {
  const issueSummary = summary ?? `  Claimed: ${claimed}`;
  return (
    '🚫 Close open issues before committing.\n\n' +
    `${issueSummary}\n\n` +
    'Next steps:\n' + COMMIT_NEXT_STEPS
  );
}

// ── Stop gate messages ───────────────────────────────────────────

export function stopBlockMessage(summary, claimed) {
  const issueSummary = summary ?? `  Claimed: ${claimed}`;
  return (
    '🚫 Unresolved issues — close before stopping.\n\n' +
    `${issueSummary}\n\n` +
    'Next steps:\n' + SESSION_CLOSE_PROTOCOL
  );
}

// ── Memory gate messages ─────────────────────────────────────────

export function memoryPromptMessage(claimId, sessionId) {
  const claimLine = claimId ? `claim \`${claimId}\` was closed.\n` : '';
  const ackCmd = `bd kv set "memory-gate-done:${sessionId}"`;
  return (
    `\u25cf Memory gate: ${claimLine}` +
    'For each candidate insight, check ALL 4:\n' +
    '  1. Hard to rediscover from code/docs?\n' +
    '  2. Not obvious from the current implementation?\n' +
    '  3. Will affect a future decision?\n' +
    '  4. Still relevant in ~14 days?\n' +
    'KEEP (all 4 yes) → `bd remember "<insight>"`\n' +
    'SKIP examples: file maps, flag inventories, per-issue summaries,\n' +
    '  wording tweaks, facts obvious from reading the source.\n' +
    `KEEP: \`${ackCmd} "saved: <key>"\`\n` +
    `SKIP: \`${ackCmd} "nothing novel — <one-line reason>"\`\n`
  );
}
