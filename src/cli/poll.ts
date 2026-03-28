// src/cli/poll.ts
/**
 * CLI command: specialists poll <job-id>
 *
 * Machine-readable job status polling. Reads from .specialists/jobs/<id>/ files.
 * Designed for programmatic consumption (Claude Code, scripts).
 *
 * Output (JSON mode):
 *   {
 *     "job_id": "abc123",
 *     "status": "running" | "done" | "error" | "cancelled" | "waiting",
 *     "elapsed_ms": 45000,
 *     "cursor": 1523,
 *     "output": "...",          // full output when done
 *     "output_delta": "...",    // new output since cursor
 *     "events": [...],          // new events since cursor
 *     "current_event": "text",
 *     "current_tool": "read",
 *     "model": "claude-sonnet-4-6",
 *     "backend": "anthropic",
 *     "bead_id": "unitAI-123"
 *   }
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJobEventsById } from '../specialist/timeline-query.js';
import type { TimelineEvent } from '../specialist/timeline-events.js';

interface PollResult {
  job_id: string;
  status: 'starting' | 'running' | 'waiting' | 'done' | 'error';
  elapsed_ms: number;
  cursor: number;
  output: string;
  output_delta: string;
  events: TimelineEvent[];
  current_event?: string;
  current_tool?: string;
  model?: string;
  backend?: string;
  bead_id?: string;
  error?: string;
}

interface JobStatus {
  id: string;
  status: 'starting' | 'running' | 'waiting' | 'done' | 'error';
  current_event?: string;
  current_tool?: string;
  model?: string;
  backend?: string;
  bead_id?: string;
  error?: string;
  started_at_ms: number;
  last_event_at_ms?: number;
}

function parseArgs(argv: string[]): { jobId: string; cursor: number; json: boolean; follow: boolean } {
  let jobId: string | undefined;
  let cursor = 0;
  let json = false;
  let follow = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cursor' && argv[i + 1]) {
      cursor = parseInt(argv[++i], 10);
      if (isNaN(cursor) || cursor < 0) cursor = 0;
      continue;
    }
    if (argv[i] === '--json') { json = true; continue; }
    if (argv[i] === '--follow' || argv[i] === '-f' || argv[i] === '--f') { follow = true; continue; }
    if (!argv[i].startsWith('-')) { jobId = argv[i]; }
  }

  if (!jobId) {
    console.error('Usage: specialists poll <job-id> [--cursor N] [--json] [--follow]');
    process.exit(1);
  }

  return { jobId, cursor, json, follow };
}

function readJobState(jobsDir: string, jobId: string, cursor: number): PollResult {
  const jobDir = join(jobsDir, jobId);

  const statusPath = join(jobDir, 'status.json');
  let status: JobStatus | null = null;
  if (existsSync(statusPath)) {
    try { status = JSON.parse(readFileSync(statusPath, 'utf-8')); } catch { /* ignore */ }
  }

  const resultPath = join(jobDir, 'result.txt');
  let output = '';
  if (existsSync(resultPath)) {
    try { output = readFileSync(resultPath, 'utf-8'); } catch { /* ignore */ }
  }

  const events = readJobEventsById(jobsDir, jobId);
  const newEvents = events.slice(cursor);
  const nextCursor = events.length;

  const startedAt = status?.started_at_ms ?? Date.now();
  const lastEvent = status?.last_event_at_ms ?? Date.now();
  const elapsedMs = (status?.status === 'done' || status?.status === 'error')
    ? (lastEvent - startedAt)
    : (Date.now() - startedAt);

  return {
    job_id: jobId,
    status: status?.status ?? 'starting',
    elapsed_ms: elapsedMs,
    cursor: nextCursor,
    output: status?.status === 'done' ? output : '',
    output_delta: '',
    events: newEvents,
    current_event: status?.current_event,
    current_tool: status?.current_tool,
    model: status?.model,
    backend: status?.backend,
    bead_id: status?.bead_id,
    error: status?.error,
  };
}

function renderHeader(result: PollResult, fromCursor: number): string[] {
  const lines: string[] = [];
  lines.push(`Job:      ${result.job_id}`);
  lines.push(`Status:   ${result.status}`);
  lines.push(`Elapsed:  ${Math.round(result.elapsed_ms / 1000)}s`);
  if (result.model) lines.push(`Model:    ${result.backend}/${result.model}`);
  if (result.bead_id) lines.push(`Bead:     ${result.bead_id}`);
  if (result.current_tool) lines.push(`Tool:     ${result.current_tool}`);
  if (result.error) lines.push(`Error:    ${result.error}`);
  lines.push(`Events:   ${result.events.length} new (cursor: ${fromCursor} → ${result.cursor})`);
  return lines;
}

export async function run(): Promise<void> {
  const { jobId, cursor, json, follow } = parseArgs(process.argv.slice(3));
  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  const jobDir = join(jobsDir, jobId);

  if (!existsSync(jobDir)) {
    const result: PollResult = {
      job_id: jobId, status: 'error', elapsed_ms: 0, cursor: 0,
      output: '', output_delta: '', events: [], error: `Job not found: ${jobId}`,
    };
    console.log(json ? JSON.stringify(result) : `Job not found: ${jobId}`);
    process.exit(1);
  }

  // --follow: redraw header in-place every second until done/error, then show output
  if (follow) {
    let lastLineCount = 0;
    while (true) {
      const result = readJobState(jobsDir, jobId, cursor);
      const headerLines = renderHeader(result, cursor);

      // Move cursor up and clear to redraw in-place (skip on first render)
      if (lastLineCount > 0) {
        process.stdout.write(`\x1b[${lastLineCount}A\x1b[0J`);
      }
      process.stdout.write(headerLines.join('\n') + '\n');
      lastLineCount = headerLines.length;

      if (result.status === 'done' || result.status === 'error') {
        if (result.status === 'done' && result.output) {
          console.log('\n--- Output ---');
          console.log(result.output);
        }
        process.exit(result.status === 'done' ? 0 : 1);
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // One-shot (default)
  const result = readJobState(jobsDir, jobId, cursor);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const headerLines = renderHeader(result, cursor);
    console.log(headerLines.join('\n'));
    if (result.status === 'done' && result.output) {
      console.log('\n--- Output ---');
      console.log(result.output);
    }
  }
}