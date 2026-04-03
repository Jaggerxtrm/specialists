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
import { spawnSync, execFileSync } from 'node:child_process';
import type { SpecialistRunner, RunOptions } from './runner.js';
import type { BeadsClient } from './beads.js';
import {
  type TimelineEvent,
  TIMELINE_EVENT_TYPES,
  createRunStartEvent,
  createMetaEvent,
  createRunCompleteEvent,
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
  session_file?: string;
  fifo_path?: string;
  tmux_session?: string;
  metrics?: SessionRunMetrics;
  error?: string;
}

export interface SupervisorOptions {
  runner: SpecialistRunner;
  runOptions: RunOptions;
  jobsDir: string; // absolute path to .specialists/jobs/
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


export class Supervisor {
  private readonly sqliteClient: ObservabilitySqliteClient | null;

  constructor(private opts: SupervisorOptions) {
    this.sqliteClient = createObservabilitySqliteClient();
  }

  private jobDir(id: string): string {
    return join(this.opts.jobsDir, id);
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
    return join(this.opts.jobsDir, '..', 'ready');
  }

  private writeReadyMarker(id: string): void {
    mkdirSync(this.readyDir(), { recursive: true });
    writeFileSync(join(this.readyDir(), id), '', 'utf-8');
  }

  readStatus(id: string): SupervisorStatus | null {
    try {
      const sqliteStatus = this.sqliteClient?.readStatus(id);
      if (sqliteStatus) return sqliteStatus;
    } catch {
      // fallback to file state
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
    } catch {
      // fallback to file state
    }

    if (!existsSync(this.opts.jobsDir)) return [];
    const jobs: SupervisorStatus[] = [];
    for (const entry of readdirSync(this.opts.jobsDir)) {
      const path = join(this.opts.jobsDir, entry, 'status.json');
      if (!existsSync(path)) continue;
      try { jobs.push(JSON.parse(readFileSync(path, 'utf-8'))); } catch { /* skip */ }
    }
    return jobs.sort((a, b) => b.started_at_ms - a.started_at_ms);
  }

  private writeStatusFile(id: string, data: SupervisorStatus): void {
    mkdirSync(this.jobDir(id), { recursive: true });
    const path = this.statusPath(id);
    const tmp = path + '.tmp';
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmp, path);
    try { this.sqliteClient?.upsertStatus(data); } catch { /* best effort */ }
  }


  /** GC: remove job dirs older than JOB_TTL_DAYS. */
  private gc(): void {
    if (!existsSync(this.opts.jobsDir)) return;
    const cutoff = Date.now() - JOB_TTL_DAYS * 86_400_000;
    for (const entry of readdirSync(this.opts.jobsDir)) {
      const dir = join(this.opts.jobsDir, entry);
      try {
        const stat = statSync(dir);
        if (!stat.isDirectory()) continue;
        if (stat.mtimeMs < cutoff) rmSync(dir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }

  /** Crash recovery: mark running jobs with dead PID as error, and emit stale warnings. */
  private crashRecovery(): void {
    if (!existsSync(this.opts.jobsDir)) return;
    const thresholds: Required<StallDetectionConfig> = {
      ...STALL_DETECTION_DEFAULTS,
      ...this.opts.stallDetection,
    };
    const now = Date.now();
    for (const entry of readdirSync(this.opts.jobsDir)) {
      const statusPath = join(this.opts.jobsDir, entry, 'status.json');
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
            const eventsPath = join(this.opts.jobsDir, entry, 'events.jsonl');
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

    const initialStatus: SupervisorStatus = {
      id,
      specialist: runOptions.name,
      status: 'starting',
      started_at_ms: startedAtMs,
      pid: process.pid,
      ...(runOptions.inputBeadId ? { bead_id: runOptions.inputBeadId } : {}),
      ...(process.env.SPECIALISTS_TMUX_SESSION ? { tmux_session: process.env.SPECIALISTS_TMUX_SESSION } : {}),
    };
    this.writeStatusFile(id, initialStatus);
    // Persist a latest marker so other processes can discover the active job id immediately
    writeFileSync(join(this.opts.jobsDir, 'latest'), `${id}\n`, 'utf-8');
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
      } catch {
        // best effort
      }
    };

    // Emit run_start event
    appendTimelineEvent(createRunStartEvent(runOptions.name, runOptions.inputBeadId));

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
    let runMetrics: SessionRunMetrics = {
      turns: 0,
      tool_calls: 0,
      auto_compactions: 0,
      auto_retries: 0,
    };
    let currentToolCallId = '';
    let currentToolArgs: Record<string, unknown> | undefined;
    let currentToolIsError = false;
    const toolCallNames: string[] = [];
    // Map from toolCallId → {tool, args} for parallel tool call tracking
    const activeToolCalls = new Map<string, { tool: string; args?: Record<string, unknown> }>();
    let killFn: (() => void) | undefined;
    let steerFn: ((msg: string) => Promise<void>) | undefined;
    let resumeFn: ((msg: string) => Promise<string>) | undefined;
    let closeFn: (() => Promise<void>) | undefined;
    let fifoReadStream: ReturnType<typeof createReadStream> | undefined;
    let fifoReadline: ReturnType<typeof createInterface> | undefined;
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
      setStatus({ status: 'running', current_event: 'starting', last_event_at_ms: now });
      lastActivityMs = now;
      silenceWarnEmitted = false;

      try {
        const output = await resumeFn(task);
        latestOutput = output;
        mkdirSync(this.jobDir(id), { recursive: true });
        writeFileSync(this.resultPath(id), output, 'utf-8');
        try { this.sqliteClient?.upsertResult(id, output); } catch { /* best effort */ }

        const waitingAt = Date.now();
        setStatus({
          status: 'waiting',
          current_event: 'waiting',
          elapsed_s: Math.round((waitingAt - startedAtMs) / 1000),
          last_event_at_ms: waitingAt,
        });
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
          // Stream to caller if callback provided
          this.opts.onProgress?.(delta);
        },
        // onEvent — map callback events to timeline events
        (eventType) => {
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
          const timelineEvent = mapCallbackEventToTimelineEvent(eventType, {
            tool: currentTool,
            toolCallId: currentToolCallId || undefined,
            args: currentToolArgs,
            isError: currentToolIsError,
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
            appendTimelineEvent(createTurnSummaryEvent(
              metricEvent.turn_index,
              metricEvent.token_usage,
              metricEvent.finish_reason,
            ));
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
          const fifoFd = openSync(fifoPath, 'r+');
          fifoReadStream = createReadStream('', { fd: fifoFd, autoClose: true });
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
          fifoReadline.on('error', () => {}); // ignore FIFO errors
        },
        // onResumeReady — keep-alive: session stays alive after first agent_end
        (rFn, cFn) => {
          keepAliveSession = true;
          resumeFn = rFn;
          closeFn = cFn;
          setStatus({ status: 'waiting', current_event: 'waiting', last_event_at_ms: Date.now() });
        },
        // onToolStartCallback — capture tool name, args, and call ID for timeline event fidelity
        (tool, args, toolCallId) => {
          currentTool = tool;
          currentToolArgs = args;
          currentToolCallId = toolCallId ?? '';
          currentToolIsError = false; // reset on new tool start
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
        (tool, isError, toolCallId) => {
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
          toolStartMs = undefined;
          toolDurationWarnEmitted = false;
        },
      );

      latestOutput = result.output;
      mkdirSync(this.jobDir(id), { recursive: true });
      writeFileSync(this.resultPath(id), latestOutput, 'utf-8');
      try { this.sqliteClient?.upsertResult(id, latestOutput); } catch { /* best effort */ }

      if (keepAliveSession) {
        setStatus({
          status: 'waiting',
          current_event: 'waiting',
          elapsed_s: Math.round((Date.now() - startedAtMs) / 1000),
          last_event_at_ms: Date.now(),
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
      setStatus({
        status: 'done',
        elapsed_s: elapsed,
        last_event_at_ms: Date.now(),
        model: finalResult.model,
        backend: finalResult.backend,
        bead_id: finalResult.beadId,
        metrics: runMetrics,
      });

      // Emit run_complete — THE canonical completion event
      appendTimelineEvent(createRunCompleteEvent('COMPLETE', elapsed, {
        model: finalResult.model,
        backend: finalResult.backend,
        bead_id: finalResult.beadId,
        output: finalResult.output,
        token_usage: runMetrics.token_usage,
        finish_reason: runMetrics.finish_reason,
        tool_calls: [...toolCallNames],
        exit_reason: runMetrics.exit_reason,
        metrics: runMetrics,
      }));

      // Touch ready marker so hooks can surface completion banners.
      this.writeReadyMarker(id);

      return id;
    } catch (err: any) {
      const elapsed = Math.round((Date.now() - startedAtMs) / 1000);
      const errorMsg = err?.message ?? String(err);
      setStatus({
        status: 'error',
        elapsed_s: elapsed,
        error: errorMsg,
      });

      mergeRunMetrics({
        tool_calls: toolCallNames.length,
        tool_call_names: toolCallNames,
        exit_reason: err instanceof Error ? err.name : 'error',
      });

      // Emit run_complete with ERROR status
      appendTimelineEvent(createRunCompleteEvent('ERROR', elapsed, {
        error: errorMsg,
        token_usage: runMetrics.token_usage,
        finish_reason: runMetrics.finish_reason,
        tool_calls: [...toolCallNames],
        exit_reason: runMetrics.exit_reason,
        metrics: runMetrics,
      }));

      // Touch ready marker so hooks can surface failure banners.
      this.writeReadyMarker(id);
      throw err;
    } finally {
      if (stuckIntervalId !== undefined) clearInterval(stuckIntervalId);
      process.removeListener('SIGTERM', sigtermHandler);
      // Close the FIFO readline interface and destroy the stream to release event loop
      try { fifoReadline?.close(); } catch { /* ignore */ }
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
    }
  }
}
