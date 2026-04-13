import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { resolveJobsDir } from '../specialist/job-root.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { isEpicUnresolvedState, type EpicState } from '../specialist/epic-lifecycle.js';

interface MergeCliOptions {
  target: string;
  rebuild: boolean;
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

  for (const argument of argv) {
    if (argument === '--rebuild') {
      rebuild = true;
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

  return { target, rebuild };
}

function runCommand(command: string, args: readonly string[], cwd = process.cwd()) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
    // SQLite unavailable during migration/fallback: allow merge but warn
    return {
      blocked: false,
      epicId: membership.epicId,
      message: `Warning: unable to verify epic ${membership.epicId} status (observability DB unavailable). Proceeding with chain merge.`,
    };
  }

  try {
    const epicRun = sqliteClient.readEpicRun(membership.epicId);
    if (!epicRun) {
      // Epic metadata missing during migration: allow merge but warn
      return {
        blocked: false,
        epicId: membership.epicId,
        message: `Warning: epic ${membership.epicId} has no run record. Proceeding with chain merge.`,
      };
    }

    const status = epicRun.status as EpicState;
    if (!isEpicUnresolvedState(status)) {
      // Epic is terminal (merged, failed, abandoned): allow chain merge
      return { blocked: false, epicId: membership.epicId, epicStatus: status };
    }

    // Epic is unresolved: block chain merge
    return {
      blocked: true,
      epicId: membership.epicId,
      epicStatus: status,
      message: `Chain ${chainRootBeadId} belongs to unresolved epic ${membership.epicId} (status: ${status}).\nUse 'sp epic merge ${membership.epicId}' to publish all chains together, or 'sp epic status ${membership.epicId}' to inspect the epic state.`,
    };
  } finally {
    sqliteClient.close();
  }
}

export function readAllJobStatuses(): JobStatusRecord[] {
  const jobsDir = resolveJobsDir();
  if (!existsSync(jobsDir)) return [];

  const entries = readdirSync(jobsDir, { withFileTypes: true });
  const statuses: JobStatusRecord[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const statusPath = join(jobsDir, entry.name, 'status.json');
    if (!existsSync(statusPath)) continue;

    const parsed = readJson<JobStatusRecord>(readFileSync(statusPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') continue;
    statuses.push(parsed);
  }

  return statuses;
}

export function selectNewestChainRootJob(beadId: string, statuses: readonly JobStatusRecord[]): ChainMergeTarget | null {
  const candidates = statuses
    .filter(status => status.bead_id === beadId && status.branch && status.worktree_path)
    .sort((left, right) => (right.started_at_ms ?? 0) - (left.started_at_ms ?? 0));

  const selected = candidates[0];
  if (!selected || !selected.branch || !selected.status || !selected.id) return null;

  return {
    beadId,
    branch: selected.branch,
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

  const childIds = readEpicChildIds(target);
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
  reason: 'ok' | 'empty-delta' | 'noise-only-delta';
}

const NOISE_PATH_PREFIXES = ['.xtrm/reports/', '.wolf/', '.specialists/jobs/'] as const;

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

export function previewBranchMergeDelta(branch: string, cwd = process.cwd()): MergePreviewDelta {
  const mergeBase = runCommand('git', ['merge-base', 'main', branch], cwd);
  if (mergeBase.status !== 0) {
    throw new Error(`Unable to compute merge base for 'main' and '${branch}'.`);
  }

  const mergeBaseSha = mergeBase.stdout.trim();
  if (!mergeBaseSha) {
    throw new Error(`Unable to compute merge base for 'main' and '${branch}'.`);
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

export function evaluateMergeWorthiness(preview: MergePreviewDelta): MergeWorthinessDecision {
  if (preview.files.length === 0) {
    return { shouldMerge: false, reason: 'empty-delta' };
  }

  if (preview.substantiveFiles.length === 0) {
    return { shouldMerge: false, reason: 'noise-only-delta' };
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

function assertBranchMergeWorthiness(target: ChainMergeTarget, cwd = process.cwd()): void {
  const preview = previewBranchMergeDelta(target.branch, cwd);
  const decision = evaluateMergeWorthiness(preview);
  if (decision.shouldMerge) return;
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
  const tsc = runCommand('bunx', ['tsc', '--noEmit'], cwd);
  if (tsc.status === 0) return;

  const stderr = tsc.stderr.trim();
  const stdout = tsc.stdout.trim();
  throw new Error(`TypeScript gate failed after merge.\n${stderr || stdout || 'Unknown tsc error'}`);
}

export function runRebuild(cwd = process.cwd()): void {
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
  console.error('Usage: specialists|sp merge <target-bead-id> [--rebuild]');
  process.exit(1);
}

export function runMergePlan(
  targets: readonly ChainMergeTarget[],
  options: MergeExecutionOptions,
): MergeStepResult[] {
  const mainRepoRoot = resolveMainWorktreeRoot();
  const mergedSteps: MergeStepResult[] = [];

  for (const target of targets) {
    assertBranchMergeWorthiness(target, mainRepoRoot);
    mergeBranch(target.branch, mainRepoRoot);
    runTypecheckGate(mainRepoRoot);
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
  const mergedSteps = runMergePlan(targets, { rebuild: options.rebuild });
  printSummary(mergedSteps, options.rebuild);
}
