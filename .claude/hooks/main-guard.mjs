#!/usr/bin/env node
// Claude Code PreToolUse hook — block writes/commits on main/master
// Exit 0: allow  |  Exit 2: block (message shown to user)
//
// Receives JSON on stdin: {"tool_name": "...", "tool_input": {...}}

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let branch = '';
try {
  branch = execSync('git branch --show-current', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch {}

// Not in a git repo or not on a protected branch — allow
if (!branch || (branch !== 'main' && branch !== 'master')) {
  process.exit(0);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const tool = input.tool_name ?? '';
const blockMsg =
  `⛔ Direct edits on '${branch}' are not allowed.\n` +
  `Create a feature branch first: git checkout -b feature/<name>`;

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

if (WRITE_TOOLS.has(tool)) {
  process.stderr.write(blockMsg + '\n');
  process.exit(2);
}

process.exit(0);
