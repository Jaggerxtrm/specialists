#!/usr/bin/env node
// specialists-session-start — Claude Code SessionStart hook
// Injects specialists context at the start of every session:
//   • Active background jobs (if any)
//   • Available specialists list
//   • Key CLI commands reminder
//
// Installed by: specialists install
// Hook type: SessionStart

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const cwd     = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const HOME    = homedir();
const jobsDir = join(cwd, '.specialists', 'jobs');
const lines   = [];

// ── 1. Active background jobs ──────────────────────────────────────────────
if (existsSync(jobsDir)) {
  let entries = [];
  try { entries = readdirSync(jobsDir); } catch { /* ignore */ }

  const activeJobs = [];
  for (const jobId of entries) {
    const statusPath = join(jobsDir, jobId, 'status.json');
    if (!existsSync(statusPath)) continue;
    try {
      const s = JSON.parse(readFileSync(statusPath, 'utf-8'));
      if (s.status === 'running' || s.status === 'starting') {
        const elapsed = s.elapsed_s !== undefined ? ` (${s.elapsed_s}s)` : '';
        activeJobs.push(
          `  • ${s.specialist ?? jobId}  [${s.status}]${elapsed}  →  specialists result ${jobId}`
        );
      }
    } catch { /* malformed status.json */ }
  }

  if (activeJobs.length > 0) {
    lines.push('## Specialists — Active Background Jobs');
    lines.push('');
    lines.push(...activeJobs);
    lines.push('');
    lines.push('Use `specialists feed <job-id> --follow` to stream events, or `specialists result <job-id>` when done.');
    lines.push('');
  }
}

// ── 2. Available specialists (read YAML dirs directly) ────────────────────
function readSpecialistNames(dir) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith('.specialist.yaml'))
      .map(f => f.replace('.specialist.yaml', ''));
  } catch {
    return [];
  }
}

const projectNames = readSpecialistNames(join(cwd, 'specialists'));
const userNames    = readSpecialistNames(join(HOME, '.agents', 'specialists'));

// Merge, deduplicate, sort
const allNames = [...new Set([...projectNames, ...userNames])].sort();

if (allNames.length > 0) {
  lines.push('## Specialists — Available');
  lines.push('');
  if (projectNames.length > 0) {
    lines.push(`project (${projectNames.length}): ${projectNames.join(', ')}`);
  }
  if (userNames.length > 0) {
    // Only show user-scope names not already in project
    const extraUser = userNames.filter(n => !projectNames.includes(n));
    if (extraUser.length > 0) {
      lines.push(`user    (${extraUser.length}): ${extraUser.join(', ')}`);
    }
  }
  lines.push('');
}

// ── 3. Key commands reminder ───────────────────────────────────────────────
lines.push('## Specialists — Session Quick Reference');
lines.push('');
lines.push('```');
lines.push('specialists list                                   # discover available specialists');
lines.push('specialists run <name> --prompt "..."              # run foreground (streams output)');
lines.push('specialists run <name> --prompt "..."              # run; job ID prints on stderr');
lines.push('specialists feed <job-id> --follow                 # tail live events');
lines.push('specialists result <job-id>                        # read final output');
lines.push('specialists status                                 # system health');
lines.push('specialists doctor                                 # troubleshoot issues');
lines.push('```');
lines.push('');
lines.push('MCP tools: specialist_init · use_specialist · start_specialist · feed_specialist · run_parallel');

// ── Output ─────────────────────────────────────────────────────────────────
if (lines.length === 0) process.exit(0);

process.stdout.write(JSON.stringify({
  type: 'inject',
  content: lines.join('\n'),
}) + '\n');
