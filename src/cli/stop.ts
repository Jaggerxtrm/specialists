// src/cli/stop.ts
// Send SIGTERM to the PID recorded in status.json for a given job.

import { Supervisor } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { hasRunCompleteEvent } from '../specialist/observability-sqlite.js';
import { killTmuxSession } from './tmux-utils.js';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function resolveTerminalStatus(jobId: string): 'done' | 'cancelled' {
  return hasRunCompleteEvent(jobId) ? 'done' : 'cancelled';
}

export async function run(): Promise<void> {
  const jobId = process.argv[3];
  if (!jobId) {
    console.error('Usage: specialists|sp stop <job-id>');
    process.exit(1);
  }

  const jobsDir = resolveJobsDir(process.cwd());
  const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });

  try {
    const status = supervisor.readStatus(jobId);

    if (!status) {
      console.error(`No job found: ${jobId}`);
      process.exit(1);
    }

    if (status.status === 'done' || status.status === 'error' || status.status === 'cancelled') {
      process.stderr.write(`${dim(`Job ${jobId} is already ${status.status}.`)}\n`);
      return;
    }

    if (!status.pid) {
      process.stderr.write(`${red(`No PID recorded for job ${jobId}.`)}\n`);
      process.exit(1);
    }

    const tmuxSession = status.tmux_session;
    const terminalStatus = resolveTerminalStatus(jobId);
    supervisor.updateJobStatus(jobId, terminalStatus);

    try {
      process.kill(status.pid, 'SIGTERM');
      process.stdout.write(`${green('✓')} Marked ${jobId} as ${terminalStatus} and sent SIGTERM to PID ${status.pid}\n`);

      if (tmuxSession) {
        killTmuxSession(tmuxSession);
        process.stdout.write(`${dim(`  tmux session ${tmuxSession} killed`)}\n`);
      }
    } catch (err: any) {
      if (err.code === 'ESRCH') {
        process.stderr.write(`${red(`Process ${status.pid} not found.`)} Job may have already completed.\n`);

        if (tmuxSession) {
          killTmuxSession(tmuxSession);
          process.stdout.write(`${dim(`  tmux session ${tmuxSession} killed`)}\n`);
        }
      } else {
        process.stderr.write(`${red('Error:')} ${err.message}\n`);
        process.exit(1);
      }
    }
  } finally {
    await supervisor.dispose();
  }
}
