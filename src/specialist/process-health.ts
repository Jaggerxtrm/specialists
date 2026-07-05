import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { SupervisorStatus } from './supervisor.js';
import { createObservabilitySqliteClient } from './observability-sqlite.js';

export type ProcessHealthThresholds = {
  warnPct: number;
  refusePct: number;
};

export type ProcessHealthProcessKind = 'specialist' | 'dolt' | 'serena-lsp' | 'orphan';

export interface ProcessHealthProcess {
  pid: number;
  ppid: number;
  kind: ProcessHealthProcessKind;
  role: string;
  cmdline: string;
  cwd: string | null;
  rssBytes: number;
  cpuPct: number;
  ageSeconds: number;
  worktree: string | null;
  reason?: 'dolt-worktree-local' | 'gitnexus-orphan' | 'pi-orphan' | 'deleted-worktree-process';
}

export interface ProcessHealthWorkspaceGroup {
  workspace: string;
  count: number;
  rssBytes: number;
  processes: ProcessHealthProcess[];
}

export interface StaleSpecialistJobCandidate {
  jobId: string;
  pid: number;
  beadId: string | null;
  specialist: string;
  cwd: string | null;
  ageMs: number;
  /**
   * - dead-pid: registry active, PID gone (existing container-restart-orphan class).
   * - orphaned-keep-alive: registry waiting, ppid==1, edit-capable keep-alive reparented after wrapper died.
   * - dead-toolchain: registry active, PID alive but no tool/think activity in the window.
   * - terminal-alive: registry done/error/cancelled but PID (and its detached pi child) still running.
   *   Class introduced for unitAI-yme9q — pi keep-alive sessions dispatched via bare `sp run ... &`
   *   (no console/daemon driving the FIFO, waiting_auto_close_ms unset) never receive a close signal;
   *   the job's SQLite row is marked terminal for chain bookkeeping while the OS process leaks indefinitely.
   */
  reason: 'dead-pid' | 'orphaned-keep-alive' | 'dead-toolchain' | 'terminal-alive';
}

export type ProcessHealthStatus = 'OK' | 'WARN' | 'REFUSE';

export interface ProcessHealthReport {
  status: ProcessHealthStatus;
  statusReasons: string[];
  memAvailableBytes: number;
  totalRssBytes: number;
  totalCpuPct: number;
  specialistCount: number;
  doltCount: number;
  serenaLspCount: number;
  orphanCount: number;
  thresholdPct: number;
  warnPct: number;
  refusePct: number;
  warnLimitBytes: number;
  refuseLimitBytes: number;
  specialistProcesses: ProcessHealthProcess[];
  doltProcesses: ProcessHealthProcess[];
  serenaWorkspaces: ProcessHealthWorkspaceGroup[];
  orphanProcesses: ProcessHealthProcess[];
}

interface ProcStatSnapshot {
  ppid: number;
  utimeTicks: number;
  stimeTicks: number;
  startTimeTicks: number;
}

interface ProcessSnapshot {
  pid: number;
  ppid: number;
  cmdline: string;
  comm: string;
  cwd: string | null;
  rssBytes: number;
  cpuPct: number;
  ageSeconds: number;
}

interface StaleSpecialistJobSource {
  listStatuses(): SupervisorStatus[];
  getLastActivityTimestampMs?(jobId: string): number | null;
}

const DEFAULT_WARN_PCT = 70;
const DEFAULT_REFUSE_PCT = 85;
const CLOCK_TICKS_PER_SECOND = 100;

function parseThreshold(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function getProcessHealthThresholds(env: NodeJS.ProcessEnv = process.env): ProcessHealthThresholds {
  const warnPct = parseThreshold(env.SPECIALISTS_HEALTH_WARN_PCT, DEFAULT_WARN_PCT);
  const refusePct = parseThreshold(env.SPECIALISTS_HEALTH_REFUSE_PCT, DEFAULT_REFUSE_PCT);
  return { warnPct, refusePct };
}

function readMemAvailableBytes(meminfoPath: string): number {
  try {
    const content = readFileSync(meminfoPath, 'utf-8');
    const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(content);
    if (!match) return 0;
    return Number(match[1]) * 1024;
  } catch {
    return 0;
  }
}

function readProcStringOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function readProcCwdOrNull(pid: number, procRoot: string): string | null {
  try {
    return readlinkSync(join(procRoot, String(pid), 'cwd'));
  } catch {
    return null;
  }
}

function parseStat(stat: string): ProcStatSnapshot | null {
  const closeParen = stat.lastIndexOf(')');
  if (closeParen < 0) return null;
  const fields = stat.slice(closeParen + 2).trim().replace(/\s+/g, ' ').split(' ');
  const ppid = Number(fields[1]);
  const utimeTicks = Number(fields[11]);
  const stimeTicks = Number(fields[12]);
  const startTimeTicks = Number(fields[19]);
  if (![ppid, utimeTicks, stimeTicks, startTimeTicks].every(Number.isFinite)) return null;
  return { ppid, utimeTicks, stimeTicks, startTimeTicks };
}

function readProcUptimeSecondsOrNull(procRoot: string): number | null {
  try {
    const match = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/.exec(readFileSync(join(procRoot, 'uptime'), 'utf-8').trim());
    if (!match) return null;
    return Number(match[1]);
  } catch {
    return null;
  }
}

function readProcessLiveness(pid: number, procRoot: string): 'alive' | 'dead' {
  if (!existsSync(join(procRoot, String(pid)))) return 'dead';
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return 'dead';
    return 'alive';
  }
}

function readProcessSnapshot(pid: number, procRoot: string, uptimeSeconds: number): ProcessSnapshot | null {
  const basePath = join(procRoot, String(pid));
  const cmdlineRaw = readProcStringOrNull(join(basePath, 'cmdline'));
  if (!cmdlineRaw) return null;
  const cmdline = cmdlineRaw.replace(/\0/g, ' ').trim();
  if (!cmdline) return null;

  const comm = (readProcStringOrNull(join(basePath, 'comm')) ?? '').trim();
  const stat = readProcStringOrNull(join(basePath, 'stat'));
  const parsedStat = stat ? parseStat(stat) : null;
  if (!parsedStat) return null;

  const status = readProcStringOrNull(join(basePath, 'status')) ?? '';
  const rssMatch = /VmRSS:\s+(\d+)\s+kB/m.exec(status);
  const rssBytes = rssMatch ? Number(rssMatch[1]) * 1024 : 0;
  const cwd = readProcCwdOrNull(pid, procRoot);
  const cpuSeconds = (parsedStat.utimeTicks + parsedStat.stimeTicks) / CLOCK_TICKS_PER_SECOND;
  const ageSeconds = Math.max(0, uptimeSeconds - (parsedStat.startTimeTicks / CLOCK_TICKS_PER_SECOND));
  const cpuPct = ageSeconds > 0 ? (cpuSeconds / ageSeconds) * 100 : 0;

  return { pid, ppid: parsedStat.ppid, cmdline, comm, cwd, rssBytes, cpuPct, ageSeconds };
}

function listPids(procRoot: string): number[] {
  if (!existsSync(procRoot)) return [];
  const pids: number[] = [];
  for (const entry of readdirSync(procRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pid = Number(entry.name);
    if (Number.isInteger(pid) && pid > 0) pids.push(pid);
  }
  return pids;
}

function getWorktreeFromCwd(cwd: string | null): string | null {
  if (!cwd) return null;
  const marker = '/.worktrees/';
  const index = cwd.indexOf(marker);
  if (index < 0) return null;
  const tail = cwd.slice(index + marker.length);
  const slash = tail.indexOf('/');
  return cwd.slice(0, index + marker.length + (slash < 0 ? tail.length : slash));
}

function basename(command: string): string {
  return command.split('/').pop() ?? command;
}

function isShellWrapper(command: string): boolean {
  return ['sh', 'bash', 'zsh', 'fish'].includes(basename(command));
}

function getSpecialistKeepAliveAgeMs(snapshot: ProcessSnapshot, nowMs: number): number {
  return Math.max(0, nowMs - Math.round(snapshot.ageSeconds * 1000));
}

function isOrphanedKeepAlive(snapshot: ProcessSnapshot, ageMs: number, minAgeMs: number): boolean {
  return snapshot.ppid === 1 && isSpecialistRunCommand(snapshot.cmdline) && ageMs >= minAgeMs;
}

function isSpecialistRunCommand(cmdline: string): boolean {
  const tokens = cmdline.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || isShellWrapper(tokens[0]!)) return false;
  const commandIndex = tokens.findIndex((token) => ['specialists', 'sp'].includes(basename(token)));
  return commandIndex >= 0 && tokens[commandIndex + 1] === 'run';
}

function isPiAgentProcess(snapshot: ProcessSnapshot): boolean {
  return snapshot.cmdline.includes('pi-coding-agent');
}

function isPiOrphanCandidate(snapshot: ProcessSnapshot): boolean {
  return snapshot.comm === 'pi' || isPiAgentProcess(snapshot);
}

function isDeletedCwdToolProcess(snapshot: ProcessSnapshot): boolean {
  if (!snapshot.cwd?.includes('(deleted)')) return false;
  return isPiOrphanCandidate(snapshot)
    || isSpecialistRunCommand(snapshot.cmdline)
    || snapshot.cmdline.includes('gitnexus')
    || snapshot.cmdline.includes('serena')
    || snapshot.cmdline.includes('tsserver');
}

function classifyProcess(snapshot: ProcessSnapshot): ProcessHealthProcessKind | null {
  const { cmdline, ppid } = snapshot;
  if (cmdline.includes('dolt sql-server')) return 'dolt';
  if (cmdline.includes('serena') && (cmdline.includes('language-server') || cmdline.includes('lsp'))) return 'serena-lsp';
  if (isDeletedCwdToolProcess(snapshot)) return 'orphan';
  if ((isPiOrphanCandidate(snapshot) || (cmdline.includes('gitnexus') && cmdline.includes('mcp'))) && ppid === 1) return 'orphan';
  if (isPiAgentProcess(snapshot) || isSpecialistRunCommand(cmdline)) return 'specialist';
  return null;
}

function getOrphanReason(snapshot: ProcessSnapshot): 'dolt-worktree-local' | 'gitnexus-orphan' | 'pi-orphan' | 'deleted-worktree-process' | null {
  if (snapshot.cmdline.includes('dolt sql-server')) return 'dolt-worktree-local';
  if (isDeletedCwdToolProcess(snapshot)) return 'deleted-worktree-process';
  if (snapshot.cmdline.includes('gitnexus') && snapshot.cmdline.includes('mcp') && snapshot.ppid === 1) return 'gitnexus-orphan';
  if (isPiOrphanCandidate(snapshot) && snapshot.ppid === 1) return 'pi-orphan';
  return null;
}

function toProcessHealthProcess(snapshot: ProcessSnapshot, kind: ProcessHealthProcessKind): ProcessHealthProcess {
  return {
    pid: snapshot.pid,
    ppid: snapshot.ppid,
    kind,
    role: kind,
    cmdline: snapshot.cmdline,
    cwd: snapshot.cwd,
    rssBytes: snapshot.rssBytes,
    cpuPct: snapshot.cpuPct,
    ageSeconds: snapshot.ageSeconds,
    worktree: getWorktreeFromCwd(snapshot.cwd),
  };
}

export function collectProcessHealth(options: { procRoot?: string; meminfoPath?: string; nowMs?: number } = {}): ProcessHealthReport {
  const procRoot = options.procRoot ?? '/proc';
  const meminfoPath = options.meminfoPath ?? '/proc/meminfo';
  const uptimeSeconds = readProcUptimeSecondsOrNull(procRoot) ?? ((options.nowMs ?? Date.now()) / 1000);
  const thresholds = getProcessHealthThresholds();
  const memAvailableBytes = readMemAvailableBytes(meminfoPath);
  const processes: ProcessHealthProcess[] = [];

  for (const pid of listPids(procRoot)) {
    const snapshot = readProcessSnapshot(pid, procRoot, uptimeSeconds);
    if (!snapshot) continue;
    const kind = classifyProcess(snapshot);
    if (!kind) continue;
    const process = toProcessHealthProcess(snapshot, kind);
    if (kind === 'orphan') process.reason = getOrphanReason(snapshot) ?? undefined;
    processes.push(process);
  }

  const specialistProcesses = processes.filter((process) => process.kind === 'specialist');
  const doltProcesses = processes.filter((process) => process.kind === 'dolt');
  const serenaProcesses = processes.filter((process) => process.kind === 'serena-lsp');
  const orphanProcesses = processes.filter((process) => process.kind === 'orphan');

  const serenaMap = new Map<string, ProcessHealthProcess[]>();
  for (const process of serenaProcesses) {
    const workspace = process.worktree ?? process.cwd ?? 'unknown';
    if (!serenaMap.has(workspace)) serenaMap.set(workspace, []);
    serenaMap.get(workspace)!.push(process);
  }

  const warnLimitBytes = Math.floor(memAvailableBytes * (thresholds.warnPct / 100));
  const refuseLimitBytes = Math.floor(memAvailableBytes * (thresholds.refusePct / 100));
  const totalRssBytes = processes.reduce((sum, process) => sum + process.rssBytes, 0);
  const totalCpuPct = processes.reduce((sum, process) => sum + process.cpuPct, 0);
  const thresholdPct = memAvailableBytes > 0 ? (totalRssBytes / memAvailableBytes) * 100 : 0;
  const statusReasons: string[] = [];

  if (thresholdPct >= thresholds.refusePct) statusReasons.push(`rss >= refuse threshold (${thresholds.refusePct}%)`);
  else if (thresholdPct >= thresholds.warnPct) statusReasons.push(`rss >= warn threshold (${thresholds.warnPct}%)`);
  if (doltProcesses.length > 1) statusReasons.push(`dolt sql-server count ${doltProcesses.length} > expected 1`);
  if (orphanProcesses.length > 0) statusReasons.push(`orphan process count ${orphanProcesses.length} > 0`);

  const status: ProcessHealthStatus = thresholdPct >= thresholds.refusePct ? 'REFUSE'
    : statusReasons.length > 0 ? 'WARN'
    : 'OK';

  return {
    status,
    statusReasons,
    memAvailableBytes,
    totalRssBytes,
    totalCpuPct,
    specialistCount: specialistProcesses.length,
    doltCount: doltProcesses.length,
    serenaLspCount: serenaProcesses.length,
    orphanCount: orphanProcesses.length,
    thresholdPct,
    warnPct: thresholds.warnPct,
    refusePct: thresholds.refusePct,
    warnLimitBytes,
    refuseLimitBytes,
    specialistProcesses,
    doltProcesses,
    serenaWorkspaces: [...serenaMap.entries()].map(([workspace, workspaceProcesses]) => ({
      workspace,
      count: workspaceProcesses.length,
      rssBytes: workspaceProcesses.reduce((sum, process) => sum + process.rssBytes, 0),
      processes: workspaceProcesses,
    })).sort((left, right) => right.rssBytes - left.rssBytes),
    orphanProcesses,
  };
}

function withReason(process: ProcessHealthProcess, reason: NonNullable<ProcessHealthProcess['reason']>): ProcessHealthProcess {
  return { ...process, reason };
}

function hasDeletedCwd(process: ProcessHealthProcess): boolean {
  return Boolean(process.cwd?.includes('(deleted)'));
}

export function collectOrphanProcesses(options: { procRoot?: string; nowMs?: number } = {}): ProcessHealthProcess[] {
  const health = collectProcessHealth(options);
  const reaped = new Map<number, ProcessHealthProcess>();

  for (const process of health.orphanProcesses) reaped.set(process.pid, process);
  for (const process of health.doltProcesses) {
    if (hasDeletedCwd(process)) reaped.set(process.pid, withReason(process, 'dolt-worktree-local'));
  }
  for (const process of health.specialistProcesses) {
    if (hasDeletedCwd(process)) reaped.set(process.pid, withReason(process, 'deleted-worktree-process'));
  }
  for (const workspace of health.serenaWorkspaces) {
    for (const process of workspace.processes) {
      if (hasDeletedCwd(process)) reaped.set(process.pid, withReason(process, 'deleted-worktree-process'));
    }
  }

  return [...reaped.values()].sort((left, right) => left.pid - right.pid);
}

export function collectStaleSpecialistJobs(options: {
  procRoot?: string;
  nowMs?: number;
  minKeepAliveAgeMs?: number;
  /**
   * Minimum ms since the last update on a terminal-status job before its still-alive PID
   * is treated as a leak. pi's session close-path has an 8s group-SIGKILL backstop, so any
   * process still alive well past that has failed to receive a close signal. Default 60s.
   */
  minTerminalAliveAgeMs?: number;
  observabilityClient?: StaleSpecialistJobSource;
} = {}): StaleSpecialistJobCandidate[] {
  const procRoot = options.procRoot ?? '/proc';
  const nowMs = options.nowMs ?? Date.now();
  const minKeepAliveAgeMs = options.minKeepAliveAgeMs ?? 30 * 60 * 1000;
  const minTerminalAliveAgeMs = options.minTerminalAliveAgeMs ?? 60 * 1000;
  const observabilityClient = options.observabilityClient ?? createObservabilitySqliteClient();
  const statuses = observabilityClient?.listStatuses() ?? [];
  const staleStatuses = statuses.filter((status) => ['starting', 'running', 'waiting'].includes(status.status));
  const terminalStatuses = statuses.filter((status) => ['done', 'error', 'cancelled'].includes(status.status));
  const uptimeSeconds = readProcUptimeSecondsOrNull(procRoot) ?? (nowMs / 1000);
  const candidates: StaleSpecialistJobCandidate[] = [];

  for (const status of staleStatuses) {
    const pid = (status as SupervisorStatus & { pid?: number }).pid;
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) continue;

    const ageMs = Math.max(0, nowMs - ((status as SupervisorStatus & { updated_at_ms?: number }).updated_at_ms ?? nowMs));
    const snapshot = readProcessSnapshot(pid, procRoot, uptimeSeconds);
    if (!snapshot) {
      if (readProcessLiveness(pid, procRoot) === 'dead' && ageMs >= minKeepAliveAgeMs) {
        candidates.push({ jobId: status.id, pid, beadId: status.bead_id ?? null, specialist: status.specialist, cwd: null, ageMs, reason: 'dead-pid' });
        continue;
      }

      const basePath = join(procRoot, String(pid));
      const cmdlineRaw = readProcStringOrNull(join(basePath, 'cmdline'));
      const statRaw = readProcStringOrNull(join(basePath, 'stat'));
      const parsedStat = statRaw ? parseStat(statRaw) : null;
      if (status.status === 'waiting' && parsedStat?.ppid === 1 && cmdlineRaw && isSpecialistRunCommand(cmdlineRaw.replace(/\0/g, ' '))) {
        candidates.push({ jobId: status.id, pid, beadId: status.bead_id ?? null, specialist: status.specialist, cwd: readProcCwdOrNull(pid, procRoot), ageMs, reason: 'orphaned-keep-alive' });
      }
      continue;
    }

    if (status.status === 'waiting'
      && snapshot.ppid === 1
      && isSpecialistRunCommand(snapshot.cmdline)
      && ageMs >= minKeepAliveAgeMs) {
      candidates.push({ jobId: status.id, pid, beadId: status.bead_id ?? null, specialist: status.specialist, cwd: snapshot.cwd, ageMs, reason: 'orphaned-keep-alive' });
      continue;
    }

    if (status.status !== 'running' && status.status !== 'waiting') continue;
    if (ageMs < minKeepAliveAgeMs) continue;
    const lastActivityMs = observabilityClient?.getLastActivityTimestampMs?.(status.id) ?? null;
    if (lastActivityMs !== null && (nowMs - lastActivityMs) < minKeepAliveAgeMs) continue;
    candidates.push({ jobId: status.id, pid, beadId: status.bead_id ?? null, specialist: status.specialist, cwd: snapshot.cwd, ageMs, reason: 'dead-toolchain' });
  }

  // Terminal-alive: registry says done/error/cancelled but the OS process (and its detached pi child)
  // is still running past the pi close-path backstop window. Introduced for unitAI-yme9q.
  for (const status of terminalStatuses) {
    const pid = (status as SupervisorStatus & { pid?: number }).pid;
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) continue;

    const updatedAtMs = (status as SupervisorStatus & { updated_at_ms?: number }).updated_at_ms ?? nowMs;
    const ageMs = Math.max(0, nowMs - updatedAtMs);
    if (ageMs < minTerminalAliveAgeMs) continue;

    const snapshot = readProcessSnapshot(pid, procRoot, uptimeSeconds);
    if (!snapshot) {
      if (readProcessLiveness(pid, procRoot) !== 'alive') continue;
      candidates.push({
        jobId: status.id,
        pid,
        beadId: status.bead_id ?? null,
        specialist: status.specialist,
        cwd: readProcCwdOrNull(pid, procRoot),
        ageMs,
        reason: 'terminal-alive',
      });
      continue;
    }

    candidates.push({
      jobId: status.id,
      pid,
      beadId: status.bead_id ?? null,
      specialist: status.specialist,
      cwd: snapshot.cwd,
      ageMs,
      reason: 'terminal-alive',
    });
  }

  return candidates.sort((left, right) => left.pid - right.pid);
}
