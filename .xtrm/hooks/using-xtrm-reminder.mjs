#!/usr/bin/env node
// using-xtrm-reminder.mjs — Claude Code SessionStart hook
// Reads skills/using-xtrm/SKILL.md and injects it as additionalSystemPrompt
// so the agent starts every session already oriented on the xtrm workflow.
// Exit 0 in all paths (fail open).

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const cwd = input?.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const preferredSkillPath = resolve(cwd, '.xtrm', 'skills', 'default', 'using-xtrm', 'SKILL.md');

if (!existsSync(preferredSkillPath)) process.exit(0);

let content;
try {
  content = readFileSync(preferredSkillPath, 'utf8');
} catch {
  process.exit(0);
}

// Strip YAML frontmatter (--- ... ---\n)
content = content.replace(/^---[\s\S]*?---\n/, '').trim();

// Append .xtrm/memory.md if it exists in the project
const memoryPath = resolve(cwd, '.xtrm', 'memory.md');
if (existsSync(memoryPath)) {
  try {
    const memory = readFileSync(memoryPath, 'utf8').trim();
    if (memory) {
      content += '\n\n---\n\n' + memory;
    }
  } catch { /* fail open */ }
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalSystemPrompt: content,
    },
  }) + '\n',
);
process.exit(0);
