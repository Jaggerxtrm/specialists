// src/cli/steer.ts
// Write a steering message to the FIFO of a running background specialist job.

import { writeFileSync } from 'node:fs';
import { Supervisor } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red   = (s: string) => `\x1b[31m${s}\x1b[0m`;

export async function run(): Promise<void> {
  const jobId  = process.argv[3];
  const message = process.argv[4];

  if (!jobId || !message) {
    console.error('Usage: specialists|sp steer <job-id> "<message>"');
    process.exit(1);
  }

  const jobsDir = resolveJobsDir();
  const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });

  try {
    const status = supervisor.readStatus(jobId);

    if (!status) {
      console.error(`No job found: ${jobId}`);
      process.exit(1);
    }

  if (status.status === 'done' || status.status === 'error') {
    process.stderr.write(`Job ${jobId} is already ${status.status}.\n`);
    process.exit(1);
  }

  if (!status.fifo_path) {
    process.stderr.write(`${red('Error:')} Job ${jobId} has no steer pipe.\n`);
    process.stderr.write('FIFO support may not be available on this system (mkfifo failed at job start).\n');
    process.exit(1);
  }

    try {
      const payload = JSON.stringify({ type: 'steer', message }) + '\n';
      writeFileSync(status.fifo_path, payload, { flag: 'a' });
      process.stdout.write(`${green('✓')} Steer message sent to job ${jobId}\n`);
    } catch (err: any) {
      process.stderr.write(`${red('Error:')} Failed to write to steer pipe: ${err?.message}\n`);
      process.exit(1);
    }
  } finally {
    await supervisor.dispose();
  }
}
