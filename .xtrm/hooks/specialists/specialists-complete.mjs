#!/usr/bin/env node
// specialists-complete — Claude Code UserPromptSubmit/PostToolUse hook
// Checks .specialists/ready/ for completed background job markers and injects
// completion/failure banners into Claude's context.
//
// Installed by: specialists install

import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const readyDir = join(cwd, '.specialists', 'ready');

// Exit silently if no ready dir or nothing to report
if (!existsSync(readyDir)) process.exit(0);

let markers;
try {
  markers = readdirSync(readyDir).filter(f => !f.startsWith('.'));
} catch {
  process.exit(0);
}

if (markers.length === 0) process.exit(0);

const banners = [];

function readDbMetadata(jobId) {
  const poll = spawnSync('sp', ['poll', jobId, '--cursor', '999999999', '--json'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 2000,
    encoding: 'utf-8',
  });

  if (poll.error || poll.status !== 0 || !poll.stdout) return null;

  let parsed;
  try {
    parsed = JSON.parse(poll.stdout);
  } catch {
    return null;
  }

  const specialist = parsed.specialist;
  const elapsedMs = parsed.elapsed_ms;
  const status = parsed.status;
  const error = parsed.error;

  if (specialist === undefined && elapsedMs === undefined && status === undefined && error === undefined) {
    return null;
  }

  return { specialist, elapsed_ms: elapsedMs, status, error };
}

function readStatusJson(jobId) {
  const statusPath = join(cwd, '.specialists', 'jobs', jobId, 'status.json');
  if (!existsSync(statusPath)) return null;

  try {
    return JSON.parse(readFileSync(statusPath, 'utf-8'));
  } catch {
    return null;
  }
}

function buildBanner(jobId, metadata, hasStatusFile) {
  const specialist = metadata?.specialist ?? jobId;
  const elapsed = metadata?.elapsed_ms !== undefined ? `, ${Math.round(metadata.elapsed_ms / 1000)}s` : '';
  const completionStatus = metadata?.status ?? 'done';
  const errorMessage = metadata?.error ? ` — ${metadata.error}` : '';

  if (completionStatus === 'error') {
    return `[Specialist ${specialist} failed (job ${jobId}${elapsed}${errorMessage}). Run: specialists feed ${jobId} --follow]`;
  }

  if (metadata) {
    return `[Specialist ${specialist} completed (job ${jobId}${elapsed}). Run: specialists result ${jobId}]`;
  }

  if (hasStatusFile) {
    return `[Specialist ${jobId} completed (job ${jobId}). Run: specialists result ${jobId}]`;
  }

  return `[Specialist job ${jobId} completed. Run: sp poll ${jobId}]`;
}

for (const jobId of markers) {
  const markerPath = join(readyDir, jobId);

  try {
    const dbMetadata = readDbMetadata(jobId);
    const status = dbMetadata ?? (process.env.SPECIALISTS_JOB_FILE_OUTPUT === 'on' ? readStatusJson(jobId) : null);
    const hasStatusFile = process.env.SPECIALISTS_JOB_FILE_OUTPUT === 'on' && status !== null;

    banners.push(buildBanner(jobId, status, hasStatusFile));

    // Delete marker so it only fires once
    unlinkSync(markerPath);
  } catch {
    // Ignore malformed entries
    try { unlinkSync(markerPath); } catch { /* ignore */ }
  }
}

if (banners.length === 0) process.exit(0);

// UserPromptSubmit/PostToolUse hooks inject content via JSON
process.stdout.write(JSON.stringify({
  type: 'inject',
  content: banners.join('\n'),
}) + '\n');
