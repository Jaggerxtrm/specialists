import type { ConsoleView, FeedEventRow, HistoryMode, JobInspect, JobResult, ProcessRow, ProcessSnapshot, RepoRef } from './types.js';
export interface ConsoleState {
    repos: RepoRef[];
    repoIndex: number;
    view: ConsoleView;
    selectedRow: number;
    scroll: number;
    filter: string;
    filtering: boolean;
    selectedJobId?: string;
    historyMode: HistoryMode;
    includeCleaned: boolean;
    follow: boolean;
    snapshot?: ProcessSnapshot;
    feedRows: FeedEventRow[];
    jobInspect?: JobInspect;
    jobResult?: JobResult;
    message?: string;
}
export type ConsoleAction = {
    type: 'reposLoaded';
    repos: RepoRef[];
} | {
    type: 'snapshotLoaded';
    snapshot: ProcessSnapshot;
} | {
    type: 'feedLoaded';
    rows: FeedEventRow[];
    totalRows?: number;
    viewportRows?: number;
} | {
    type: 'jobLoaded';
    inspect: JobInspect;
} | {
    type: 'resultLoaded';
    result: JobResult;
} | {
    type: 'message';
    message?: string;
} | {
    type: 'move';
    delta: number;
    viewportRows: number;
    totalRows?: number;
} | {
    type: 'top';
    viewportRows: number;
    totalRows?: number;
} | {
    type: 'bottom';
    viewportRows: number;
    totalRows?: number;
} | {
    type: 'open';
    view: Exclude<ConsoleView, 'ps'>;
    jobId: string;
} | {
    type: 'back';
} | {
    type: 'cycleHistory';
} | {
    type: 'toggleAll';
} | {
    type: 'toggleCleaned';
} | {
    type: 'toggleFollow';
} | {
    type: 'startFilter';
} | {
    type: 'filterChar';
    char: string;
} | {
    type: 'filterBackspace';
} | {
    type: 'finishFilter';
    clear?: boolean;
} | {
    type: 'nextRepo';
} | {
    type: 'selectRepo';
    index: number;
};
export declare function initialConsoleState(): ConsoleState;
export declare function currentRepo(state: ConsoleState): RepoRef | undefined;
export declare function selectedJobRow(state: Pick<ConsoleState, 'snapshot' | 'selectedRow'>): Extract<ProcessRow, {
    kind: 'job';
}> | undefined;
export declare function visibleSlice<T>(rows: readonly T[], scroll: number, viewportRows: number): readonly T[];
export declare function reduceConsoleState(state: ConsoleState, action: ConsoleAction): ConsoleState;
//# sourceMappingURL=view-model.d.ts.map