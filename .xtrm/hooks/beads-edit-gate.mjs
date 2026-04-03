#!/usr/bin/env node
// beads-edit-gate — Claude Code PreToolUse hook
// Blocks file edits when this session has not claimed a beads issue via bd kv.
// Falls back to global in_progress check when session_id is unavailable.
// Only active in projects with a .beads/ directory.
// Exit 0: allow  |  Exit 2: block (stderr shown to Claude)
//
// Installed by: xtrm install

import {
  readHookInput,
  resolveSessionContext,
  resolveClaimAndWorkState,
  decideEditGate,
  decideWorktreeBoundary,
} from './beads-gate-core.mjs';
import { withSafeBdContext, resolveCwd, resolveSessionId } from './beads-gate-utils.mjs';
import { editBlockMessage, editBlockFallbackMessage } from './beads-gate-messages.mjs';
import { logEvent } from './xtrm-logger.mjs';

const input = readHookInput();
if (!input) process.exit(0);

// Worktree boundary check — independent of beads, fires first
const _cwd = resolveCwd(input);
const _boundary = decideWorktreeBoundary(input, _cwd);
if (!_boundary.allow) {
  const _wbReason = `🚫 Edit outside worktree boundary.\n  File:    ${_boundary.filePath}\n  Allowed: ${_boundary.worktreeRoot}\n\n  All edits must stay within the active worktree.`;
  logEvent({
    cwd: _cwd,
    runtime: 'claude',
    sessionId: resolveSessionId(input),
    layer: 'gate',
    kind: 'gate.worktree.block',
    outcome: 'block',
    toolName: input.tool_name,
    message: _wbReason,
    extra: { file: _boundary.filePath, worktree_root: _boundary.worktreeRoot },
  });
  process.stdout.write(JSON.stringify({ decision: 'block', reason: _wbReason }));
  process.stdout.write('\n');
  process.exit(0);
}

withSafeBdContext(() => {
  const ctx = resolveSessionContext(input);
  if (!ctx || !ctx.isBeadsProject) process.exit(0);

  const state = resolveClaimAndWorkState(ctx);
  const decision = decideEditGate(ctx, state);

  if (decision.allow) {
    logEvent({
      cwd: ctx.cwd,
      runtime: 'claude',
      sessionId: ctx.sessionId,
      layer: 'gate',
      kind: 'gate.edit.allow',
      outcome: 'allow',
      toolName: input.tool_name,
      issueId: state?.claimId ?? null,
      extra: { file: input.tool_input?.file_path ?? null },
    });
    process.exit(0);
  }

  // Block with appropriate message
  const reason = decision.reason === 'no_claim_with_work'
    ? editBlockMessage(decision.sessionId)
    : editBlockFallbackMessage();
  logEvent({
    cwd: ctx.cwd,
    runtime: 'claude',
    sessionId: ctx.sessionId,
    layer: 'gate',
    kind: 'gate.edit.block',
    outcome: 'block',
    toolName: input.tool_name,
    message: reason,
    extra: { file: input.tool_input?.file_path ?? null, reason_code: decision.reason },
  });
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.stdout.write('\n');
  process.exit(0);
});
