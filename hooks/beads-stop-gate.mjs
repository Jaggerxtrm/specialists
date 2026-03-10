#!/usr/bin/env node
// beads-stop-gate — Claude Code Stop hook
// Blocks the agent from stopping when in_progress beads issues remain.
// Exit 0: allow stop  |  Exit 2: block stop (stderr shown to Claude)
//
// Installed by: specialists install

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
    '🚫 BEADS STOP GATE: Unresolved issues — complete the session close protocol.\n\n' +
    `Open issues:\n${summary}\n\n` +
    'Session close protocol:\n' +
    '  3. bd close <id1> <id2> ...               close all in_progress issues\n' +
    '  4. git add <files> && git commit -m "..."  commit your changes\n' +
    '  5. git push -u origin <feature-branch>     push feature branch\n' +
    '  6. gh pr create --fill                     create PR\n' +
    '  7. gh pr merge --squash                    merge PR\n' +
    '  8. git checkout master && git reset --hard origin/master\n'
  );
  process.exit(2);
}

process.exit(0);
