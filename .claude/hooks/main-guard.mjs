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

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

if (WRITE_TOOLS.has(tool)) {
  process.stderr.write(
    `⛔ You are on '${branch}' — never edit files directly on master.\n\n` +
    'Full workflow:\n' +
    '  1. git checkout -b feature/<name>         ← start here\n' +
    '  2. bd create + bd update in_progress      track your work\n' +
    '  3. Edit files / write code\n' +
    '  4. bd close <id> && git add && git commit\n' +
    '  5. git push -u origin feature/<name>\n' +
    '  6. gh pr create --fill && gh pr merge --squash\n' +
    '  7. git checkout master && git reset --hard origin/master\n'
  );
  process.exit(2);
}

// Block direct commits and pushes to master — use feature branches + gh pr create/merge
if (tool === 'Bash') {
  const cmd = (input.tool_input?.command ?? '').trim().replace(/\s+/g, ' ');

  if (/^git commit/.test(cmd)) {
    process.stderr.write(
      `⛔ Don't commit directly to '${branch}' — use a feature branch.\n\n` +
      'Full workflow:\n' +
      '  1. git checkout -b feature/<name>         ← start here\n' +
      '  2. bd create + bd update in_progress      track your work\n' +
      '  3. Edit files / write code\n' +
      '  4. bd close <id> && git add && git commit\n' +
      '  5. git push -u origin feature/<name>\n' +
      '  6. gh pr create --fill && gh pr merge --squash\n' +
      '  7. git checkout master && git reset --hard origin/master\n'
    );
    process.exit(2);
  }

  if (/^git push/.test(cmd)) {
    const tokens = cmd.split(' ');
    const lastToken = tokens[tokens.length - 1];
    const explicitMaster = /^(master|main)$/.test(lastToken) || /:(master|main)$/.test(lastToken);
    const impliedMaster = tokens.length <= 3 && (branch === 'main' || branch === 'master');
    if (explicitMaster || impliedMaster) {
      process.stderr.write(
        `⛔ Don't push directly to '${branch}' — use the PR workflow.\n\n` +
        'Next steps:\n' +
        '  5. git push -u origin <feature-branch>     ← push your branch\n' +
        '  6. gh pr create --fill                      create PR\n' +
        '     gh pr merge --squash                     merge it\n' +
        '  7. git checkout master                      sync master\n' +
        '     git reset --hard origin/master\n\n' +
        'If you\'re not on a feature branch yet:\n' +
        '  git checkout -b feature/<name>    (then re-commit and push)\n'
      );
      process.exit(2);
    }
  }
}

process.exit(0);
