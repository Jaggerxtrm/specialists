#!/usr/bin/env node
// beads-edit-gate — Claude Code PreToolUse hook
// Blocks file edits when no beads issue is in_progress.
// Only active in projects with a .beads/ directory.
// Exit 0: allow  |  Exit 2: block (stderr shown to Claude)
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
try {
  const output = execSync('bd list --status=in_progress', {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 8000,
  });
  inProgress = (output.match(/in_progress/g) ?? []).length;
} catch {
  process.exit(0);
}

if (inProgress === 0) {
  process.stderr.write(
    '\u{1F6AB} BEADS GATE: No in_progress issue tracked.\n' +
    'You MUST create and claim a beads issue BEFORE editing any file:\n\n' +
    '  bd create --title="<task summary>" --type=task --priority=2\n' +
    '  bd update <id> --status=in_progress\n\n' +
    'No exceptions. Momentum is not an excuse.\n'
  );
  process.exit(2);
}

process.exit(0);
