import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunOptions, SpecialistRunner } from './runner.js';
import { resolveJobsDir } from './job-root.js';
import { createObservabilitySqliteClient, type ObservabilitySqliteClient } from './observability-sqlite.js';
import { Supervisor, type SupervisorStatus } from './supervisor.js';

const TERMINAL_STATUSES: ReadonlySet<SupervisorStatus['status']> = new Set(['done', 'error']);
const INITIAL_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 2_000;

export interface JobControlOptions {
  runner: SpecialistRunner;
  runOptions: RunOptions;
  jobsDir?: string;
}

export class JobControl {
  private supervisor: Supervisor;
  private jobId: string | null = null;
  private readonly runner: SpecialistRunner;
  private readonly baseRunOptions: RunOptions;
  private readonly jobsDir: string;
  private readonly sqliteClient: ObservabilitySqliteClient | null;

  constructor(opts: JobControlOptions) {
    this.runner = opts.runner;
    this.baseRunOptions = opts.runOptions;
    this.jobsDir = opts.jobsDir ?? resolveJobsDir(opts.runOptions.workingDirectory ?? process.cwd());
    this.sqliteClient = createObservabilitySqliteClient();
    this.supervisor = new Supervisor({
      runner: this.runner,
      runOptions: this.baseRunOptions,
      jobsDir: this.jobsDir,
    });
  }

  async startJob(opts: { nodeId: string; memberId: string }): Promise<string> {
    const runOptions: RunOptions = {
      ...this.baseRunOptions,
      variables: {
        ...(this.baseRunOptions.variables ?? {}),
        node_id: opts.nodeId,
        member_id: opts.memberId,
      },
    };

    let resolveJobId: ((jobId: string) => void) | undefined;
    const jobIdPromise = new Promise<string>((resolve) => {
      resolveJobId = resolve;
    });

    this.supervisor = new Supervisor({
      runner: this.runner,
      runOptions,
      jobsDir: this.jobsDir,
      onJobStarted: ({ id }) => {
        this.jobId = id;
        resolveJobId?.(id);
      },
    });

    void this.supervisor.run().catch(() => {
      // status/result are persisted by Supervisor; callers can inspect them via readStatus/readResult.
    });

    return jobIdPromise;
  }

  async resumeJob(jobId: string, prompt: string): Promise<void> {
    this.writeFifoMessage(jobId, { type: 'resume', task: prompt });
  }

  async steerJob(jobId: string, message: string): Promise<void> {
    this.writeFifoMessage(jobId, { type: 'steer', message });
  }

  async stopJob(jobId: string): Promise<void> {
    this.writeFifoMessage(jobId, { type: 'close' });
  }

  readStatus(jobId: string): SupervisorStatus | null {
    return this.supervisor.readStatus(jobId);
  }

  readResult(jobId: string): string | null {
    try {
      const sqliteResult = this.sqliteClient?.readResult(jobId) ?? null;
      if (sqliteResult) return sqliteResult;
    } catch {
      // fallback to file state
    }

    const resultPath = this.resultPath(jobId);
    if (!existsSync(resultPath)) return null;

    try {
      return readFileSync(resultPath, 'utf-8');
    } catch {
      return null;
    }
  }

  async waitForTerminal(jobId: string, timeoutMs?: number): Promise<SupervisorStatus> {
    const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
    let backoffMs = INITIAL_BACKOFF_MS;

    while (true) {
      const status = this.readStatus(jobId);
      if (!status) {
        throw new Error(`No job found: ${jobId}`);
      }

      if (TERMINAL_STATUSES.has(status.status)) {
        return status;
      }

      if (deadline !== undefined && Date.now() >= deadline) {
        throw new Error(`Timed out waiting for terminal status for job ${jobId}`);
      }

      await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  }

  private writeFifoMessage(jobId: string, payload: Record<string, unknown>): void {
    const status = this.readStatus(jobId);
    if (!status) {
      throw new Error(`No job found: ${jobId}`);
    }

    if (!status.fifo_path) {
      throw new Error(`Job ${jobId} has no steer pipe`);
    }

    const jsonLine = `${JSON.stringify(payload)}\n`;
    writeFileSync(status.fifo_path, jsonLine, { flag: 'a' });
  }

  private resultPath(jobId: string): string {
    return join(this.jobsDir, jobId, 'result.txt');
  }
}
