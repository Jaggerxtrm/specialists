// src/cli/resume.ts
// Resume a waiting keep-alive specialist session with a next-turn prompt.

import { writeFileSync } from 'node:fs';
import { Supervisor } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red   = (s: string) => `\x1b[31m${s}\x1b[0m`;

export async function run(): Promise<void> {
  const jobId  = process.argv[3];
  const task   = process.argv[4];

  if (!jobId || !task) {
    console.error('Usage: specialists|sp resume <job-id> "<task>"');
    process.exit(1);
  }

  const jobsDir = resolveJobsDir();
  const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });
  const status = supervisor.readStatus(jobId);

  if (!status) {
    console.error(`No job found: ${jobId}`);
    process.exit(1);
  }

  if (status.status !== 'waiting') {
    process.stderr.write(`${red('Error:')} Job ${jobId} is not in waiting state (status: ${status.status}).\n`);
    process.stderr.write('resume is only valid for keep-alive jobs in waiting state. Use steer for running jobs.\n');
    process.exit(1);
  }

  if (!status.fifo_path) {
    process.stderr.write(`${red('Error:')} Job ${jobId} has no steer pipe.\n`);
    process.exit(1);
  }

  try {
    const payload = JSON.stringify({ type: 'resume', task }) + '\n';
    writeFileSync(status.fifo_path, payload, { flag: 'a' });
    process.stdout.write(`${green('✓')} Resume sent to job ${jobId}\n`);
    process.stdout.write(`  Use 'specialists feed ${jobId} --follow' to watch the response.\n`);
  } catch (err: any) {
    process.stderr.write(`${red('Error:')} Failed to write to steer pipe: ${err?.message}\n`);
    process.exit(1);
  }
}
