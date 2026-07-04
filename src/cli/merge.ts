import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { loadEpicReadinessSummary } from '../specialist/epic-readiness.js';
import { syncEpicState } from '../specialist/epic-reconciler.js';
import { isEpicUnresolvedState, type EpicState } from '../specialist/epic-lifecycle.js';

interface MergeCliOptions {
  target: string;
  rebuild: boolean;
  targetBranch?: string;
}

interface BeadSummary {
  id: string;
  title: string;
  issue_type?: string;
  parent?: string;
  dependencies?: Array<{ id?: string }>;
}

interface JobStatusRecord {
  id: string;
  bead_id?: string;
  status?: string;
  branch?: string;
  worktree_path?: string;
  started_at_ms?: number;
}

export interface ChainMergeTarget {
  beadId: string;
  branch: string;
  worktreePath: string;
  jobId: string;
  jobStatus: string;
  startedAtMs: number;
}

export interface MergeStepResult {
  beadId: string;
  branch: string;
  changedFiles: string[];
}

export interface MergeExecutionOptions {
  rebuild: boolean;
  mode?: PublicationMode;
  publicationLabel?: string;
  targetBranch?: string;
}

export type PublicationMode = 'direct' | 'pr';

export interface PublicationExecutionOptions extends MergeExecutionOptions {
  mode: PublicationMode;
  publicationLabel: string;
}

export interface PublicationResult {
  steps: MergeStepResult[];
  pullRequestUrl?: string;
}

const TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled']);

function parseOptions(argv: readonly string[]): MergeCliOptions {
  let target = '';
  let rebuild = false;
  let targetBranch = '';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--rebuild') {
      rebuild = true;
      continue;
    }

    if (argument === '--target-branch') {
      const branchName = argv[index + 1];
      if (!branchName || branchName.startsWith('-')) {
        throw new Error('Missing value for --target-branch');
      }
      if (targetBranch) {
        throw new Error('Only one target branch is supported');
      }
      targetBranch = branchName;
      index += 1;
      continue;
    }

    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (target) {
      throw new Error('Only one merge target is supported');
    }
    target = argument;
  }

  if (!target) {
    throw new Error('Missing merge target');
  }

  return { target, rebuild, targetBranch: targetBranch ? validateTargetBranchRef(targetBranch) : undefined };
}

function runCommand(command: string, args: readonly string[], cwd = process.cwd()) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function validateTargetBranchRef(targetBranch: string, cwd = process.cwd()): string {
  const verification = runCommand('git', ['rev-parse', '--verify', `${targetBranch}^{commit}`], cwd);
  if (verification.status !== 0) {
    const detail = verification.stderr.trim() || verification.stdout.trim() || 'unknown git ref error';
    throw new Error(`Invalid --target-branch '${targetBranch}': ${detail}`);
  }
  return targetBranch;
}

function resolveDefaultBranchName(cwd = process.cwd(), overrideBranch?: string): string {
  if (overrideBranch) return overrideBranch;
  const symbolicRef = runCommand('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd);
  if (symbolicRef.status === 0) {
    const remoteHeadRef = symbolicRef.stdout.trim();
    if (remoteHeadRef.startsWith('origin/')) {
      const branchName = remoteHeadRef.slice('origin/'.length).trim();
      if (branchName) return branchName;
    }
  }

  const localHead = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (localHead.status === 0) {
    const branchName = localHead.stdout.trim();
    if (branchName && branchName !== 'HEAD') {
      return branchName;
    }
  }

  throw new Error('Unable to resolve repository default branch (origin/HEAD).');
}

function resolveMainWorktreeRoot(cwd = process.cwd()): string {
  const worktreeList = runCommand('git', ['worktree', 'list', '--porcelain'], cwd);
  if (worktreeList.status === 0) {
    const firstWorktreeLine = worktreeList.stdout
      .split('\n')
      .map(line => line.trim())
      .find(line => line.startsWith('worktree '));

    if (firstWorktreeLine) {
      const worktreePath = firstWorktreeLine.slice('worktree '.length).trim();
      if (worktreePath) return worktreePath;
    }
  }

  const topLevel = runCommand('git', ['rev-parse', '--show-toplevel'], cwd);
  if (topLevel.status !== 0) {
    throw new Error('Unable to resolve main worktree root.');
  }

  const rootPath = topLevel.stdout.trim();
  if (!rootPath) {
    throw new Error('Unable to resolve main worktree root.');
  }

  return rootPath;
}

function readJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function readBead(id: string): BeadSummary {
  const result = runCommand('bd', ['show', id, '--json']);
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`Unable to read bead '${id}'`);
  }

  const parsed = readJson<unknown>(result.stdout);
  const bead = Array.isArray(parsed) ? parsed[0] : parsed;

  if (!bead || typeof bead !== 'object') {
    throw new Error(`Unexpected bd show payload for '${id}'`);
  }

  const maybe = bead as BeadSummary;
  if (!maybe.id || !maybe.title) {
    throw new Error(`Invalid bead record for '${id}'`);
  }

  return maybe;
}

export function parseChildBeadIds(childrenOutput: string): string[] {
  const ids = childrenOutput
    .split('\n')
    .map(line => line.match(/(unitAI-[a-z0-9]+)/i)?.[1] ?? '')
    .filter(Boolean);
  return [...new Set(ids)];
}

function readEpicChildIds(epicId: string): string[] {
  // Try --json mode first (newer bd versions)
  let result = runCommand('bd', ['children', epicId, '--json']);
  if (result.status === 0) {
    const parsed = readJson<Array<{ id?: string }>>(result.stdout);
    if (Array.isArray(parsed)) {
      const ids = parsed.map(row => row.id).filter((id): id is string => Boolean(id));
      return [...new Set(ids)];
    }
    // Command succeeded but JSON parse failed — fall through to text parse
    const idsFromText = parseChildBeadIds(result.stdout);
    if (idsFromText.length === 0) {
      throw new Error(`No children found for epic '${epicId}'`);
    }
    return idsFromText;
  }

  // Fallback: retry without --json (older bd versions or --json unsupported)
  result = runCommand('bd', ['children', epicId]);
  if (result.status !== 0) {
    throw new Error(`Unable to load children for epic '${epicId}'`);
  }
  const idsFromText = parseChildBeadIds(result.stdout);
  if (idsFromText.length === 0) {
    throw new Error(`No children found for epic '${epicId}'`);
  }
  return idsFromText;
}

function readEpicChainRootBeadIds(epicId: string): string[] {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) return [];

  try {
    return [...new Set(
      sqliteClient
        .listEpicChains(epicId)
        .map((chain) => chain.chain_root_bead_id ?? chain.chain_id)
        .filter((id): id is string => Boolean(id)),
    )];
  } finally {
    sqliteClient.close();
  }
}

export function resolveChainEpicMembership(chainRootBeadId: string): { epicId?: string; source: 'sqlite' | 'bead-parent' | 'none' } {
  const sqliteClient = createObservabilitySqliteClient();
  if (sqliteClient) {
    try {
      const membership = sqliteClient.resolveEpicByChainRootBeadId(chainRootBeadId);
      if (membership?.epic_id) {
        return { epicId: membership.epic_id, source: 'sqlite' };
      }
    } finally {
      sqliteClient.close();
    }
  }

  const bead = readBead(chainRootBeadId);
  if (bead.parent) {
    return { epicId: bead.parent, source: 'bead-parent' };
  }

  return { source: 'none' };
}

export interface EpicGuardResult {
  blocked: boolean;
  epicId?: string;
  epicStatus?: EpicState;
  message?: string;
}

export function checkEpicUnresolvedGuard(chainRootBeadId: string): EpicGuardResult {
  const membership = resolveChainEpicMembership(chainRootBeadId);

  if (!membership.epicId) {
    return { blocked: false };
  }

  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    return {
      blocked: false,
      epicId: membership.epicId,
      message: `Warning: unable to verify epic ${membership.epicId} readiness (observability DB unavailable). Proceeding with chain merge.`,
    };
  }

  try {
    const epicRun = sqliteClient.readEpicRun(membership.epicId);
    if (!epicRun) {
      return {
        blocked: false,
        epicId: membership.epicId,
        message: `Warning: epic ${membership.epicId} has no run record. Proceeding with chain merge.`,
      };
    }

    const status = epicRun.status as EpicState;
    if (!isEpicUnresolvedState(status)) {
      return { blocked: false, epicId: membership.epicId, epicStatus: status };
    }

    const summary = loadEpicReadinessSummary(sqliteClient, membership.epicId);
    const chain = summary.chains.find((entry) => entry.chain_root_bead_id === chainRootBeadId || entry.chain_id === chainRootBeadId);

    if (!chain) {
      return {
        blocked: true,
        epicId: membership.epicId,
        epicStatus: status,
        message: `Chain ${chainRootBeadId} belongs to epic ${membership.epicId} but has no derived readiness record. Use 'sp epic status ${membership.epicId}' to inspect migration state.`,
      };
    }

    if (chain.state === 'pass') {
      return { blocked: false, epicId: membership.epicId, epicStatus: status };
    }

    return {
      blocked: true,
      epicId: membership.epicId,
      epicStatus: status,
      message: `Chain ${chainRootBeadId} blocked by derived readiness: ${chain.blocking_reason ?? chain.state}.\nUse 'sp epic status ${membership.epicId}' to inspect epic state.`,
    };
  } finally {
    sqliteClient.close();
  }
}

export function readAllJobStatuses(): JobStatusRecord[] {
  // DB-first merge surface.
  // sqlite listStatuses() wins when available.
  // status.json fallback exists only for legacy/mock compatibility and must not override sqlite results.
  // resolveMergeTargets() uses this for `sp merge`.
  // resolveMergeTargetsForBeadIds() uses this for `sp epic merge` via epic.ts:349 and `sp end` via end.ts:100.
  // One migration here covers all merge surfaces.
  // epic-readiness.ts:275 already reads via sqlite.listStatuses().
  const sqliteClient = createObservabilitySqliteClient();
  if (sqliteClient && typeof (sqliteClient as { listStatuses?: unknown }).listStatuses === 'function') {
    try {
      return sqliteClient.listStatuses().map((status) => ({
        id: status.id,
        bead_id: status.bead_id,
        status: status.status,
        branch: status.branch,
        worktree_path: status.worktree_path,
        started_at_ms: status.started_at_ms,
      }));
    } finally {
      sqliteClient.close();
    }
  }

  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  if (!existsSync(jobsDir)) return [];

  const statuses: JobStatusRecord[] = [];
  for (const jobId of readdirSync(jobsDir)) {
    const statusFile = join(jobsDir, jobId, 'status.json');
    if (!existsSync(statusFile)) continue;

    try {
      const raw = JSON.parse(readFileSync(statusFile, 'utf-8')) as JobStatusRecord;
      if (raw.id) {
        statuses.push(raw);
      }
    } catch {
      continue;
    }
  }

  return statuses;
}

export function selectNewestChainRootJob(beadId: string, statuses: readonly JobStatusRecord[]): ChainMergeTarget | null {
  const candidates = statuses
    .filter(status => status.bead_id === beadId && status.branch && status.worktree_path)
    .sort((left, right) => (right.started_at_ms ?? 0) - (left.started_at_ms ?? 0));

  const selected = candidates[0];
  if (!selected || !selected.branch || !selected.status || !selected.id || !selected.worktree_path) return null;

  return {
    beadId,
    branch: selected.branch,
    worktreePath: selected.worktree_path,
    jobId: selected.id,
    jobStatus: selected.status,
    startedAtMs: selected.started_at_ms ?? 0,
  };
}

export function ensureTerminalJobs(chains: readonly ChainMergeTarget[]): void {
  const running = chains.filter(chain => !TERMINAL_STATUSES.has(chain.jobStatus));
  if (running.length === 0) return;

  const lines = running.map(chain => `- ${chain.beadId} (${chain.jobId}): ${chain.jobStatus}`);
  throw new Error(`Refusing merge: non-terminal chain jobs\n${lines.join('\n')}`);
}

export function topologicallySortChains(
  chains: readonly ChainMergeTarget[],
  dependenciesByBeadId: ReadonlyMap<string, readonly string[]>,
): ChainMergeTarget[] {
  const byId = new Map(chains.map(chain => [chain.beadId, chain]));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const chain of chains) {
    indegree.set(chain.beadId, 0);
    adjacency.set(chain.beadId, []);
  }

  for (const chain of chains) {
    const dependencies = dependenciesByBeadId.get(chain.beadId) ?? [];
    for (const dependencyId of dependencies) {
      if (!byId.has(dependencyId)) continue;
      adjacency.get(dependencyId)?.push(chain.beadId);
      indegree.set(chain.beadId, (indegree.get(chain.beadId) ?? 0) + 1);
    }
  }

  const queue = [...chains]
    .filter(chain => (indegree.get(chain.beadId) ?? 0) === 0)
    .sort((left, right) => left.startedAtMs - right.startedAtMs)
    .map(chain => chain.beadId);

  const ordered: ChainMergeTarget[] = [];

  while (queue.length > 0) {
    const beadId = queue.shift();
    if (!beadId) continue;

    const chain = byId.get(beadId);
    if (chain) {
      ordered.push(chain);
    }

    const dependents = adjacency.get(beadId) ?? [];
    for (const dependentId of dependents) {
      const nextIndegree = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(dependentId);
      }
    }
  }

  if (ordered.length !== chains.length) {
    throw new Error('Unable to compute merge order: dependency cycle detected');
  }

  return ordered;
}

function loadDependenciesFor(beadIds: readonly string[]): Map<string, readonly string[]> {
  const selected = new Set(beadIds);
  const dependenciesByBeadId = new Map<string, readonly string[]>();

  for (const beadId of beadIds) {
    const bead = readBead(beadId);
    const dependencyIds = (bead.dependencies ?? [])
      .map(dep => dep.id)
      .filter((id): id is string => {
        if (!id) return false;
        return selected.has(id);
      });
    dependenciesByBeadId.set(beadId, dependencyIds);
  }

  return dependenciesByBeadId;
}

export function resolveMergeTargetsForBeadIds(beadIds: readonly string[]): ChainMergeTarget[] {
  const statuses = readAllJobStatuses();
  const chains = beadIds
    .map((beadId) => selectNewestChainRootJob(beadId, statuses))
    .filter((chain): chain is ChainMergeTarget => Boolean(chain));

  if (chains.length === 0) {
    throw new Error('No mergeable chain branches found for provided bead IDs');
  }

  ensureTerminalJobs(chains);

  const dependenciesByBeadId = loadDependenciesFor(chains.map((chain) => chain.beadId));
  return topologicallySortChains(chains, dependenciesByBeadId);
}

export function resolveMergeTargets(target: string): ChainMergeTarget[] {
  const bead = readBead(target);

  if (bead.issue_type !== 'epic') {
    const statuses = readAllJobStatuses();
    const chain = selectNewestChainRootJob(target, statuses);
    if (!chain) {
      throw new Error(`No chain-root job with worktree metadata found for bead '${target}'`);
    }

    const guardResult = checkEpicUnresolvedGuard(chain.beadId);
    if (guardResult.message && !guardResult.blocked) {
      console.warn(guardResult.message);
    }
    if (guardResult.blocked) {
      throw new Error(guardResult.message!);
    }

    ensureTerminalJobs([chain]);
    return [chain];
  }

  const chainRootBeadIds = readEpicChainRootBeadIds(target);
  const childIds = chainRootBeadIds.length > 0 ? chainRootBeadIds : readEpicChildIds(target);
  const chains = resolveMergeTargetsForBeadIds(childIds);
  if (chains.length === 0) {
    throw new Error(`No mergeable chain branches found under epic '${target}'`);
  }

  return chains;
}

function readChangedFilesForLastMerge(cwd = process.cwd()): string[] {
  const diff = runCommand('git', ['diff', '--name-only', 'HEAD^1', 'HEAD'], cwd);
  if (diff.status !== 0) return [];
  return diff.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

interface MergePreviewFileDelta {
  status: string;
  path: string;
}

interface MergePreviewDelta {
  branch: string;
  files: MergePreviewFileDelta[];
  substantiveFiles: MergePreviewFileDelta[];
  noiseFiles: MergePreviewFileDelta[];
}

interface MergeWorthinessDecision {
  shouldMerge: boolean;
  reason: 'ok' | 'already-published' | 'empty-delta' | 'noise-only-delta';
}

const NOISE_PATH_PREFIXES = ['.xtrm/reports/', '.wolf/', '.specialists/jobs/'] as const;

const MERGE_DIRTY_IGNORE_PREFIXES = [
  ...NOISE_PATH_PREFIXES,
  '.beads/',
  '.xtrm/skills/active/',
  'dist/',
] as const;

interface DirtyPathState {
  tracked: string[];
  untracked: string[];
}

interface ShelvedMainState {
  stashRef: string;
  dirtyPaths: string[];
}

function isMergeDirtyIgnored(path: string): boolean {
  return MERGE_DIRTY_IGNORE_PREFIXES.some(prefix => path.startsWith(prefix));
}

function parseGitStatusPaths(stdout: string): DirtyPathState {
  const tracked: string[] = [];
  const untracked: string[] = [];

  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('?? ')) {
      const path = line.slice(3).trim();
      if (path && !isMergeDirtyIgnored(path)) untracked.push(path);
      continue;
    }

    const match = /^..\s(.+?)(?:\s->\s(.+))?$/.exec(line);
    const path = match ? (match[2] ?? match[1] ?? '') : line.slice(3).trim();
    if (path && !isMergeDirtyIgnored(path)) tracked.push(path.trim());
  }

  return { tracked, untracked };
}

function getMainRepoDirtyPaths(cwd: string): DirtyPathState {
  const status = runCommand('git', ['status', '--porcelain=v1'], cwd);
  if (status.status !== 0) {
    throw new Error(`Unable to read git status in '${cwd}'.`);
  }

  return parseGitStatusPaths(status.stdout);
}

function getIncomingMergePaths(branches: readonly string[], cwd: string): Set<string> {
  const incoming = new Set<string>();

  for (const branch of branches) {
    const preview = previewBranchMergeDelta(branch, cwd);
    for (const file of preview.files) {
      if (!isMergeDirtyIgnored(file.path)) incoming.add(file.path);
    }
  }

  return incoming;
}

function formatDirtyConflictMessage(paths: readonly string[]): string {
  return paths.map(path => `- ${path}`).join('\n');
}

function classifyMainRepoDirtyState(branches: readonly string[], cwd: string): {
  dirty: DirtyPathState;
  overlappingPaths: string[];
} {
  const dirty = getMainRepoDirtyPaths(cwd);
  const incoming = getIncomingMergePaths(branches, cwd);
  const overlap = [...dirty.tracked, ...dirty.untracked].filter(path => incoming.has(path));
  return { dirty, overlappingPaths: overlap };
}

function shelveMainRepoDirtyState(cwd: string, dirty: DirtyPathState, publicationLabel: string): ShelvedMainState | null {
  const dirtyPaths = [...dirty.tracked, ...dirty.untracked];
  if (dirtyPaths.length === 0) return null;

  const message = `sp epic merge ${publicationLabel} auto-shelve`;
  const stash = runCommand('git', ['stash', 'push', '--include-untracked', '--message', message], cwd);
  if (stash.status !== 0) {
    throw new Error(`Unable to shelve dirty main-tree state in '${cwd}'.\n${stash.stderr.trim() || stash.stdout.trim() || 'Unknown git error'}`);
  }

  return { stashRef: 'stash@{0}', dirtyPaths };
}

function restoreShelvedMainState(cwd: string, shelved: ShelvedMainState): void {
  const apply = runCommand('git', ['stash', 'apply', '--index', shelved.stashRef], cwd);
  if (apply.status === 0) {
    const drop = runCommand('git', ['stash', 'drop', shelved.stashRef], cwd);
    if (drop.status === 0) return;
    throw new Error(`Restored shelved state but failed to drop stash '${shelved.stashRef}'.\n${drop.stderr.trim() || drop.stdout.trim() || 'Unknown git error'}`);
  }

  throw new Error(
    `Merge succeeded, but restoring shelved dirty state failed for stash '${shelved.stashRef}'.\n` +
    `Recovery:\n` +
    `  git status\n` +
    `  git stash list --grep "sp epic merge"\n` +
    `  git stash apply --index ${shelved.stashRef}\n` +
    `  git stash drop ${shelved.stashRef}\n` +
    `Files:\n${formatDirtyConflictMessage(shelved.dirtyPaths)}\n` +
    `Details: ${apply.stderr.trim() || apply.stdout.trim() || 'Unknown git error'}`,
  );
}

export function assertMainRepoCleanForMerge(cwd: string): void {
  const dirty = getMainRepoDirtyPaths(cwd);
  const allDirty = [...dirty.tracked, ...dirty.untracked];
  if (allDirty.length === 0) return;

  const list = allDirty.map(path => `- ${path}`).join('\n');
  throw new Error(
    `Refusing merge: main repo '${cwd}' has uncommitted changes that could cause spurious conflicts.\n` +
    `Dirty files (tracked + untracked, non-dist/wolf/xtrm):\n${list}\n` +
    `Resolve by committing, stashing, or reverting these changes, then retry merge.`,
  );
}

function parseNameStatusLine(line: string): MergePreviewFileDelta | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\t+/);
  if (parts.length < 2) return null;

  const status = parts[0] ?? '';
  if (!status) return null;

  const path = parts.length >= 3 ? parts[parts.length - 1] ?? '' : parts[1] ?? '';
  if (!path) return null;

  return { status, path };
}

function isNoisePath(path: string): boolean {
  return NOISE_PATH_PREFIXES.some(prefix => path.startsWith(prefix));
}

function isBranchAlreadyPublished(branch: string, cwd = process.cwd(), targetBranch?: string): boolean {
  const baseBranch = resolveDefaultBranchName(cwd, targetBranch);

  const ancestorCheck = runCommand('git', ['merge-base', '--is-ancestor', branch, baseBranch], cwd);
  if (ancestorCheck.status === 0) {
    return true;
  }

  const cherryPickCount = runCommand('git', ['rev-list', '--right-only', '--cherry-pick', '--no-merges', '--count', `${baseBranch}...${branch}`], cwd);
  if (cherryPickCount.status !== 0) {
    return false;
  }

  return cherryPickCount.stdout.trim() === '0';
}

export function previewBranchMergeDelta(branch: string, cwd = process.cwd(), targetBranch?: string): MergePreviewDelta {
  const baseBranch = resolveDefaultBranchName(cwd, targetBranch);
  const mergeBase = runCommand('git', ['merge-base', baseBranch, branch], cwd);
  if (mergeBase.status !== 0) {
    throw new Error(`Unable to compute merge base for '${baseBranch}' and '${branch}'.`);
  }

  const mergeBaseSha = mergeBase.stdout.trim();
  if (!mergeBaseSha) {
    throw new Error(`Unable to compute merge base for '${baseBranch}' and '${branch}'.`);
  }

  const stagedDelta = runCommand('git', ['diff', `${mergeBaseSha}..${branch}`, '--name-status'], cwd);
  if (stagedDelta.status !== 0) {
    throw new Error(`Unable to read merge delta for '${branch}'.`);
  }

  const files = stagedDelta.stdout
    .split('\n')
    .map(parseNameStatusLine)
    .filter((entry): entry is MergePreviewFileDelta => Boolean(entry));

  const noiseFiles = files.filter(file => isNoisePath(file.path));
  const substantiveFiles = files.filter(file => !isNoisePath(file.path));

  return {
    branch,
    files,
    noiseFiles,
    substantiveFiles,
  };
}

export function evaluateMergeWorthiness(preview: MergePreviewDelta, branch: string, cwd = process.cwd(), targetBranch?: string): MergeWorthinessDecision {
  if (preview.files.length === 0) {
    return isBranchAlreadyPublished(branch, cwd, targetBranch)
      ? { shouldMerge: false, reason: 'already-published' }
      : { shouldMerge: false, reason: 'empty-delta' };
  }

  if (preview.substantiveFiles.length === 0) {
    return isBranchAlreadyPublished(branch, cwd, targetBranch)
      ? { shouldMerge: false, reason: 'already-published' }
      : { shouldMerge: false, reason: 'noise-only-delta' };
  }

  return { shouldMerge: true, reason: 'ok' };
}

function throwWorthinessBlockError(target: ChainMergeTarget, preview: MergePreviewDelta, decision: MergeWorthinessDecision): never {
  const summary = [
    `beadId=${target.beadId}`,
    `jobId=${target.jobId}`,
    `branch=${target.branch}`,
    `total=${preview.files.length}`,
    `substantive=${preview.substantiveFiles.length}`,
    `noise=${preview.noiseFiles.length}`,
  ].join(' ');

  const reason = decision.reason === 'empty-delta'
    ? 'empty merge delta'
    : 'noise-only merge delta';

  throw new Error(
    `Refusing merge for '${target.branch}': ${reason}.\n` +
    `Diagnostics: ${summary}`,
  );
}

function assertBranchMergeWorthiness(target: ChainMergeTarget, cwd = process.cwd(), targetBranch?: string): MergeWorthinessDecision {
  const preview = previewBranchMergeDelta(target.branch, cwd, targetBranch);
  const decision = evaluateMergeWorthiness(preview, target.branch, cwd, targetBranch);
  if (decision.reason === 'already-published' || decision.shouldMerge) return decision;
  throwWorthinessBlockError(target, preview, decision);
}

function getConflictFiles(cwd = process.cwd()): string[] {
  const result = runCommand('git', ['diff', '--name-only', '--diff-filter=U'], cwd);
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function getCurrentHeadBranch(cwd = process.cwd()): string {
  const result = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (result.status !== 0) {
    throw new Error('Unable to resolve current git branch before rebase.');
  }

  const branch = result.stdout.trim();
  if (!branch || branch === 'HEAD') {
    throw new Error('Detached HEAD is not supported during merge-time rebase.');
  }

  return branch;
}

function tryAbortRebase(cwd = process.cwd()): void {
  runCommand('git', ['rebase', '--abort'], cwd);
}

export function rebaseBranchOntoMaster(branch: string, worktreePath: string, targetBranch?: string): void {
  const baseBranch = resolveDefaultBranchName(worktreePath, targetBranch);
  const checkedOutBranch = getCurrentHeadBranch(worktreePath);
  if (checkedOutBranch !== branch) {
    throw new Error(`Expected branch '${branch}' in worktree '${worktreePath}', found '${checkedOutBranch}'.`);
  }

  const rebase = runCommand('git', ['rebase', baseBranch], worktreePath);
  if (rebase.status === 0) {
    return;
  }

  const conflicts = getConflictFiles(worktreePath);
  tryAbortRebase(worktreePath);

  const stderr = rebase.stderr.trim();
  const stdout = rebase.stdout.trim();
  const detail = stderr || stdout || 'Unknown git rebase error';
  const conflictLines = conflicts.length > 0
    ? `\nConflicting files:\n${conflicts.map(file => `- ${file}`).join('\n')}`
    : '';

  throw new Error(
    `Rebase failed for '${branch}' onto '${baseBranch}' in worktree '${worktreePath}'.${conflictLines}\n` +
    `Resolve conflicts manually in that worktree, then re-run merge.\n` +
    `Details: ${detail}`,
  );
}

export function mergeBranch(branch: string, cwd = process.cwd()): void {
  const result = runCommand('git', ['merge', branch, '--no-ff', '--no-edit'], cwd);
  if (result.status === 0) return;

  const conflicts = getConflictFiles(cwd);
  const context = conflicts.length > 0
    ? `\nConflicting files:\n${conflicts.map(file => `- ${file}`).join('\n')}`
    : '';

  throw new Error(`Merge conflict while merging '${branch}'.${context}`);
}

export function runTypecheckGate(cwd = process.cwd()): void {
  const hasTypeScriptConfig =
    existsSync(join(cwd, 'tsconfig.json')) ||
    readdirSync(cwd).some(entry => entry.startsWith('tsconfig') && entry.endsWith('.json'));
  if (!hasTypeScriptConfig) {
    console.log('TypeScript gate: skipped (no tsconfig — non-TS repo)');
    return;
  }

  const tsc = runCommand('bunx', ['tsc', '--noEmit'], cwd);
  if (tsc.status === 0) return;

  const stderr = tsc.stderr.trim();
  const stdout = tsc.stdout.trim();
  throw new Error(`TypeScript gate failed after merge.\n${stderr || stdout || 'Unknown tsc error'}`);
}

function hasNodeBuildScript(cwd: string): boolean {
  const packageJsonPath = join(cwd, 'package.json');
  if (!existsSync(packageJsonPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { scripts?: Record<string, string> };
    return typeof pkg.scripts?.build === 'string' && pkg.scripts.build.length > 0;
  } catch {
    return false;
  }
}

export function runRebuild(cwd = process.cwd()): void {
  if (!hasNodeBuildScript(cwd)) {
    console.log('Rebuild: skipped (no package.json build script — non-Node repo)');
    return;
  }

  const build = runCommand('bun', ['run', 'build'], cwd);
  if (build.status === 0) return;

  const stderr = build.stderr.trim();
  const stdout = build.stdout.trim();
  throw new Error(`Rebuild failed.\n${stderr || stdout || 'Unknown build error'}`);
}

export function printSummary(steps: readonly MergeStepResult[], rebuild: boolean): void {
  console.log('Merge complete.');
  console.log('Merged branches (in order):');
  for (const step of steps) {
    console.log(`- ${step.branch} (${step.beadId})`);
    if (step.changedFiles.length === 0) {
      console.log('  files: (none)');
      continue;
    }
    console.log(`  files: ${step.changedFiles.join(', ')}`);
  }

  console.log('TypeScript gate: passed after each merge');
  if (rebuild) {
    console.log('Rebuild: bun run build (passed)');
  }
}

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error('Usage: specialists|sp merge <target-bead-id> [--rebuild] [--target-branch <name>]');
  process.exit(1);
}

function syncEpicStateAfterMerge(target: ChainMergeTarget): void {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) return;

  try {
    const membership = sqliteClient.resolveEpicByChainRootBeadId(target.beadId);
    if (!membership?.epic_id) return;

    syncEpicState(sqliteClient, membership.epic_id, true);
  } finally {
    sqliteClient.close();
  }
}

export function runMergePlan(
  targets: readonly ChainMergeTarget[],
  options: MergeExecutionOptions,
): MergeStepResult[] {
  const mainRepoRoot = resolveMainWorktreeRoot();
  const targetBranch = options.targetBranch ? validateTargetBranchRef(options.targetBranch, mainRepoRoot) : undefined;
  const shelved = options.mode === 'direct'
    ? (() => {
      const dirtyState = classifyMainRepoDirtyState(targets.map((target) => target.branch), mainRepoRoot);
      if (dirtyState.overlappingPaths.length > 0) {
        throw new Error(
          `Refusing merge: main repo '${mainRepoRoot}' has dirty files overlapping incoming epic changes.
` +
          `Overlap:
${formatDirtyConflictMessage(dirtyState.overlappingPaths)}
` +
          `Resolve or move these changes, then retry merge.`,
        );
      }
      return shelveMainRepoDirtyState(mainRepoRoot, dirtyState.dirty, options.publicationLabel ?? `epic-${targets[0]?.beadId ?? 'publication'}`);
    })()
    : null;
  const mergedSteps: MergeStepResult[] = [];

  try {
    for (const target of targets) {
      const worthiness = assertBranchMergeWorthiness(target, mainRepoRoot, targetBranch);
      if (worthiness.reason === 'already-published') {
        mergedSteps.push({
          beadId: target.beadId,
          branch: target.branch,
          changedFiles: [],
        });
        continue;
      }

      rebaseBranchOntoMaster(target.branch, target.worktreePath, targetBranch);
      mergeBranch(target.branch, mainRepoRoot);
      runTypecheckGate(mainRepoRoot);
      syncEpicStateAfterMerge(target);
      mergedSteps.push({
        beadId: target.beadId,
        branch: target.branch,
        changedFiles: readChangedFilesForLastMerge(mainRepoRoot),
      });
    }

    if (options.rebuild) {
      runRebuild(mainRepoRoot);
    }

    return mergedSteps;
  } finally {
    if (shelved) {
      restoreShelvedMainState(mainRepoRoot, shelved);
    }
  }
}

function getCurrentBranchName(): string {
  const result = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (result.status !== 0) {
    throw new Error('Unable to resolve current git branch.');
  }

  const branchName = result.stdout.trim();
  if (!branchName || branchName === 'HEAD') {
    throw new Error('Detached HEAD is not supported for PR publication.');
  }

  return branchName;
}

function checkoutNewBranch(branchName: string): void {
  const checkout = runCommand('git', ['checkout', '-b', branchName]);
  if (checkout.status === 0) return;
  throw new Error(`Failed to create publish branch '${branchName}': ${checkout.stderr.trim() || checkout.stdout.trim() || 'unknown git error'}`);
}

function checkoutBranch(branchName: string): void {
  const checkout = runCommand('git', ['checkout', branchName]);
  if (checkout.status === 0) return;
  throw new Error(`Failed to checkout branch '${branchName}': ${checkout.stderr.trim() || checkout.stdout.trim() || 'unknown git error'}`);
}

function createPullRequest(baseBranch: string, publishBranch: string, publicationLabel: string): string {
  const title = `[sp] Publish ${publicationLabel}`;
  const body = [
    `Automated publication for ${publicationLabel}.`,
    '',
    'Generated by `sp merge --pr` / `sp epic merge --pr` / `sp end --pr`.',
  ].join('\n');

  const command = runCommand('gh', ['pr', 'create', '--base', baseBranch, '--head', publishBranch, '--title', title, '--body', body]);
  if (command.status !== 0) {
    throw new Error(`Failed to create PR via gh CLI: ${command.stderr.trim() || command.stdout.trim() || 'unknown gh error'}`);
  }

  const pullRequestUrl = command.stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('http'));

  if (!pullRequestUrl) {
    throw new Error('gh pr create succeeded but did not return a PR URL.');
  }

  return pullRequestUrl;
}

export function executePublicationPlan(
  targets: readonly ChainMergeTarget[],
  options: PublicationExecutionOptions,
): PublicationResult {
  if (options.mode === 'direct') {
    return {
      steps: runMergePlan(targets, options),
    };
  }

  const baseBranch = getCurrentBranchName();
  const publishBranch = `sp/publish-${options.publicationLabel.replace(/[^a-zA-Z0-9._-]+/g, '-')}-${Date.now()}`;

  checkoutNewBranch(publishBranch);

  try {
    const steps = runMergePlan(targets, options);
    const pullRequestUrl = createPullRequest(baseBranch, publishBranch, options.publicationLabel);
    checkoutBranch(baseBranch);
    return { steps, pullRequestUrl };
  } catch (error) {
    try {
      checkoutBranch(baseBranch);
    } catch {
      // Preserve original publication error.
    }
    throw error;
  }
}

export async function run(): Promise<void> {
  let options: MergeCliOptions;
  try {
    options = parseOptions(process.argv.slice(3));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    printUsageAndExit(message);
  }

  const targets = resolveMergeTargets(options.target);
  const mergedSteps = runMergePlan(targets, { rebuild: options.rebuild, targetBranch: options.targetBranch });
  printSummary(mergedSteps, options.rebuild);
}
