#!/usr/bin/env node
// worktree-boundary.mjs — Claude Code PreToolUse hook
// Blocks Write/Edit when the target file is outside the active worktree root.
// Only active when session cwd is inside .xtrm/worktrees/<name>.
// Fail-open: any unexpected error allows the edit through.
//
// Installed by: xtrm install

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const filePath = input?.tool_input?.file_path;
if (!filePath) process.exit(0);

// Detect worktree root from cwd
const m = cwd.match(/^(.+\/\.xtrm\/worktrees\/[^/]+)/);
if (!m) process.exit(0); // not in a worktree — no constraint

const worktreeRoot = m[1];
const abs = resolve(cwd, filePath);

if (abs === worktreeRoot || abs.startsWith(worktreeRoot + '/')) process.exit(0);

process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: `🚫 Edit outside worktree boundary.\n  File:    ${abs}\n  Allowed: ${worktreeRoot}\n\n  All edits must stay within the active worktree.`,
}));
process.stdout.write('\n');
process.exit(0);
