import type { ProcessHealthReport } from '../../specialist/process-health.js';
import type { SupervisorStatus } from '../../specialist/supervisor.js';

export type ConsoleView = 'ps' | 'feed' | 'job' | 'result' | 'bead' | 'diff' | 'config';
export type HistoryMode = 'default' | 'history' | 'all';
export type FeedSource = 'sp_feed' | 'forensic';

export interface RepoRef {
  id: string;
  name: string;
  path: string;
  dbPath?: string;
  current?: boolean;
}

export interface ProcessFilter {
  historyMode: HistoryMode;
  includeCleaned: boolean;
  textFilter: string;
}

export interface ConsoleJob extends SupervisorStatus {
  is_dead?: boolean;
  bead_title?: string;
  payload_kb?: string;
  payload_tokens?: string;
  next_action?: string;
}

export type ProcessRow =
  | { kind: 'group'; id: string; label: string; depth: number }
  | { kind: 'job'; id: string; job: ConsoleJob; depth: number };

export interface ProcessSnapshot {
  generatedAtMs: number;
  repo: RepoRef;
  filter: ProcessFilter;
  rows: ProcessRow[];
  jobs: ConsoleJob[];
  totalJobs: number;
  visibleJobs: number;
  runningJobs: number;
  waitingJobs: number;
  epics: number;
  nodes: number;
  worktrees: number;
  maxContextPct?: number;
  totalTokens: number;
  health: ProcessHealthReport | null;
}

export interface FeedEventRow {
  jobId: string;
  specialist: string;
  beadId?: string;
  seq?: number;
  t: number;
  type: string;
  line: string;
}

export interface JobInspect {
  job: ConsoleJob;
  fields: Array<{ label: string; value: string }>;
  actions: string[];
}

export interface JobResult {
  job: ConsoleJob | null;
  title: string;
  output: string;
  footer: string;
  error?: string;
}

// ---------- BeadView (Phase 2) ----------

export interface BeadField {
  key: string;
  value: string;
}

export interface BeadSection {
  title: string;
  body: string;
}

export interface BeadDoc {
  beadId: string;
  fields: BeadField[];
  sections: BeadSection[];
  raw?: string;
  error?: string;
}

export interface LiveStateRow {
  key: string;
  value: string;
}

export interface LiveStateRows {
  rows: LiveStateRow[];
  error?: string;
}

// ---------- DiffView (Phase 4) ----------

export interface WorktreeRef {
  path: string;
  branch?: string;
  base: string;
}

export interface DiffSummary {
  worktree: WorktreeRef | null;
  entries: Array<{
    path: string;
    status: 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';
    added: number;
    deleted: number;
    binary: boolean;
  }>;
  error?: string;
}

export interface DiffHunkLine {
  kind: 'context' | 'add' | 'del' | 'meta';
  text: string;
}

export interface DiffHunkBlock {
  header: string;
  lines: DiffHunkLine[];
}

export interface DiffFile {
  path: string;
  binary: boolean;
  hunks: DiffHunkBlock[];
  truncated?: boolean;
  totalLines?: number;
  error?: string;
}

// ---------- ConfigView (Phase 6) — types defined in config-source.ts ----------

export interface RuntimeClient {
  listRepos(): Promise<RepoRef[]>;
  listProcessSnapshot(repo: RepoRef, filter: ProcessFilter): Promise<ProcessSnapshot>;
  readFeed(args: { repo: RepoRef; jobId: string; fromSeq?: number; limit?: number; source?: FeedSource }): Promise<FeedEventRow[]>;
  inspectJob(repo: RepoRef, jobIdPrefix: string): Promise<JobInspect>;
  readResult(repo: RepoRef, jobIdPrefix: string): Promise<JobResult>;
  linkedDetail(repo: RepoRef, jobIdPrefix: string): Promise<BeadDoc>;
  liveStateFor(repo: RepoRef, jobIdPrefix: string): Promise<LiveStateRows>;
  resolveWorktree(repo: RepoRef, jobIdPrefix: string): Promise<WorktreeRef | null>;
  diffSummary(repo: RepoRef, jobIdPrefix: string): Promise<DiffSummary>;
  diffFile(repo: RepoRef, jobIdPrefix: string, file: string): Promise<DiffFile>;
  readGlobalConfig(): Promise<import('./config-source.js').ConfigSnapshot>;
}

export const BEAD_ID_RE = /^[a-zA-Z]+-[a-zA-Z0-9]+(\.[0-9]+)*$/;
