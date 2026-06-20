import type { ProcessHealthReport } from '../../specialist/process-health.js';
import type { SupervisorStatus } from '../../specialist/supervisor.js';

export type ConsoleView = 'ps' | 'feed' | 'job' | 'result' | 'bead' | 'diff' | 'config' | 'repoConfig';
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

export type DiffSource = 'worktree' | 'commit';

export interface DiffSummary {
  worktree: WorktreeRef | null;
  entries: Array<{
    path: string;
    status: 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';
    added: number;
    deleted: number;
    binary: boolean;
  }>;
  // Which lookup path produced this summary. Absent when the diff is
  // empty (no worktree + no recorded commit) so the header can render
  // the empty state distinctly.
  source?: DiffSource;
  // For source='commit': the SHA the summary was extracted from. The
  // view-model passes this to diffFile so the file-level diff matches.
  commitSha?: string;
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
  // Which lookup path produced this file diff. Mirrors DiffSummary.source.
  source?: DiffSource;
  // For source='commit': the SHA the file diff was extracted from.
  commitSha?: string;
  error?: string;
}

// ---------- RepoConfigView (unitAI-hneld) ----------

export interface RepoConfigRow {
  name: string;
  path: string;
  // Disk existence — false when the configured path no longer resolves to a
  // directory (stale entry after a repo move/delete).
  exists: boolean;
  // .specialists/db/observability.db state. Absent or zero size means the
  // repo has never run a specialist locally.
  dbExists: boolean;
  dbSizeBytes: number;
  // Most-recent updated_at_ms from specialist_jobs (or undefined when no
  // jobs / no DB).
  lastActivityMs?: number;
  runningJobs: number;
  waitingJobs: number;
  // Mirrors RepoRef.current so the renderer can highlight the active tab
  // without having to cross-reference state.repos.
  current: boolean;
}

export interface RepoConfigSnapshot {
  rows: RepoConfigRow[];
  baseDirs: string[];
  autoDiscoveredAt?: string;
  configPath: string;
  configExists: boolean;
}

// ---------- ConfigView (Phase 6) — types defined in config-source.ts ----------

export interface ListReposContext {
  repos: RepoRef[];
  /**
   * Optional one-line message surfaced into the existing message slot.
   * Used for first-run auto-discovery feedback (unitAI-29p39).
   */
  message?: string;
}

export interface RuntimeClient {
  listRepos(): Promise<RepoRef[]>;
  /**
   * Optional context-aware seam used by ConsoleApp.loadRepos to surface
   * a startup message (e.g. discovery result). Defaults to a thin
   * wrapper over listRepos() when a runtime implementation skips it
   * (e.g. test stubs).
   */
  listReposWithContext?(): Promise<ListReposContext>;
  listProcessSnapshot(repo: RepoRef, filter: ProcessFilter): Promise<ProcessSnapshot>;
  readFeed(args: { repo: RepoRef; jobId: string; fromSeq?: number; limit?: number; source?: FeedSource }): Promise<FeedEventRow[]>;
  inspectJob(repo: RepoRef, jobIdPrefix: string): Promise<JobInspect>;
  readResult(repo: RepoRef, jobIdPrefix: string): Promise<JobResult>;
  linkedDetail(repo: RepoRef, jobIdPrefix: string): Promise<BeadDoc>;
  liveStateFor(repo: RepoRef, jobIdPrefix: string): Promise<LiveStateRows>;
  resolveWorktree(repo: RepoRef, jobIdPrefix: string): Promise<WorktreeRef | null>;
  diffSummary(repo: RepoRef, jobIdPrefix: string): Promise<DiffSummary>;
  diffFile(repo: RepoRef, jobIdPrefix: string, file: string): Promise<DiffFile>;
  /**
   * Repo config (~/.config/specialists/console.json) management — surfaced
   * via RepoConfigView (unitAI-hneld). Optional so test stubs that don't
   * care about the R keybind can skip the implementation.
   */
  readRepoConfigSnapshot?(cwd?: string): Promise<RepoConfigSnapshot>;
  addRepoConfigEntry?(entry: { name: string; path: string }): Promise<{ ok: boolean; error?: string; snapshot?: RepoConfigSnapshot }>;
  removeRepoConfigEntry?(name: string): Promise<{ ok: boolean; error?: string; snapshot?: RepoConfigSnapshot }>;
  editRepoConfigEntry?(name: string, field: 'name' | 'path', value: string): Promise<{ ok: boolean; error?: string; snapshot?: RepoConfigSnapshot }>;
  rescanRepoConfig?(): Promise<{ ok: boolean; error?: string; snapshot?: RepoConfigSnapshot; discoveredCount?: number }>;
  readGlobalConfig(): Promise<import('./config-source.js').ConfigSnapshot>;
  writeGlobalConfig(
    rawObj: Record<string, unknown>,
    expectedMtimeMs?: number,
  ): Promise<import('./config-source.js').WriteOutcome>;
  readRawGlobalConfig(): Promise<{ raw: Record<string, unknown>; mtimeMs?: number; exists: boolean }>;
  openConfigInEditor(): Promise<{ ok: boolean; errorClass?: string }>;
}

export const BEAD_ID_RE = /^[a-zA-Z]+-[a-zA-Z0-9]+(\.[0-9]+)*$/;
