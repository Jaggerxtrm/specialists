#!/usr/bin/env node
// specialists-session-start — Claude Code SessionStart hook
// Injects specialists context at the start of every session:
//   • using-specialists skill (behavioral delegation guide)
//   • Active background jobs (if any)
//   • Available specialists list
//   • Key CLI commands reminder
//
// Installed by: specialists init
// Hook type: SessionStart

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';


const cwd     = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const jobsDir = join(cwd, '.specialists', 'jobs');
const lines   = [];

// ── 0. using-specialists skill ─────────────────────────────────────────────
// Inject the behavioral delegation guide so Claude knows when and how to
// use specialists without waiting for the user to ask.
const skillPath = join(cwd, '.specialists', 'default', 'skills', 'using-specialists', 'SKILL.md');
if (existsSync(skillPath)) {
  const raw = readFileSync(skillPath, 'utf-8');
  // Strip YAML frontmatter (--- ... ---) if present
  const content = raw.startsWith('---')
    ? raw.replace(/^---[\s\S]*?---\n?/, '').trimStart()
    : raw;
  lines.push(content);
}

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

const defaultNames = readSpecialistNames(join(cwd, '.specialists', 'default', 'specialists'));
const userNames    = readSpecialistNames(join(cwd, '.specialists', 'user', 'specialists'));

// User takes precedence on name collision; merge and sort
const allNames = [...new Set([...userNames, ...defaultNames])].sort();

if (allNames.length > 0) {
  lines.push('## Specialists — Available');
  lines.push('');
  if (defaultNames.length > 0) {
    lines.push(`default (${defaultNames.length}): ${defaultNames.join(', ')}`);
  }
  if (userNames.length > 0) {
    const extraUser = userNames.filter(n => !defaultNames.includes(n));
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
lines.push('specialists run <name> --prompt "..." --background # run async → returns job ID');
lines.push('specialists run <name> --follow                    # background + stream live output');
lines.push('specialists feed <job-id> --follow                 # tail live events');
lines.push('specialists result <job-id>                        # read final output');
lines.push('specialists status                                 # system health');
lines.push('specialists doctor                                 # troubleshoot issues');
lines.push('```');
lines.push('');
lines.push('MCP tools: specialist_init · use_specialist · start_specialist · poll_specialist · run_parallel');

// ── Output ─────────────────────────────────────────────────────────────────
if (lines.length === 0) process.exit(0);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalSystemPrompt: lines.join('\n'),
  },
}) + '\n');
