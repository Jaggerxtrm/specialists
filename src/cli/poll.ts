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

function parseArgs(argv: string[]): { jobId: string; cursor: number; json: boolean } {
  let jobId: string | undefined;
  let cursor = 0;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cursor' && argv[i + 1]) {
      cursor = parseInt(argv[++i], 10);
      if (isNaN(cursor) || cursor < 0) cursor = 0;
      continue;
    }
    if (argv[i] === '--json') {
      json = true;
      continue;
    }
    if (!argv[i].startsWith('--')) {
      jobId = argv[i];
    }
  }

  if (!jobId) {
    console.error('Usage: specialists poll <job-id> [--cursor N] [--json]');
    process.exit(1);
  }

  return { jobId, cursor, json };
}

export async function run(): Promise<void> {
  const { jobId, cursor, json } = parseArgs(process.argv.slice(3));
  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  const jobDir = join(jobsDir, jobId);

  if (!existsSync(jobDir)) {
    const result: PollResult = {
      job_id: jobId,
      status: 'error',
      elapsed_ms: 0,
      cursor: 0,
      output: '',
      output_delta: '',
      events: [],
      error: `Job not found: ${jobId}`,
    };
    console.log(JSON.stringify(result));
    process.exit(1);
  }

  // Read status.json
  const statusPath = join(jobDir, 'status.json');
  let status: JobStatus | null = null;
  if (existsSync(statusPath)) {
    try {
      status = JSON.parse(readFileSync(statusPath, 'utf-8'));
    } catch {
      // ignore
    }
  }

  // Read result.txt for output (only populated when done)
  const resultPath = join(jobDir, 'result.txt');
  let output = '';
  if (existsSync(resultPath)) {
    try {
      output = readFileSync(resultPath, 'utf-8');
    } catch {
      // ignore
    }
  }

  // Read events since cursor
  const events = readJobEventsById(jobsDir, jobId);
  const newEvents = events.slice(cursor);
  const nextCursor = events.length;

  // Calculate elapsed time
  const startedAt = status?.started_at_ms ?? Date.now();
  const lastEvent = status?.last_event_at_ms ?? Date.now();
  const elapsedMs = (status?.status === 'done' || status?.status === 'error')
    ? (lastEvent - startedAt)
    : (Date.now() - startedAt);

  const result: PollResult = {
    job_id: jobId,
    status: status?.status ?? 'starting',
    elapsed_ms: elapsedMs,
    cursor: nextCursor,
    output: status?.status === 'done' ? output : '',
    output_delta: '',  // Will compute below
    events: newEvents,
    current_event: status?.current_event,
    current_tool: status?.current_tool,
    model: status?.model,
    backend: status?.backend,
    bead_id: status?.bead_id,
    error: status?.error,
  };

  // Compute output delta from events (text events)
  // For now, this is a placeholder - full output delta would require
  // capturing text tokens in events, which we don't currently do.
  // The output field is populated on completion.

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Human-readable output
    console.log(`Job:      ${jobId}`);
    console.log(`Status:   ${result.status}`);
    console.log(`Elapsed:  ${Math.round(result.elapsed_ms / 1000)}s`);
    if (result.model) console.log(`Model:    ${result.backend}/${result.model}`);
    if (result.bead_id) console.log(`Bead:     ${result.bead_id}`);
    if (result.current_tool) console.log(`Tool:     ${result.current_tool}`);
    if (result.error) console.log(`Error:    ${result.error}`);
    console.log(`Events:   ${newEvents.length} new (cursor: ${cursor} → ${nextCursor})`);

    if (result.status === 'done' && result.output) {
      console.log('\n--- Output ---');
      console.log(result.output.slice(0, 500) + (result.output.length > 500 ? '...' : ''));
    }
  }
}