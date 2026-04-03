#!/usr/bin/env node
// beads-commit-gate — Claude Code PreToolUse hook
// Blocks `git commit` when this session still has an unclosed claim in bd kv.
// Falls back to global in_progress check when session_id is unavailable.
// Forces: close issues first, THEN commit.
// Exit 0: allow  |  Exit 2: block (stderr shown to Claude)
//
// Installed by: xtrm install

import {
  readHookInput,
  resolveSessionContext,
  resolveClaimAndWorkState,
  decideCommitGate,
} from './beads-gate-core.mjs';
import { withSafeBdContext } from './beads-gate-utils.mjs';
import { commitBlockMessage } from './beads-gate-messages.mjs';
import { logEvent } from './xtrm-logger.mjs';

const input = readHookInput();
if (!input) process.exit(0);

if ((input.tool_name ?? '') !== 'Bash') process.exit(0);

const command = input.tool_input?.command ?? '';
// Strip quoted strings to avoid matching patterns inside --reason "..." or similar args
const commandUnquoted = command.replace(/'[^']*'|"[^"]*"/g, '');

if (/\bspecialists\s+(run|resume|result|feed|stop|status)\b/.test(commandUnquoted)) {
  process.exit(0);
}

withSafeBdContext(() => {
  const ctx = resolveSessionContext(input);
  if (!ctx || !ctx.isBeadsProject) process.exit(0);

  // Only intercept git commit for the claim-gate check
  if (!/\bgit\s+commit\b/.test(commandUnquoted)) process.exit(0);

  const state = resolveClaimAndWorkState(ctx);
  const decision = decideCommitGate(ctx, state);

  if (decision.allow) {
    logEvent({
      cwd: ctx.cwd,
      runtime: 'claude',
      sessionId: ctx.sessionId,
      layer: 'gate',
      kind: 'gate.commit.allow',
      outcome: 'allow',
      toolName: 'Bash',
      issueId: state?.claimId ?? null,
    });
    process.exit(0);
  }

  // Block with structured decision
  const reason = commitBlockMessage(decision.summary, decision.claimed);
  logEvent({
    cwd: ctx.cwd,
    runtime: 'claude',
    sessionId: ctx.sessionId,
    layer: 'gate',
    kind: 'gate.commit.block',
    outcome: 'block',
    toolName: 'Bash',
    issueId: decision.claimed ?? null,
    message: reason,
    extra: { reason_code: decision.reason },
  });
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.stdout.write('\n');
  process.exit(0);
});
