#!/usr/bin/env node
// specialists-complete — Claude Code UserPromptSubmit/PostToolUse hook
// Checks .specialists/ready/ for completed background job markers and injects
// completion/failure banners into Claude's context.
//
// Reads job metadata via `sp ps --json --all` (DB-canonical in v3.9.0+).
// Falls back to .specialists/jobs/<id>/status.json only when
// SPECIALISTS_JOB_FILE_OUTPUT=on for legacy installs.
//
// Installed by: specialists install

import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const readyDir = join(cwd, '.specialists', 'ready');

if (!existsSync(readyDir)) process.exit(0);

let markers;
try {
  markers = readdirSync(readyDir).filter(f => !f.startsWith('.'));
} catch {
  process.exit(0);
}

if (markers.length === 0) process.exit(0);

function readDbMetadata() {
  const result = spawnSync('sp', ['ps', '--json', '--all'], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 3000,
    maxBuffer: 32 * 1024 * 1024,
    encoding: 'utf-8',
  });
  if (result.status !== 0 || !result.stdout) return new Map();

  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { return new Map(); }

  const byId = new Map();
  if (Array.isArray(parsed?.flat)) {
    for (const job of parsed.flat) if (job?.id) byId.set(job.id, job);
    return byId;
  }
  // Fallback: walk trees (older schema)
  const walk = (n) => {
    if (n?.id) byId.set(n.id, n);
    (n?.children ?? []).forEach(walk);
  };
  (parsed?.trees ?? []).forEach(walk);
  (parsed?.standalone ?? []).forEach(walk);
  return byId;
}

function readStatusJson(jobId) {
  if (process.env.SPECIALISTS_JOB_FILE_OUTPUT !== 'on') return null;
  const statusPath = join(cwd, '.specialists', 'jobs', jobId, 'status.json');
  if (!existsSync(statusPath)) return null;
  try { return JSON.parse(readFileSync(statusPath, 'utf-8')); } catch { return null; }
}

function buildBanner(jobId, meta) {
  if (!meta) {
    return `[Specialist job ${jobId} completed. Run: specialists result ${jobId}]`;
  }
  const specialist = meta.specialist ?? jobId;
  const elapsed = typeof meta.elapsed_s === 'number' ? `, ${meta.elapsed_s}s` : '';
  const error = meta.error ? ` — ${meta.error}` : '';

  if (meta.status === 'error') {
    return `[Specialist '${specialist}' failed (job ${jobId}${elapsed}${error}). Run: specialists feed ${jobId} --follow]`;
  }
  return `[Specialist '${specialist}' completed (job ${jobId}${elapsed}). Run: specialists result ${jobId}]`;
}

const dbJobs = readDbMetadata();
const banners = [];

for (const jobId of markers) {
  const markerPath = join(readyDir, jobId);
  try {
    const meta = dbJobs.get(jobId) ?? readStatusJson(jobId);
    banners.push(buildBanner(jobId, meta));
    unlinkSync(markerPath);
  } catch {
    try { unlinkSync(markerPath); } catch { /* ignore */ }
  }
}

if (banners.length === 0) process.exit(0);

process.stdout.write(JSON.stringify({
  type: 'inject',
  content: banners.join('\n'),
}) + '\n');
