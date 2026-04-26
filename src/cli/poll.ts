// src/cli/poll.ts
/**
 * CLI command: specialists poll <job-id>
 *
 * Machine-readable job status polling. Reads from observability.db (primary) with fallback to .specialists/jobs/<id>/ files.
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
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { detectJobOutputMode } from './status.js';
import type { TimelineEvent } from '../specialist/timeline-events.js';

interface PollResult {
  job_id: string;
  status: 'starting' | 'running' | 'waiting' | 'done' | 'error' | 'cancelled';
  elapsed_ms: number;
  cursor: number;
  output_cursor: number;
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

type JobStatus = Pick<
  import('../specialist/supervisor.js').SupervisorStatus,
  'id' | 'status' | 'current_event' | 'current_tool' | 'model' | 'backend' | 'bead_id' | 'error' | 'started_at_ms' | 'last_event_at_ms'
>;

function parseArgs(argv: string[]): { jobId: string; cursor: number; outputCursor: number } {
  let jobId: string | undefined;
  let cursor = 0;
  let outputCursor = 0;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cursor' && argv[i + 1]) {
      cursor = parseInt(argv[++i], 10);
      if (isNaN(cursor) || cursor < 0) cursor = 0;
      continue;
    }
    if (argv[i] === '--output-cursor' && argv[i + 1]) {
      outputCursor = parseInt(argv[++i], 10);
      if (isNaN(outputCursor) || outputCursor < 0) outputCursor = 0;
      continue;
    }
    // Silently ignore --json (was explicit before; JSON is now always the output)
    if (argv[i] === '--json') { continue; }
    // --follow removed: redirect to feed
    if (argv[i] === '--follow' || argv[i] === '-f') {
      process.stderr.write("--follow removed from poll. Use 'specialists feed --follow' for live human-readable output.\n");
      process.exit(1);
    }
    if (!argv[i].startsWith('-')) { jobId = argv[i]; }
  }

  if (!jobId) {
    console.error('Usage: specialists poll <job-id> [--cursor N] [--output-cursor N]');
    process.exit(1);
  }

  return { jobId, cursor, outputCursor };
}

function readJobState(jobsDir: string, jobId: string, cursor: number, outputCursor: number): PollResult {
  const sqliteClient = createObservabilitySqliteClient();
  const jobDir = join(jobsDir, jobId);

  let status: JobStatus | null = null;
  if (sqliteClient) {
    try {
      status = sqliteClient.readStatus(jobId);
    } catch { /* ignore */ }
  }
  if (!status && detectJobOutputMode() === 'on') {
    const statusPath = join(jobDir, 'status.json');
    if (existsSync(statusPath)) {
      try { status = JSON.parse(readFileSync(statusPath, 'utf-8')); } catch { /* ignore */ }
    }
  }

  let fullOutput = '';
  if (sqliteClient) {
    try {
      fullOutput = sqliteClient.readResult(jobId) ?? '';
    } catch { /* ignore */ }
  }
  if (!fullOutput && detectJobOutputMode() === 'on') {
    const resultPath = join(jobDir, 'result.txt');
    if (existsSync(resultPath)) {
      try { fullOutput = readFileSync(resultPath, 'utf-8'); } catch { /* ignore */ }
    }
  }

  const dbEvents = sqliteClient?.readEvents(jobId);
  const events = (dbEvents && dbEvents.length > 0)
    ? dbEvents
    : (detectJobOutputMode() === 'on' ? readJobEventsById(jobsDir, jobId) : (dbEvents ?? []));
  const newEvents = events.slice(cursor);
  const nextCursor = events.length;

  const startedAt = status?.started_at_ms ?? Date.now();
  const lastEvent = status?.last_event_at_ms ?? Date.now();
  const elapsedMs = (status?.status === 'done' || status?.status === 'error')
    ? (lastEvent - startedAt)
    : (Date.now() - startedAt);

  const isDone = status?.status === 'done';
  const output = isDone ? fullOutput : '';
  const outputDelta = fullOutput.length > outputCursor ? fullOutput.slice(outputCursor) : '';
  const nextOutputCursor = fullOutput.length;

  return {
    job_id: jobId,
    status: status?.status ?? 'starting',
    elapsed_ms: elapsedMs,
    cursor: nextCursor,
    output_cursor: nextOutputCursor,
    output,
    output_delta: outputDelta,
    events: newEvents,
    current_event: status?.current_event,
    current_tool: status?.current_tool,
    model: status?.model,
    backend: status?.backend,
    bead_id: status?.bead_id,
    error: status?.error,
  };
}

export async function run(): Promise<void> {
  const { jobId, cursor, outputCursor } = parseArgs(process.argv.slice(3));
  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  const jobDir = join(jobsDir, jobId);

  if (!existsSync(jobDir)) {
    const result: PollResult = {
      job_id: jobId, status: 'error', elapsed_ms: 0,
      cursor: 0, output_cursor: 0,
      output: '', output_delta: '', events: [], error: `Job not found: ${jobId}`,
    };
    console.log(JSON.stringify(result));
    process.exit(1);
  }

  const result = readJobState(jobsDir, jobId, cursor, outputCursor);

  // Tip for callers expecting live output while job is still running
  if (result.status !== 'done' && result.status !== 'error' && !result.output_delta) {
    process.stderr.write("Tip: use 'specialists feed --follow' for live human-readable output.\n");
  }

  console.log(JSON.stringify(result));
}