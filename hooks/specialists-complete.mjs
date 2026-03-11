#!/usr/bin/env node
// specialists-complete — Claude Code UserPromptSubmit hook
// Checks .specialists/ready/ for completed background job markers and injects
// completion banners into Claude's context.
//
// Installed by: specialists install

import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
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

for (const jobId of markers) {
  const markerPath = join(readyDir, jobId);
  const statusPath = join(cwd, '.specialists', 'jobs', jobId, 'status.json');

  try {
    let specialist = jobId;
    let elapsed = '';

    if (existsSync(statusPath)) {
      const status = JSON.parse(readFileSync(statusPath, 'utf-8'));
      specialist = status.specialist ?? jobId;
      elapsed = status.elapsed_s !== undefined ? `, ${status.elapsed_s}s` : '';
    }

    banners.push(
      `[Specialist '${specialist}' completed (job ${jobId}${elapsed}). Run: specialists result ${jobId}]`
    );

    // Delete marker so it only fires once
    unlinkSync(markerPath);
  } catch {
    // Ignore malformed entries
    try { unlinkSync(markerPath); } catch { /* ignore */ }
  }
}

if (banners.length === 0) process.exit(0);

// UserPromptSubmit hooks inject content via JSON
process.stdout.write(JSON.stringify({
  type: 'inject',
  content: banners.join('\n'),
}) + '\n');
