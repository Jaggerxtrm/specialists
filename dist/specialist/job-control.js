import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveJobsDir } from './job-root.js';
import { createObservabilitySqliteClient } from './observability-sqlite.js';
import { Supervisor } from './supervisor.js';
const TERMINAL_STATUSES = new Set(['done', 'error', 'stopped']);
const INITIAL_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 2_000;
export class JobControl {
    supervisor;
    jobId = null;
    runner;
    baseRunOptions;
    jobsDir;
    sqliteClient;
    constructor(opts) {
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
    async startJob(opts) {
        const runOptions = {
            ...this.baseRunOptions,
            variables: {
                ...(this.baseRunOptions.variables ?? {}),
                node_id: opts.nodeId,
                SPECIALISTS_NODE_ID: opts.nodeId,
                member_id: opts.memberId,
            },
        };
        let resolveJobId;
        const jobIdPromise = new Promise((resolve) => {
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
    async resumeJob(jobId, prompt) {
        this.writeFifoMessage(jobId, { type: 'resume', task: prompt });
    }
    async steerJob(jobId, message) {
        this.writeFifoMessage(jobId, { type: 'steer', message });
    }
    async stopJob(jobId) {
        const status = this.readStatus(jobId);
        if (!status) {
            throw new Error(`No job found: ${jobId}`);
        }
        if (TERMINAL_STATUSES.has(status.status)) {
            return;
        }
        if (!status.fifo_path) {
            return;
        }
        this.writeFifoMessage(jobId, { type: 'close' });
    }
    readStatus(jobId) {
        return this.supervisor.readStatus(jobId);
    }
    readResult(jobId) {
        try {
            const sqliteResult = this.sqliteClient?.readResult(jobId) ?? null;
            if (sqliteResult)
                return sqliteResult;
        }
        catch {
            // fallback to file state
        }
        const resultPath = this.resultPath(jobId);
        if (!existsSync(resultPath))
            return null;
        try {
            return readFileSync(resultPath, 'utf-8');
        }
        catch {
            return null;
        }
    }
    async waitForTerminal(jobId, timeoutMs) {
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
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        }
    }
    writeFifoMessage(jobId, payload) {
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
    resultPath(jobId) {
        return join(this.jobsDir, jobId, 'result.txt');
    }
}
//# sourceMappingURL=job-control.js.map