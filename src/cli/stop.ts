// src/cli/stop.ts
// Send SIGTERM to the PID recorded in status.json for a given job.

import { Supervisor } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { hasRunCompleteEvent } from '../specialist/observability-sqlite.js';
import { isProcessAlive } from '../specialist/process-liveness.js';
import { BeadsClient } from '../specialist/beads.js';
import { killTmuxSession } from './tmux-utils.js';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function resolveTerminalStatus(jobId: string): 'done' | 'cancelled' {
  return hasRunCompleteEvent(jobId) ? 'done' : 'cancelled';
}

function parseStopArgs(argv: readonly string[]): { jobId?: string; force: boolean } {
  let jobId: string | undefined;
  let force = false;

  for (const token of argv) {
    if (token === '--force') {
      force = true;
      continue;
    }

    if (!token.startsWith('-') && !jobId) {
      jobId = token;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return { jobId, force };
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return !isProcessAlive(pid);
}

function tryKillProcessGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (err: any) {
    if (err.code !== 'ESRCH') throw err;
  }
}

export async function run(): Promise<void> {
  let parsed: { jobId?: string; force: boolean };

  try {
    parsed = parseStopArgs(process.argv.slice(3));
  } catch (err: any) {
    console.error(err.message);
    console.error('Usage: specialists|sp stop <job-id> [--force]');
    process.exit(1);
  }

  const { jobId, force } = parsed;
  if (!jobId) {
    console.error('Usage: specialists|sp stop <job-id> [--force]');
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

    const pid = status.pid;
    const tmuxSession = status.tmux_session;
    const isAlreadyDead = !isProcessAlive(pid, status.started_at_ms);

    if (force && isAlreadyDead) {
      supervisor.updateJobStatus(jobId, 'error');
      tryKillProcessGroup(pid);
      process.stdout.write(`${green('✓')} Marked ${jobId} as error (PID ${pid} already dead)\n`);
    } else {
      const terminalStatus = resolveTerminalStatus(jobId);
      supervisor.updateJobStatus(jobId, terminalStatus);

      try {
        process.kill(pid, 'SIGTERM');
        process.stdout.write(`${green('✓')} Marked ${jobId} as ${terminalStatus} and sent SIGTERM to PID ${pid}\n`);

        if (force) {
          const exited = await waitForProcessExit(pid, 5_000);
          if (!exited) {
            supervisor.updateJobStatus(jobId, 'error');
            tryKillProcessGroup(pid);
            process.stderr.write(`${red('Force stop:')} PID ${pid} ignored SIGTERM, marked ${jobId} as error and killed process group.\n`);
          }
        }
      } catch (err: any) {
        if (err.code === 'ESRCH') {
          if (force) {
            supervisor.updateJobStatus(jobId, 'error');
            tryKillProcessGroup(pid);
            process.stdout.write(`${green('✓')} Marked ${jobId} as error (PID ${pid} already gone)\n`);
          } else {
            process.stderr.write(`${red(`Process ${pid} not found.`)} Job may have already completed.\n`);
          }
        } else {
          process.stderr.write(`${red('Error:')} ${err.message}\n`);
          process.exit(1);
        }
      }
    }

    if (tmuxSession) {
      killTmuxSession(tmuxSession);
      process.stdout.write(`${dim(`  tmux session ${tmuxSession} killed`)}\n`);
    }

    // Auto-close linked bead if still in_progress (unitAI-9truh).
    if (status.bead_id) {
      const finalStatus = supervisor.readStatus(jobId)?.status ?? 'cancelled';
      const beads = new BeadsClient();
      if (beads.closeBeadIfInProgress(status.bead_id, `Job ${jobId} stopped (${finalStatus})`)) {
        process.stdout.write(`${dim(`  bead ${status.bead_id} auto-closed`)}\n`);
      }
    }
  } finally {
    await supervisor.dispose();
  }
}
