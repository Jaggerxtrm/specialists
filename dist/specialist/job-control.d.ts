import type { RunOptions, SpecialistRunner } from './runner.js';
import { type SupervisorStatus } from './supervisor.js';
export interface JobControlOptions {
    runner: SpecialistRunner;
    runOptions: RunOptions;
    jobsDir?: string;
}
export declare class JobControl {
    private supervisor;
    private jobId;
    private readonly runner;
    private readonly baseRunOptions;
    private readonly jobsDir;
    private readonly sqliteClient;
    constructor(opts: JobControlOptions);
    startJob(opts: {
        nodeId: string;
        memberId: string;
    }): Promise<string>;
    resumeJob(jobId: string, prompt: string): Promise<void>;
    steerJob(jobId: string, message: string): Promise<void>;
    stopJob(jobId: string): Promise<void>;
    readStatus(jobId: string): SupervisorStatus | null;
    readResult(jobId: string): string | null;
    waitForTerminal(jobId: string, timeoutMs?: number): Promise<SupervisorStatus>;
    private writeFifoMessage;
    private resultPath;
}
//# sourceMappingURL=job-control.d.ts.map