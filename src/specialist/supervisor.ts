// src/specialist/supervisor.ts
// Wraps SpecialistRunner to provide file-based job state for background execution.

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import type { SpecialistRunner, RunOptions } from './runner.js';
import { resolveJobsDir, resolveCurrentBranch } from './job-root.js';
import type { BeadsClient } from './beads.js';
import {
  type TimelineEvent,
  TIMELINE_EVENT_TYPES,
  createRunStartEvent,
  createMetaEvent,
  createRunCompleteEvent,
  createStatusChangeEvent,
  createStaleWarningEvent,
  createTokenUsageEvent,
  createFinishReasonEvent,
  createTurnSummaryEvent,
  createCompactionEvent,
  createRetryEvent,
  createAutoCommitEvent,
  mapCallbackEventToTimelineEvent,
} from './timeline-events.js';
import type { SessionMetricEvent, SessionRunMetrics } from '../pi/session.js';
import type { StallDetectionConfig } from './loader.js';
import { createObservabilitySqliteClient, type ObservabilitySqliteClient } from './observability-sqlite.js';
import { resolveObservabilityDbLocation } from './observability-db.js';
import { resolveChainId } from './epic-lifecycle.js';
import { loadEpicReadinessSummary, syncEpicStateFromReadiness } from './epic-readiness.js';
import { derivePersistedChainIdentity } from './chain-identity.js';
import { isTmuxSessionAlive } from '../cli/tmux-utils.js';

const JOB_TTL_DAYS = Number(process.env.SPECIALISTS_JOB_TTL_DAYS ?? 7);

export const STALL_DETECTION_DEFAULTS: Required<StallDetectionConfig> = {
  running_silence_warn_ms: 60_000,
  running_silence_error_ms: 300_000,
  waiting_stale_ms: 3_600_000,
  tool_duration_warn_ms: 120_000,
};

export type SupervisorJobStatus = 'starting' | 'running' | 'waiting' | 'done' | 'error' | 'cancelled';

export interface SupervisorStatus {
  id: string;
  specialist: string;
  status: SupervisorJobStatus;
  current_event?: string;
  current_tool?: string;
  model?: string;
  backend?: string;
  pid?: number;
  started_at_ms: number;
  elapsed_s?: number;
  last_event_at_ms?: number;
  bead_id?: string;
  node_id?: string;
  session_file?: string;
  fifo_path?: string;
  tmux_session?: string;
  worktree_path?: string;
  reused_from_job_id?: string;
  worktree_owner_job_id?: string;
  chain_kind?: 'chain' | 'prep';
  chain_id?: string;
  chain_root_job_id?: string;
  chain_root_bead_id?: string;
  epic_id?: string;
  branch?: string;
  startup_context?: {
    job_id?: string;
    specialist_name?: string;
    bead_id?: string;
    reused_from_job_id?: string;
    worktree_owner_job_id?: string;
    chain_id?: string;
    chain_root_job_id?: string;
    chain_root_bead_id?: string;
    worktree_path?: string;
    branch?: string;
    variables_keys?: string[];
    reviewed_job_id_present?: boolean;
    reused_worktree_awareness_present?: boolean;
    bead_context_present?: boolean;
    memory_injection?: {
      static_tokens: number;
      memory_tokens: number;
      gitnexus_tokens: number;
      total_tokens: number;
    };
    mandatory_rules_injection?: {
      sets_loaded: string[];
      rules_count: number;
      inline_rules_count: number;
      globals_disabled: boolean;
      token_estimate: number;
    };
    skills?: {
      count: number;
      activated: string[];
    };
  };
  metrics?: SessionRunMetrics;
  context_pct?: number;
  context_health?: ContextHealth;
  error?: string;
  auto_commit_count?: number;
  last_auto_commit_sha?: string;
  last_auto_commit_at_ms?: number;
}

export type SupervisorStatusView = SupervisorStatus & { is_dead: boolean };

export interface SupervisorOptions {
  runner: SpecialistRunner;
  runOptions: RunOptions;
  /** Absolute path to .specialists/jobs/. Defaults to the git-common-root-anchored path. */
  jobsDir?: string;
  beadsClient?: BeadsClient;
  /** Optional callback to stream progress deltas to stdout/elsewhere */
  onProgress?: (delta: string) => void;
  /** Optional callback for meta events (backend/model) */
  onMeta?: (meta: { backend: string; model: string }) => void;
  /** Optional callback fired as soon as a job id is allocated and persisted */
  onJobStarted?: (job: { id: string }) => void;
  /** Stall detection thresholds — merged with STALL_DETECTION_DEFAULTS */
  stallDetection?: StallDetectionConfig;
}



function getCurrentGitSha(): string | undefined {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return undefined;
  const sha = result.stdout?.trim();
  return sha || undefined;
}

function formatBeadNotes(result: { output: string; promptHash?: string; durationMs?: number; model: string; backend: string; specialist: string; jobId: string; status: SupervisorJobStatus; timestamp: string }): string {
  const statusLabel = result.status === 'waiting'
    ? 'WAITING — more output may follow'
    : result.status.toUpperCase();
  const metadata = [
    `timestamp=${result.timestamp}`,
    `status=${result.status}`,
    `prompt_hash=${result.promptHash ?? 'unknown'}`,
    `git_sha=${getCurrentGitSha() ?? 'unknown'}`,
    `elapsed_ms=${result.durationMs !== undefined ? Math.round(result.durationMs) : 'unknown'}`,
    `model=${result.model}`,
    `backend=${result.backend}`,
  ].join('\n');
  return `### Specialist Output — ${result.specialist} (job ${result.jobId}) [${statusLabel}]\n\n${result.output}\n\n---\n${metadata}`;
}

const GITNEXUS_RISK_ORDER: Record<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

type ContextHealth = 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL';

const MODEL_CONTEXT_WINDOWS: Array<{ matcher: (model: string) => boolean; windowTokens: number }> = [
  { matcher: (model) => model.includes('gemini-3.1-pro'), windowTokens: 1_000_000 },
  { matcher: (model) => model.includes('qwen3.5') || model.includes('glm-5'), windowTokens: 128_000 },
  { matcher: (model) => model.includes('claude'), windowTokens: 200_000 },
];

const TERMINAL_COMPLIANCE_VERDICT_REGEX = /## Compliance Verdict[\s\S]*?- Verdict: (PASS|PARTIAL|FAIL)/i;

function getModelContextWindow(model: string | undefined): number | undefined {
  if (!model) return undefined;
  const normalizedModel = model.toLowerCase();
  return MODEL_CONTEXT_WINDOWS.find(({ matcher }) => matcher(normalizedModel))?.windowTokens;
}

function getContextHealth(contextPct: number): ContextHealth {
  if (contextPct < 40) return 'OK';
  if (contextPct <= 65) return 'MONITOR';
  if (contextPct <= 80) return 'WARN';
  return 'CRITICAL';
}

function calculateContextUtilization(
  contextInputTokens: number,
  model: string | undefined,
): { context_pct: number; context_health: ContextHealth } | undefined {
  const contextWindow = getModelContextWindow(model);
  if (!contextWindow || contextInputTokens < 0) return undefined;

  const contextPct = (contextInputTokens / contextWindow) * 100;
  return {
    context_pct: Number(contextPct.toFixed(2)),
    context_health: getContextHealth(contextPct),
  };
}

function normalizeGitnexusRisk(value: unknown): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'HIGH' || normalized === 'CRITICAL') {
    return normalized;
  }
  return undefined;
}

function collectStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function extractGitnexusFiles(tool: string, resultRaw?: Record<string, unknown>): string[] {
  if (!resultRaw) return [];
  if (tool === 'gitnexus_impact') {
    return collectStringArray(resultRaw.files);
  }
  if (tool === 'gitnexus_detect_changes') {
    return collectStringArray(resultRaw.files_changed);
  }
  return [];
}

function extractGitnexusSymbols(resultRaw?: Record<string, unknown>, args?: Record<string, unknown>): string[] {
  if (!resultRaw) return [];
  const symbols = [
    ...collectStringArray(resultRaw.symbols_analyzed),
    ...collectStringArray(resultRaw.affected_symbols),
    ...collectStringArray(resultRaw.symbols_modified),
  ];

  const argTarget = args?.target;
  if (typeof argTarget === 'string' && argTarget.trim().length > 0) {
    symbols.push(argTarget);
  }

  return symbols;
}

function extractGitnexusRisk(resultRaw?: Record<string, unknown>): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined {
  if (!resultRaw) return undefined;
  const direct = normalizeGitnexusRisk(resultRaw.risk_level)
    ?? normalizeGitnexusRisk(resultRaw.riskLevel)
    ?? normalizeGitnexusRisk(resultRaw.highest_risk)
    ?? normalizeGitnexusRisk(resultRaw.risk);
  if (direct) return direct;

  const blastRadius = resultRaw.blast_radius;
  if (blastRadius && typeof blastRadius === 'object' && !Array.isArray(blastRadius)) {
    const blastRadiusRecord = blastRadius as Record<string, unknown>;
    return normalizeGitnexusRisk(blastRadiusRecord.risk_level)
      ?? normalizeGitnexusRisk(blastRadiusRecord.riskLevel)
      ?? normalizeGitnexusRisk(blastRadiusRecord.highest_risk)
      ?? normalizeGitnexusRisk(blastRadiusRecord.risk);
  }

  return undefined;
}

function isGitnexusAnalyzeRequired(permissionRequired: string | undefined): boolean {
  return permissionRequired === 'MEDIUM' || permissionRequired === 'HIGH';
}

const AUTO_COMMIT_NOISE_PREFIXES = ['.xtrm/', '.wolf/', '.specialists/jobs/', '.beads/'] as const;

function isAutoCommitNoisePath(path: string): boolean {
  return AUTO_COMMIT_NOISE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function listSubstantiveWorktreeFiles(worktreePath: string): string[] {
  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: worktreePath,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (status.status !== 0) {
    throw new Error((status.stderr ?? status.stdout ?? 'git status failed').trim());
  }

  return (status.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const payload = line.length > 3 ? line.slice(3).trim() : '';
      if (!payload) return '';
      const renamed = payload.includes(' -> ') ? payload.split(' -> ').at(-1) ?? '' : payload;
      return renamed.trim().replace(/^"|"$/g, '');
    })
    .filter((path) => path.length > 0)
    .filter((path) => !isAutoCommitNoisePath(path));
}

function buildAutoCommitMessage(specialist: string, beadId: string | undefined, turnNumber: number): string {
  const beadLabel = beadId ?? 'no-bead';
  return `checkpoint(${specialist}): ${beadLabel} turn ${turnNumber}`;
}

function runAutoCommitCheckpoint(options: {
  autoCommitPolicy: 'never' | 'checkpoint_on_waiting' | 'checkpoint_on_terminal' | undefined;
  target: 'waiting' | 'terminal';
  worktreePath: string | undefined;
  specialist: string;
  beadId: string | undefined;
  turnNumber: number;
}):
  | { status: 'skipped'; reason: string }
  | { status: 'success'; sha: string; files: string[]; committedAtMs: number }
  | { status: 'failed'; reason: string } {
  const { autoCommitPolicy, target, worktreePath, specialist, beadId, turnNumber } = options;
  if (!worktreePath) return { status: 'skipped', reason: 'no_worktree' };
  if (!autoCommitPolicy || autoCommitPolicy === 'never') return { status: 'skipped', reason: 'policy_never' };
  if (autoCommitPolicy === 'checkpoint_on_waiting' && target !== 'waiting') {
    return { status: 'skipped', reason: 'policy_waiting_only' };
  }
  if (autoCommitPolicy === 'checkpoint_on_terminal' && target !== 'terminal') {
    return { status: 'skipped', reason: 'policy_terminal_only' };
  }

  try {
    const substantiveFiles = listSubstantiveWorktreeFiles(worktreePath);
    if (substantiveFiles.length === 0) {
      return { status: 'skipped', reason: 'no_substantive_changes' };
    }

    const addResult = spawnSync('git', ['add', '--', ...substantiveFiles], {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (addResult.status !== 0) {
      return { status: 'failed', reason: (addResult.stderr ?? addResult.stdout ?? 'git add failed').trim() };
    }

    const commitResult = spawnSync('git', ['commit', '-m', buildAutoCommitMessage(specialist, beadId, turnNumber)], {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (commitResult.status !== 0) {
      return { status: 'failed', reason: (commitResult.stderr ?? commitResult.stdout ?? 'git commit failed').trim() };
    }

    const shaResult = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (shaResult.status !== 0) {
      return { status: 'failed', reason: (shaResult.stderr ?? shaResult.stdout ?? 'git rev-parse failed').trim() };
    }

    return {
      status: 'success',
      sha: (shaResult.stdout ?? '').trim(),
      files: substantiveFiles,
      committedAtMs: Date.now(),
    };
  } catch (error: unknown) {
    return { status: 'failed', reason: String(error) };
  }
}

function startDetachedGitnexusAnalyze(cwd: string): void {
  const child = spawn('npx', ['gitnexus', 'analyze'], {
    cwd,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

const STATUS_WATCHDOG_INTERVAL_MS = 5_000;
const STATUS_WATCHDOG_STALE_AFTER_MS = 30_000;

function resolveDetachedRuntime(): string {
  if (process.execPath.endsWith('/bun')) return process.execPath;

  const envRuntime = process.env.SPECIALISTS_BUN_PATH ?? process.env.BUN_PATH;
  if (envRuntime) return envRuntime;

  const whichResult = spawnSync('which', ['bun'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (whichResult.status === 0) {
    const resolved = (whichResult.stdout ?? '').trim();
    if (resolved) return resolved;
  }

  if (String(process.env.SPECIALISTS_JOB_FILE_OUTPUT ?? '').trim().toLowerCase() === 'on') {
    return process.execPath;
  }

  throw new Error('bun:sqlite watchdog requires Bun runtime; either run under Bun or set SPECIALISTS_JOB_FILE_OUTPUT=on');
}

function startDetachedStatusWatchdog(dbPath: string, statusPath: string, jobId: string, pid: number): number | undefined {
  const watchdogScript = `
const { existsSync, readFileSync, writeFileSync, renameSync } = require('node:fs');

const dbPath = process.env.SPECIALISTS_OBSERVABILITY_DB_PATH;
const statusPath = process.env.SPECIALISTS_STATUS_PATH;
const jobId = process.env.SPECIALISTS_STATUS_JOB_ID;
const pidRaw = process.env.SPECIALISTS_STATUS_PID;
const intervalRaw = process.env.SPECIALISTS_STATUS_WATCHDOG_INTERVAL_MS;
const staleAfterRaw = process.env.SPECIALISTS_STATUS_WATCHDOG_STALE_AFTER_MS;
const mode = process.env.SPECIALISTS_STATUS_WATCHDOG_MODE;

const targetPid = Number(pidRaw);
const intervalMs = Number(intervalRaw);
const staleAfterMs = Number(staleAfterRaw);

if (!dbPath || !statusPath || !jobId || !Number.isFinite(targetPid) || targetPid <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
  console.error('[watchdog] invalid env');
  process.exit(1);
}

let Database;
try {
  ({ Database } = require('bun:sqlite'));
} catch (error) {
  console.error('[watchdog] bun:sqlite unavailable:', error?.message ?? String(error));
  process.exit(1);
}

const isPidAlive = () => {
  try {
    process.kill(targetPid, 0);
    return true;
  } catch {
    return false;
  }
};

if (mode === 'db') {
  const readJobStatus = () => {
    const db = new Database(dbPath, { readonly: true, create: false });
    try {
      const row = db.query('SELECT status_json FROM specialist_jobs WHERE job_id = ? LIMIT 1').get(jobId);
      return row?.status_json ? JSON.parse(row.status_json) : null;
    } finally {
      db.close();
    }
  };

  const run = () => {
    const status = readJobStatus();
    if (!status) {
      if (!isPidAlive()) process.exit(0);
      return;
    }
    if (status.status === 'done' || status.status === 'error') process.exit(0);
    if (!isPidAlive()) process.exit(0);
  };

  setInterval(run, intervalMs);
  run();
  return;
}

if (mode === 'file') {
  const run = () => {
    if (!existsSync(statusPath)) return;
    let status;
    try {
      status = JSON.parse(readFileSync(statusPath, 'utf-8'));
    } catch {
      return;
    }
    if (!status || typeof status !== 'object') return;
    if (status.status === 'done' || status.status === 'error') {
      process.exit(0);
      return;
    }
    const updatedAtMs = Number(status.updated_at_ms ?? status.last_event_at_ms ?? status.started_at_ms ?? 0);
    if (Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > staleAfterMs) {
      process.exit(0);
      return;
    }
    if (!isPidAlive()) process.exit(0);
  };

  console.warn('[watchdog] file mode degraded; Bun unavailable, polling status file');
  setInterval(run, intervalMs);
  run();
  return;
}

console.error('[watchdog] invalid watchdog mode');
process.exit(1);
`;

  const runtime = resolveDetachedRuntime();
  const watchdogMode = String(process.env.SPECIALISTS_JOB_FILE_OUTPUT ?? '').trim().toLowerCase() === 'on' && runtime === process.execPath ? 'file' : 'db';
  const watchdog = spawn(runtime, ['-e', watchdogScript], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      SPECIALISTS_OBSERVABILITY_DB_PATH: dbPath,
      SPECIALISTS_STATUS_PATH: statusPath,
      SPECIALISTS_STATUS_JOB_ID: jobId,
      SPECIALISTS_STATUS_PID: String(pid),
      SPECIALISTS_STATUS_WATCHDOG_INTERVAL_MS: String(STATUS_WATCHDOG_INTERVAL_MS),
      SPECIALISTS_STATUS_WATCHDOG_STALE_AFTER_MS: String(STATUS_WATCHDOG_STALE_AFTER_MS),
      SPECIALISTS_STATUS_WATCHDOG_MODE: watchdogMode,
    },
  });

  watchdog.unref();
  return watchdog.pid ?? undefined;
}

export function isPidAlive(pid: number | undefined): boolean {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isJobDead(status: Pick<SupervisorStatus, 'status' | 'pid' | 'tmux_session'>): boolean {
  if (status.status !== 'starting' && status.status !== 'running' && status.status !== 'waiting') return false;
  if (status.pid !== undefined && !isPidAlive(status.pid)) return true;
  if (status.tmux_session && !isTmuxSessionAlive(status.tmux_session)) return true;
  return false;
}

export class Supervisor {
  private readonly sqliteClient: ObservabilitySqliteClient | null;
  private readonly resolvedJobsDir: string;
  private isDisposed = false;
  private disposePromise: Promise<void> | null = null;
  private pendingSqliteOperations = 0;
  private readonly pendingSqliteDrainResolvers = new Set<() => void>();

  constructor(private opts: SupervisorOptions) {
    this.sqliteClient = createObservabilitySqliteClient();
    // Anchor jobs dir to the git common root so worktree sessions share state with
    // the main checkout. Fall back to cwd-relative path when git is unavailable.
    const cwd = opts.runOptions?.workingDirectory ?? process.cwd();
    this.resolvedJobsDir = opts.jobsDir ?? resolveJobsDir(cwd);
  }

  private createDisposedSqliteError(operation: string): Error {
    return new Error(`[supervisor] SQLite operation "${operation}" rejected: supervisor is disposed`);
  }

  private withSqliteOperation<T>(operation: string, fn: (client: ObservabilitySqliteClient) => T): T | undefined {
    const client = this.sqliteClient;
    if (!client) return undefined;
    if (this.isDisposed) throw this.createDisposedSqliteError(operation);

    this.pendingSqliteOperations += 1;
    try {
      return fn(client);
    } finally {
      this.pendingSqliteOperations -= 1;
      if (this.pendingSqliteOperations === 0) {
        for (const resolve of this.pendingSqliteDrainResolvers) {
          resolve();
        }
        this.pendingSqliteDrainResolvers.clear();
      }
    }
  }

  private async waitForPendingSqliteOperations(): Promise<void> {
    if (this.pendingSqliteOperations === 0) return;

    await new Promise<void>((resolve) => {
      this.pendingSqliteDrainResolvers.add(resolve);
    });
  }

  async dispose(): Promise<void> {
    if (this.disposePromise) {
      await this.disposePromise;
      return;
    }

    this.isDisposed = true;
    this.disposePromise = (async () => {
      await this.waitForPendingSqliteOperations();
      if (!this.sqliteClient) return;
      try {
        this.sqliteClient.close();
      } catch (error: unknown) {
        console.warn(`[supervisor] Failed to close sqlite client: ${String(error)}`);
      }
    })();

    await this.disposePromise;
  }

  private jobDir(id: string): string {
    return join(this.resolvedJobsDir, id);
  }

  private statusPath(id: string): string {
    return join(this.jobDir(id), 'status.json');
  }

  private resultPath(id: string): string {
    return join(this.jobDir(id), 'result.txt');
  }

  private observabilityDbPath(): string {
    return resolveObservabilityDbLocation(this.opts.runOptions?.workingDirectory ?? process.cwd()).dbPath;
  }

  private shouldWriteJobFiles(): boolean {
    const mode = String(process.env.SPECIALISTS_JOB_FILE_OUTPUT ?? '').trim().toLowerCase();
    return mode === '' || mode === 'on' || mode === 'true' || mode === '1';
  }

  private eventsPath(id: string): string {
    return join(this.jobDir(id), 'events.jsonl');
  }

  private readyDir(): string {
    return join(this.resolvedJobsDir, '..', 'ready');
  }

  private writeReadyMarker(id: string): void {
    mkdirSync(this.readyDir(), { recursive: true });
    writeFileSync(join(this.readyDir(), id), '', 'utf-8');
  }

  private withComputedLiveness(status: SupervisorStatus): SupervisorStatusView {
    return {
      ...status,
      is_dead: isJobDead(status),
    };
  }

  readStatus(id: string): SupervisorStatusView | null {
    try {
      if (this.isDisposed) {
        throw this.createDisposedSqliteError('readStatus');
      }
      const sqliteStatus = this.withSqliteOperation('readStatus', (client) => client.readStatus(id));
      if (sqliteStatus) return this.withComputedLiveness(sqliteStatus);
    } catch (error: unknown) {
      if (!(error instanceof Error && error.message.includes('supervisor is disposed'))) {
        console.warn(`[supervisor] SQLite readStatus failed, falling back to file state: ${String(error)}`);
      }
    }

    const path = this.statusPath(id);
    if (!existsSync(path)) return null;
    try {
      const status = JSON.parse(readFileSync(path, 'utf-8')) as SupervisorStatus;
      return this.withComputedLiveness(status);
    } catch {
      return null;
    }
  }

  updateJobStatus(id: string, status: Extract<SupervisorJobStatus, 'done' | 'cancelled' | 'error' | 'waiting' | 'running' | 'starting'>, error?: string): SupervisorStatusView | null {
    const currentStatus = this.readStatus(id);
    if (!currentStatus) return null;

    const updatedStatus: SupervisorStatus = {
      ...currentStatus,
      status,
      current_event: undefined,
      error,
      last_event_at_ms: Date.now(),
    };

    this.writeStatusFile(id, updatedStatus);
    return this.withComputedLiveness(updatedStatus);
  }

  /** List all jobs sorted newest-first. */
  listJobs(): SupervisorStatusView[] {
    try {
      if (this.isDisposed) {
        throw this.createDisposedSqliteError('listStatuses');
      }
      const sqliteJobs = this.withSqliteOperation('listStatuses', (client) => client.listStatuses()) ?? [];
      if (sqliteJobs.length > 0) {
        return sqliteJobs
          .map((status) => this.withComputedLiveness(status))
          .sort((a, b) => b.started_at_ms - a.started_at_ms);
      }
    } catch (error: unknown) {
      if (!(error instanceof Error && error.message.includes('supervisor is disposed'))) {
        console.warn(`[supervisor] SQLite listStatuses failed, falling back to file state: ${String(error)}`);
      }
    }

    if (!existsSync(this.resolvedJobsDir)) return [];
    const jobs: SupervisorStatusView[] = [];
    for (const entry of readdirSync(this.resolvedJobsDir)) {
      const path = join(this.resolvedJobsDir, entry, 'status.json');
      if (!existsSync(path)) continue;
      try {
        const status = JSON.parse(readFileSync(path, 'utf-8')) as SupervisorStatus;
        jobs.push(this.withComputedLiveness(status));
      } catch { /* skip */ }
    }
    return jobs.sort((a, b) => b.started_at_ms - a.started_at_ms);
  }

  private withStatusLineageDefaults(id: string, status: SupervisorStatus): SupervisorStatus {
    const chainRootJobId = status.chain_root_job_id ?? status.worktree_owner_job_id;
    const chainRootSnapshot = chainRootJobId && chainRootJobId !== id
      ? this.readStatus(chainRootJobId) ?? undefined
      : undefined;

    const identity = derivePersistedChainIdentity(status, chainRootSnapshot);

    if (identity.chain_kind === 'prep') {
      return {
        ...status,
        chain_kind: 'prep',
        chain_id: undefined,
        chain_root_job_id: undefined,
        chain_root_bead_id: undefined,
      };
    }

    return {
      ...status,
      worktree_owner_job_id: identity.chain_root_job_id,
      chain_kind: 'chain',
      chain_id: identity.chain_id,
      chain_root_job_id: identity.chain_root_job_id,
      chain_root_bead_id: identity.chain_root_bead_id,
    };
  }

  private writeStatusFileOnly(id: string, data: SupervisorStatus): void {
    if (!this.shouldWriteJobFiles()) return;
    const normalizedStatus = this.withStatusLineageDefaults(id, data);
    mkdirSync(this.jobDir(id), { recursive: true });
    const path = this.statusPath(id);
    const tmp = path + '.tmp';
    writeFileSync(tmp, JSON.stringify(normalizedStatus, null, 2), 'utf-8');
    renameSync(tmp, path);
  }

  private writeStatusFile(id: string, data: SupervisorStatus): void {
    const normalizedStatus = this.withStatusLineageDefaults(id, data);
    this.writeStatusFileOnly(id, normalizedStatus);
    try {
      this.withSqliteOperation('upsertStatus', (client) => {
        client.upsertStatus(normalizedStatus);

        const chainId = resolveChainId(normalizedStatus);
        if (!normalizedStatus.epic_id || !chainId) {
          return;
        }

        client.upsertEpicRun({
          epic_id: normalizedStatus.epic_id,
          status: 'open',
          updated_at_ms: Date.now(),
          status_json: JSON.stringify({
            epic_id: normalizedStatus.epic_id,
            status: 'open',
            source: 'supervisor',
            chain_id: chainId,
            chain_root_bead_id: normalizedStatus.chain_root_bead_id ?? null,
            chain_root_job_id: normalizedStatus.chain_root_job_id ?? normalizedStatus.id,
          }),
        });

        client.upsertEpicChainMembership({
          chain_id: chainId,
          epic_id: normalizedStatus.epic_id,
          chain_root_bead_id: normalizedStatus.chain_root_bead_id,
          chain_root_job_id: normalizedStatus.chain_root_job_id ?? normalizedStatus.id,
          updated_at_ms: Date.now(),
        });

        const readiness = loadEpicReadinessSummary(client, normalizedStatus.epic_id);
        syncEpicStateFromReadiness(client, readiness);
      });
    } catch (error: unknown) {
      console.warn(`[supervisor] SQLite upsertStatus failed: ${String(error)}`);
    }
  }


  /** GC: remove job dirs older than JOB_TTL_DAYS. */
  private gc(): void {
    if (!existsSync(this.resolvedJobsDir)) return;
    const cutoff = Date.now() - JOB_TTL_DAYS * 86_400_000;
    for (const entry of readdirSync(this.resolvedJobsDir)) {
      const dir = join(this.resolvedJobsDir, entry);
      try {
        const stat = statSync(dir);
        if (!stat.isDirectory()) continue;
        if (stat.mtimeMs < cutoff) rmSync(dir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }

  /** Crash recovery: mark running jobs with dead PID as error, and emit stale warnings. */
  private crashRecovery(): void {
    if (!existsSync(this.resolvedJobsDir)) return;
    const thresholds: Required<StallDetectionConfig> = {
      ...STALL_DETECTION_DEFAULTS,
      ...this.opts.stallDetection,
    };
    const now = Date.now();
    const shouldUseFiles = String(process.env.SPECIALISTS_JOB_FILE_OUTPUT ?? '').trim().toLowerCase() !== 'off';

    if (this.sqliteClient && !shouldUseFiles) {
      for (const job of this.sqliteClient.listActiveJobs(['running', 'starting', 'waiting'])) {
        const status = (this.sqliteClient as unknown as { readStatus(jobId: string): SupervisorStatus | null }).readStatus(job.job_id);
        if (!status) continue;
        if (status.status === 'running' || status.status === 'starting') {
          if (!status.pid || isPidAlive(status.pid)) continue;
          const tmp = this.statusPath(status.id) + '.tmp';
          const updated: SupervisorStatus = {
            ...status,
            status: 'error',
            error: 'orphaned (parent supervisor died)',
            last_event_at_ms: now,
          };
          writeFileSync(tmp, JSON.stringify(updated, null, 2), 'utf-8');
          renameSync(tmp, this.statusPath(status.id));
          continue;
        }
        if (status.status === 'waiting') {
          const lastEventAt = status.last_event_at_ms ?? status.started_at_ms;
          const silenceMs = now - lastEventAt;
          if (silenceMs > thresholds.waiting_stale_ms) {
            const eventsPath = join(this.resolvedJobsDir, status.id, 'events.jsonl');
            const event = createStaleWarningEvent('waiting_stale', {
              silence_ms: silenceMs,
              threshold_ms: thresholds.waiting_stale_ms,
            });
            try { appendFileSync(eventsPath, JSON.stringify(event) + '\n'); } catch { /* best effort */ }
          }
        }
      }
      return;
    }

    for (const entry of readdirSync(this.resolvedJobsDir)) {
      const statusPath = join(this.resolvedJobsDir, entry, 'status.json');
      if (!existsSync(statusPath)) continue;
      try {
        const s: SupervisorStatus = JSON.parse(readFileSync(statusPath, 'utf-8'));

        if (s.status === 'running' || s.status === 'starting') {
          if (!s.pid) continue;
          if (!isPidAlive(s.pid)) {
            const tmp = statusPath + '.tmp';
            const updated: SupervisorStatus = {
              ...s,
              status: 'error',
              error: 'orphaned (parent supervisor died)',
              last_event_at_ms: now,
            };
            writeFileSync(tmp, JSON.stringify(updated, null, 2), 'utf-8');
            renameSync(tmp, statusPath);
          } else if (s.status === 'running') {
            const lastEventAt = s.last_event_at_ms ?? s.started_at_ms;
            const silenceMs = now - lastEventAt;
            if (silenceMs > thresholds.running_silence_error_ms) {
              const tmp = statusPath + '.tmp';
              const updated: SupervisorStatus = {
                ...s,
                status: 'error',
                error: `No activity for ${Math.round(silenceMs / 1000)}s (threshold: ${thresholds.running_silence_error_ms / 1000}s)`,
              };
              writeFileSync(tmp, JSON.stringify(updated, null, 2), 'utf-8');
              renameSync(tmp, statusPath);
            }
          }
        } else if (s.status === 'waiting') {
          const lastEventAt = s.last_event_at_ms ?? s.started_at_ms;
          const silenceMs = now - lastEventAt;
          if (silenceMs > thresholds.waiting_stale_ms) {
            const eventsPath = join(this.resolvedJobsDir, entry, 'events.jsonl');
            const event = createStaleWarningEvent('waiting_stale', {
              silence_ms: silenceMs,
              threshold_ms: thresholds.waiting_stale_ms,
            });
            try { appendFileSync(eventsPath, JSON.stringify(event) + '\n'); } catch { /* best effort */ }
          }
        }
      } catch { /* ignore */ }
    }
  }

  /**
   * Run the specialist under supervision. Writes job state to disk.
   * Returns the job ID when complete (or throws on error).
   */
  async run(): Promise<string> {
    const { runner, runOptions } = this.opts;

    this.gc();
    this.crashRecovery();

    const id = crypto.randomUUID().slice(0, 6);
    const dir = this.jobDir(id);
    const startedAtMs = Date.now();

    mkdirSync(dir, { recursive: true });
    mkdirSync(this.readyDir(), { recursive: true });

    const nodeId = runOptions.variables?.node_id ?? runOptions.variables?.SPECIALISTS_NODE_ID;
    const variablesKeys = Object.keys(runOptions.variables ?? {});
    const activatedSkills = (runOptions.variables?.activated_skills ?? runOptions.variables?.skills_activated ?? '')
      .split(',')
      .map((skill) => skill.trim())
      .filter((skill) => skill.length > 0);
    const startupContext: NonNullable<SupervisorStatus['startup_context']> = {
      job_id: id,
      specialist_name: runOptions.name,
      ...(runOptions.inputBeadId ? { bead_id: runOptions.inputBeadId } : {}),
      ...(runOptions.reusedFromJobId ? { reused_from_job_id: runOptions.reusedFromJobId } : {}),
      ...(runOptions.worktreeOwnerJobId ? { worktree_owner_job_id: runOptions.worktreeOwnerJobId } : {}),
      ...((runOptions.worktreeOwnerJobId || runOptions.workingDirectory)
        ? {
            chain_id: runOptions.worktreeOwnerJobId ?? id,
            chain_root_job_id: runOptions.worktreeOwnerJobId ?? id,
          }
        : {}),
      ...(runOptions.variables?.chain_root_bead_id ? { chain_root_bead_id: runOptions.variables.chain_root_bead_id } : {}),
      ...(runOptions.workingDirectory ? { worktree_path: runOptions.workingDirectory } : {}),
      ...(runOptions.workingDirectory
        ? { branch: resolveCurrentBranch(runOptions.workingDirectory) }
        : { branch: resolveCurrentBranch() }),
      variables_keys: variablesKeys,
      reviewed_job_id_present: variablesKeys.includes('reviewed_job_id'),
      reused_worktree_awareness_present: variablesKeys.includes('reused_worktree_awareness'),
      bead_context_present: variablesKeys.includes('bead_context'),
      ...(activatedSkills.length > 0
        ? {
            skills: {
              count: activatedSkills.length,
              activated: activatedSkills,
            },
          }
        : {}),
    };

    const initialStatus: SupervisorStatus = {
      id,
      specialist: runOptions.name,
      status: 'starting',
      started_at_ms: startedAtMs,
      pid: process.pid,
      ...(runOptions.inputBeadId ? { bead_id: runOptions.inputBeadId } : {}),
      ...(nodeId ? { node_id: nodeId } : {}),
      ...(process.env.SPECIALISTS_TMUX_SESSION ? { tmux_session: process.env.SPECIALISTS_TMUX_SESSION } : {}),
      ...(runOptions.workingDirectory ? { worktree_path: runOptions.workingDirectory } : {}),
      ...(runOptions.reusedFromJobId ? { reused_from_job_id: runOptions.reusedFromJobId } : {}),
      ...(runOptions.worktreeOwnerJobId ? { worktree_owner_job_id: runOptions.worktreeOwnerJobId } : {}),
      ...((runOptions.worktreeOwnerJobId || runOptions.workingDirectory)
        ? {
            chain_kind: 'chain' as const,
            chain_id: runOptions.worktreeOwnerJobId ?? id,
            chain_root_job_id: runOptions.worktreeOwnerJobId ?? id,
          }
        : { chain_kind: 'prep' as const }),
      ...(runOptions.epicId ? { epic_id: runOptions.epicId } : {}),
      ...(runOptions.workingDirectory
        ? { branch: resolveCurrentBranch(runOptions.workingDirectory) }
        : { branch: resolveCurrentBranch() }),
      startup_context: startupContext,
    };
    this.writeStatusFile(id, initialStatus);
    const statusWatchdogPid = startDetachedStatusWatchdog(this.observabilityDbPath(), this.statusPath(id), id, process.pid);
    // Persist a latest marker so other processes can discover the active job id immediately
    writeFileSync(join(this.resolvedJobsDir, 'latest'), `${id}\n`, 'utf-8');
    this.opts.onJobStarted?.({ id });

    let statusSnapshot: SupervisorStatus = initialStatus;
    const setStatus = (updates: Partial<SupervisorStatus>): void => {
      statusSnapshot = { ...statusSnapshot, ...updates };
      this.writeStatusFile(id, statusSnapshot);
    };

    const mergeRunMetrics = (incoming: SessionRunMetrics | undefined): void => {
      if (!incoming) return;
      runMetrics = {
        ...runMetrics,
        ...incoming,
        ...(incoming.token_usage ? { token_usage: { ...runMetrics.token_usage, ...incoming.token_usage } } : {}),
        ...(incoming.tool_call_names ? { tool_call_names: [...incoming.tool_call_names] } : {}),
      };
      setStatus({ metrics: runMetrics });
    };

    // Keep events.jsonl fd open for the job lifetime
    const eventsFd = openSync(this.eventsPath(id), 'a');
    let nextTimelineSeq = 1;
    const assignTimelineSeq = (event: TimelineEvent): TimelineEvent => {
      if (typeof event.seq === 'number' && Number.isFinite(event.seq) && event.seq > 0) {
        nextTimelineSeq = Math.max(nextTimelineSeq, event.seq + 1);
        return event;
      }
      return { ...event, seq: nextTimelineSeq++ };
    };

    const appendTimelineEvent = (event: TimelineEvent): void => {
      const sequencedEvent = assignTimelineSeq(event);
      try {
        writeSync(eventsFd, JSON.stringify(sequencedEvent) + '\n');
      } catch (err: any) {
        // Log but don't crash — event logging is best-effort
        console.error(`[supervisor] Failed to write event: ${err?.message ?? err}`);
      }

      try {
        this.withSqliteOperation('appendEvent', (client) => client.appendEvent(id, runOptions.name, statusSnapshot.bead_id, sequencedEvent));
      } catch (error: unknown) {
        console.warn(`[supervisor] SQLite appendEvent failed: ${String(error)}`);
      }
    };

    const appendTimelineEventFileOnly = (event: TimelineEvent): TimelineEvent => {
      const sequencedEvent = assignTimelineSeq(event);
      try {
        writeSync(eventsFd, JSON.stringify(sequencedEvent) + '\n');
      } catch (err: any) {
        // Log but don't crash — event logging is best-effort
        console.error(`[supervisor] Failed to write event: ${err?.message ?? err}`);
      }
      return sequencedEvent;
    };

    const setWaitingStatus = (updates?: Partial<SupervisorStatus>): void => {
      const previousStatus = statusSnapshot.status;
      const waitingAt = Date.now();
      setStatus({
        status: 'waiting',
        current_event: 'waiting',
        elapsed_s: Math.round((waitingAt - startedAtMs) / 1000),
        last_event_at_ms: waitingAt,
        ...updates,
      });
      if (previousStatus !== 'waiting') {
        appendTimelineEvent(createStatusChangeEvent('waiting', previousStatus));
      }
    };

    // Emit run_start event
    const runStartEvent = appendTimelineEventFileOnly(createRunStartEvent(
      runOptions.name,
      runOptions.inputBeadId,
      statusSnapshot.startup_context,
    ));
    try {
      this.withSqliteOperation('upsertStatusWithEvent:run_start', (client) => client.upsertStatusWithEvent(statusSnapshot, runStartEvent));
    } catch (error: unknown) {
      console.warn(`[supervisor] SQLite upsertStatusWithEvent failed during run start: ${String(error)}`);
    }

    // Create a named FIFO for cross-process steering (e.g. `specialists steer <id> "msg"`)
    // Available for all jobs — steering is independent of keep-alive
    const fifoPath = join(dir, 'steer.pipe');
    try {
      execFileSync('mkfifo', [fifoPath]);
      setStatus({ fifo_path: fifoPath });
    } catch {
      // mkfifo unavailable or failed — steer is a best-effort feature, continue without it
    }

    let textLogged = false;
    let runMetrics: SessionRunMetrics = {
      turns: 0,
      tool_calls: 0,
      auto_compactions: 0,
      auto_retries: 0,
    };
    const gitnexusAccumulator = {
      files_touched: new Set<string>(),
      symbols_analyzed: new Set<string>(),
      highest_risk: undefined as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
      tool_invocations: 0,
    };
    let textCharCount = 0;
    let thinkingCharCount = 0;
    let turnTextAccumulator = '';
    let currentContextTokens = 0;
    const toolCallNames: string[] = [];
    type ActiveToolCallState = {
      tool: string;
      args?: Record<string, unknown>;
      isError?: boolean;
      resultContent?: string;
      resultRaw?: Record<string, unknown>;
    };

    // Map from toolCallId → tool state for parallel tool call tracking.
    const activeToolCalls = new Map<string, ActiveToolCallState>();
    let latestUncorrelatedToolState: ActiveToolCallState | undefined;
    let killFn: (() => void) | undefined;
    let steerFn: ((msg: string) => Promise<void>) | undefined;
    let resumeFn: ((msg: string) => Promise<string>) | undefined;
    let closeFn: (() => Promise<void>) | undefined;
    let fifoReadStream: ReturnType<typeof createReadStream> | undefined;
    let fifoReadline: ReturnType<typeof createInterface> | undefined;
    let fifoFd: number | undefined;
    let keepAliveSession = false;
    let latestOutput = '';
    let autoCommitPolicy: 'never' | 'checkpoint_on_waiting' | 'checkpoint_on_terminal' | undefined = 'never';
    let keepAliveExitResolved = false;
    let isReadOnlySpecialist = false;
    let resolveKeepAliveExit: ((exit: { kind: 'closed' } | { kind: 'fatal'; error: Error }) => void) | undefined;
    const keepAliveExitPromise = new Promise<{ kind: 'closed' } | { kind: 'fatal'; error: Error }>((resolve) => {
      resolveKeepAliveExit = resolve;
    });

    const finishKeepAlive = (exit: { kind: 'closed' } | { kind: 'fatal'; error: Error }): void => {
      if (keepAliveExitResolved) return;
      keepAliveExitResolved = true;
      resolveKeepAliveExit?.(exit);
    };

    const emitRunCompleteForTurn = (result: {
      model: string;
      backend: string;
      beadId?: string;
      output: string;
    }): void => {
      const gitnexusSummary = gitnexusAccumulator.tool_invocations > 0
        ? {
            files_touched: [...gitnexusAccumulator.files_touched],
            symbols_analyzed: [...gitnexusAccumulator.symbols_analyzed],
            highest_risk: gitnexusAccumulator.highest_risk,
            tool_invocations: gitnexusAccumulator.tool_invocations,
          }
        : undefined;

      appendTimelineEvent(createRunCompleteEvent('COMPLETE', Math.round((Date.now() - startedAtMs) / 1000), {
        model: result.model,
        backend: result.backend,
        bead_id: result.beadId,
        output: result.output,
        token_usage: runMetrics.token_usage,
        finish_reason: runMetrics.finish_reason,
        tool_calls: [...toolCallNames],
        exit_reason: runMetrics.exit_reason,
        metrics: runMetrics,
        ...(gitnexusSummary ? { gitnexus_summary: gitnexusSummary } : {}),
      }));
    };

    const shouldAutoCloseReadOnlyKeepAlive = (output: string): boolean => (
      isReadOnlySpecialist && TERMINAL_COMPLIANCE_VERDICT_REGEX.test(output)
    );

    const shouldWriteExternalBeadNotes = runOptions.beadsWriteNotes ?? true;
    let skipFinalKeepAliveInputBeadAppend = false;
    const appendResultToInputBead = (params: {
      output: string;
      model: string;
      backend: string;
      status: SupervisorJobStatus;
      promptHash?: string;
      durationMs?: number;
    }): boolean => {
      const inputBeadId = runOptions.inputBeadId;
      const shouldAppendResultToInputBead = Boolean(
        shouldWriteExternalBeadNotes
        && inputBeadId
        && this.opts.beadsClient,
      );
      if (!shouldAppendResultToInputBead || !inputBeadId || !this.opts.beadsClient) return false;

      const notes = formatBeadNotes({
        output: params.output,
        promptHash: params.promptHash,
        durationMs: params.durationMs,
        model: params.model,
        backend: params.backend,
        specialist: runOptions.name,
        jobId: id,
        status: params.status,
        timestamp: new Date().toISOString(),
      });
      const appendResult = this.opts.beadsClient.updateBeadNotes(inputBeadId, notes);
      if (appendResult.ok) return true;

      const appendError = `[bead-append-failed] ${appendResult.error ?? 'Unknown error'}`;
      appendTimelineEvent(createMetaEvent('bead_append_failed', appendError));
      setStatus({ current_event: 'bead_append_failed', last_event_at_ms: Date.now() });
      try {
        appendFileSync(this.resultPath(id), `\n\n${appendError}\n`, 'utf-8');
      } catch {
        // ignore secondary artifact write failures
      }
      return false;
    };

    const applyAutoCommitCheckpoint = (target: 'waiting' | 'terminal', autoCommitPolicy: 'never' | 'checkpoint_on_waiting' | 'checkpoint_on_terminal' | undefined): void => {
      const autoCommitResult = runAutoCommitCheckpoint({
        autoCommitPolicy,
        target,
        worktreePath: statusSnapshot.worktree_path,
        specialist: runOptions.name,
        beadId: statusSnapshot.bead_id,
        turnNumber: Math.max(1, runMetrics.turns ?? 1),
      });

      if (autoCommitResult.status === 'skipped') {
        appendTimelineEvent(createAutoCommitEvent('skipped', { reason: autoCommitResult.reason }));
        return;
      }

      if (autoCommitResult.status === 'failed') {
        appendTimelineEvent(createAutoCommitEvent('failed', { reason: autoCommitResult.reason }));
        console.warn(`[supervisor] Auto-commit failed for job ${id}: ${autoCommitResult.reason}`);
        return;
      }

      const nextAutoCommitCount = (statusSnapshot.auto_commit_count ?? 0) + 1;
      setStatus({
        auto_commit_count: nextAutoCommitCount,
        last_auto_commit_sha: autoCommitResult.sha,
        last_auto_commit_at_ms: autoCommitResult.committedAtMs,
      });
      appendTimelineEvent(createAutoCommitEvent('success', {
        commit_sha: autoCommitResult.sha,
        committed_files: autoCommitResult.files,
      }));
    };

    const handleResumeTurn = async (task: string): Promise<void> => {
      if (!resumeFn) return;
      const now = Date.now();
      lastActivityMs = now;
      setStatus({ status: 'running', current_event: 'starting', last_event_at_ms: now });
      silenceWarnEmitted = false;

      try {
        const output = await resumeFn(task);
        latestOutput = output;
        mkdirSync(this.jobDir(id), { recursive: true });
        writeFileSync(this.resultPath(id), output, 'utf-8');
        try {
          this.withSqliteOperation('upsertResult:resume_turn', (client) => client.upsertResult(id, output));
        } catch (error: unknown) {
          console.warn(`[supervisor] SQLite upsertResult failed during resume turn: ${String(error)}`);
        }

        emitRunCompleteForTurn({
          model: statusSnapshot.model ?? 'unknown',
          backend: statusSnapshot.backend ?? 'unknown',
          beadId: statusSnapshot.bead_id,
          output,
        });

        const isWaitingTurn = !shouldAutoCloseReadOnlyKeepAlive(output);
        applyAutoCommitCheckpoint(isWaitingTurn ? 'waiting' : 'terminal', autoCommitPolicy);
        appendResultToInputBead({
          output,
          model: statusSnapshot.model ?? 'unknown',
          backend: statusSnapshot.backend ?? 'unknown',
          status: isWaitingTurn ? 'waiting' : 'done',
        });

        if (!isWaitingTurn) {
          void closeKeepAliveSession();
          return;
        }

        setWaitingStatus();
      } catch (err: any) {
        const error = err instanceof Error ? err : new Error(String(err));
        setStatus({ status: 'error', error: error.message });
        finishKeepAlive({ kind: 'fatal', error });
      }
    };

    const closeKeepAliveSession = async (): Promise<void> => {
      if (!closeFn) {
        finishKeepAlive({ kind: 'closed' });
        return;
      }
      try {
        await closeFn();
        finishKeepAlive({ kind: 'closed' });
      } catch (err: any) {
        const error = err instanceof Error ? err : new Error(String(err));
        setStatus({ status: 'error', error: error.message });
        finishKeepAlive({ kind: 'fatal', error });
      }
    };

    // Stuck detection: thresholds, local tracking state, and periodic checker
    const thresholds: Required<StallDetectionConfig> = {
      ...STALL_DETECTION_DEFAULTS,
      ...this.opts.stallDetection,
    };
    let lastActivityMs = startedAtMs;
    let silenceWarnEmitted = false;
    let toolStartMs: number | undefined;
    let toolDurationWarnEmitted = false;
    let stuckIntervalId: ReturnType<typeof setInterval> | undefined;

    stuckIntervalId = setInterval(() => {
      const now = Date.now();
      if (statusSnapshot.status === 'running') {
        const silenceMs = now - lastActivityMs;
        if (!silenceWarnEmitted && silenceMs > thresholds.running_silence_warn_ms) {
          silenceWarnEmitted = true;
          appendTimelineEvent(createStaleWarningEvent('running_silence', {
            silence_ms: silenceMs,
            threshold_ms: thresholds.running_silence_warn_ms,
          }));
        }
        if (silenceMs > thresholds.running_silence_error_ms) {
          appendTimelineEvent(createStaleWarningEvent('running_silence_error', {
            silence_ms: silenceMs,
            threshold_ms: thresholds.running_silence_error_ms,
          }));
          setStatus({
            status: 'error',
            error: `No activity for ${Math.round(silenceMs / 1000)}s (threshold: ${thresholds.running_silence_error_ms / 1000}s)`,
          });
          killFn?.();
          clearInterval(stuckIntervalId);
        }
      }
      if (toolStartMs !== undefined && !toolDurationWarnEmitted) {
        const toolDurationMs = now - toolStartMs;
        if (toolDurationMs > thresholds.tool_duration_warn_ms) {
          toolDurationWarnEmitted = true;
          const activeToolName = activeToolCalls.values().next().value?.tool ?? latestUncorrelatedToolState?.tool ?? 'unknown';
          appendTimelineEvent(createStaleWarningEvent('tool_duration', {
            silence_ms: toolDurationMs,
            threshold_ms: thresholds.tool_duration_warn_ms,
            tool: activeToolName,
          }));
        }
      }
    }, 10_000);

    const sigtermHandler = () => {
      if (keepAliveSession) {
        const hasPendingKeepAliveOutput = Boolean(
          latestOutput
          && statusSnapshot.status === 'waiting'
          && !shouldAutoCloseReadOnlyKeepAlive(latestOutput),
        );
        if (hasPendingKeepAliveOutput) {
          const appendSucceeded = appendResultToInputBead({
            output: latestOutput,
            model: statusSnapshot.model ?? 'unknown',
            backend: statusSnapshot.backend ?? 'unknown',
            status: 'cancelled',
          });
          if (appendSucceeded) {
            skipFinalKeepAliveInputBeadAppend = true;
          }
        }
        void closeKeepAliveSession();
        return;
      }
      killFn?.();
    };
    process.once('SIGTERM', sigtermHandler);

    const runOptionsWithBoundary = runOptions.workingDirectory
      ? { ...runOptions, worktreeBoundary: runOptions.workingDirectory }
      : runOptions;

    try {
      const result = await runner.run(
        runOptionsWithBoundary,
        // onProgress — parse tool names, update status, and stream to caller
        (delta) => {
          const toolMatch = delta.match(/⚙ (.+?)…/);
          if (toolMatch) {
            setStatus({ current_tool: toolMatch[1] });
          }

          if (delta !== '✓\n' && !delta.startsWith('\n⚙ ') && !delta.startsWith('💭 ')) {
            turnTextAccumulator += delta;
          }

          // Stream to caller if callback provided
          this.opts.onProgress?.(delta);
        },
        // onEvent — map callback events to timeline events
        (eventType, details) => {
          const now = Date.now();
          // Reset silence timer on any activity
          lastActivityMs = now;
          silenceWarnEmitted = false;
          const keepAliveTurnCompleted = keepAliveSession && eventType === 'agent_end';
          if (keepAliveTurnCompleted) {
            setWaitingStatus();
          } else {
            setStatus({
              status: 'running',
              current_event: eventType,
              last_event_at_ms: now,
              elapsed_s: Math.round((now - startedAtMs) / 1000),
            });
          }

          // Map callback event to timeline event using the canonical model
          if (eventType === 'turn_start') {
            textCharCount = 0;
            thinkingCharCount = 0;
            turnTextAccumulator = '';
          }
          if (eventType === 'message_start_assistant') {
            turnTextAccumulator = '';
          }
          if (eventType === 'text') {
            textCharCount += details?.charCount ?? 0;
          }
          if (eventType === 'thinking') {
            thinkingCharCount += details?.charCount ?? 0;
          }

          const toolCallId = details?.toolCallId;
          const toolState = toolCallId
            ? activeToolCalls.get(toolCallId)
            : latestUncorrelatedToolState;

          const parsedMeta = (() => {
            if (eventType !== 'memory_injection' && eventType !== 'meta' || !details?.summary) return undefined;
            try {
              return JSON.parse(details.summary) as {
                memory_injection?: {
                  static_tokens?: number;
                  memory_tokens?: number;
                  gitnexus_tokens?: number;
                  total_tokens?: number;
                };
                kind?: 'meta';
                source?: string;
                backend?: string;
                data?: {
                  sets_loaded?: string[];
                  rules_count?: number;
                  inline_rules_count?: number;
                  globals_disabled?: boolean;
                  token_estimate?: number;
                };
              };
            } catch {
              return undefined;
            }
          })();
          const metaDetails = details as {
            source?: string;
            backend?: string;
            data?: {
              sets_loaded?: string[];
              rules_count?: number;
              inline_rules_count?: number;
              globals_disabled?: boolean;
              token_estimate?: number;
            };
          } | undefined;

          const memoryInjection = parsedMeta?.memory_injection
            ? {
                static_tokens: parsedMeta.memory_injection.static_tokens ?? 0,
                memory_tokens: parsedMeta.memory_injection.memory_tokens ?? 0,
                gitnexus_tokens: parsedMeta.memory_injection.gitnexus_tokens ?? 0,
                total_tokens: parsedMeta.memory_injection.total_tokens ?? 0,
              }
            : undefined;

          const mandatoryRulesInjection = parsedMeta?.source === 'mandatory_rules_injection' && parsedMeta.data
            ? {
                sets_loaded: parsedMeta.data.sets_loaded ?? [],
                rules_count: parsedMeta.data.rules_count ?? 0,
                inline_rules_count: parsedMeta.data.inline_rules_count ?? 0,
                globals_disabled: parsedMeta.data.globals_disabled ?? false,
                token_estimate: parsedMeta.data.token_estimate ?? 0,
              }
            : undefined;

          if (memoryInjection || mandatoryRulesInjection) {
            setStatus({
              startup_context: {
                ...(statusSnapshot.startup_context ?? {}),
                ...(memoryInjection ? { memory_injection: memoryInjection } : {}),
                ...(mandatoryRulesInjection ? { mandatory_rules_injection: mandatoryRulesInjection } : {}),
              },
            });
          }

          const timelineEvent = mapCallbackEventToTimelineEvent(eventType, {
            tool: toolState?.tool,
            toolCallId,
            args: toolState?.args,
            isError: toolState?.isError,
            resultContent: toolState?.resultContent,
            resultRaw: toolState?.resultRaw,
            charCount: eventType === 'text'
              ? textCharCount
              : eventType === 'thinking'
                ? thinkingCharCount
                : details?.charCount,
            compaction: {
              tokensBefore: details?.tokensBefore,
              summary: details?.summary,
              firstKeptEntryId: details?.firstKeptEntryId,
            },
            retry: {
              attempt: details?.attempt,
              maxAttempts: details?.maxAttempts,
              delayMs: details?.delayMs,
              errorMessage: details?.errorMessage,
            },
            modelChange: {
              action: details?.action ?? (eventType === 'set_model' || eventType === 'cycle_model' ? eventType : 'set_model'),
              model: details?.model,
              previousModel: details?.previousModel,
            },
            extensionError: {
              extension: details?.extension,
              errorMessage: details?.errorMessage,
            },
            memoryInjection,
            metaPayload: eventType === 'meta' ? {
              model: details?.model,
              backend: metaDetails?.backend,
              source: metaDetails?.source,
              data: metaDetails?.data,
            } : undefined,
          });

          if (timelineEvent) {
            appendTimelineEvent(timelineEvent);
            if (eventType === 'tool_execution_end') {
              if (toolCallId) {
                activeToolCalls.delete(toolCallId);
              } else {
                latestUncorrelatedToolState = undefined;
              }

              const nextActiveTool = activeToolCalls.values().next().value?.tool;
              setStatus({ current_tool: nextActiveTool });
            }
          } else if (eventType === 'text' && !textLogged) {
            // Text presence event (not streaming deltas)
            textLogged = true;
            appendTimelineEvent({ t: Date.now(), type: TIMELINE_EVENT_TYPES.TEXT });
          }
        },
        // onMetric — additive RPC-derived observability
        (metricEvent: SessionMetricEvent) => {
          if (metricEvent.type === 'token_usage') {
            mergeRunMetrics({ token_usage: metricEvent.token_usage });
            currentContextTokens = metricEvent.token_usage.input_tokens ?? 0;
            appendTimelineEvent(createTokenUsageEvent(metricEvent.token_usage, metricEvent.source));
            return;
          }

          if (metricEvent.type === 'finish_reason') {
            mergeRunMetrics({ finish_reason: metricEvent.finish_reason });
            appendTimelineEvent(createFinishReasonEvent(metricEvent.finish_reason, metricEvent.source));
            return;
          }

          if (metricEvent.type === 'api_error') {
            mergeRunMetrics({ api_error: metricEvent.errorMessage });
            appendTimelineEvent({
              t: Date.now(),
              type: TIMELINE_EVENT_TYPES.ERROR,
              source: metricEvent.source,
              error_message: metricEvent.errorMessage,
            });
            return;
          }

          if (metricEvent.type === 'turn_summary') {
            mergeRunMetrics({
              turns: metricEvent.turn_index,
              ...(metricEvent.token_usage ? { token_usage: metricEvent.token_usage } : {}),
              ...(metricEvent.finish_reason ? { finish_reason: metricEvent.finish_reason } : {}),
            });
            const contextUtilization = calculateContextUtilization(currentContextTokens, statusSnapshot.model);
            setStatus({
              context_pct: contextUtilization?.context_pct,
              context_health: contextUtilization?.context_health,
            });
            appendTimelineEvent(createTurnSummaryEvent(
              metricEvent.turn_index,
              metricEvent.token_usage,
              metricEvent.finish_reason,
              turnTextAccumulator || undefined,
              contextUtilization?.context_pct,
              contextUtilization?.context_health,
            ));
            turnTextAccumulator = '';
            return;
          }

          if (metricEvent.type === 'compaction') {
            const compactions = (runMetrics.auto_compactions ?? 0) + (metricEvent.phase === 'end' ? 1 : 0);
            mergeRunMetrics({ auto_compactions: compactions });
            appendTimelineEvent(createCompactionEvent(metricEvent.phase, {
              tokensBefore: metricEvent.tokensBefore,
              summary: metricEvent.summary,
              firstKeptEntryId: metricEvent.firstKeptEntryId,
            }));
            return;
          }

          if (metricEvent.type === 'retry') {
            const retries = (runMetrics.auto_retries ?? 0) + (metricEvent.phase === 'end' ? 1 : 0);
            mergeRunMetrics({ auto_retries: retries });
            appendTimelineEvent(createRetryEvent(metricEvent.phase, {
              attempt: metricEvent.attempt,
              maxAttempts: metricEvent.maxAttempts,
              delayMs: metricEvent.delayMs,
              errorMessage: metricEvent.errorMessage,
            }));
            return;
          }

        },
        // onMeta — model/backend metadata
        (meta) => {
          setStatus({ model: meta.model, backend: meta.backend });
          appendTimelineEvent(createMetaEvent(meta.model, meta.backend));
          // Stream to caller if callback provided
          this.opts.onMeta?.(meta);
        },
        // onKillRegistered — capture so SIGTERM can kill the Pi session cleanly
        (fn) => { killFn = fn; },
        // onBeadCreated
        (beadId) => {
          setStatus({ bead_id: beadId });
        },
        // onSteerRegistered — wire FIFO reader to forward steer messages into the session
        (fn) => {
          steerFn = fn;
          if (!existsSync(fifoPath)) return;
          // Start a background reader loop on the FIFO.
          // Opening with 'r+' (O_RDWR) prevents blocking on open when there's no writer yet.
          // Each line received is forwarded as a steer message to the Pi session.
          // Open the FIFO fd synchronously (O_RDWR = non-blocking on named pipes)
          // so the fd is guaranteed open before onResumeReady transitions to 'waiting'.
          // createReadStream without a path argument uses the pre-opened fd directly,
          // eliminating the race where a test writer (O_WRONLY) blocks waiting for a reader.
          fifoFd = openSync(fifoPath, 'r+');
          fifoReadStream = createReadStream('', { fd: fifoFd, autoClose: false });
          fifoReadline = createInterface({ input: fifoReadStream });
          fifoReadline.on('line', (line) => {
              try {
                const parsed = JSON.parse(line);
                if (parsed?.type === 'steer' && typeof parsed.message === 'string') {
                  // steer is only valid while the session is running
                  steerFn?.(parsed.message).catch(() => {});
                } else if (parsed?.type === 'resume' && typeof parsed.task === 'string') {
                  // resume: send next-turn prompt to a waiting keep-alive session
                  // waiting state: retained, non-streaming pi session awaiting explicit next-turn
                  // action from orchestrator. Valid actions: resume, close. Invalid: steer.
                  void handleResumeTurn(parsed.task);
                } else if (parsed?.type === 'prompt' && typeof parsed.message === 'string') {
                  // DEPRECATED: {type:"prompt"} → use {type:"resume", task:"..."} instead
                  console.error('[specialists] DEPRECATED: FIFO message {type:"prompt"} is deprecated. Use {type:"resume", task:"..."} instead.');
                  void handleResumeTurn(parsed.message);
                } else if (parsed?.type === 'close') {
                  void closeKeepAliveSession();
                }
              } catch { /* ignore malformed lines */ }
            });
          fifoReadline.on('error', (error) => {
            console.error(`[supervisor] FIFO read error: ${String(error)}`);
          });
        },
        // onResumeReady — keep-alive: session stays alive after first agent_end
        (rFn, cFn) => {
          keepAliveSession = true;
          resumeFn = rFn;
          closeFn = cFn;
          setWaitingStatus();
        },
        // onToolStartCallback — capture tool name, args, and call ID for timeline event fidelity
        (tool, args, toolCallId) => {
          const toolState: ActiveToolCallState = {
            tool,
            args,
            isError: false,
            resultContent: undefined,
            resultRaw: undefined,
          };

          if (toolCallId) {
            activeToolCalls.set(toolCallId, toolState);
          } else {
            latestUncorrelatedToolState = toolState;
          }

          toolStartMs = Date.now();
          toolDurationWarnEmitted = false;
          toolCallNames.push(tool);
          mergeRunMetrics({
            tool_calls: toolCallNames.length,
            tool_call_names: toolCallNames,
          });
          setStatus({ current_tool: tool });
        },
        // onToolEndCallback — restore correct per-call context before onEvent('tool_execution_end') fires
        (tool, isError, toolCallId, resultContent, resultRaw) => {
          const resolvedToolState: ActiveToolCallState = toolCallId
            ? activeToolCalls.get(toolCallId) ?? { tool }
            : latestUncorrelatedToolState ?? { tool };

          const finalizedToolState: ActiveToolCallState = {
            ...resolvedToolState,
            tool: resolvedToolState.tool ?? tool,
            isError,
            resultContent,
            resultRaw,
          };

          if (toolCallId) {
            activeToolCalls.set(toolCallId, finalizedToolState);
          } else {
            latestUncorrelatedToolState = finalizedToolState;
          }

          toolStartMs = undefined;
          toolDurationWarnEmitted = false;

          const resolvedToolName = finalizedToolState.tool;
          const resolvedToolArgs = finalizedToolState.args;

          if (resolvedToolName === 'edit' || resolvedToolName === 'write') {
            const path = resultRaw?.path;
            if (typeof path === 'string' && path.trim().length > 0) {
              gitnexusAccumulator.files_touched.add(path);
            }
          }

          if (resolvedToolName.startsWith('gitnexus_')) {
            gitnexusAccumulator.tool_invocations += 1;

            for (const file of extractGitnexusFiles(resolvedToolName, resultRaw)) {
              gitnexusAccumulator.files_touched.add(file);
            }

            for (const symbol of extractGitnexusSymbols(resultRaw, resolvedToolArgs)) {
              gitnexusAccumulator.symbols_analyzed.add(symbol);
            }

            const risk = extractGitnexusRisk(resultRaw);
            if (risk) {
              const currentHighest = gitnexusAccumulator.highest_risk;
              if (!currentHighest || GITNEXUS_RISK_ORDER[risk] > GITNEXUS_RISK_ORDER[currentHighest]) {
                gitnexusAccumulator.highest_risk = risk;
              }
            }
          }

          setStatus({ current_tool: undefined });
        },
      );

      latestOutput = result.output;
      mkdirSync(this.jobDir(id), { recursive: true });
      writeFileSync(this.resultPath(id), latestOutput, 'utf-8');

      const elapsed = Math.round((Date.now() - startedAtMs) / 1000);
      const finalResult = {
        ...result,
        output: latestOutput,
      };

      mergeRunMetrics(finalResult.metrics);
      mergeRunMetrics({
        tool_calls: toolCallNames.length,
        tool_call_names: toolCallNames,
        exit_reason: 'agent_end',
      });
      isReadOnlySpecialist = finalResult.permissionRequired === 'READ_ONLY';
      autoCommitPolicy = finalResult.autoCommit;

      emitRunCompleteForTurn({
        model: finalResult.model,
        backend: finalResult.backend,
        beadId: finalResult.beadId,
        output: finalResult.output,
      });

      const runCompletesAsWaiting = keepAliveSession && !shouldAutoCloseReadOnlyKeepAlive(finalResult.output);
      applyAutoCommitCheckpoint(runCompletesAsWaiting ? 'waiting' : 'terminal', autoCommitPolicy);

      if (keepAliveSession) {
        if (shouldAutoCloseReadOnlyKeepAlive(finalResult.output)) {
          await closeKeepAliveSession();
        } else {
          setWaitingStatus({
            model: result.model,
            backend: result.backend,
            bead_id: result.beadId,
          });
        }

        const keepAliveExit = await keepAliveExitPromise;
        if (keepAliveExit.kind === 'fatal') {
          throw keepAliveExit.error;
        }
      }

      const inputBeadId = runOptions.inputBeadId;
      const ownsBead = Boolean(finalResult.beadId && !inputBeadId);

      const appendedStatus: SupervisorJobStatus = keepAliveSession && !shouldAutoCloseReadOnlyKeepAlive(finalResult.output)
        ? 'waiting'
        : 'done';
      const shouldSkipFinalInputBeadAppend = keepAliveSession && skipFinalKeepAliveInputBeadAppend;
      if (!shouldSkipFinalInputBeadAppend) {
        appendResultToInputBead({
          output: finalResult.output,
          model: finalResult.model,
          backend: finalResult.backend,
          status: appendedStatus,
          promptHash: finalResult.promptHash,
          durationMs: finalResult.durationMs,
        });
      }

      if (ownsBead && finalResult.beadId) {
        this.opts.beadsClient?.updateBeadNotes(finalResult.beadId, formatBeadNotes({
          output: finalResult.output,
          promptHash: finalResult.promptHash,
          durationMs: finalResult.durationMs,
          model: finalResult.model,
          backend: finalResult.backend,
          specialist: runOptions.name,
          jobId: id,
          status: 'done',
          timestamp: new Date().toISOString(),
        }));
      } else if (shouldWriteExternalBeadNotes && !inputBeadId && finalResult.beadId) {
        this.opts.beadsClient?.updateBeadNotes(finalResult.beadId, formatBeadNotes({
          output: finalResult.output,
          promptHash: finalResult.promptHash,
          durationMs: finalResult.durationMs,
          model: finalResult.model,
          backend: finalResult.backend,
          specialist: runOptions.name,
          jobId: id,
          status: 'done',
          timestamp: new Date().toISOString(),
        }));
      }

      if (finalResult.beadId) {
        // Close owned beads after notes are written. Never close input beads — orchestrator owns lifecycle.
        if (!inputBeadId) {
          this.opts.beadsClient?.closeBead(finalResult.beadId, 'COMPLETE', finalResult.durationMs, finalResult.model);
        }
      }
      const completedAtMs = Date.now();
      statusSnapshot = {
        ...statusSnapshot,
        status: 'done',
        elapsed_s: elapsed,
        last_event_at_ms: completedAtMs,
        model: finalResult.model,
        backend: finalResult.backend,
        bead_id: finalResult.beadId,
        metrics: runMetrics,
      };
      this.writeStatusFileOnly(id, statusSnapshot);

      const gitnexusSummary = gitnexusAccumulator.tool_invocations > 0
        ? {
            files_touched: [...gitnexusAccumulator.files_touched],
            symbols_analyzed: [...gitnexusAccumulator.symbols_analyzed],
            highest_risk: gitnexusAccumulator.highest_risk,
            tool_invocations: gitnexusAccumulator.tool_invocations,
          }
        : undefined;

      try {
        this.withSqliteOperation('upsertStatusWithEventAndResult:complete', (client) => client.upsertStatusWithEventAndResult(statusSnapshot, createRunCompleteEvent('COMPLETE', elapsed, {
          model: finalResult.model,
          backend: finalResult.backend,
          bead_id: finalResult.beadId,
          output: finalResult.output,
          token_usage: runMetrics.token_usage,
          finish_reason: runMetrics.finish_reason,
          tool_calls: [...toolCallNames],
          exit_reason: runMetrics.exit_reason,
          metrics: runMetrics,
          ...(gitnexusSummary ? { gitnexus_summary: gitnexusSummary } : {}),
        }), latestOutput));
      } catch (error: unknown) {
        console.warn(`[supervisor] SQLite upsertStatusWithEventAndResult failed: ${String(error)}`);
      }

      if (isGitnexusAnalyzeRequired(finalResult.permissionRequired)) {
        try {
          startDetachedGitnexusAnalyze(runOptions.workingDirectory ?? process.cwd());
          appendTimelineEventFileOnly({
            t: Date.now(),
            type: TIMELINE_EVENT_TYPES.META,
            model: 'gitnexus_analyze_started',
            backend: 'supervisor',
          });
        } catch (err: any) {
          appendTimelineEventFileOnly({
            t: Date.now(),
            type: TIMELINE_EVENT_TYPES.META,
            model: 'gitnexus_analyze_start_failed',
            backend: String(err?.message ?? err),
          });
        }
      }

      // Touch ready marker so hooks can surface completion banners.
      this.writeReadyMarker(id);

      return id;
    } catch (err: any) {
      const elapsed = Math.round((Date.now() - startedAtMs) / 1000);
      const errorMsg = err?.message ?? String(err);
      const failedAtMs = Date.now();
      statusSnapshot = {
        ...statusSnapshot,
        status: 'error',
        elapsed_s: elapsed,
        error: errorMsg,
        last_event_at_ms: failedAtMs,
      };
      this.writeStatusFileOnly(id, statusSnapshot);

      mergeRunMetrics({
        tool_calls: toolCallNames.length,
        tool_call_names: toolCallNames,
        exit_reason: err instanceof Error ? err.name : 'error',
      });

      const gitnexusSummary = gitnexusAccumulator.tool_invocations > 0
        ? {
            files_touched: [...gitnexusAccumulator.files_touched],
            symbols_analyzed: [...gitnexusAccumulator.symbols_analyzed],
            highest_risk: gitnexusAccumulator.highest_risk,
            tool_invocations: gitnexusAccumulator.tool_invocations,
          }
        : undefined;

      // Emit run_complete with ERROR status
      const runCompleteEvent = appendTimelineEventFileOnly(createRunCompleteEvent('ERROR', elapsed, {
        error: errorMsg,
        token_usage: runMetrics.token_usage,
        finish_reason: runMetrics.finish_reason,
        tool_calls: [...toolCallNames],
        exit_reason: runMetrics.exit_reason,
        metrics: runMetrics,
        ...(gitnexusSummary ? { gitnexus_summary: gitnexusSummary } : {}),
      }));
      try {
        this.withSqliteOperation('upsertStatusWithEvent:error', (client) => client.upsertStatusWithEvent(statusSnapshot, runCompleteEvent));
      } catch (error: unknown) {
        console.warn(`[supervisor] SQLite upsertStatusWithEvent failed during error completion: ${String(error)}`);
      }

      appendResultToInputBead({
        output: latestOutput || errorMsg,
        model: statusSnapshot.model ?? 'unknown',
        backend: statusSnapshot.backend ?? 'unknown',
        status: 'error',
      });

      // Touch ready marker so hooks can surface failure banners.
      this.writeReadyMarker(id);
      throw err;
    } finally {
      if (stuckIntervalId !== undefined) clearInterval(stuckIntervalId);
      process.removeListener('SIGTERM', sigtermHandler);
      if (statusWatchdogPid !== undefined) {
        try { process.kill(statusWatchdogPid, 'SIGTERM'); } catch { /* ignore */ }
      }
      // Close the FIFO: readline → fd → stream. Closing the fd synchronously before
      // destroying the stream prevents the event loop hang that blocks batch test suites.
      // autoClose is false so stream.destroy() won't attempt a second close on the fd.
      try { fifoReadline?.close(); } catch { /* ignore */ }
      if (fifoFd !== undefined) { try { closeSync(fifoFd); } catch { /* ignore */ } fifoFd = undefined; }
      try { fifoReadStream?.destroy(); } catch { /* ignore */ }
      // Ensure events are flushed to disk before closing
      try { fsyncSync(eventsFd); } catch { /* ignore */ }
      closeSync(eventsFd);
      // Remove the FIFO on job completion (best effort)
      try { if (existsSync(fifoPath)) rmSync(fifoPath); } catch { /* ignore */ }
      // Best-effort tmux cleanup for tmux-backed background runs
      if (statusSnapshot.tmux_session) {
        spawnSync('tmux', ['kill-session', '-t', statusSnapshot.tmux_session], { stdio: 'ignore' });
      }
      await this.dispose();
    }
  }
}
