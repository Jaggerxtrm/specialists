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
  mapCallbackEventToTimelineEvent,
} from './timeline-events.js';
import type { SessionMetricEvent, SessionRunMetrics } from '../pi/session.js';
import type { StallDetectionConfig } from './loader.js';
import { createObservabilitySqliteClient, type ObservabilitySqliteClient } from './observability-sqlite.js';

const JOB_TTL_DAYS = Number(process.env.SPECIALISTS_JOB_TTL_DAYS ?? 7);

export const STALL_DETECTION_DEFAULTS: Required<StallDetectionConfig> = {
  running_silence_warn_ms: 60_000,
  running_silence_error_ms: 300_000,
  waiting_stale_ms: 3_600_000,
  tool_duration_warn_ms: 120_000,
};

export interface SupervisorStatus {
  id: string;
  specialist: string;
  status: 'starting' | 'running' | 'waiting' | 'done' | 'error';
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
  branch?: string;
  metrics?: SessionRunMetrics;
  error?: string;
}

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

function formatBeadNotes(result: { output: string; promptHash: string; durationMs: number; model: string; backend: string }): string {
  const metadata = [
    `prompt_hash=${result.promptHash}`,
    `git_sha=${getCurrentGitSha() ?? 'unknown'}`,
    `elapsed_ms=${Math.round(result.durationMs)}`,
    `model=${result.model}`,
    `backend=${result.backend}`,
  ].join('\n');
  return `${result.output}\n\n---\n${metadata}`;
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
  cumulativeInputTokens: number,
  model: string | undefined,
): { context_pct: number; context_health: ContextHealth } | undefined {
  const contextWindow = getModelContextWindow(model);
  if (!contextWindow || cumulativeInputTokens < 0) return undefined;

  const contextPct = (cumulativeInputTokens / contextWindow) * 100;
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

function startDetachedGitnexusAnalyze(cwd: string): void {
  const child = spawn('npx', ['gitnexus', 'analyze'], {
    cwd,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

export class Supervisor {
  private readonly sqliteClient: ObservabilitySqliteClient | null;
  private readonly resolvedJobsDir: string;
  private isDisposed = false;

  constructor(private opts: SupervisorOptions) {
    this.sqliteClient = createObservabilitySqliteClient();
    // Anchor jobs dir to the git common root so worktree sessions share state with
    // the main checkout. Fall back to cwd-relative path when git is unavailable.
    const cwd = opts.runOptions?.workingDirectory ?? process.cwd();
    this.resolvedJobsDir = opts.jobsDir ?? resolveJobsDir(cwd);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (!this.sqliteClient) return;
    try {
      this.sqliteClient.close();
    } catch (error: unknown) {
      console.warn(`[supervisor] Failed to close sqlite client: ${String(error)}`);
    }
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

  readStatus(id: string): SupervisorStatus | null {
    try {
      const sqliteStatus = this.sqliteClient?.readStatus(id);
      if (sqliteStatus) return sqliteStatus;
    } catch (error: unknown) {
      console.warn(`[supervisor] SQLite readStatus failed, falling back to file state: ${String(error)}`);
    }

    const path = this.statusPath(id);
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
  }

  /** List all jobs sorted newest-first. */
  listJobs(): SupervisorStatus[] {
    try {
      const sqliteJobs = this.sqliteClient?.listStatuses() ?? [];
      if (sqliteJobs.length > 0) {
        return sqliteJobs.sort((a, b) => b.started_at_ms - a.started_at_ms);
      }
    } catch (error: unknown) {
      console.warn(`[supervisor] SQLite listStatuses failed, falling back to file state: ${String(error)}`);
    }

    if (!existsSync(this.resolvedJobsDir)) return [];
    const jobs: SupervisorStatus[] = [];
    for (const entry of readdirSync(this.resolvedJobsDir)) {
      const path = join(this.resolvedJobsDir, entry, 'status.json');
      if (!existsSync(path)) continue;
      try { jobs.push(JSON.parse(readFileSync(path, 'utf-8'))); } catch { /* skip */ }
    }
    return jobs.sort((a, b) => b.started_at_ms - a.started_at_ms);
  }

  private writeStatusFileOnly(id: string, data: SupervisorStatus): void {
    mkdirSync(this.jobDir(id), { recursive: true });
    const path = this.statusPath(id);
    const tmp = path + '.tmp';
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmp, path);
  }

  private writeStatusFile(id: string, data: SupervisorStatus): void {
    this.writeStatusFileOnly(id, data);
    try {
      this.sqliteClient?.upsertStatus(data);
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
    for (const entry of readdirSync(this.resolvedJobsDir)) {
      const statusPath = join(this.resolvedJobsDir, entry, 'status.json');
      if (!existsSync(statusPath)) continue;
      try {
        const s: SupervisorStatus = JSON.parse(readFileSync(statusPath, 'utf-8'));

        if (s.status === 'running' || s.status === 'starting') {
          if (!s.pid) continue;
          let pidAlive = true;
          try { process.kill(s.pid, 0); } catch {
            pidAlive = false;
          }
          if (!pidAlive) {
            // PID is dead — mark as crashed
            const tmp = statusPath + '.tmp';
            const updated: SupervisorStatus = { ...s, status: 'error', error: 'Process crashed or was killed' };
            writeFileSync(tmp, JSON.stringify(updated, null, 2), 'utf-8');
            renameSync(tmp, statusPath);
          } else if (s.status === 'running') {
            // PID alive but check age-based staleness for running jobs
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
          // Waiting jobs: emit stale_warning if idle too long (do NOT auto-close)
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
      ...(runOptions.workingDirectory
        ? { branch: resolveCurrentBranch(runOptions.workingDirectory) }
        : { branch: resolveCurrentBranch() }),
    };
    this.writeStatusFileOnly(id, initialStatus);
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
    const appendTimelineEvent = (event: TimelineEvent): void => {
      try {
        writeSync(eventsFd, JSON.stringify(event) + '\n');
      } catch (err: any) {
        // Log but don't crash — event logging is best-effort
        console.error(`[supervisor] Failed to write event: ${err?.message ?? err}`);
      }

      try {
        this.sqliteClient?.appendEvent(id, runOptions.name, statusSnapshot.bead_id, event);
      } catch (error: unknown) {
        console.warn(`[supervisor] SQLite appendEvent failed: ${String(error)}`);
      }
    };

    const appendTimelineEventFileOnly = (event: TimelineEvent): void => {
      try {
        writeSync(eventsFd, JSON.stringify(event) + '\n');
      } catch (err: any) {
        // Log but don't crash — event logging is best-effort
        console.error(`[supervisor] Failed to write event: ${err?.message ?? err}`);
      }
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
    const runStartEvent = createRunStartEvent(runOptions.name, runOptions.inputBeadId);
    appendTimelineEventFileOnly(runStartEvent);
    try {
      this.sqliteClient?.upsertStatusWithEvent(statusSnapshot, runStartEvent);
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
    let currentTool = '';
    let currentToolResultContent: string | undefined;
    let currentToolResultRaw: Record<string, unknown> | undefined;
    let runMetrics: SessionRunMetrics = {
      turns: 0,
      tool_calls: 0,
      auto_compactions: 0,
      auto_retries: 0,
    };
    let currentToolCallId = '';
    let currentToolArgs: Record<string, unknown> | undefined;
    let currentToolIsError = false;
    const gitnexusAccumulator = {
      files_touched: new Set<string>(),
      symbols_analyzed: new Set<string>(),
      highest_risk: undefined as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
      tool_invocations: 0,
    };
    let textCharCount = 0;
    let thinkingCharCount = 0;
    let turnTextAccumulator = '';
    let cumulativeInputTokens = 0;
    const toolCallNames: string[] = [];
    // Map from toolCallId → {tool, args} for parallel tool call tracking
    const activeToolCalls = new Map<string, { tool: string; args?: Record<string, unknown> }>();
    let killFn: (() => void) | undefined;
    let steerFn: ((msg: string) => Promise<void>) | undefined;
    let resumeFn: ((msg: string) => Promise<string>) | undefined;
    let closeFn: (() => Promise<void>) | undefined;
    let fifoReadStream: ReturnType<typeof createReadStream> | undefined;
    let fifoReadline: ReturnType<typeof createInterface> | undefined;
    let fifoFd: number | undefined;
    let keepAliveSession = false;
    let latestOutput = '';
    let keepAliveExitResolved = false;
    let resolveKeepAliveExit: ((exit: { kind: 'closed' } | { kind: 'fatal'; error: Error }) => void) | undefined;
    const keepAliveExitPromise = new Promise<{ kind: 'closed' } | { kind: 'fatal'; error: Error }>((resolve) => {
      resolveKeepAliveExit = resolve;
    });

    const finishKeepAlive = (exit: { kind: 'closed' } | { kind: 'fatal'; error: Error }): void => {
      if (keepAliveExitResolved) return;
      keepAliveExitResolved = true;
      resolveKeepAliveExit?.(exit);
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
          this.sqliteClient?.upsertResult(id, output);
        } catch (error: unknown) {
          console.warn(`[supervisor] SQLite upsertResult failed during resume turn: ${String(error)}`);
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
          appendTimelineEvent(createStaleWarningEvent('tool_duration', {
            silence_ms: toolDurationMs,
            threshold_ms: thresholds.tool_duration_warn_ms,
            tool: currentTool,
          }));
        }
      }
    }, 10_000);

    const sigtermHandler = () => {
      if (keepAliveSession) {
        void closeKeepAliveSession();
        return;
      }
      killFn?.();
    };
    process.once('SIGTERM', sigtermHandler);

    try {
      const result = await runner.run(
        runOptions,
        // onProgress — parse tool names, update status, and stream to caller
        (delta) => {
          const toolMatch = delta.match(/⚙ (.+?)…/);
          if (toolMatch) {
            currentTool = toolMatch[1];
            setStatus({ current_tool: currentTool });
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
          setStatus({
            status: 'running',
            current_event: eventType,
            last_event_at_ms: now,
            elapsed_s: Math.round((now - startedAtMs) / 1000),
          });

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

          const timelineEvent = mapCallbackEventToTimelineEvent(eventType, {
            tool: currentTool,
            toolCallId: currentToolCallId || undefined,
            args: currentToolArgs,
            isError: currentToolIsError,
            resultContent: currentToolResultContent,
            resultRaw: currentToolResultRaw,
            charCount: eventType === 'text'
              ? textCharCount
              : eventType === 'thinking'
                ? thinkingCharCount
                : details?.charCount,
          });

          if (timelineEvent) {
            appendTimelineEvent(timelineEvent);
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
            cumulativeInputTokens += metricEvent.token_usage.input_tokens ?? 0;
            appendTimelineEvent(createTokenUsageEvent(metricEvent.token_usage, metricEvent.source));
            return;
          }

          if (metricEvent.type === 'finish_reason') {
            mergeRunMetrics({ finish_reason: metricEvent.finish_reason });
            appendTimelineEvent(createFinishReasonEvent(metricEvent.finish_reason, metricEvent.source));
            return;
          }

          if (metricEvent.type === 'turn_summary') {
            mergeRunMetrics({
              turns: metricEvent.turn_index,
              ...(metricEvent.token_usage ? { token_usage: metricEvent.token_usage } : {}),
              ...(metricEvent.finish_reason ? { finish_reason: metricEvent.finish_reason } : {}),
            });
            const contextUtilization = calculateContextUtilization(cumulativeInputTokens, statusSnapshot.model);
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
            appendTimelineEvent(createCompactionEvent(metricEvent.phase));
            return;
          }

          if (metricEvent.type === 'retry') {
            const retries = (runMetrics.auto_retries ?? 0) + (metricEvent.phase === 'end' ? 1 : 0);
            mergeRunMetrics({ auto_retries: retries });
            appendTimelineEvent(createRetryEvent(metricEvent.phase));
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
          currentTool = tool;
          currentToolArgs = args;
          currentToolCallId = toolCallId ?? '';
          currentToolIsError = false; // reset on new tool start
          currentToolResultContent = undefined;
          currentToolResultRaw = undefined;
          toolStartMs = Date.now();
          toolDurationWarnEmitted = false;
          toolCallNames.push(tool);
          mergeRunMetrics({
            tool_calls: toolCallNames.length,
            tool_call_names: toolCallNames,
          });
          setStatus({ current_tool: tool });
          if (toolCallId) {
            activeToolCalls.set(toolCallId, { tool, args });
          }
        },
        // onToolEndCallback — restore correct per-call context before onEvent('tool_execution_end') fires
        (tool, isError, toolCallId, resultContent, resultRaw) => {
          if (toolCallId && activeToolCalls.has(toolCallId)) {
            const entry = activeToolCalls.get(toolCallId)!;
            currentTool = entry.tool;
            currentToolArgs = entry.args;
            currentToolCallId = toolCallId;
            activeToolCalls.delete(toolCallId);
          } else {
            currentTool = tool;
          }
          currentToolIsError = isError;
          currentToolResultContent = resultContent;
          currentToolResultRaw = resultRaw;
          toolStartMs = undefined;
          toolDurationWarnEmitted = false;

          if (tool === 'edit' || tool === 'write') {
            const path = resultRaw?.path;
            if (typeof path === 'string' && path.trim().length > 0) {
              gitnexusAccumulator.files_touched.add(path);
            }
          }

          if (tool.startsWith('gitnexus_')) {
            gitnexusAccumulator.tool_invocations += 1;

            for (const file of extractGitnexusFiles(tool, resultRaw)) {
              gitnexusAccumulator.files_touched.add(file);
            }

            for (const symbol of extractGitnexusSymbols(resultRaw, currentToolArgs)) {
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
        },
      );

      latestOutput = result.output;
      mkdirSync(this.jobDir(id), { recursive: true });
      writeFileSync(this.resultPath(id), latestOutput, 'utf-8');

      if (keepAliveSession) {
        setWaitingStatus({
          model: result.model,
          backend: result.backend,
          bead_id: result.beadId,
        });

        const keepAliveExit = await keepAliveExitPromise;
        if (keepAliveExit.kind === 'fatal') {
          throw keepAliveExit.error;
        }
      }

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

      const inputBeadId = runOptions.inputBeadId;
      const ownsBead = Boolean(finalResult.beadId && !inputBeadId);
      const shouldWriteExternalBeadNotes = runOptions.beadsWriteNotes ?? true;
      const shouldAppendReadOnlyResultToInputBead = Boolean(
        inputBeadId
        && finalResult.permissionRequired === 'READ_ONLY'
        && this.opts.beadsClient,
      );

      if (ownsBead && finalResult.beadId) {
        this.opts.beadsClient?.updateBeadNotes(finalResult.beadId, formatBeadNotes(finalResult));
      } else if (shouldWriteExternalBeadNotes) {
        if (shouldAppendReadOnlyResultToInputBead && inputBeadId) {
          this.opts.beadsClient?.updateBeadNotes(inputBeadId, formatBeadNotes(finalResult));
        } else if (finalResult.beadId) {
          this.opts.beadsClient?.updateBeadNotes(finalResult.beadId, formatBeadNotes(finalResult));
        }
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

      // Emit run_complete — THE canonical completion event
      const runCompleteEvent = createRunCompleteEvent('COMPLETE', elapsed, {
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
      });
      appendTimelineEventFileOnly(runCompleteEvent);
      try {
        this.sqliteClient?.upsertStatusWithEventAndResult(statusSnapshot, runCompleteEvent, latestOutput);
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
      const runCompleteEvent = createRunCompleteEvent('ERROR', elapsed, {
        error: errorMsg,
        token_usage: runMetrics.token_usage,
        finish_reason: runMetrics.finish_reason,
        tool_calls: [...toolCallNames],
        exit_reason: runMetrics.exit_reason,
        metrics: runMetrics,
        ...(gitnexusSummary ? { gitnexus_summary: gitnexusSummary } : {}),
      });
      appendTimelineEventFileOnly(runCompleteEvent);
      try {
        this.sqliteClient?.upsertStatusWithEvent(statusSnapshot, runCompleteEvent);
      } catch (error: unknown) {
        console.warn(`[supervisor] SQLite upsertStatusWithEvent failed during error completion: ${String(error)}`);
      }

      // Touch ready marker so hooks can surface failure banners.
      this.writeReadyMarker(id);
      throw err;
    } finally {
      if (stuckIntervalId !== undefined) clearInterval(stuckIntervalId);
      process.removeListener('SIGTERM', sigtermHandler);
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
      this.dispose();
    }
  }
}
