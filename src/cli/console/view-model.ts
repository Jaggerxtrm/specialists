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
  // Per-poll upsert/tombstone delta surfaced by snapshotDiff
  // (unitAI-ctb4u.19). Defaults to undefined; consumed by a future
  // ProcessView render pass (unitAI-ctb4u.21).
  lastDelta?: { upserts: ConsoleJob[]; tombstones: ConsoleJob[] };
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
  // Buffer carries the in-flight text input for add/edit prompts.
  buffer: string;
  // For edit-* modes: name of the entry being mutated. For add-name mode:
  // the path captured during the previous add-path step.
  targetName?: string;
  pendingPath?: string;
  error?: string;
}

export interface RepoConfigViewState {
  snapshot?: RepoConfigSnapshot;
  loading: boolean;
  selectedIndex: number;
  // Toggled by `s` — hides rows with zero jobs in the last 30d when true.
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

export type ConsoleAction =
  | { type: 'reposLoaded'; repos: RepoRef[]; message?: string }
  | { type: 'snapshotLoaded'; snapshot: ProcessSnapshot }
  | { type: 'snapshotDelta'; upserts: ConsoleJob[]; tombstones: ConsoleJob[] }
  | { type: 'feedLoaded'; rows: FeedEventRow[]; totalRows?: number; viewportRows?: number }
  | { type: 'jobLoaded'; inspect: JobInspect }
  | { type: 'resultLoaded'; result: JobResult }
  | { type: 'beadLoaded'; doc: BeadDoc; live: LiveStateRows }
  | { type: 'beadError'; error: string }
  | { type: 'diffSummaryLoaded'; summary: DiffSummary }
  | { type: 'diffFileLoaded'; file: DiffFile }
  | { type: 'diffOpenFile'; index: number; path: string }
  | { type: 'diffBack' }
  | { type: 'diffRefresh' }
  | { type: 'diffMove'; delta: number; viewportRows: number; totalRows?: number }
  | { type: 'configLoaded'; snapshot: ConfigSnapshot; rawMtimeMs?: number }
  | { type: 'configSelectSpecialist'; name: string }
  | { type: 'configRefresh' }
  | { type: 'configCycleField'; delta: number }
  | { type: 'configEditStart'; specialist: string; fieldPath: string; expectedMtimeMs?: number }
  | { type: 'configEditChar'; char: string }
  | { type: 'configEditBackspace' }
  | { type: 'configEditCancel' }
  | { type: 'configEditError'; error: string }
  | { type: 'configEditCommit'; nextSnapshot?: ConfigSnapshot; rawMtimeMs?: number; prevRaw: Record<string, unknown> }
  | { type: 'configUndo'; restoredSnapshot?: ConfigSnapshot; rawMtimeMs?: number }
  | { type: 'repoConfigLoading' }
  | { type: 'repoConfigLoaded'; snapshot: RepoConfigSnapshot }
  | { type: 'repoConfigMove'; delta: number }
  | { type: 'repoConfigToggleInactive' }
  | { type: 'repoConfigStartAdd' }
  | { type: 'repoConfigStartEdit'; field: 'name' | 'path'; targetName: string }
  | { type: 'repoConfigEditChar'; char: string }
  | { type: 'repoConfigEditBackspace' }
  | { type: 'repoConfigEditAdvance' }
  | { type: 'repoConfigEditCancel' }
  | { type: 'repoConfigEditError'; error: string }
  | { type: 'repoConfigEditCommit'; snapshot?: RepoConfigSnapshot; message?: string }
  | { type: 'repoConfigMessage'; message?: string }
  | { type: 'message'; message?: string }
  | { type: 'move'; delta: number; viewportRows: number; totalRows?: number }
  | { type: 'top'; viewportRows: number; totalRows?: number }
  | { type: 'bottom'; viewportRows: number; totalRows?: number }
  | { type: 'open'; view: Exclude<ConsoleView, 'ps'>; jobId: string }
  | { type: 'back' }
  | { type: 'cycleHistory' }
  | { type: 'toggleAll' }
  | { type: 'toggleCleaned' }
  | { type: 'toggleFollow' }
  | { type: 'toggleFeedSource' }
  | { type: 'startFilter' }
  | { type: 'filterChar'; char: string }
  | { type: 'filterBackspace' }
  | { type: 'finishFilter'; clear?: boolean }
  | { type: 'nextRepo' }
  | { type: 'selectRepo'; index: number }
  | { type: 'viewAll' };

export function initialConsoleState(): ConsoleState {
  return {
    repos: [],
    repoIndex: 0,
    view: 'all',
    selectedRow: 0,
    scroll: 0,
    filter: '',
    filtering: false,
    historyMode: 'default',
    includeCleaned: false,
    follow: false,
    feedRows: [],
    beadLoading: false,
    feedSource: 'forensic',
    diff: { stage: 'summary', loading: false, selectedFileIndex: 0, fileScroll: 0 },
    configLoading: false,
    configScroll: 0,
    configSelectedFieldIndex: 0,
    configEdit: { active: false, buffer: '' },
    configUndoStack: [],
    repoConfig: initialRepoConfigState(),
  };
}

export function initialRepoConfigState(): RepoConfigViewState {
  return {
    loading: false,
    selectedIndex: 0,
    showInactive: false,
    edit: { mode: 'none', buffer: '' },
  };
}

export function currentRepo(state: ConsoleState): RepoRef | undefined {
  return state.repos[state.repoIndex];
}

export function selectedJobRow(state: Pick<ConsoleState, 'snapshot' | 'selectedRow'>): Extract<ProcessRow, { kind: 'job' }> | undefined {
  const rows = state.snapshot?.rows ?? [];
  const current = rows[state.selectedRow];
  if (current?.kind === 'job') return current;

  for (let index = state.selectedRow + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row?.kind === 'job') return row;
  }
  for (let index = state.selectedRow - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.kind === 'job') return row;
  }
  return undefined;
}

export function visibleSlice<T>(rows: readonly T[], scroll: number, viewportRows: number): readonly T[] {
  const size = Math.max(1, viewportRows);
  return rows.slice(scroll, scroll + size);
}

export function reduceConsoleState(state: ConsoleState, action: ConsoleAction): ConsoleState {
  switch (action.type) {
    case 'reposLoaded': {
      // First load: honor the runtime's `current` flag (unitAI-29p39 marks
      // the repo whose path matches cwd). Subsequent loads (re-discovery
      // via R / rescan) keep the operator's current selection.
      const isFirstLoad = state.repos.length === 0;
      const currentIdx = action.repos.findIndex((r) => r.current);
      const repoIndex = isFirstLoad && currentIdx >= 0
        ? currentIdx
        : Math.min(state.repoIndex, Math.max(0, action.repos.length - 1));
      return {
        ...state,
        repos: action.repos,
        repoIndex,
        // First-run discovery surfaces a one-line "discovered N repos in
        // ..." message via this field (unitAI-29p39). Subsequent runs
        // load from console.json and pass message=undefined, which is a
        // no-op on the existing message slot.
        message: action.message ?? state.message,
      };
    }
    case 'snapshotLoaded': {
      if (state.view !== 'ps') return { ...state, snapshot: action.snapshot, message: undefined };
      const selectedRow = nearestSelectableRow(action.snapshot.rows, Math.min(state.selectedRow, Math.max(0, action.snapshot.rows.length - 1)), 1);
      return { ...state, snapshot: action.snapshot, selectedRow, scroll: clampScroll(state.scroll, selectedRow, 1), message: undefined };
    }
    case 'snapshotDelta':
      // Surface the upsert/tombstone primitives from snapshotDiff
      // (unitAI-ctb4u.19) without altering any render state. Downstream
      // consumers (ProcessView delta rendering, sync_hint subscribers)
      // read state.lastDelta off the reducer output.
      return { ...state, lastDelta: { upserts: action.upserts, tombstones: action.tombstones } };
    case 'feedLoaded': {
      const totalRows = action.totalRows ?? action.rows.length;
      const scroll = state.follow ? Math.max(0, totalRows - Math.max(1, action.viewportRows ?? 1)) : Math.min(state.scroll, Math.max(0, totalRows - Math.max(1, action.viewportRows ?? 1)));
      return { ...state, feedRows: action.rows, scroll, message: undefined };
    }
    case 'jobLoaded':
      return { ...state, jobInspect: action.inspect, message: undefined };
    case 'resultLoaded':
      return { ...state, jobResult: action.result, message: undefined };
    case 'beadLoaded':
      return { ...state, beadDoc: action.doc, beadLive: action.live, beadLoading: false, beadError: undefined, message: undefined };
    case 'beadError':
      return { ...state, beadLoading: false, beadError: action.error };
    case 'message':
      return { ...state, message: action.message };
    case 'move': {
      if (state.view !== 'ps') return moveScrollOnly(state, action.delta, action.viewportRows, action.totalRows);
      const rows = state.snapshot?.rows ?? [];
      const next = nearestSelectableRow(rows, state.selectedRow + action.delta, action.delta >= 0 ? 1 : -1);
      return { ...state, selectedRow: next, scroll: clampScroll(state.scroll, next, action.viewportRows) };
    }
    case 'top':
      return { ...state, selectedRow: state.view === 'ps' ? nearestSelectableRow(state.snapshot?.rows ?? [], 0, 1) : 0, scroll: 0, follow: state.view === 'feed' ? false : state.follow };
    case 'bottom': {
      if (state.view !== 'ps') {
        const totalRows = action.totalRows ?? detailRowCount(state);
        const scroll = Math.max(0, totalRows - action.viewportRows);
        return { ...state, scroll, follow: state.view === 'feed' ? true : state.follow };
      }
      const rows = state.snapshot?.rows ?? [];
      const selectedRow = nearestSelectableRow(rows, rows.length - 1, -1);
      return { ...state, selectedRow, scroll: Math.max(0, rows.length - action.viewportRows) };
    }
    case 'open':
      return {
        ...state,
        view: action.view,
        selectedJobId: action.jobId,
        scroll: 0,
        follow: action.view === 'feed',
        beadLoading: action.view === 'bead' ? true : state.beadLoading,
        beadDoc: action.view === 'bead' ? undefined : state.beadDoc,
        beadLive: action.view === 'bead' ? undefined : state.beadLive,
        beadError: action.view === 'bead' ? undefined : state.beadError,
        diff: action.view === 'diff'
          ? { stage: 'summary', loading: true, selectedFileIndex: 0, fileScroll: 0 }
          : state.diff,
        configLoading: action.view === 'config' ? true : state.configLoading,
        configScroll: action.view === 'config' ? 0 : state.configScroll,
        config: action.view === 'config' ? undefined : state.config,
      };
    case 'back': {
      // unitAI-kz1ud + bead-view selection-preserving contract:
      // - Detail views (especially forensic feed in follow mode) can leave
      //   `scroll` in the hundreds, which would slice an empty viewport off
      //   `snapshot.rows` and render a blank ps. Always reset scroll.
      // - Preserve the operator's prior selectedRow when it's still in
      //   range. If it's now out of bounds (rows shrank under us, or the
      //   detail view stomped on it) snap to the nearest selectable row.
      const psRows = state.snapshot?.rows ?? [];
      const inRange = state.selectedRow >= 0 && state.selectedRow < psRows.length;
      const selectedRow = inRange
        ? state.selectedRow
        : nearestSelectableRow(psRows, 0, 1);
      return {
        ...state,
        view: 'ps',
        selectedJobId: undefined,
        selectedRow,
        scroll: 0,
        follow: false,
        jobInspect: undefined,
        jobResult: undefined,
        beadDoc: undefined,
        beadLive: undefined,
        beadLoading: false,
        beadError: undefined,
        diff: { stage: 'summary', loading: false, selectedFileIndex: 0, fileScroll: 0 },
      };
    }
    case 'diffSummaryLoaded':
      return {
        ...state,
        diff: {
          ...state.diff,
          loading: false,
          summary: action.summary,
          error: action.summary.error,
          selectedFileIndex: Math.min(state.diff.selectedFileIndex, Math.max(0, action.summary.entries.length - 1)),
        },
      };
    case 'diffFileLoaded':
      return {
        ...state,
        diff: { ...state.diff, loading: false, fileDoc: action.file, error: action.file.error, fileScroll: 0 },
      };
    case 'diffOpenFile':
      return {
        ...state,
        diff: {
          ...state.diff,
          stage: 'file',
          loading: true,
          selectedFileIndex: action.index,
          filePath: action.path,
          fileDoc: undefined,
          fileScroll: 0,
          error: undefined,
        },
      };
    case 'diffBack':
      if (state.diff.stage === 'file') {
        return {
          ...state,
          diff: { ...state.diff, stage: 'summary', fileDoc: undefined, filePath: undefined, fileScroll: 0, error: undefined },
        };
      }
      // Already at summary — fall through to leave DiffView.
      return {
        ...state,
        view: 'ps',
        selectedJobId: undefined,
        diff: { stage: 'summary', loading: false, selectedFileIndex: 0, fileScroll: 0 },
      };
    case 'diffRefresh':
      return {
        ...state,
        diff: { ...state.diff, loading: true, error: undefined },
      };
    case 'configLoaded': {
      const firstSpecialist = action.snapshot.specialists[0]?.name;
      return {
        ...state,
        config: action.snapshot,
        configLoading: false,
        configRawMtimeMs: action.rawMtimeMs ?? state.configRawMtimeMs,
        configSelectedSpecialist: state.configSelectedSpecialist ?? firstSpecialist,
      };
    }
    case 'configSelectSpecialist':
      return { ...state, configSelectedSpecialist: action.name, configScroll: 0, configSelectedFieldIndex: 0 };
    case 'configRefresh':
      return { ...state, configLoading: true };
    case 'configCycleField': {
      const selected = state.config?.specialists.find((s) => s.name === state.configSelectedSpecialist);
      const total = selected?.fields.length ?? 0;
      if (total === 0) return state;
      const next = Math.max(0, Math.min(total - 1, state.configSelectedFieldIndex + action.delta));
      return { ...state, configSelectedFieldIndex: next };
    }
    case 'configEditStart':
      return {
        ...state,
        configEdit: {
          active: true,
          fieldPath: action.fieldPath,
          specialist: action.specialist,
          buffer: '',
          error: undefined,
          expectedMtimeMs: action.expectedMtimeMs,
        },
      };
    case 'configEditChar':
      if (!state.configEdit.active) return state;
      return { ...state, configEdit: { ...state.configEdit, buffer: state.configEdit.buffer + action.char, error: undefined } };
    case 'configEditBackspace':
      if (!state.configEdit.active) return state;
      return { ...state, configEdit: { ...state.configEdit, buffer: state.configEdit.buffer.slice(0, -1), error: undefined } };
    case 'configEditCancel':
      return { ...state, configEdit: { active: false, buffer: '' } };
    case 'configEditError':
      return { ...state, configEdit: { ...state.configEdit, error: action.error } };
    case 'configEditCommit': {
      const undoStack = [action.prevRaw, ...state.configUndoStack].slice(0, 5);
      return {
        ...state,
        config: action.nextSnapshot ?? state.config,
        configRawMtimeMs: action.rawMtimeMs ?? state.configRawMtimeMs,
        configUndoStack: undoStack,
        configEdit: { active: false, buffer: '' },
      };
    }
    case 'configUndo':
      return {
        ...state,
        config: action.restoredSnapshot ?? state.config,
        configRawMtimeMs: action.rawMtimeMs ?? state.configRawMtimeMs,
        configUndoStack: state.configUndoStack.slice(1),
      };
    case 'diffMove': {
      const stage = state.diff.stage;
      if (stage === 'summary') {
        const total = state.diff.summary?.entries.length ?? 0;
        const next = Math.max(0, Math.min(total - 1, state.diff.selectedFileIndex + action.delta));
        return { ...state, diff: { ...state.diff, selectedFileIndex: next } };
      }
      const total = action.totalRows ?? 0;
      const max = Math.max(0, total - Math.max(1, action.viewportRows));
      const next = Math.max(0, Math.min(max, state.diff.fileScroll + action.delta));
      return { ...state, diff: { ...state.diff, fileScroll: next } };
    }
    case 'cycleHistory': {
      const historyMode: HistoryMode = state.historyMode === 'default' ? 'history' : state.historyMode === 'history' ? 'all' : 'default';
      return { ...state, historyMode, selectedRow: 0, scroll: 0 };
    }
    case 'toggleAll':
      return { ...state, historyMode: state.historyMode === 'all' ? 'default' : 'all', selectedRow: 0, scroll: 0 };
    case 'toggleCleaned':
      return { ...state, includeCleaned: !state.includeCleaned, selectedRow: 0, scroll: 0 };
    case 'toggleFollow':
      return { ...state, follow: !state.follow };
    case 'toggleFeedSource':
      // Source-switch atomicity: clear buffer before next subscribe so no
      // mixed-source rows can be drawn.
      return {
        ...state,
        feedSource: state.feedSource === 'forensic' ? 'sp_feed' : 'forensic',
        feedRows: [],
        scroll: 0,
      };
    case 'startFilter':
      return { ...state, filtering: true };
    case 'filterChar':
      return { ...state, filter: `${state.filter}${action.char}`, selectedRow: 0, scroll: 0 };
    case 'filterBackspace':
      return { ...state, filter: state.filter.slice(0, -1), selectedRow: 0, scroll: 0 };
    case 'finishFilter':
      return { ...state, filtering: false, filter: action.clear ? '' : state.filter, selectedRow: 0, scroll: 0 };
    case 'nextRepo':
      return switchRepo(state, state.repoIndex + 1);
    case 'selectRepo':
      return switchRepo(state, action.index);
    case 'repoConfigLoading':
      return { ...state, repoConfig: { ...state.repoConfig, loading: true } };
    case 'repoConfigLoaded': {
      const max = Math.max(0, action.snapshot.rows.length - 1);
      const selectedIndex = Math.min(state.repoConfig.selectedIndex, max);
      return {
        ...state,
        repoConfig: {
          ...state.repoConfig,
          snapshot: action.snapshot,
          loading: false,
          selectedIndex,
        },
      };
    }
    case 'repoConfigMove': {
      const rows = visibleRepoConfigRows(state.repoConfig);
      if (rows.length === 0) return state;
      const max = rows.length - 1;
      const next = Math.max(0, Math.min(max, state.repoConfig.selectedIndex + action.delta));
      return { ...state, repoConfig: { ...state.repoConfig, selectedIndex: next } };
    }
    case 'repoConfigToggleInactive':
      return {
        ...state,
        repoConfig: { ...state.repoConfig, showInactive: !state.repoConfig.showInactive, selectedIndex: 0 },
      };
    case 'repoConfigStartAdd':
      return {
        ...state,
        repoConfig: {
          ...state.repoConfig,
          edit: { mode: 'add-path', buffer: '', error: undefined },
        },
      };
    case 'repoConfigStartEdit':
      return {
        ...state,
        repoConfig: {
          ...state.repoConfig,
          edit: {
            mode: action.field === 'name' ? 'edit-name' : 'edit-path',
            buffer: '',
            targetName: action.targetName,
            error: undefined,
          },
        },
      };
    case 'repoConfigEditChar':
      if (state.repoConfig.edit.mode === 'none') return state;
      return {
        ...state,
        repoConfig: {
          ...state.repoConfig,
          edit: { ...state.repoConfig.edit, buffer: state.repoConfig.edit.buffer + action.char, error: undefined },
        },
      };
    case 'repoConfigEditBackspace':
      if (state.repoConfig.edit.mode === 'none') return state;
      return {
        ...state,
        repoConfig: {
          ...state.repoConfig,
          edit: { ...state.repoConfig.edit, buffer: state.repoConfig.edit.buffer.slice(0, -1), error: undefined },
        },
      };
    case 'repoConfigEditAdvance': {
      // Two-step add flow: after path is captured we move to name (default
      // derived from basename in the component). Everything else is a
      // single-step submit handled by the component, never this action.
      if (state.repoConfig.edit.mode !== 'add-path') return state;
      return {
        ...state,
        repoConfig: {
          ...state.repoConfig,
          edit: {
            mode: 'add-name',
            buffer: '',
            pendingPath: state.repoConfig.edit.buffer,
            error: undefined,
          },
        },
      };
    }
    case 'repoConfigEditCancel':
      return { ...state, repoConfig: { ...state.repoConfig, edit: { mode: 'none', buffer: '' } } };
    case 'repoConfigEditError':
      return {
        ...state,
        repoConfig: { ...state.repoConfig, edit: { ...state.repoConfig.edit, error: action.error } },
      };
    case 'repoConfigEditCommit': {
      const next = action.snapshot ?? state.repoConfig.snapshot;
      const max = Math.max(0, (next?.rows.length ?? 1) - 1);
      return {
        ...state,
        repoConfig: {
          ...state.repoConfig,
          snapshot: next,
          edit: { mode: 'none', buffer: '' },
          selectedIndex: Math.min(state.repoConfig.selectedIndex, max),
          message: action.message,
        },
      };
    }
    case 'repoConfigMessage':
      return { ...state, repoConfig: { ...state.repoConfig, message: action.message } };
    case 'viewAll':
      return { ...state, view: 'all', scroll: 0, selectedRow: 0 };
  }
}

// Apply the showInactive toggle. Inactive = no jobs in the last 30 days OR
// no DB at all. Exposed so the component can pick the matching row and so
// the reducer's `move` action stays in sync with what the operator sees.
export function visibleRepoConfigRows(state: RepoConfigViewState): RepoConfigSnapshot['rows'] {
  const all = state.snapshot?.rows ?? [];
  if (state.showInactive) return all;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return all.filter((r) => (r.lastActivityMs ?? 0) >= cutoff);
}

function switchRepo(state: ConsoleState, nextIndex: number): ConsoleState {
  if (state.repos.length === 0) return state;
  const repoIndex = ((nextIndex % state.repos.length) + state.repos.length) % state.repos.length;
  return {
    ...state,
    repoIndex,
    view: 'ps',
    selectedRow: 0,
    scroll: 0,
    selectedJobId: undefined,
    snapshot: undefined,
    feedRows: [],
    jobInspect: undefined,
    jobResult: undefined,
    message: undefined,
  };
}

function nearestSelectableRow(rows: readonly ProcessRow[], requested: number, direction: 1 | -1): number {
  if (rows.length === 0) return 0;
  const start = Math.max(0, Math.min(requested, rows.length - 1));
  for (let index = start; index >= 0 && index < rows.length; index += direction) {
    if (rows[index]?.kind === 'job') return index;
  }
  for (let index = start; index >= 0 && index < rows.length; index -= direction) {
    if (rows[index]?.kind === 'job') return index;
  }
  return start;
}

function clampScroll(scroll: number, selectedRow: number, viewportRows: number): number {
  const height = Math.max(1, viewportRows);
  if (selectedRow < scroll) return selectedRow;
  if (selectedRow >= scroll + height) return selectedRow - height + 1;
  return Math.max(0, scroll);
}

function moveScrollOnly(state: ConsoleState, delta: number, viewportRows: number, renderedTotalRows?: number): ConsoleState {
  const totalRows = renderedTotalRows ?? detailRowCount(state);
  const maxScroll = Math.max(0, totalRows - Math.max(1, viewportRows));
  return { ...state, scroll: Math.max(0, Math.min(maxScroll, state.scroll + delta)), follow: state.view === 'feed' ? false : state.follow };
}

function detailRowCount(state: ConsoleState): number {
  if (state.view === 'feed') return state.feedRows.length;
  if (state.view === 'job') return state.jobInspect?.fields.length ?? 0;
  if (state.view === 'result') return state.jobResult?.output.split('\n').length ?? 0;
  return state.snapshot?.rows.length ?? 0;
}
