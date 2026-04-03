#!/usr/bin/env node
// xtrm-tool-logger.mjs — PostToolUse hook
// Logs every tool call to .xtrm/debug.db with kind=tool.call.
// Captures tool-specific context: cmd for Bash, file path for edits, etc.

import { readFileSync } from 'node:fs';
import { logEvent } from './xtrm-logger.mjs';
import { resolveCwd, resolveSessionId } from './beads-gate-utils.mjs';

function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf-8')); } catch { return null; }
}

function buildData(toolName, toolInput) {
  if (!toolInput) return null;
  if (toolName === 'Bash' || toolName === 'bash' || toolName === 'execute_shell_command') {
    return { cmd: (toolInput.command || '').slice(0, 120) };
  }
  if (['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
    return toolInput.file_path ? { file: toolInput.file_path } : null;
  }
  if (toolName === 'Glob')      return { pattern: toolInput.pattern, path: toolInput.path };
  if (toolName === 'Grep')      return { pattern: toolInput.pattern, path: toolInput.path };
  if (toolName === 'WebFetch')  return { url: (toolInput.url   || '').slice(0, 100) };
  if (toolName === 'WebSearch') return { query: (toolInput.query || '').slice(0, 100) };
  if (toolName === 'Agent')     return { prompt: (toolInput.prompt || '').slice(0, 80) };
  return null;
}

const input = readInput();
if (!input || input.hook_event_name !== 'PostToolUse') process.exit(0);

const toolName = input.tool_name;

// Skip tools that would create noise or cause recursion
const SKIP = new Set(['TodoRead', 'TodoWrite', 'Task', 'TaskCreate', 'TaskUpdate', 'TaskGet']);
if (SKIP.has(toolName)) process.exit(0);

const cwd = resolveCwd(input) || process.cwd();
const sessionId = resolveSessionId(input);
const isError = input.tool_response?.is_error === true;

logEvent({
  cwd,
  runtime: 'claude',
  sessionId,
  kind: 'tool.call',
  outcome: isError ? 'error' : 'ok',
  toolName,
  data: buildData(toolName, input.tool_input),
});

process.exit(0);
