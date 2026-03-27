// src/specialist/supervisor.ts
// Wraps SpecialistRunner to provide file-based job state for background execution.

import {
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
  mapCallbackEventToTimelineEvent,
} from './timeline-events.js';

const JOB_TTL_DAYS = Number(process.env.SPECIALISTS_JOB_TTL_DAYS ?? 7);

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
  constructor(private opts: SupervisorOptions) {}

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

  readStatus(id: string): SupervisorStatus | null {
    const path = this.statusPath(id);
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
  }

  /** List all jobs sorted newest-first. */
  listJobs(): SupervisorStatus[] {
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
  }

  private updateStatus(id: string, updates: Partial<SupervisorStatus>): void {
    const current = this.readStatus(id);
    if (!current) return;
    this.writeStatusFile(id, { ...current, ...updates });
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

  /** Crash recovery: mark running jobs with dead PID as error. */
  private crashRecovery(): void {
    if (!existsSync(this.opts.jobsDir)) return;
    for (const entry of readdirSync(this.opts.jobsDir)) {
      const statusPath = join(this.opts.jobsDir, entry, 'status.json');
      if (!existsSync(statusPath)) continue;
      try {
        const s: SupervisorStatus = JSON.parse(readFileSync(statusPath, 'utf-8'));
        if (s.status !== 'running' && s.status !== 'starting') continue;
        if (!s.pid) continue;
        try { process.kill(s.pid, 0); } catch {
          // PID is dead — mark as crashed
          const tmp = statusPath + '.tmp';
          const updated: SupervisorStatus = { ...s, status: 'error', error: 'Process crashed or was killed' };
          writeFileSync(tmp, JSON.stringify(updated, null, 2), 'utf-8');
          renameSync(tmp, statusPath);
        }
      } catch { /* ignore */ }
    }
  }

  /**
   * Run the specialist under supervision. Writes job state to disk.
   * Returns the job ID when complete (or throws on error).
   */
  async run(): Promise<string> {
    const { runner, runOptions, jobsDir } = this.opts;

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

    // Keep events.jsonl fd open for the job lifetime
    const eventsFd = openSync(this.eventsPath(id), 'a');
    const appendTimelineEvent = (event: TimelineEvent): void => {
      try {
        writeSync(eventsFd, JSON.stringify(event) + '\n');
      } catch (err: any) {
        // Log but don't crash — event logging is best-effort
        console.error(`[supervisor] Failed to write event: ${err?.message ?? err}`);
      }
    };

    // Emit run_start event
    appendTimelineEvent(createRunStartEvent(runOptions.name));

    // Create a named FIFO for cross-process steering (e.g. `specialists steer <id> "msg"`)
    // Only create if keepAlive is enabled - foreground runs don't need steering
    const fifoPath = join(dir, 'steer.pipe');
    const needsFifo = runOptions.keepAlive;
    if (needsFifo) {
      try {
        execFileSync('mkfifo', [fifoPath]);
        setStatus({ fifo_path: fifoPath });
      } catch {
        // mkfifo unavailable or failed — steer is a best-effort feature, continue without it
      }
    }

    let textLogged = false;
    let currentTool = '';
    let currentToolCallId = '';
    let killFn: (() => void) | undefined;
    let steerFn: ((msg: string) => Promise<void>) | undefined;
    let resumeFn: ((msg: string) => Promise<string>) | undefined;
    let closeFn: (() => Promise<void>) | undefined;
    let fifoReadStream: ReturnType<typeof createReadStream> | undefined;
    let fifoReadline: ReturnType<typeof createInterface> | undefined;

    const sigtermHandler = () => killFn?.();
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
          });

          if (timelineEvent) {
            appendTimelineEvent(timelineEvent);
          } else if (eventType === 'text' && !textLogged) {
            // Text presence event (not streaming deltas)
            textLogged = true;
            appendTimelineEvent({ t: Date.now(), type: TIMELINE_EVENT_TYPES.TEXT });
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
          // Skip FIFO setup for foreground runs (keepAlive=false)
          if (!needsFifo || !existsSync(fifoPath)) return;
          // Start a background reader loop on the FIFO.
          // Opening with 'r+' (O_RDWR) prevents blocking on open when there's no writer yet.
          // Each line received is forwarded as a steer message to the Pi session.
          fifoReadStream = createReadStream(fifoPath, { flags: 'r+' });
          fifoReadline = createInterface({ input: fifoReadStream });
          fifoReadline.on('line', (line) => {
              try {
                const parsed = JSON.parse(line);
                if (parsed?.type === 'steer' && typeof parsed.message === 'string') {
                  steerFn?.(parsed.message).catch(() => {});
                } else if (parsed?.type === 'prompt' && typeof parsed.message === 'string') {
                  // follow-up: resume the session with a new prompt
                  if (resumeFn) {
                    setStatus({ status: 'running', current_event: 'starting' });
                    resumeFn(parsed.message)
                      .then((output) => {
                        mkdirSync(this.jobDir(id), { recursive: true });
                        writeFileSync(this.resultPath(id), output, 'utf-8');
                        setStatus({
                          status: 'waiting',
                          current_event: 'waiting',
                          elapsed_s: Math.round((Date.now() - startedAtMs) / 1000),
                          last_event_at_ms: Date.now(),
                        });
                      })
                      .catch((err: any) => {
                        setStatus({ status: 'error', error: err?.message ?? String(err) });
                      });
                  }
                } else if (parsed?.type === 'close') {
                  closeFn?.().catch(() => {});
                }
              } catch { /* ignore malformed lines */ }
            });
          fifoReadline.on('error', () => {}); // ignore FIFO errors
        },
        // onResumeReady — keep-alive: session stays alive after first agent_end
        (rFn, cFn) => {
          resumeFn = rFn;
          closeFn = cFn;
          setStatus({ status: 'waiting', current_event: 'waiting' });
        },
      );

      const elapsed = Math.round((Date.now() - startedAtMs) / 1000);
      mkdirSync(this.jobDir(id), { recursive: true });
      writeFileSync(this.resultPath(id), result.output, 'utf-8');
      if (result.beadId) {
        this.opts.beadsClient?.updateBeadNotes(result.beadId, formatBeadNotes(result));
      }
      setStatus({
        status: 'done',
        elapsed_s: elapsed,
        last_event_at_ms: Date.now(),
        model: result.model,
        backend: result.backend,
        bead_id: result.beadId,
      });

      // Emit run_complete — THE canonical completion event
      appendTimelineEvent(createRunCompleteEvent('COMPLETE', elapsed, {
        model: result.model,
        backend: result.backend,
        bead_id: result.beadId,
      }));

      // Touch ready marker so the hook can surface completion banners
      mkdirSync(this.readyDir(), { recursive: true });
      writeFileSync(join(this.readyDir(), id), '', 'utf-8');

      return id;
    } catch (err: any) {
      const elapsed = Math.round((Date.now() - startedAtMs) / 1000);
      const errorMsg = err?.message ?? String(err);
      setStatus({
        status: 'error',
        elapsed_s: elapsed,
        error: errorMsg,
      });

      // Emit run_complete with ERROR status
      appendTimelineEvent(createRunCompleteEvent('ERROR', elapsed, {
        error: errorMsg,
      }));
      throw err;
    } finally {
      process.removeListener('SIGTERM', sigtermHandler);
      // Close the FIFO readline interface and destroy the stream to release event loop
      try { fifoReadline?.close(); } catch { /* ignore */ }
      try { fifoReadStream?.destroy(); } catch { /* ignore */ }
      // Ensure events are flushed to disk before closing
      try { fsyncSync(eventsFd); } catch { /* ignore */ }
      closeSync(eventsFd);
      // Remove the FIFO on job completion (best effort)
      try { if (existsSync(fifoPath)) rmSync(fifoPath); } catch { /* ignore */ }
    }
  }
}
