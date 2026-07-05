import { Supervisor } from './supervisor.js';
import { createReviewVerdictEvent, createChainEvent } from './timeline-events.js';
import { hasRunCompleteEvent } from './observability-sqlite.js';
import { isProcessAlive } from './process-liveness.js';
import { BeadsClient } from './beads.js';
import { killTmuxSession } from '../cli/tmux-utils.js';
import { resolveJobsDir } from './job-root.js';
import type { RunOptions } from './runner.js';
import type { SpecialistRunner } from './runner.js';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const PASS_COMPLIANCE_VERDICT_REGEX = /## Compliance Verdict[\s\S]*?- Verdict:\s*\**\s*PASS\s*\**/i;

export interface StopJobOptions {
  force?: boolean;
  closeBeadAnyway?: boolean;
  jobsDir?: string;
}

export interface FinalizeJobOptions {
  jobsDir?: string;
}

function resolveTerminalStatus(jobId: string): 'done' | 'cancelled' {
  return hasRunCompleteEvent(jobId) ? 'done' : 'cancelled';
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

function createFinalizeSupervisor(jobsDir: string): Supervisor {
  const runner = { run: async () => { throw new Error('finalize supervisor runner is not used'); } } as unknown as SpecialistRunner;
  const runOptions = {} as unknown as RunOptions;
  return new Supervisor({ runner, runOptions, jobsDir, beadsClient: new BeadsClient() });
}

function findReviewerPassInChain(supervisor: Supervisor, chainId: string): { reviewerJobId: string } | null {
  for (const id of supervisor.listChainJobIds(chainId)) {
    const status = supervisor.readStatus(id);
    if (!status || status.specialist !== 'reviewer') continue;
    if (PASS_COMPLIANCE_VERDICT_REGEX.test(supervisor.readResult(id) ?? '')) return { reviewerJobId: id };
  }
  return null;
}

export async function stopJob(jobId: string, opts: StopJobOptions = {}): Promise<void> {
  const jobsDir = opts.jobsDir ?? resolveJobsDir(process.cwd());
  const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir, beadsClient: new BeadsClient() });

  try {
    const status = supervisor.readStatus(jobId);
    if (!status) throw new Error(`No job found: ${jobId}`);
    if (status.status === 'done' || status.status === 'error' || status.status === 'cancelled') {
      // unitAI-yme9q: "already finalized" is only true if the underlying OS process is actually dead.
      // For keep-alive pi sessions dispatched via bare `sp run ... &` (no console/daemon driving the
      // FIFO, waiting_auto_close_ms unset), the job's SQLite row transitions to terminal for chain
      // bookkeeping while the OS process and its detached pi child leak indefinitely.
      const pid = (status as typeof status & { pid?: number }).pid;
      if (typeof pid === 'number' && Number.isInteger(pid) && pid > 0
          && isProcessAlive(pid, status.started_at_ms)) {
        supervisor.emitControlEvent(jobId, 'stop_terminal_alive_reaped', {
          source: 'cli',
          pid,
          previous_status: status.status,
          reason: 'registry_terminal_process_alive',
          signal: 'SIGTERM/SIGKILL',
          tmux_session: status.tmux_session,
        });
        try {
          process.kill(-pid, 'SIGTERM');
        } catch (err: any) {
          if (err?.code !== 'ESRCH') {
            try { process.kill(pid, 'SIGTERM'); } catch { /* already dead */ }
          }
        }
        const exited = await waitForProcessExit(pid, 3_000);
        if (!exited) {
          try { process.kill(-pid, 'SIGKILL'); } catch { tryKillProcessGroup(pid); }
        }
        if (status.tmux_session) killTmuxSession(status.tmux_session);
        process.stdout.write(`${green('✓')} Reaped orphaned PID ${pid} for job ${jobId} (registry was ${status.status}).\n`);
        return;
      }
      process.stderr.write(`${dim(`Job ${jobId} already finalized (${status.status}).`)}\n`);
      return;
    }

    let statusForBeadClose = status;
    let finalizedFromWaiting = false;
    if (status.status === 'waiting' && status.bead_id) {
      const finalized = supervisor.finalizeWaitingJob(jobId);
      if (finalized) {
        statusForBeadClose = finalized;
        finalizedFromWaiting = true;
      }
    }

    if (!finalizedFromWaiting && (statusForBeadClose.status === 'done' || statusForBeadClose.status === 'error' || statusForBeadClose.status === 'cancelled')) {
      process.stderr.write(`${dim(`Job ${jobId} already finalized (${statusForBeadClose.status}).`)}\n`);
      return;
    }
    if (!status.pid) throw new Error(`No PID recorded for job ${jobId}.`);

    const pid = status.pid;
    const tmuxSession = status.tmux_session;
    const isAlreadyDead = !isProcessAlive(pid, status.started_at_ms);
    const force = opts.force ?? false;

    supervisor.emitControlEvent(jobId, 'stop_requested', {
      source: 'cli',
      pid,
      previous_status: status.status,
      force,
      reason: isAlreadyDead ? 'pid_already_dead' : 'operator_stop',
      signal: force ? 'SIGTERM/SIGKILL' : 'SIGTERM',
      tmux_session: tmuxSession,
    });

    if (force && isAlreadyDead) {
      supervisor.updateJobStatus(jobId, 'error', `Force stop requested; PID ${pid} already dead`);
      supervisor.emitControlEvent(jobId, 'stop_marked_error', { source: 'cli', pid, previous_status: status.status, next_status: 'error', force, reason: 'pid_already_dead' });
      supervisor.aggregateJobMetricsBestEffort(jobId);
      tryKillProcessGroup(pid);
      process.stdout.write(`${green('✓')} Marked ${jobId} as error (PID ${pid} already dead)\n`);
    } else {
      const terminalStatus = resolveTerminalStatus(jobId);
      supervisor.updateJobStatus(jobId, terminalStatus);
      supervisor.emitControlEvent(jobId, 'status_marked_before_signal', { source: 'cli', pid, previous_status: status.status, next_status: terminalStatus, force });
      supervisor.aggregateJobMetricsBestEffort(jobId);
      try {
        process.kill(pid, 'SIGTERM');
        supervisor.emitControlEvent(jobId, 'signal_sent', { source: 'cli', pid, signal: 'SIGTERM', force, next_status: terminalStatus });
        process.stdout.write(`${green('✓')} Marked ${jobId} as ${terminalStatus} and sent SIGTERM to PID ${pid}\n`);
        if (force) {
          const exited = await waitForProcessExit(pid, 5_000);
          if (!exited) {
            supervisor.updateJobStatus(jobId, 'error', `Force stop escalated; PID ${pid} ignored SIGTERM`);
            supervisor.emitControlEvent(jobId, 'force_stop_escalated', { source: 'cli', pid, signal: 'SIGKILL', previous_status: terminalStatus, next_status: 'error', force: true, reason: 'sigterm_timeout' });
            tryKillProcessGroup(pid);
            process.stderr.write(`${red('Force stop:')} PID ${pid} ignored SIGTERM, marked ${jobId} as error and killed process group.\n`);
          }
        }
      } catch (err: any) {
        if (err.code === 'ESRCH') {
          if (force) {
            supervisor.updateJobStatus(jobId, 'error', `Force stop escalated; PID ${pid} ignored SIGTERM`);
            supervisor.emitControlEvent(jobId, 'force_stop_escalated', { source: 'cli', pid, signal: 'SIGKILL', previous_status: terminalStatus, next_status: 'error', force: true, reason: 'sigterm_timeout' });
            tryKillProcessGroup(pid);
            process.stdout.write(`${green('✓')} Marked ${jobId} as error (PID ${pid} already gone)\n`);
          } else {
            process.stderr.write(`${red(`Process ${pid} not found.`)} Job may have already completed.\n`);
          }
        } else {
          throw err;
        }
      }
    }

    if (tmuxSession) {
      supervisor.emitControlEvent(jobId, 'tmux_kill_requested', { source: 'cli', pid, tmux_session: tmuxSession });
      killTmuxSession(tmuxSession);
      process.stdout.write(`${dim(`  tmux session ${tmuxSession} killed`)}\n`);
    }

    if (status.bead_id) {
      const finalStatus = supervisor.readStatus(jobId)?.status ?? statusForBeadClose.status ?? 'cancelled';
      const beads = new BeadsClient();
      const liveJobs = supervisor.listLiveJobsForBead(status.bead_id).filter((liveJobId) => liveJobId !== jobId);
      if (opts.closeBeadAnyway || liveJobs.length === 0) {
        if (beads.closeBeadIfInProgress(status.bead_id, `Job ${jobId} stopped (${finalStatus})`)) {
          process.stdout.write(`${dim(`  bead ${status.bead_id} auto-closed`)}\n`);
        }
      } else {
        const message = `bead_close_skipped: sibling-jobs-active [${liveJobs.join(', ')}]`;
        supervisor.emitMetaEvent(jobId, message, 'supervisor');
        process.stdout.write(`${dim(`  ${message}`)}\n`);
      }
    }
  } finally {
    await supervisor.dispose();
  }
}

export async function finalizeJob(chainMemberId: string, opts: FinalizeJobOptions = {}): Promise<void> {
  const jobsDir = opts.jobsDir ?? resolveJobsDir();
  const supervisor = createFinalizeSupervisor(jobsDir);

  try {
    const status = supervisor.readStatus(chainMemberId);
    if (!status) throw new Error(`No job found: ${chainMemberId}`);
    const chainId = status.chain_id ?? status.chain_root_job_id;
    if (!chainId) throw new Error(`Job ${chainMemberId} has no chain identity (chain_id missing).`);

    const reviewerPass = findReviewerPassInChain(supervisor, chainId);
    if (!reviewerPass) throw new Error(`No reviewer with PASS compliance verdict found in chain ${chainId}.`);

    supervisor.emitTimelineEvent(chainMemberId, createChainEvent('chain_ready_for_review', {
      chain_id: chainId,
      chain_template: status.branch ?? status.startup_context?.branch ?? 'unknown',
      reviewer_job_id: reviewerPass.reviewerJobId,
      terminal_state: 'merge_ready',
      result: 'pass',
    }) as any);
    supervisor.emitTimelineEvent(chainMemberId, createReviewVerdictEvent('pass', {
      chain_id: chainId,
      chain_template: status.branch ?? status.startup_context?.branch ?? 'unknown',
      reviewer_job_id: reviewerPass.reviewerJobId,
      terminal_state: 'merge_ready',
      result: 'pass',
    }) as any);

    const finalized: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const id of supervisor.listChainJobIds(chainId)) {
      const memberStatus = supervisor.readStatus(id);
      if (!memberStatus) { skipped.push({ id, reason: 'missing' }); continue; }
      if (memberStatus.status !== 'waiting') { skipped.push({ id, reason: memberStatus.status }); continue; }
      const result = supervisor.finalizeWaitingJob(id);
      if (result) finalized.push(id); else skipped.push({ id, reason: 'finalize-failed' });
    }
    if (finalized.length === 0) throw new Error(`No waiting keep-alive jobs to finalize in chain ${chainId}.`);

    supervisor.emitTimelineEvent(chainMemberId, createChainEvent('chain_finalized', {
      chain_id: chainId,
      chain_template: status.branch ?? status.startup_context?.branch ?? 'unknown',
      terminal_state: 'merged',
      result: 'success',
    }) as any);

    process.stdout.write(`${green('✓')} Finalized chain ${chainId} (reviewer PASS: ${reviewerPass.reviewerJobId})\n`);
    for (const id of finalized) process.stdout.write(`  ${green('✓')} ${id}\n`);
    for (const { id, reason } of skipped) process.stdout.write(`  ${dim(`· ${id} (${reason})`)}\n`);
  } finally {
    await supervisor.dispose();
  }
}

