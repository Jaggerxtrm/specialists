#!/usr/bin/env node
// Claude Code PreToolUse hook — block writes and direct master pushes
// Exit 0: allow  |  Exit 2: block (message shown to user)
//
// Installed by: specialists install

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

// Block direct pushes to master — agents must use feature branches + gh pr create/merge
if (tool === 'Bash') {
  const cmd = (input.tool_input?.command ?? '').trim().replace(/\s+/g, ' ');
  if (/^git push/.test(cmd)) {
    const tokens = cmd.split(' ');
    const lastToken = tokens[tokens.length - 1];
    const explicitMaster = /^(master|main)$/.test(lastToken) || /:(master|main)$/.test(lastToken);
    const impliedMaster = tokens.length <= 3 && (branch === 'main' || branch === 'master');
    if (explicitMaster || impliedMaster) {
      process.stderr.write(
        `⛔ Direct push to '${branch}' is not allowed.\n` +
        `Use the PR workflow instead:\n` +
        `  git push -u origin <feature-branch>\n` +
        `  gh pr create --fill\n` +
        `  gh pr merge --squash\n`
      );
      process.exit(2);
    }
  }
}

process.exit(0);
