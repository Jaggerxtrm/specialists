// src/cli/stop.ts
// Send SIGTERM to the PID recorded in status.json for a given job.

import { join } from 'node:path';
import { Supervisor } from '../specialist/supervisor.js';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red   = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`;

export async function run(): Promise<void> {
  const jobId = process.argv[3];
  if (!jobId) {
    console.error('Usage: specialists stop <job-id>');
    process.exit(1);
  }

  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });
  const status = supervisor.readStatus(jobId);

  if (!status) {
    console.error(`No job found: ${jobId}`);
    process.exit(1);
  }

  if (status.status === 'done' || status.status === 'error') {
    process.stderr.write(`${dim(`Job ${jobId} is already ${status.status}.`)}\n`);
    return;
  }

  if (!status.pid) {
    process.stderr.write(`${red(`No PID recorded for job ${jobId}.`)}\n`);
    process.exit(1);
  }

  try {
    process.kill(status.pid, 'SIGTERM');
    process.stdout.write(`${green('✓')} Sent SIGTERM to PID ${status.pid} (job ${jobId})\n`);
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      process.stderr.write(`${red(`Process ${status.pid} not found.`)} Job may have already completed.\n`);
    } else {
      process.stderr.write(`${red('Error:')} ${err.message}\n`);
      process.exit(1);
    }
  }
}
