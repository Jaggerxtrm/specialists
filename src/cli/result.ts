// src/cli/result.ts
// Print result.txt for a given job ID. Exit 1 if still running.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Supervisor } from '../specialist/supervisor.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

interface ResultArgs {
  jobId: string;
  wait: boolean;
  json: boolean;
  timeout?: number; // seconds; undefined = no timeout
}

function parseArgs(argv: string[]): ResultArgs {
  const jobId = argv[0];
  if (!jobId || jobId.startsWith('--')) {
    console.error('Usage: specialists|sp result <job-id> [--wait] [--timeout <seconds>] [--json]');
    process.exit(1);
  }

  let wait = false;
  let json = false;
  let timeout: number | undefined;

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--wait') { wait = true; continue; }
    if (token === '--json') { json = true; continue; }
    if (token === '--timeout' && argv[i + 1]) {
      const parsed = parseInt(argv[++i], 10);
      if (isNaN(parsed) || parsed <= 0) {
        console.error('Error: --timeout must be a positive integer (seconds)');
        process.exit(1);
      }
      timeout = parsed;
      continue;
    }
  }

  return { jobId, wait, json, timeout };
}

export async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  const { jobId } = args;

  const emitJson = (status: ReturnType<Supervisor['readStatus']>, output: string | null, error: string | null): void => {
    console.log(JSON.stringify({
      job: status ? {
        id: status.id,
        specialist: status.specialist,
        status: status.status,
        model: status.model ?? null,
        backend: status.backend ?? null,
        bead_id: status.bead_id ?? null,
        metrics: status.metrics ?? null,
        error: status.error ?? null,
      } : null,
      output,
      error,
    }, null, 2));
  };

  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });
  const sqliteClient = createObservabilitySqliteClient();

  try {
    const resultPath = join(jobsDir, jobId, 'result.txt');

    const readResultOutput = (): string | null => {
      try {
        const sqliteResult = sqliteClient?.readResult(jobId) ?? null;
        if (sqliteResult) return sqliteResult;
      } catch {
        // fallback to result.txt
      }

      if (!existsSync(resultPath)) {
        return null;
      }

      return readFileSync(resultPath, 'utf-8');
    };

  if (args.wait) {
    const startMs = Date.now();

    while (true) {
      const status = supervisor.readStatus(jobId);

      if (!status) {
        if (args.json) {
          emitJson(null, null, `No job found: ${jobId}`);
        } else {
          console.error(`No job found: ${jobId}`);
        }
        process.exit(1);
      }

      if (status.status === 'done') {
        const output = readResultOutput();
        if (!output) {
          if (args.json) {
            emitJson(status, null, `Result not found for job ${jobId}`);
          } else {
            console.error(`Result not found for job ${jobId}`);
          }
          process.exit(1);
        }

        if (args.json) {
          emitJson(status, output, null);
        } else {
          process.stdout.write(output);
        }
        return;
      }

      if (status.status === 'error') {
        const message = `Job ${jobId} failed: ${status.error ?? 'unknown error'}`;
        if (args.json) {
          emitJson(status, null, message);
        } else {
          process.stderr.write(`${red(`Job ${jobId} failed:`)} ${status.error ?? 'unknown error'}\n`);
        }
        process.exit(1);
      }

      // Check timeout before sleeping
      if (args.timeout !== undefined) {
        const elapsedSecs = (Date.now() - startMs) / 1000;
        if (elapsedSecs >= args.timeout) {
          const timeoutMessage = `Timeout: job ${jobId} did not complete within ${args.timeout}s`;
          if (args.json) {
            emitJson(status, null, timeoutMessage);
          } else {
            process.stderr.write(`${timeoutMessage}\n`);
          }
          process.exit(1);
        }
      }

      // Still starting/running/waiting — poll at 1s intervals
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // ── Original non-wait behavior ─────────────────────────────────────────────
  const status = supervisor.readStatus(jobId);

  if (!status) {
    if (args.json) {
      emitJson(null, null, `No job found: ${jobId}`);
    } else {
      console.error(`No job found: ${jobId}`);
    }
    process.exit(1);
  }

  if (status.status === 'running' || status.status === 'starting' || status.status === 'waiting') {
    const output = readResultOutput();
    if (!output) {
      const message = `Job ${jobId} is still ${status.status}. Use 'specialists feed --job ${jobId}' to follow.`;
      if (args.json) {
        emitJson(status, null, message);
      } else {
        process.stderr.write(`${dim(message)}\n`);
      }
      process.exit(1);
    }

    if (args.json) {
      emitJson(status, output, null);
    } else {
      process.stderr.write(`${dim(`Job ${jobId} is currently ${status.status}. Showing last completed output while it continues.`)}\n`);
      process.stdout.write(output);
    }
    return;
  }

  if (status.status === 'error') {
    const message = `Job ${jobId} failed: ${status.error ?? 'unknown error'}`;
    if (args.json) {
      emitJson(status, null, message);
    } else {
      process.stderr.write(`${red(`Job ${jobId} failed:`)} ${status.error ?? 'unknown error'}\n`);
    }
    process.exit(1);
  }
  const output = readResultOutput();
  if (!output) {
    if (args.json) {
      emitJson(status, null, `Result not found for job ${jobId}`);
    } else {
      console.error(`Result not found for job ${jobId}`);
    }
    process.exit(1);
  }

  if (args.json) {
    emitJson(status, output, null);
    return;
  }

  process.stdout.write(output);
  } finally {
    sqliteClient?.close();
  }
}
