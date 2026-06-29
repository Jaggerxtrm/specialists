import type { SpecialistLoader } from './loader.js';
import type { HookEmitter } from './hooks.js';
import type { CircuitBreaker } from '../utils/circuitBreaker.js';
import type { BeadsClient as BeadsClientType } from './beads.js';
import type { RunArgs } from '../cli/run.js';
import type { Specialist } from './schema.js';
export interface LaunchSpecialistOptions {
    args: RunArgs;
    specialist: Specialist;
    loader: SpecialistLoader;
    hooks: HookEmitter;
    circuitBreaker: CircuitBreaker;
    beadsClient?: BeadsClientType;
    workingDirectory?: string;
    basePin?: {
        baseShaPinned: string;
        baseShaObserved: string;
        currentSha: string;
        branch: string;
        commitsBehind: number;
        override: boolean;
    };
    reusedFromJobId?: string;
    worktreeOwnerJobId?: string;
    effectiveBeadId?: string;
    prompt: string;
    variables?: Record<string, string>;
    epicId?: string;
    beadsWriteNotes: boolean;
    perm: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
    jobsDir: string;
    startEventTailer: (jobId: string, jobsDir: string) => (() => void) | undefined;
    formatFooterModel: (backend?: string, model?: string) => string;
    onProgress?: (delta: string) => void;
    onMeta?: (meta: {
        backend: string;
        model: string;
        sessionId?: string;
    }) => void;
    onJobStarted?: (job: {
        id: string;
    }) => void;
}
export declare function launchSpecialist(opts: LaunchSpecialistOptions): Promise<void>;
//# sourceMappingURL=launch.d.ts.map