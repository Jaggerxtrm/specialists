// src/specialist/jobRegistry.ts
//
// In-memory registry for async specialist jobs started via start_specialist.
// Jobs accumulate streaming output from pi token events and are read by poll_specialist.
//
import type { RunResult } from './runner.js';

export interface JobSnapshot {
  job_id: string;
  status: 'running' | 'done' | 'error';
  /** Full output — populated only when status === 'done' or 'error'. Empty string while running. */
  output: string;
  /** New content since the provided cursor (for incremental mid-run polling). */
  delta: string;
  /** Pass as cursor on next poll to receive only new content. */
  next_cursor: number;
  /** Last pi event type seen: starting | thinking | toolcall | tool_execution | text | done | error */
  current_event: string;
  backend: string;
  model: string;
  specialist_version: string;
  duration_ms: number;
  error?: string;
}

interface JobState {
  id: string;
  status: 'running' | 'done' | 'error';
  outputBuffer: string;
  currentEvent: string;
  backend: string;
  model: string;
  specialistVersion: string;
  startedAtMs: number;
  endedAtMs?: number;
  error?: string;
}

export class JobRegistry {
  private jobs = new Map<string, JobState>();

  register(id: string, meta: { backend: string; model: string; specialistVersion?: string }): void {
    this.jobs.set(id, {
      id,
      status: 'running',
      outputBuffer: '',
      currentEvent: 'starting',
      backend: meta.backend,
      model: meta.model,
      specialistVersion: meta.specialistVersion ?? '?',
      startedAtMs: Date.now(),
    });
  }

  appendOutput(id: string, text: string): void {
    const job = this.jobs.get(id);
    if (job) job.outputBuffer += text;
  }

  setCurrentEvent(id: string, eventType: string): void {
    const job = this.jobs.get(id);
    if (job) job.currentEvent = eventType;
  }

  /** Update backend/model from the first assistant message_start event. */
  setMeta(id: string, meta: { backend: string; model: string }): void {
    const job = this.jobs.get(id);
    if (!job) return;
    if (meta.backend) job.backend = meta.backend;
    if (meta.model) job.model = meta.model;
  }

  complete(id: string, result: RunResult): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'done';
    job.outputBuffer = result.output;  // authoritative final text
    job.currentEvent = 'done';
    job.backend = result.backend;
    job.model = result.model;
    job.specialistVersion = result.specialistVersion;
    job.endedAtMs = Date.now();
  }

  fail(id: string, err: Error): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'error';
    job.error = err.message;
    job.currentEvent = 'error';
    job.endedAtMs = Date.now();
  }

  snapshot(id: string, cursor = 0): JobSnapshot | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const isDone = job.status === 'done' || job.status === 'error';
    return {
      job_id: job.id,
      status: job.status,
      output: isDone ? job.outputBuffer : '',
      delta: job.outputBuffer.slice(cursor),
      next_cursor: job.outputBuffer.length,
      current_event: job.currentEvent,
      backend: job.backend,
      model: job.model,
      specialist_version: job.specialistVersion,
      duration_ms: (job.endedAtMs ?? Date.now()) - job.startedAtMs,
      error: job.error,
    };
  }

  delete(id: string): void {
    this.jobs.delete(id);
  }
}
