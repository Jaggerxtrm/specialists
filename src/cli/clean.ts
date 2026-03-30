import {
  Dirent,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import type { SupervisorStatus } from '../specialist/supervisor.js';

interface CleanOptions {
  removeAllCompleted: boolean;
  dryRun: boolean;
  keepRecentCount: number | null;
}

interface CompletedJobDirectory {
  id: string;
  directoryPath: string;
  modifiedAtMs: number;
  startedAtMs: number;
  sizeBytes: number;
}

const MS_PER_DAY = 86_400_000;
const DEFAULT_TTL_DAYS = 7;
const COMPLETED_STATUSES = new Set<SupervisorStatus['status']>(['done', 'error']);

function parseTtlDaysFromEnvironment(): number {
  const rawValue = process.env.SPECIALISTS_JOB_TTL_DAYS ?? process.env.JOB_TTL_DAYS;
  if (!rawValue) return DEFAULT_TTL_DAYS;

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) return DEFAULT_TTL_DAYS;

  return parsedValue;
}

function parseOptions(argv: readonly string[]): CleanOptions {
  let removeAllCompleted = false;
  let dryRun = false;
  let keepRecentCount: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--all') {
      removeAllCompleted = true;
      continue;
    }

    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (argument === '--keep') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --keep');
      }

      const parsedValue = Number(value);
      const isInteger = Number.isInteger(parsedValue);
      if (!isInteger || parsedValue < 0) {
        throw new Error('--keep must be a non-negative integer');
      }

      keepRecentCount = parsedValue;
      index += 1;
      continue;
    }

    if (argument.startsWith('--keep=')) {
      const value = argument.slice('--keep='.length);
      const parsedValue = Number(value);
      const isInteger = Number.isInteger(parsedValue);
      if (!isInteger || parsedValue < 0) {
        throw new Error('--keep must be a non-negative integer');
      }

      keepRecentCount = parsedValue;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  return { removeAllCompleted, dryRun, keepRecentCount };
}

function readDirectorySizeBytes(directoryPath: string): number {
  let totalBytes = 0;
  const entries = readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      totalBytes += readDirectorySizeBytes(entryPath);
      continue;
    }

    totalBytes += stats.size;
  }

  return totalBytes;
}

function readCompletedJobDirectory(baseDirectory: string, entry: Dirent): CompletedJobDirectory | null {
  if (!entry.isDirectory()) return null;

  const directoryPath = join(baseDirectory, entry.name);
  const statusFilePath = join(directoryPath, 'status.json');
  if (!existsSync(statusFilePath)) return null;

  let statusData: SupervisorStatus;
  try {
    statusData = JSON.parse(readFileSync(statusFilePath, 'utf-8')) as SupervisorStatus;
  } catch {
    return null;
  }

  if (!COMPLETED_STATUSES.has(statusData.status)) return null;

  const directoryStats = statSync(directoryPath);

  return {
    id: entry.name,
    directoryPath,
    modifiedAtMs: directoryStats.mtimeMs,
    startedAtMs: statusData.started_at_ms,
    sizeBytes: readDirectorySizeBytes(directoryPath),
  };
}

function collectCompletedJobDirectories(jobsDirectoryPath: string): CompletedJobDirectory[] {
  const entries = readdirSync(jobsDirectoryPath, { withFileTypes: true });
  const completedJobs: CompletedJobDirectory[] = [];

  for (const entry of entries) {
    const completedJob = readCompletedJobDirectory(jobsDirectoryPath, entry);
    if (completedJob) {
      completedJobs.push(completedJob);
    }
  }

  return completedJobs;
}

function selectJobsToRemove(completedJobs: readonly CompletedJobDirectory[], options: CleanOptions): CompletedJobDirectory[] {
  const jobsByNewest = [...completedJobs].sort((left, right) => {
    if (right.startedAtMs !== left.startedAtMs) {
      return right.startedAtMs - left.startedAtMs;
    }
    return right.modifiedAtMs - left.modifiedAtMs;
  });

  if (options.keepRecentCount !== null) {
    return jobsByNewest.slice(options.keepRecentCount);
  }

  if (options.removeAllCompleted) {
    return jobsByNewest;
  }

  const ttlDays = parseTtlDaysFromEnvironment();
  const cutoffMs = Date.now() - ttlDays * MS_PER_DAY;
  return jobsByNewest.filter(job => job.modifiedAtMs < cutoffMs);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function renderSummary(removedCount: number, freedBytes: number, dryRun: boolean): string {
  const action = dryRun ? 'Would remove' : 'Removed';
  const noun = removedCount === 1 ? 'directory' : 'directories';
  return `${action} ${removedCount} job ${noun} (${formatBytes(freedBytes)} freed)`;
}

function printDryRunPlan(jobs: readonly CompletedJobDirectory[]): void {
  if (jobs.length === 0) return;

  console.log('Would remove:');
  for (const job of jobs) {
    console.log(`  - ${job.id}`);
  }
}

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error('Usage: specialists|sp clean [--all] [--keep <n>] [--dry-run]');
  process.exit(1);
}

export async function run(): Promise<void> {
  let options: CleanOptions;
  try {
    options = parseOptions(process.argv.slice(3));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    printUsageAndExit(message);
  }

  const jobsDirectoryPath = join(process.cwd(), '.specialists', 'jobs');
  if (!existsSync(jobsDirectoryPath)) {
    console.log('No jobs directory found.');
    return;
  }

  const completedJobs = collectCompletedJobDirectories(jobsDirectoryPath);
  const jobsToRemove = selectJobsToRemove(completedJobs, options);
  const freedBytes = jobsToRemove.reduce((total, job) => total + job.sizeBytes, 0);

  if (options.dryRun) {
    printDryRunPlan(jobsToRemove);
    console.log(renderSummary(jobsToRemove.length, freedBytes, true));
    return;
  }

  for (const job of jobsToRemove) {
    rmSync(job.directoryPath, { recursive: true, force: true });
  }

  console.log(renderSummary(jobsToRemove.length, freedBytes, false));
}
