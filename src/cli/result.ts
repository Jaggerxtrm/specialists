// src/cli/result.ts
// Print result.txt for a given job ID. Exit 1 if still running.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Supervisor } from '../specialist/supervisor.js';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

export async function run(): Promise<void> {
  const jobId = process.argv[3];
  if (!jobId) {
    console.error('Usage: specialists|sp result <job-id>');
    process.exit(1);
  }

  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });
  const status = supervisor.readStatus(jobId);

  if (!status) {
    console.error(`No job found: ${jobId}`);
    process.exit(1);
  }

  const resultPath = join(jobsDir, jobId, 'result.txt');

  if (status.status === 'running' || status.status === 'starting') {
    if (!existsSync(resultPath)) {
      process.stderr.write(`${dim(`Job ${jobId} is still ${status.status}. Use 'specialists feed --job ${jobId}' to follow.`)}\n`);
      process.exit(1);
    }

    process.stderr.write(`${dim(`Job ${jobId} is currently ${status.status}. Showing last completed output while it continues.`)}\n`);
    process.stdout.write(readFileSync(resultPath, 'utf-8'));
    return;
  }

  if (status.status === 'error') {
    process.stderr.write(`${red(`Job ${jobId} failed:`)} ${status.error ?? 'unknown error'}\n`);
    process.exit(1);
  }
  if (!existsSync(resultPath)) {
    console.error(`Result file not found for job ${jobId}`);
    process.exit(1);
  }

  process.stdout.write(readFileSync(resultPath, 'utf-8'));
}
