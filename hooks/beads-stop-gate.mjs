#!/usr/bin/env node
// beads-stop-gate — Claude Code Stop hook
// Blocks the agent from stopping when in_progress beads issues remain.
// Forces the session close protocol before declaring done.
// Exit 0: allow stop  |  Exit 2: block stop (stderr shown to Claude)
//
// Installed by: npx --package=@jaggerxtrm/specialists install

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!existsSync(join(cwd, '.beads'))) process.exit(0);

let inProgress = 0;
let summary = '';
try {
  const output = execSync('bd list --status=in_progress', {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 8000,
  });
  inProgress = (output.match(/in_progress/g) ?? []).length;
  summary = output.trim();
} catch {
  process.exit(0);
}

if (inProgress > 0) {
  process.stderr.write(
    '\u{1F6AB} BEADS STOP GATE: Cannot stop with unresolved in_progress issues.\n' +
    'Complete the session close protocol:\n\n' +
    '  bd close <id1> <id2> ...\n' +
    '  git add <files> && git commit -m "..."\n' +
    '  git push\n\n' +
    `Open issues:\n${summary}\n`
  );
  process.exit(2);
}

process.exit(0);
