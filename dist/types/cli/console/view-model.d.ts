import type { BeadDoc, ConsoleJob, ConsoleView, DiffFile, DiffSummary, FeedEventRow, FeedSource, HistoryMode, JobInspect, JobResult, LiveStateRows, ProcessRow, ProcessSnapshot, RepoConfigSnapshot, RepoRef } from './types.js';
import type { ConfigSnapshot } from './config-source.js';
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
    lastDelta?: {
        upserts: ConsoleJob[];
        tombstones: ConsoleJob[];
    };
    feedRows: FeedEventRow[];
    jobInspect?: JobInspect;
    jobResult?: JobResult;
    beadDoc?: BeadDoc;
    beadLive?: LiveStateRows;
    beadLoading: boolean;
    beadError?: string;
    feedSource: FeedSource;
    diff: DiffViewState;
    config?: ConfigSnapshot;
    configLoading: boolean;
    configSelectedSpecialist?: string;
    configSelectedFieldIndex: number;
    configScroll: number;
    configEdit: ConfigEditState;
    configUndoStack: Array<Record<string, unknown>>;
    configRawMtimeMs?: number;
    repoConfig: RepoConfigViewState;
    message?: string;
}
export type RepoConfigEditMode = 'none' | 'add-path' | 'add-name' | 'edit-name' | 'edit-path';
export interface RepoConfigEditState {
    mode: RepoConfigEditMode;
    buffer: string;
    targetName?: string;
    pendingPath?: string;
    error?: string;
}
export interface RepoConfigViewState {
    snapshot?: RepoConfigSnapshot;
    loading: boolean;
    selectedIndex: number;
    showInactive: boolean;
    edit: RepoConfigEditState;
    message?: string;
}
export interface ConfigEditState {
    active: boolean;
    fieldPath?: string;
    specialist?: string;
    buffer: string;
    error?: string;
    expectedMtimeMs?: number;
}
export interface DiffViewState {
    stage: 'summary' | 'file';
    loading: boolean;
    summary?: DiffSummary;
    selectedFileIndex: number;
    fileScroll: number;
    filePath?: string;
    fileDoc?: DiffFile;
    error?: string;
}
export type ConsoleAction = {
    type: 'reposLoaded';
    repos: RepoRef[];
    message?: string;
} | {
    type: 'snapshotLoaded';
    snapshot: ProcessSnapshot;
} | {
    type: 'snapshotDelta';
    upserts: ConsoleJob[];
    tombstones: ConsoleJob[];
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
    type: 'beadLoaded';
    doc: BeadDoc;
    live: LiveStateRows;
} | {
    type: 'beadError';
    error: string;
} | {
    type: 'diffSummaryLoaded';
    summary: DiffSummary;
} | {
    type: 'diffFileLoaded';
    file: DiffFile;
} | {
    type: 'diffOpenFile';
    index: number;
    path: string;
} | {
    type: 'diffBack';
} | {
    type: 'diffRefresh';
} | {
    type: 'diffMove';
    delta: number;
    viewportRows: number;
    totalRows?: number;
} | {
    type: 'configLoaded';
    snapshot: ConfigSnapshot;
    rawMtimeMs?: number;
} | {
    type: 'configSelectSpecialist';
    name: string;
} | {
    type: 'configRefresh';
} | {
    type: 'configCycleField';
    delta: number;
} | {
    type: 'configEditStart';
    specialist: string;
    fieldPath: string;
    expectedMtimeMs?: number;
} | {
    type: 'configEditChar';
    char: string;
} | {
    type: 'configEditBackspace';
} | {
    type: 'configEditCancel';
} | {
    type: 'configEditError';
    error: string;
} | {
    type: 'configEditCommit';
    nextSnapshot?: ConfigSnapshot;
    rawMtimeMs?: number;
    prevRaw: Record<string, unknown>;
} | {
    type: 'configUndo';
    restoredSnapshot?: ConfigSnapshot;
    rawMtimeMs?: number;
} | {
    type: 'repoConfigLoading';
} | {
    type: 'repoConfigLoaded';
    snapshot: RepoConfigSnapshot;
} | {
    type: 'repoConfigMove';
    delta: number;
} | {
    type: 'repoConfigToggleInactive';
} | {
    type: 'repoConfigStartAdd';
} | {
    type: 'repoConfigStartEdit';
    field: 'name' | 'path';
    targetName: string;
} | {
    type: 'repoConfigEditChar';
    char: string;
} | {
    type: 'repoConfigEditBackspace';
} | {
    type: 'repoConfigEditAdvance';
} | {
    type: 'repoConfigEditCancel';
} | {
    type: 'repoConfigEditError';
    error: string;
} | {
    type: 'repoConfigEditCommit';
    snapshot?: RepoConfigSnapshot;
    message?: string;
} | {
    type: 'repoConfigMessage';
    message?: string;
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
    type: 'toggleFeedSource';
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
export declare function initialRepoConfigState(): RepoConfigViewState;
export declare function currentRepo(state: ConsoleState): RepoRef | undefined;
export declare function selectedJobRow(state: Pick<ConsoleState, 'snapshot' | 'selectedRow'>): Extract<ProcessRow, {
    kind: 'job';
}> | undefined;
export declare function visibleSlice<T>(rows: readonly T[], scroll: number, viewportRows: number): readonly T[];
export declare function reduceConsoleState(state: ConsoleState, action: ConsoleAction): ConsoleState;
export declare function visibleRepoConfigRows(state: RepoConfigViewState): RepoConfigSnapshot['rows'];
//# sourceMappingURL=view-model.d.ts.map