import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { SupervisorStatus } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { collectOrphanProcesses, collectStaleSpecialistJobs, type StaleSpecialistJobCandidate } from '../specialist/process-health.js';
import {
  collectWorktreeGcCandidates,
  pruneWorktrees,
  type WorktreeGcCandidate,
} from '../specialist/worktree-gc.js';

interface CleanOptions {
  removeAllCompleted: boolean;
  dryRun: boolean;
  keepRecentCount: number | null;
  aggressivePrune: boolean;
  staleProcessesOnly: boolean;
  staleAfterHours: number;
  reapOrphans: boolean;
  psDashboard: boolean;
  observability: boolean;
  observabilityBeforeMs: number | null;
  includeEpics: boolean;
}

interface OrphanProcess {
  pid: number;
  ppid: number;
  comm: string;
  cmdline: string;
  cwd: string | null;
  reason: 'dolt-worktree-local' | 'gitnexus-orphan' | 'pi-orphan' | 'deleted-worktree-process';
}

interface CompletedJobRecord {
  id: string;
  directoryPath: string;
  completedAtMs: number;
  createdAtMs: number;
  sizeBytes: number;
}

interface StaleProcessCandidate {
  status: SupervisorStatus;
  reason: 'dead-pid' | 'stale-update';
}

const MS_PER_DAY = 86_400_000;
const DEFAULT_TTL_DAYS = 7;
const DEFAULT_STALE_AFTER_HOURS = 24;
const COMPLETED_STATUSES = new Set<SupervisorStatus['status']>(['done', 'error', 'cancelled']);
const STALE_PROCESS_STATUSES = new Set<SupervisorStatus['status']>(['running', 'starting', 'waiting']);
const PROTECTED_SQLITE_SUFFIXES = ['.db', '.db-wal', '.db-shm'] as const;

function parseDuration(raw: string): number | null {
  const match = /^(\d+)(ms|s|m|h|d)$/i.exec(raw.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * multipliers[unit]!;
}

function parseBeforeArgument(raw: string): number {
  const durationMs = parseDuration(raw);
  if (durationMs !== null) return Date.now() - durationMs;

  const isoMs = Date.parse(raw);
  if (Number.isFinite(isoMs)) return isoMs;

  throw new Error(`Invalid --before value '${raw}'. Use ISO date or duration like 7d.`);
}

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
  let aggressivePrune = false;
  let staleProcessesOnly = false;
  let staleAfterHours = DEFAULT_STALE_AFTER_HOURS;
  let reapOrphans = false;
  let psDashboard = false;
  let observability = false;
  let observabilityBeforeMs: number | null = null;
  let includeEpics = false;

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

    if (argument === '--processes') {
      staleProcessesOnly = true;
      continue;
    }

    if (argument === '--reap-orphans') {
      reapOrphans = true;
      continue;
    }

    if (argument === '--ps') {
      psDashboard = true;
      continue;
    }

    if (argument === '--observability') {
      observability = true;
      continue;
    }

    if (argument === '--include-epics') {
      includeEpics = true;
      continue;
    }

    if (argument === '--before') {
      const value = argv[index + 1];
      if (!value) throw new Error('Missing value for --before');
      observabilityBeforeMs = parseBeforeArgument(value);
      index += 1;
      continue;
    }

    if (argument.startsWith('--before=')) {
      observabilityBeforeMs = parseBeforeArgument(argument.slice('--before='.length));
      continue;
    }

    if (argument === '--aggressive-prune') {
      aggressivePrune = true;
      continue;
    }

    if (argument === '--stale-after') {
      const value = argv[index + 1];
      if (!value) throw new Error('Missing value for --stale-after');
      const parsedValue = Number(value);
      if (!Number.isFinite(parsedValue) || parsedValue < 0) throw new Error('--stale-after must be a non-negative number');
      staleAfterHours = parsedValue;
      index += 1;
      continue;
    }

    if (argument.startsWith('--stale-after=')) {
      const value = argument.slice('--stale-after='.length);
      const parsedValue = Number(value);
      if (!Number.isFinite(parsedValue) || parsedValue < 0) throw new Error('--stale-after must be a non-negative number');
      staleAfterHours = parsedValue;
      continue;
    }

    if (argument === '--keep') {
      const value = argv[index + 1];
      if (!value) throw new Error('Missing value for --keep');
      const parsedValue = Number(value);
      if (!Number.isInteger(parsedValue) || parsedValue < 0) throw new Error('--keep must be a non-negative integer');
      keepRecentCount = parsedValue;
      index += 1;
      continue;
    }

    if (argument.startsWith('--keep=')) {
      const value = argument.slice('--keep='.length);
      const parsedValue = Number(value);
      if (!Number.isInteger(parsedValue) || parsedValue < 0) throw new Error('--keep must be a non-negative integer');
      keepRecentCount = parsedValue;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  if (staleProcessesOnly && (removeAllCompleted || keepRecentCount !== null)) {
    throw new Error('--processes cannot be combined with --all or --keep');
  }
  if (reapOrphans && (removeAllCompleted || keepRecentCount !== null || staleProcessesOnly || psDashboard)) {
    throw new Error('--reap-orphans cannot be combined with --all, --keep, --processes, or --ps');
  }
  if (psDashboard && (removeAllCompleted || keepRecentCount !== null || staleProcessesOnly || aggressivePrune || observability)) {
    throw new Error('--ps cannot be combined with --all, --keep, --processes, --aggressive-prune, or --observability');
  }
  if (observability && (removeAllCompleted || keepRecentCount !== null || staleProcessesOnly || reapOrphans || psDashboard || aggressivePrune)) {
    throw new Error('--observability cannot be combined with --all, --keep, --processes, --reap-orphans, --ps, or --aggressive-prune');
  }
  if (!observability && (observabilityBeforeMs !== null || includeEpics)) {
    throw new Error('--before and --include-epics require --observability');
  }
  if (observability && observabilityBeforeMs === null) {
    throw new Error('--observability requires --before <iso|duration>');
  }

  return { removeAllCompleted, dryRun, keepRecentCount, aggressivePrune, staleProcessesOnly, staleAfterHours, reapOrphans, psDashboard, observability, observabilityBeforeMs, includeEpics };
}

function readDirectorySizeBytes(directoryPath: string): number {
  let totalBytes = 0;
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = join(directoryPath, entry.name);
    const stats = statSync(entryPath);
    totalBytes += stats.isDirectory() ? readDirectorySizeBytes(entryPath) : stats.size;
  }
  return totalBytes;
}

function containsProtectedSqliteArtifact(directoryPath: string): boolean {
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (containsProtectedSqliteArtifact(entryPath)) return true;
      continue;
    }
    if (PROTECTED_SQLITE_SUFFIXES.some(suffix => entry.name.endsWith(suffix))) return true;
  }
  return false;
}

function getJobTimestamps(status: SupervisorStatus): { createdAtMs: number; completedAtMs: number; updatedAtMs: number } {
  const typedStatus = status as SupervisorStatus & { created_at_ms?: number; completed_at_ms?: number; updated_at_ms?: number };
  const createdAtMs = typedStatus.started_at_ms ?? typedStatus.created_at_ms ?? typedStatus.updated_at_ms ?? 0;
  const updatedAtMs = typedStatus.updated_at_ms ?? createdAtMs;
  const completedAtMs = typedStatus.completed_at_ms ?? updatedAtMs;
  return { createdAtMs, completedAtMs, updatedAtMs };
}

function readCompletedJobDirectory(baseDirectory: string, entry: { name: string; isDirectory(): boolean }): CompletedJobRecord | null {
  if (!entry.isDirectory()) return null;
  const directoryPath = join(baseDirectory, entry.name);
  if (containsProtectedSqliteArtifact(directoryPath)) return null;
  const statusFilePath = join(directoryPath, 'status.json');
  if (!existsSync(statusFilePath)) return null;

  let statusData: SupervisorStatus;
  try {
    statusData = JSON.parse(readFileSync(statusFilePath, 'utf-8')) as SupervisorStatus;
  } catch {
    return null;
  }

  if (!COMPLETED_STATUSES.has(statusData.status)) return null;
  const { createdAtMs, completedAtMs } = getJobTimestamps(statusData);
  return { id: entry.name, directoryPath, completedAtMs, createdAtMs, sizeBytes: readDirectorySizeBytes(directoryPath) };
}

function collectCompletedJobs(jobsDirectoryPath: string): CompletedJobRecord[] {
  const sqliteClient = createObservabilitySqliteClient();
  const statuses = sqliteClient?.listStatuses() ?? [];
  if (statuses.length > 0) {
    return statuses
      .filter(status => COMPLETED_STATUSES.has(status.status))
      .map(status => {
        const directoryPath = join(jobsDirectoryPath, status.id);
        if (!existsSync(directoryPath) || containsProtectedSqliteArtifact(directoryPath)) return null;
        const { createdAtMs, completedAtMs } = getJobTimestamps(status);
        return { id: status.id, directoryPath, completedAtMs, createdAtMs, sizeBytes: readDirectorySizeBytes(directoryPath) };
      })
      .filter((job): job is CompletedJobRecord => job !== null);
  }

  if (process.env.SPECIALISTS_JOB_FILE_OUTPUT !== 'on') return [];
  return readdirSync(jobsDirectoryPath, { withFileTypes: true })
    .map(entry => readCompletedJobDirectory(jobsDirectoryPath, entry))
    .filter((job): job is CompletedJobRecord => job !== null);
}

function selectJobsToRemove(
  completedJobs: readonly CompletedJobRecord[],
  options: CleanOptions,
  protectedJobIds: ReadonlySet<string>,
): CompletedJobRecord[] {
  const jobsByNewest = [...completedJobs].sort((left, right) => {
    if (right.createdAtMs !== left.createdAtMs) return right.createdAtMs - left.createdAtMs;
    return right.completedAtMs - left.completedAtMs;
  });

  if (options.keepRecentCount !== null) {
    const removable = jobsByNewest.slice(options.keepRecentCount);
    if (options.aggressivePrune) return removable;
    return removable.filter(job => !protectedJobIds.has(job.id));
  }
  if (options.removeAllCompleted) return jobsByNewest;

  const cutoffMs = Date.now() - parseTtlDaysFromEnvironment() * MS_PER_DAY;
  return jobsByNewest.filter(job => job.completedAtMs < cutoffMs);
}

function getProcessLiveness(status: SupervisorStatus): 'alive' | 'dead' | 'invalid' {
  const typedStatus = status as SupervisorStatus & { pid?: number };
  const pid = typedStatus.pid;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return 'invalid';

  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ESRCH') {
      return 'dead';
    }
    return 'invalid';
  }
}

/** No-PID 'starting' rows are nearly always orphans from a failed dispatch.
 * They never received a heartbeat, so the long --stale-after window is
 * inappropriate. Shorten it so default `sp clean --processes` reclaims them. */
const STARTING_NO_PID_STALE_MS = 5 * 60 * 1000;

function selectStaleProcesses(statuses: readonly SupervisorStatus[], staleAfterHours: number): StaleProcessCandidate[] {
  const cutoffMs = Date.now() - staleAfterHours * 60 * 60 * 1000;
  const startingNoPidCutoffMs = Date.now() - STARTING_NO_PID_STALE_MS;
  const staleJobs: StaleProcessCandidate[] = [];
  for (const status of statuses) {
    if (!STALE_PROCESS_STATUSES.has(status.status)) continue;

    const liveness = getProcessLiveness(status);
    if (liveness === 'alive') continue;
    if (liveness === 'dead') {
      staleJobs.push({ status, reason: 'dead-pid' });
      continue;
    }

    const updatedAtMs = (status as SupervisorStatus & { updated_at_ms?: number }).updated_at_ms ?? 0;
    const effectiveCutoff = status.status === 'starting' ? Math.max(startingNoPidCutoffMs, cutoffMs) : cutoffMs;
    if (updatedAtMs < effectiveCutoff) staleJobs.push({ status, reason: 'stale-update' });
  }
  return staleJobs;
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

function printObservabilityPruneReport(report: {
  dryRun: boolean;
  beforeMs: number;
  eventsCutoffMs: number;
  includeEpics: boolean;
  deletedEvents: number;
  deletedResults: number;
  deletedJobs: number;
  deletedEpicRuns: number;
  skippedActiveChainJobs: number;
  extractedJobs: number;
}): void {
  console.log(report.dryRun ? 'Would prune observability SQLite rows:' : 'Pruned observability SQLite rows:');
  console.log(`  before: ${new Date(report.beforeMs).toISOString()}`);
  console.log(`  events cutoff: ${new Date(report.eventsCutoffMs).toISOString()}`);
  console.log(`  specialist_events: ${report.deletedEvents}`);
  console.log(`  specialist_results: ${report.deletedResults}`);
  console.log(`  specialist_jobs: ${report.deletedJobs}`);
  console.log(`  extracted jobs: ${report.extractedJobs}`);
  console.log(`  epic_runs: ${report.deletedEpicRuns}${report.includeEpics ? '' : ' (skipped, use --include-epics)'}`);
  console.log(`  skipped active-chain jobs: ${report.skippedActiveChainJobs}`);
}

function printDryRunPlan(jobs: readonly CompletedJobRecord[]): void {
  if (jobs.length === 0) return;
  console.log('Would remove:');
  for (const job of jobs) console.log(`  - ${job.id}`);
}

function printProcessPlan(jobs: readonly StaleProcessCandidate[]): void {
  if (jobs.length === 0) return;
  console.log('Would cancel:');
  for (const job of jobs) console.log(`  - ${job.status.id} (${job.reason})`);
}

function printWorktreeDryRunPlan(candidates: readonly WorktreeGcCandidate[]): void {
  if (candidates.length === 0) return;
  console.log('Would remove worktrees:');
  for (const candidate of candidates) {
    const label = candidate.branch ? ` (${candidate.branch})` : '';
    console.log(`  - ${candidate.jobId}${label}: ${candidate.worktreePath}`);
  }
}

function printWorktreeGcSummary(removed: readonly WorktreeGcCandidate[], skipped: readonly WorktreeGcCandidate[]): void {
  if (removed.length === 0 && skipped.length === 0) return;
  const noun = removed.length === 1 ? 'worktree' : 'worktrees';
  console.log(`Removed ${removed.length} ${noun}` + (skipped.length > 0 ? ` (${skipped.length} skipped)` : '') + '.');
}

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error('Usage: specialists|sp clean [--all] [--keep <n>] [--aggressive-prune] [--processes [--stale-after <hours>]] [--reap-orphans] [--observability --before <iso|duration> [--include-epics]] [--dry-run]');
  process.exit(1);
}

// ── Orphan-process reaper (Linux /proc) ────────────────────────────────────────
// Reaps three classes of pre-fix leaks (see unitAI-85xxp / unitAI-1phu7 /
// unitAI-0wz2p):
//   1. dolt sql-server processes whose cwd is under */.worktrees/* (per-worktree
//      dolt servers from the bd-stub-was-rescaffolded bug, fixed in 7c2b630a)
//   2. gitnexus mcp processes orphaned to PID 1 (from --keep-alive teardown leaks
//      before b12dd0fc shipped detached + group-SIGKILL)
//   3. pi / pi-coding-agent processes orphaned to PID 1 (same root cause)
//
// Strict matching: only reap processes that meet BOTH the command pattern AND
// the orphan/cwd condition. Never touch the bd shared-server dolt or any
// dolt/gitnexus process under a live supervisor.

function findOrphanProcesses(): OrphanProcess[] {
  return collectOrphanProcesses().map((process) => ({
    pid: process.pid,
    ppid: process.ppid,
    comm: process.cmdline.split(' ')[0] ?? process.role,
    cmdline: process.cmdline,
    cwd: process.cwd,
    reason: process.reason ?? 'pi-orphan',
  }));
}

async function killOrphanProcesses(orphans: readonly OrphanProcess[], dryRun: boolean): Promise<number> {
  if (dryRun) return orphans.length;
  let killed = 0;
  for (const orphan of orphans) {
    try {
      // SIGTERM first to give graceful shutdown a chance.
      process.kill(orphan.pid, 'SIGTERM');
    } catch { /* already dead */ }
  }
  // Brief grace period then SIGKILL anything still alive.
  if (orphans.length > 0) await new Promise(resolve => setTimeout(resolve, 1500));
  for (const orphan of orphans) {
    try {
      process.kill(orphan.pid, 0);
      try { process.kill(orphan.pid, 'SIGKILL'); } catch { /* race */ }
    } catch {
      // ESRCH = already gone
    }
    killed += 1;
  }
  return killed;
}

function printOrphanPlan(orphans: readonly OrphanProcess[]): void {
  if (orphans.length === 0) {
    console.log('No orphan/stale leaked processes found.');
    return;
  }
  const action = 'Would reap';
  console.log(`${action} ${orphans.length} orphan/stale leaked process(es):`);
  for (const orphan of orphans) {
    const cwdSuffix = orphan.cwd ? ` cwd=${orphan.cwd}` : '';
    console.log(`  - pid=${orphan.pid} ppid=${orphan.ppid} reason=${orphan.reason} comm=${orphan.comm}${cwdSuffix}`);
  }
}

function printStaleJobPlan(jobs: readonly StaleSpecialistJobCandidate[]): void {
  if (jobs.length === 0) {
    console.log('No stale specialist jobs found.');
    return;
  }
  console.log(`Would reap ${jobs.length} stale specialist job(s):`);
  for (const job of jobs) {
    const ageMinutes = Math.round(job.ageMs / 60000);
    const bead = job.beadId ? ` bead=${job.beadId}` : '';
    const cwd = job.cwd ? ` cwd=${job.cwd}` : '';
    console.log(`  - job=${job.jobId} pid=${job.pid}${bead} age=${ageMinutes}m reason=${job.reason}${cwd}`);
  }
}

async function reapStaleSpecialistJobs(jobs: readonly StaleSpecialistJobCandidate[], dryRun: boolean): Promise<number> {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) return 0;
  if (dryRun) return jobs.length;

  let reapedCount = 0;
  for (const job of jobs) {
    if (job.reason === 'orphaned-keep-alive') {
      try {
        process.kill(job.pid, 'SIGTERM');
      } catch { /* already dead */ }
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        process.kill(job.pid, 0);
        try { process.kill(job.pid, 'SIGKILL'); } catch { /* race */ }
      } catch { /* already gone */ }
    }
    if (job.reason === 'terminal-alive') {
      // pi is spawned detached (own process group) — reap parent + the detached pi child + its MCP
      // servers by targeting the whole group. SIGTERM first to give pi's stdin-EOF close-path a
      // chance, then group-SIGKILL if anything survives. DO NOT overwrite the DB status: the job
      // completed correctly in the registry (done/error/cancelled); only the OS process leaked.
      try {
        process.kill(-job.pid, 'SIGTERM');
      } catch (err: any) {
        if (err?.code !== 'ESRCH') {
          try { process.kill(job.pid, 'SIGTERM'); } catch { /* already dead */ }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        process.kill(job.pid, 0);
        try { process.kill(-job.pid, 'SIGKILL'); } catch {
          try { process.kill(job.pid, 'SIGKILL'); } catch { /* race */ }
        }
      } catch { /* already gone */ }
      reapedCount += 1;
      continue;
    }
    sqliteClient.markSpecialistJobCancelled(job.jobId, `cleanup: stale-reaper:${job.reason}`);
    reapedCount += 1;
  }
  return reapedCount;
}

function printOrphanSummary(killedCount: number): void {
  if (killedCount === 0) return;
  const noun = killedCount === 1 ? 'process' : 'processes';
  console.log(`Reaped ${killedCount} orphan/stale leaked ${noun}.`);
}

function printStaleJobSummary(reapedCount: number): void {
  const noun = reapedCount === 1 ? 'job' : 'jobs';
  console.log(`Reaped ${reapedCount} stale specialist ${noun}.`);
}

function deleteJobDirectories(jobs: readonly CompletedJobRecord[]): number {
  for (const job of jobs) {
    rmSync(job.directoryPath, { recursive: true, force: true });
  }
  return jobs.length;
}


function isPsHidden(status: SupervisorStatus): boolean {
  const typed = status as SupervisorStatus & { ps_hidden_at?: number; ps_hidden_from_dashboard_at?: number };
  return Boolean(typed.ps_hidden_at ?? typed.ps_hidden_from_dashboard_at);
}

function selectPsDashboardCleanCandidates(statuses: readonly SupervisorStatus[]): SupervisorStatus[] {
  return statuses.filter(status => COMPLETED_STATUSES.has(status.status) && !isPsHidden(status));
}

function printPsDashboardCleanPlan(statuses: readonly SupervisorStatus[]): void {
  if (statuses.length === 0) {
    console.log('No terminal ps rows to hide.');
    return;
  }
  console.log(`Would hide ${statuses.length} terminal row(s) from default ps:`);
  for (const status of statuses) {
    const bead = status.bead_id ? ` bead=${status.bead_id}` : '';
    const branch = (status as SupervisorStatus & { branch?: string }).branch ? ` branch=${(status as SupervisorStatus & { branch?: string }).branch}` : '';
    console.log(`  - ${status.id} ${status.specialist} status=${status.status}${bead}${branch}`);
  }
}

function hidePsDashboardRows(statuses: readonly SupervisorStatus[], dryRun: boolean): number {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) return 0;
  if (dryRun) return statuses.length;
  const now = Date.now();
  for (const status of statuses) {
    sqliteClient.upsertStatus({
      ...status,
      ps_hidden_at: now,
      ps_hidden_reason: 'sp clean --ps',
    } as SupervisorStatus & { ps_hidden_at: number; ps_hidden_reason: string });
  }
  return statuses.length;
}

function removeStaleProcesses(statuses: readonly StaleProcessCandidate[], dryRun: boolean): number {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) return 0;
  if (dryRun) return statuses.length;

  let updatedCount = 0;
  for (const candidate of statuses) {
    const typedStatus = candidate.status as SupervisorStatus & { completed_at_ms?: number; updated_at_ms?: number };
    const cancelledStatus: SupervisorStatus = {
      ...candidate.status,
      status: 'cancelled',
      completed_at_ms: typedStatus.completed_at_ms ?? Date.now(),
      updated_at_ms: Date.now(),
    } as SupervisorStatus;
    sqliteClient.upsertStatus(cancelledStatus);
    updatedCount += 1;
  }
  return updatedCount;
}

export async function run(): Promise<void> {
  let options: CleanOptions;
  try {
    options = parseOptions(process.argv.slice(3));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    printUsageAndExit(message);
  }

  if (options.reapOrphans) {
    const orphans = findOrphanProcesses();
    const staleJobs = collectStaleSpecialistJobs();
    if (options.dryRun) {
      printOrphanPlan(orphans);
      printStaleJobPlan(staleJobs);
      return;
    }
    if (orphans.length === 0 && staleJobs.length === 0) {
      console.log('No orphan/stale leaked processes found.');
      return;
    }
    printOrphanPlan(orphans);
    printStaleJobPlan(staleJobs);
    const killedCount = await killOrphanProcesses(orphans, false);
    const staleCount = await reapStaleSpecialistJobs(staleJobs, false);
    printOrphanSummary(killedCount);
    printStaleJobSummary(staleCount);
    return;
  }

  const jobsDirectoryPath = resolveJobsDir();
  const sqliteClient = createObservabilitySqliteClient();
  const statuses = sqliteClient?.listStatuses() ?? [];

  if (options.observability) {
    if (!sqliteClient) throw new Error('Failed to initialize observability SQLite schema. Run `specialists db setup` first.');
    const report = sqliteClient.pruneObservabilityData({
      beforeMs: options.observabilityBeforeMs!,
      includeEpics: options.includeEpics,
      apply: !options.dryRun,
    });
    printObservabilityPruneReport(report);
    return;
  }

  if (options.psDashboard) {
    const candidates = selectPsDashboardCleanCandidates(statuses);
    if (options.dryRun) {
      printPsDashboardCleanPlan(candidates);
      return;
    }
    const hiddenCount = hidePsDashboardRows(candidates, false);
    console.log(`Hid ${hiddenCount} terminal row(s) from default ps.`);
    return;
  }

  if (!existsSync(jobsDirectoryPath)) {
    console.log('No jobs directory found.');
    return;
  }
  const worktreeCandidates = collectWorktreeGcCandidates(jobsDirectoryPath);
  const protectedJobIds = options.keepRecentCount !== null && !options.aggressivePrune && sqliteClient
    ? new Set(sqliteClient.listReferencedChainRootJobIds())
    : new Set<string>();

  if (options.staleProcessesOnly) {
    const staleJobs = selectStaleProcesses(statuses, options.staleAfterHours);
    if (options.dryRun) {
      printProcessPlan(staleJobs);
      console.log(renderSummary(staleJobs.length, 0, true));
      printWorktreeDryRunPlan(worktreeCandidates);
      return;
    }

    const cancelledCount = removeStaleProcesses(staleJobs, false);
    console.log(renderSummary(cancelledCount, 0, false));

    if (worktreeCandidates.length > 0) {
      const worktreeResult = pruneWorktrees(worktreeCandidates);
      printWorktreeGcSummary(worktreeResult.removed, worktreeResult.skipped);
    }
    return;
  }

  const completedJobs = collectCompletedJobs(jobsDirectoryPath);
  const jobsToRemove = selectJobsToRemove(completedJobs, options, protectedJobIds);
  const freedBytes = jobsToRemove.reduce((total, job) => total + job.sizeBytes, 0);

  if (options.dryRun) {
    printDryRunPlan(jobsToRemove);
    console.log(renderSummary(jobsToRemove.length, freedBytes, true));
    printWorktreeDryRunPlan(worktreeCandidates);
    return;
  }

  deleteJobDirectories(jobsToRemove);
  console.log(renderSummary(jobsToRemove.length, freedBytes, false));

  if (worktreeCandidates.length > 0) {
    const worktreeResult = pruneWorktrees(worktreeCandidates);
    printWorktreeGcSummary(worktreeResult.removed, worktreeResult.skipped);
  }
}
