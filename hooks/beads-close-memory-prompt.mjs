#!/usr/bin/env node
// beads-close-memory-prompt — Claude Code PostToolUse hook
// After `bd close`: injects a short reminder into Claude's context to capture
// knowledge and consider underused beads features.
// Output to stdout is shown to Claude as additional context.
//
// Installed by: specialists install

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

// Only fire on Bash tool
if (input.tool_name !== 'Bash') process.exit(0);

const cmd = (input.tool_input?.command ?? '').trim();

// Only fire when the command is `bd close ...`
if (!/\bbd\s+close\b/.test(cmd)) process.exit(0);

// Only fire in projects that use beads
const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!existsSync(join(cwd, '.beads'))) process.exit(0);

// Inject reminder into Claude's context
process.stdout.write(
  '\n[beads] Issue(s) closed. Before moving on:\n\n' +
  '  Knowledge worth keeping?\n' +
  '    bd remember "key insight from this work"\n' +
  '    bd memories <keyword>   -- search what is already stored\n\n' +
  '  Discovered related work while implementing?\n' +
  '    bd create --title="..." --deps=discovered-from:<id>\n\n' +
  '  Underused features to consider:\n' +
  '    bd dep add <a> <b>   -- link blocking relationships between issues\n' +
  '    bd graph             -- visualize issue dependency graph\n' +
  '    bd orphans           -- issues referenced in commits but still open\n' +
  '    bd preflight         -- PR readiness checklist before gh pr create\n' +
  '    bd stale             -- issues not touched recently\n'
);

process.exit(0);
