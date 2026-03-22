// src/specialist/supervisor.ts
// Wraps SpecialistRunner to provide file-based job state for background execution.

import {
  closeSync,
  existsSync,
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
import { spawnSync } from 'node:child_process';
import type { SpecialistRunner, RunOptions } from './runner.js';
import type { BeadsClient } from './beads.js';

const JOB_TTL_DAYS = Number(process.env.SPECIALISTS_JOB_TTL_DAYS ?? 7);

export interface SupervisorStatus {
  id: string;
  specialist: string;
  status: 'starting' | 'running' | 'done' | 'error';
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
  error?: string;
}

export interface SupervisorOptions {
  runner: SpecialistRunner;
  runOptions: RunOptions;
  jobsDir: string; // absolute path to .specialists/jobs/
  beadsClient?: BeadsClient;
}

// Events worth writing to events.jsonl (high-signal only; drop thinking_delta, text_delta, etc.)
const LOGGED_EVENTS = new Set(['thinking', 'toolcall', 'tool_execution_end', 'done']);

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

    // Keep events.jsonl fd open for the job lifetime
    const eventsFd = openSync(this.eventsPath(id), 'a');
    const appendEvent = (obj: Record<string, any>): void => {
      try { writeSync(eventsFd, JSON.stringify({ t: Date.now(), ...obj }) + '\n'); } catch { /* ignore */ }
    };

    let textLogged = false;
    let currentTool = '';
    let killFn: (() => void) | undefined;

    const sigtermHandler = () => killFn?.();
    process.once('SIGTERM', sigtermHandler);

    try {
      const result = await runner.run(
        runOptions,
        // onProgress — parse tool names from the formatted progress messages
        (delta) => {
          const toolMatch = delta.match(/⚙ (.+?)…/);
          if (toolMatch) {
            currentTool = toolMatch[1];
            this.updateStatus(id, { current_tool: currentTool });
          }
        },
        // onEvent
        (eventType) => {
          const now = Date.now();
          this.updateStatus(id, {
            status: 'running',
            current_event: eventType,
            last_event_at_ms: now,
            elapsed_s: Math.round((now - startedAtMs) / 1000),
          });
          if (LOGGED_EVENTS.has(eventType)) {
            const tool = (eventType === 'toolcall' || eventType === 'tool_execution_end') ? currentTool : undefined;
            appendEvent({ type: eventType, ...(tool ? { tool } : {}) });
          } else if (eventType === 'text' && !textLogged) {
            textLogged = true;
            appendEvent({ type: 'text' });
          }
        },
        // onMeta
        (meta) => {
          this.updateStatus(id, { model: meta.model, backend: meta.backend });
          appendEvent({ type: 'meta', model: meta.model, backend: meta.backend });
        },
        // onKillRegistered — capture so SIGTERM can kill the Pi session cleanly
        (fn) => { killFn = fn; },
        // onBeadCreated
        (beadId) => {
          this.updateStatus(id, { bead_id: beadId });
        },
      );

      const elapsed = Math.round((Date.now() - startedAtMs) / 1000);
      writeFileSync(this.resultPath(id), result.output, 'utf-8');
      if (result.beadId) {
        this.opts.beadsClient?.updateBeadNotes(result.beadId, formatBeadNotes(result));
      }
      this.updateStatus(id, {
        status: 'done',
        elapsed_s: elapsed,
        last_event_at_ms: Date.now(),
        model: result.model,
        backend: result.backend,
        bead_id: result.beadId,
      });
      appendEvent({ type: 'agent_end', elapsed_s: elapsed });

      // Touch ready marker so the hook can surface completion banners
      writeFileSync(join(this.readyDir(), id), '', 'utf-8');

      return id;
    } catch (err: any) {
      const elapsed = Math.round((Date.now() - startedAtMs) / 1000);
      this.updateStatus(id, {
        status: 'error',
        elapsed_s: elapsed,
        error: err?.message ?? String(err),
      });
      appendEvent({ type: 'error', message: err?.message ?? String(err) });
      throw err;
    } finally {
      process.removeListener('SIGTERM', sigtermHandler);
      closeSync(eventsFd);
    }
  }
}
