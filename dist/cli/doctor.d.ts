export declare function parseVersionTuple(value: string): [number, number, number] | null;
export declare function compareVersions(left: string, right: string): number;
export declare function setStatusError(statusPath: string): void;
interface CleanupProcessesResult {
    total: number;
    running: number;
    zombies: number;
    updated: number;
    zombieJobIds: string[];
}
export declare function cleanupProcesses(jobsDir: string, dryRun: boolean): CleanupProcessesResult;
export declare function renderProcessSummary(result: CleanupProcessesResult, dryRun: boolean): string;
export declare function run(argv?: readonly string[]): Promise<void>;
export {};
//# sourceMappingURL=doctor.d.ts.map