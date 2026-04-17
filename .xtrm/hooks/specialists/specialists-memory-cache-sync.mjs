#!/usr/bin/env node
// specialists-memory-cache-sync — PostToolUse hook
// Keeps local memories FTS cache fresh after memory writes and git commits.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    return null;
  }
}

function shouldSync(command) {
  if (!command || typeof command !== 'string') return false;
  const normalized = command.trim();
  if (normalized.length === 0) return false;

  return (
    /(^|\s)git\s+commit(\s|$)/.test(normalized)
    || /(^|\s)git\s+merge(\s|$)/.test(normalized)
    || /(^|\s)xt\s+memory\s+update(\s|$)/.test(normalized)
    || /(^|\s)bd\s+remember(\s|$)/.test(normalized)
  );
}

function runSync(cwd, forceRefresh) {
  const commandArgs = forceRefresh
    ? ['memory', 'refresh', '--json']
    : ['memory', 'sync', '--force', '--json'];

  spawnSync('specialists', commandArgs, {
    cwd,
    stdio: 'ignore',
    timeout: 10000,
    env: process.env,
  });
}

function main() {
  const input = readInput();
  if (!input || input.hook_event_name !== 'PostToolUse') return;

  const toolName = input.tool_name;
  if (toolName !== 'Bash' && toolName !== 'bash' && toolName !== 'execute_shell_command') return;

  const command = input.tool_input?.command;
  if (!shouldSync(command)) return;

  const cwd = input.cwd ?? process.cwd();
  const forceRefresh = /(^|\s)xt\s+memory\s+update(\s|$)/.test(command);
  runSync(cwd, forceRefresh);
}

main();
