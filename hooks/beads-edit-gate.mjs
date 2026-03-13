#!/usr/bin/env node
// beads-edit-gate — Claude Code PreToolUse hook
// Blocks file edits when no beads issue is in_progress.
// Only active in projects with a .beads/ directory.
// Exit 0: allow  |  Exit 2: block (stderr shown to Claude)
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
try {
  const output = execSync('bd list --status=in_progress', {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 8000,
  });
  inProgress = (output.match(/^◐/gm) ?? []).length;
} catch {
  process.exit(0);
}

if (inProgress === 0) {
  process.stderr.write(
    '🚫 BEADS GATE: No active issue — create one before editing files.\n\n' +
    '  bd create --title="<what you\'re doing>" --type=task --priority=2\n' +
    '  bd update <id> --status=in_progress\n\n' +
    'Full workflow (do this every session):\n' +
    '  1. bd create + bd update in_progress   ← you are here\n' +
    '  2. Edit files / write code\n' +
    '  3. bd close <id>                        close when done\n' +
    '  4. git add <files> && git commit\n' +
    '  5. git push -u origin <feature-branch>\n' +
    '  6. gh pr create --fill && gh pr merge --squash\n' +
    '  7. git checkout master && git reset --hard origin/master\n'
  );
  process.exit(2);
}

process.exit(0);
