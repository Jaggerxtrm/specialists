#!/usr/bin/env node
// SessionStart hook — verify quality gate environment is intact.
// Checks for tsc, eslint, ruff so the agent knows early if enforcement
// is silently degraded. Exits 0 always (informational only).

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// Only relevant in projects that have quality gates wired
const hookPresent = existsSync(path.resolve(cwd, '.xtrm', 'hooks', 'quality-check.cjs'));

if (!hookPresent) process.exit(0);

function which(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    // fall through to local node_modules probe
  }
  // Check node_modules/.bin/ walking up from cwd
  let dir = cwd;
  while (true) {
    if (existsSync(path.join(dir, 'node_modules', '.bin', cmd))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

const warnings = [];

// CLAUDE_PROJECT_DIR check
if (!process.env.CLAUDE_PROJECT_DIR) {
  warnings.push('CLAUDE_PROJECT_DIR is not set — quality gate may target wrong directory');
}

// TypeScript project checks
const hasTsConfig = existsSync(path.join(cwd, 'tsconfig.json')) ||
  existsSync(path.join(cwd, 'cli', 'tsconfig.json'));

if (hasTsConfig) {
  if (!which('tsc')) warnings.push('tsc not found — TypeScript compilation check will be skipped');
  const hasEslintConfig = ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml']
    .some(f => existsSync(path.join(cwd, f)));
  if (hasEslintConfig && !which('eslint')) warnings.push('eslint not found — ESLint check will be skipped');
}

// Python project checks
const hasPyFiles = existsSync(path.join(cwd, 'pyproject.toml')) ||
  existsSync(path.join(cwd, 'setup.py')) ||
  existsSync(path.join(cwd, 'requirements.txt'));

if (hasPyFiles) {
  if (!which('ruff')) warnings.push('ruff not found — Python lint check will be skipped');
}

if (warnings.length === 0) process.exit(0);

const msg = `⚠️ Quality gate environment issue(s) detected:\n${warnings.map(w => `  • ${w}`).join('\n')}\nFix these to ensure quality gates enforce correctly.`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { additionalSystemPrompt: msg },
}));
process.exit(0);
