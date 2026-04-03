#!/usr/bin/env node
// xtrm-session-logger.mjs — SessionStart hook
// Logs session.start to .xtrm/debug.db so every session has a clear entry point.

import { readFileSync } from 'node:fs';
import { logEvent } from './xtrm-logger.mjs';
import { resolveCwd, resolveSessionId } from './beads-gate-utils.mjs';

function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf-8')); } catch { return null; }
}

const input = readInput();
if (!input) process.exit(0);

const cwd = resolveCwd(input) || process.cwd();
const sessionId = resolveSessionId(input);

logEvent({
  cwd,
  runtime: 'claude',
  sessionId,
  kind: 'session.start',
  outcome: 'ok',
});

process.exit(0);
