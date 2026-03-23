// src/cli/feed.ts
// Tail events.jsonl for one job, or all jobs with --follow and no job ID.

import { existsSync, readFileSync, readdirSync, watch, watchFile, unwatchFile } from 'node:fs';
import { join } from 'node:path';
import { Supervisor, type SupervisorStatus } from '../specialist/supervisor.js';

const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red    = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const blue   = (s: string) => `\x1b[34m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

type Colorizer = (s: string) => string;

type FeedJobState = {
  id: string;
  linesRead: number;
  done: boolean;
  status?: SupervisorStatus['status'];
  specialist?: string;
  beadId?: string;
  startedAtMs?: number;
  colorize: Colorizer;
};

const COLORS: Colorizer[] = [cyan, yellow, magenta, green, blue, red];

function formatEvent(line: string): string {
  try {
    const e = JSON.parse(line);
    const ts = new Date(e.t).toISOString().slice(11, 19);
    const type = e.type ?? '?';
    const extra = e.tool ? ` ${cyan(e.tool)}` : e.model ? ` ${dim(e.model)}` : e.message ? ` ${red(e.message)}` : '';
    return `${dim(ts)}  ${type}${extra}`;
  } catch {
    return line;
  }
}

function createSupervisor(jobsDir: string): Supervisor {
  return new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });
}

function statusPath(jobsDir: string, jobId: string): string {
  return join(jobsDir, jobId, 'status.json');
}

function eventsPath(jobsDir: string, jobId: string): string {
  return join(jobsDir, jobId, 'events.jsonl');
}

function beadStateForStatus(status: SupervisorStatus['status'] | undefined): string {
  switch (status) {
    case 'done': return 'COMPLETE';
    case 'error': return 'ERROR';
    default: return (status ?? 'UNKNOWN').toUpperCase();
  }
}

function formatDateTime(ts?: number): string {
  if (!ts) return 'unknown';
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function formatPrefix(job: FeedJobState): string {
  const started = dim(`[${formatDateTime(job.startedAtMs)}]`);
  const id = job.colorize(`[${job.id}]`);
  const specialist = job.specialist ?? 'unknown';
  const bead = job.beadId ? ` ${dim(`[bead: ${job.beadId}]`)}` : '';
  return `${started} ${id} ${specialist}${bead}`;
}

function printLines(content: string, from: number, prefix?: string): number {
  const lines = content.split('\n').filter(Boolean);
  for (let i = from; i < lines.length; i++) {
    const line = formatEvent(lines[i]);
    console.log(prefix ? `${prefix}  ${line}` : line);
  }
  return lines.length;
}

function readStatus(supervisor: Supervisor, jobId: string): SupervisorStatus | null {
  try {
    return supervisor.readStatus(jobId);
  } catch {
    return null;
  }
}

function emitSingleJobFinal(status: SupervisorStatus): void {
  const finalMsg = status.status === 'done'
    ? `\n${yellow('Job complete.')} Run: specialists result ${status.id}`
    : `\n${red(`Job ${status.status}.`)} ${status.error ?? ''}`;
  process.stderr.write(finalMsg + '\n');
}

async function followSingleJob(jobId: string, jobsDir: string): Promise<void> {
  const supervisor = createSupervisor(jobsDir);
  const filePath = eventsPath(jobsDir, jobId);

  if (!existsSync(filePath)) {
    if (!readStatus(supervisor, jobId)) {
      console.error(`No job found: ${jobId}`);
      process.exit(1);
    }
    console.log(dim('No events yet.'));
    return;
  }

  const content = readFileSync(filePath, 'utf-8');
  let linesRead = printLines(content, 0);

  const currentStatus = readStatus(supervisor, jobId);
  if (!currentStatus || (currentStatus.status !== 'running' && currentStatus.status !== 'starting')) {
    return;
  }

  process.stderr.write(dim(`Following ${jobId}... (Ctrl+C to stop)\n`));

  await new Promise<void>((resolve) => {
    const onChange = () => {
      try {
        if (existsSync(filePath)) {
          const updated = readFileSync(filePath, 'utf-8');
          linesRead = printLines(updated, linesRead);
        }

        const status = readStatus(supervisor, jobId);
        if (status && status.status !== 'running' && status.status !== 'starting') {
          emitSingleJobFinal(status);
          unwatchFile(filePath, onChange);
          resolve();
        }
      } catch {
        // file may be mid-write
      }
    };

    watchFile(filePath, { interval: 500 }, onChange);
  });
}

function allTrackedJobsDone(jobs: Map<string, FeedJobState>): boolean {
  return jobs.size > 0 && [...jobs.values()].every((job) => job.done);
}

async function followAllJobs(jobsDir: string, forever: boolean): Promise<void> {
  const supervisor = createSupervisor(jobsDir);
  const jobs = new Map<string, FeedJobState>();
  const cleanups: Array<() => void> = [];
  let watcherClosed = false;

  const stopAll = (): void => {
    if (watcherClosed) return;
    watcherClosed = true;
    for (const cleanup of cleanups) cleanup();
  };

  const maybeResolve = (resolve: () => void): void => {
    if (!forever && allTrackedJobsDone(jobs)) {
      stopAll();
      resolve();
    }
  };

  const attachJob = (jobId: string, resolve: () => void): void => {
    if (jobs.has(jobId)) return;

    const job: FeedJobState = {
      id: jobId,
      linesRead: 0,
      done: false,
      colorize: COLORS[jobs.size % COLORS.length],
    };
    jobs.set(jobId, job);

    const refreshEvents = (): void => {
      try {
        if (!job.specialist && existsSync(statusPath(jobsDir, jobId))) {
          refreshStatus(false);
        }
        if (!job.specialist) return;

        const filePath = eventsPath(jobsDir, jobId);
        if (!existsSync(filePath)) return;
        const updated = readFileSync(filePath, 'utf-8');
        job.linesRead = printLines(updated, job.linesRead, formatPrefix(job));
      } catch {
        // file may be mid-write
      }
    };

    const refreshStatus = (announce: boolean): void => {
      const status = readStatus(supervisor, jobId);
      if (!status) return;

      const previous = job.status;
      job.status = status.status;
      job.specialist = status.specialist;
      job.beadId = status.bead_id;
      job.startedAtMs = status.started_at_ms;
      job.done = status.status !== 'running' && status.status !== 'starting';

      const changed = previous !== undefined && previous !== status.status;
      if (announce && changed) {
        const label = beadStateForStatus(status.status);
        const banner = status.status === 'done'
          ? green(`=== ${formatPrefix(job)} ${label} ===`)
          : red(`=== ${formatPrefix(job)} ${label}${status.error ? `: ${status.error}` : ''} ===`);
        process.stderr.write(banner + '\n');
      }
    };

    refreshStatus(false);
    refreshEvents();
    if (job.done && !forever) {
      maybeResolve(resolve);
      return;
    }

    const filePath = eventsPath(jobsDir, jobId);
    const statPath = statusPath(jobsDir, jobId);
    const onStatusChange = (): void => {
      refreshStatus(true);
      maybeResolve(resolve);
    };
    watchFile(filePath, { interval: 500 }, refreshEvents);
    watchFile(statPath, { interval: 500 }, onStatusChange);
    cleanups.push(() => unwatchFile(filePath, refreshEvents));
    cleanups.push(() => unwatchFile(statPath, onStatusChange));

    maybeResolve(resolve);
  };

  await new Promise<void>((resolve) => {
    if (!existsSync(jobsDir)) {
      console.log(dim('No jobs to follow.'));
      if (!forever) {
        resolve();
        return;
      }
    }

    if (existsSync(jobsDir)) {
      const entries = readdirSync(jobsDir)
        .map((entry) => ({ entry, status: readStatus(supervisor, entry) }))
        .sort((a, b) => (a.status?.started_at_ms ?? 0) - (b.status?.started_at_ms ?? 0));
      for (const { entry } of entries) {
        attachJob(entry, resolve);
      }
    }

    if (!forever && allTrackedJobsDone(jobs)) {
      resolve();
      return;
    }

    if (jobs.size === 0) {
      console.log(dim(forever ? 'Waiting for jobs...' : 'No jobs to follow.'));
      if (!forever) {
        resolve();
        return;
      }
    } else {
      process.stderr.write(dim('Following all jobs... (Ctrl+C to stop)\n'));
    }

    try {
      const dirWatcher = watch(jobsDir, () => {
        try {
          for (const entry of readdirSync(jobsDir)) {
            const isNew = !jobs.has(entry);
            attachJob(entry, resolve);
            if (isNew) process.stderr.write(cyan(`=== discovered ${entry} ===\n`));
          }
        } catch {
          // directory may be mid-update
        }
      });
      cleanups.push(() => dirWatcher.close());
    } catch {
      // fs.watch may be unavailable on some filesystems; polling watchers still work for known jobs
    }
  });
}

export async function run(): Promise<void> {
  const argv = process.argv.slice(3);
  let jobId: string | undefined;
  let follow = false;
  let forever = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--job' && argv[i + 1]) { jobId = argv[++i]; continue; }
    if (argv[i] === '--follow' || argv[i] === '-f') { follow = true; continue; }
    if (argv[i] === '--forever') { forever = true; continue; }
    if (!jobId && !argv[i].startsWith('--')) jobId = argv[i];
  }

  const jobsDir = join(process.cwd(), '.specialists', 'jobs');

  if (!jobId && follow) {
    await followAllJobs(jobsDir, forever);
    return;
  }

  if (!jobId) {
    console.error('Usage: specialists feed --job <job-id> [--follow]');
    process.exit(1);
  }

  if (!follow) {
    const filePath = eventsPath(jobsDir, jobId);
    if (!existsSync(filePath)) {
      const supervisor = createSupervisor(jobsDir);
      if (!readStatus(supervisor, jobId)) {
        console.error(`No job found: ${jobId}`);
        process.exit(1);
      }
      console.log(dim('No events yet.'));
      return;
    }

    const content = readFileSync(filePath, 'utf-8');
    printLines(content, 0);
    return;
  }

  await followSingleJob(jobId, jobsDir);
}
