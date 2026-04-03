#!/usr/bin/env node
// beads-stop-gate — Claude Code Stop hook
// Blocks the agent from stopping when this session has an unclosed claim in bd kv.
// Also blocks when xtrm session state indicates unfinished closure phases.
// Exit 0: allow stop  |  Exit 2: block stop (stderr shown to Claude)

import {
  readHookInput,
  resolveSessionContext,
  resolveClaimAndWorkState,
  decideStopGate,
} from './beads-gate-core.mjs';
import { withSafeBdContext } from './beads-gate-utils.mjs';
import { stopBlockMessage } from './beads-gate-messages.mjs';
import { logEvent } from './xtrm-logger.mjs';

const input = readHookInput();
if (!input) process.exit(0);

withSafeBdContext(() => {
  const ctx = resolveSessionContext(input);
  if (!ctx || !ctx.isBeadsProject) process.exit(0);

  const state = resolveClaimAndWorkState(ctx);
  const decision = decideStopGate(ctx, state);

  if (!decision.allow) {
    const message = stopBlockMessage(decision.summary, decision.claimed);
    logEvent({
      cwd: ctx.cwd,
      runtime: 'claude',
      sessionId: ctx.sessionId,
      layer: 'gate',
      kind: 'gate.stop.nudge',
      outcome: 'nudge',
      issueId: decision.claimed ?? null,
      message,
      extra: { reason_code: decision.reason },
    });
    process.stdout.write(JSON.stringify({ additionalContext: message }) + '\n');
    process.exit(0);
  }

  logEvent({
    cwd: ctx.cwd,
    runtime: 'claude',
    sessionId: ctx.sessionId,
    layer: 'gate',
    kind: 'session.end',
    outcome: 'allow',
  });
  process.exit(0);
});
