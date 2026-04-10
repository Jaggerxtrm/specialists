import { spawnSync } from 'node:child_process';
import type { EpicState, EpicRunRecord, EpicChainRecord } from '../specialist/epic-lifecycle.js';
import {
  EPIC_STATES,
  isEpicTerminalState,
  isEpicUnresolvedState,
  canTransitionEpicState,
  transitionEpicState,
  evaluateEpicMergeReadiness,
  summarizeEpicTransition,
} from '../specialist/epic-lifecycle.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import type { ObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import {
  resolveMergeTargets,
  topologicallySortChains,
  parseChildBeadIds,
  type ChainMergeTarget,
} from './merge.js';

const RUNNING_STATUSES = new Set(['starting', 'running', 'waiting', 'degraded']);

interface EpicMergeCliOptions {
  epicId: string;
  rebuild: boolean;
  forceResolving: boolean;
}

interface EpicMergeContext {
  epicId: string;
  epicRecord: EpicRunRecord | null;
  chainRecords: EpicChainRecord[];
  chainTargets: ChainMergeTarget[];
  chainJobStatuses: Map<string, { hasRunningJob: boolean; jobIds: string[] }>;
}

interface EpicMergeResult {
  epicId: string;
  success: boolean;
  fromState: EpicState;
  toState: EpicState;
  mergedChains: Array<{ beadId: string; branch: string; changedFiles: string[] }>;
  blockedChains: string[];
  error?: string;
}

function runCommand(command: string, args: readonly string[], cwd = process.cwd()) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function parseOptions(argv: readonly string[]): EpicMergeCliOptions {
  let epicId = '';
  let rebuild = false;
  let forceResolving = false;

  for (const argument of argv) {
    if (argument === '--rebuild') {
      rebuild = true;
      continue;
    }

    if (argument === '--force-resolving') {
      forceResolving = true;
      continue;
    }

    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (epicId) {
      throw new Error('Only one epic ID is supported');
    }
    epicId = argument;
  }

  if (!epicId) {
    throw new Error('Missing epic ID');
  }

  return { epicId, rebuild, forceResolving };
}

function readEpicChildrenFromBeads(epicId: string): string[] {
  const result = runCommand('bd', ['children', epicId]);
  if (result.status !== 0) {
    throw new Error(`Unable to load children for epic '${epicId}'`);
  }
  const ids = parseChildBeadIds(result.stdout);
  if (ids.length === 0) {
    throw new Error(`No children found for epic '${epicId}'`);
  }
  return ids;
}

function buildChainJobStatuses(
  sqlite: ObservabilitySqliteClient,
  chainRecords: EpicChainRecord[],
): Map<string, { hasRunningJob: boolean; jobIds: string[] }> {
  const statuses = new Map<string, { hasRunningJob: boolean; jobIds: string[] }>();

  for (const chain of chainRecords) {
    const jobIds = sqlite.listChainJobIds(chain.chain_id);
    const hasRunningJob = jobIds.some((jobId) => {
      const status = sqlite.readStatus(jobId);
      return status && RUNNING_STATUSES.has(status.status);
    });
    statuses.set(chain.chain_id, { hasRunningJob, jobIds });
  }

  return statuses;
}

function gatherEpicContext(options: EpicMergeCliOptions): EpicMergeContext {
  const sqlite = createObservabilitySqliteClient();
  if (!sqlite) {
    throw new Error('Observability SQLite database not available. Run `sp db setup` first.');
  }

  try {
    const epicRecord = sqlite.readEpicRun(options.epicId);
    const chainRecords = sqlite.listEpicChains(options.epicId);

    // If no chain records in SQLite, fall back to bd children + job statuses
    let chainTargets: ChainMergeTarget[] = [];
    if (chainRecords.length > 0) {
      // Use SQLite chain records to resolve merge targets
      const childBeadIds = chainRecords
        .map((chain) => chain.chain_root_bead_id)
        .filter((id): id is string => Boolean(id));

      if (childBeadIds.length > 0) {
        chainTargets = resolveMergeTargetsForBeadIds(childBeadIds);
      }
    } else {
      // Fallback: use bd children
      const childBeadIds = readEpicChildrenFromBeads(options.epicId);
      chainTargets = resolveMergeTargetsForBeadIds(childBeadIds);
    }

    const chainJobStatuses = buildChainJobStatuses(sqlite, chainRecords.length > 0 ? chainRecords : chainTargets.map((t) => ({
      chain_id: t.jobId,
      epic_id: options.epicId,
      chain_root_bead_id: t.beadId,
      chain_root_job_id: t.jobId,
      updated_at_ms: t.startedAtMs,
    })));

    return {
      epicId: options.epicId,
      epicRecord,
      chainRecords,
      chainTargets,
      chainJobStatuses,
    };
  } finally {
    sqlite.close();
  }
}

function resolveMergeTargetsForBeadIds(beadIds: readonly string[]): ChainMergeTarget[] {
  // Reuse the existing merge.ts logic but for multiple beads
  const result = runCommand('bd', ['show', '--json', ...beadIds]);
  if (result.status !== 0) {
    throw new Error('Unable to read bead records');
  }

  const parsed = readJson<Array<{ id?: string; issue_type?: string; dependencies?: Array<{ id?: string }> }>>(result.stdout);
  if (!Array.isArray(parsed)) {
    throw new Error('Unexpected bd show output format');
  }

  // Get job statuses to find branches
  const jobStatuses = readAllJobStatuses();

  const chains: ChainMergeTarget[] = [];
  for (const beadId of beadIds) {
    const chain = selectNewestChainRootJob(beadId, jobStatuses);
    if (chain) {
      chains.push(chain);
    }
  }

  if (chains.length === 0) {
    throw new Error('No mergeable chain branches found');
  }

  // Load dependencies and sort topologically
  const beadIdSet = new Set(beadIds);
  const dependenciesByBeadId = new Map<string, readonly string[]>();

  for (const bead of parsed) {
    if (!bead.id || !beadIdSet.has(bead.id)) continue;
    const dependencyIds = (bead.dependencies ?? [])
      .map((dep) => dep.id)
      .filter((id): id is string => Boolean(id))
      .filter((id) => beadIdSet.has(id));
    dependenciesByBeadId.set(bead.id, dependencyIds);
  }

  return topologicallySortChains(chains, dependenciesByBeadId);
}

interface JobStatusRecord {
  id: string;
  bead_id?: string;
  status?: string;
  branch?: string;
  worktree_path?: string;
  started_at_ms?: number;
}

function readAllJobStatuses(): JobStatusRecord[] {
  const sqlite = createObservabilitySqliteClient();
  if (sqlite) {
    try {
      const statuses = sqlite.listStatuses();
      return statuses.map((status) => ({
        id: status.id,
        bead_id: status.bead_id,
        status: status.status,
        branch: status.branch ?? status.worktree_path?.split('/').pop(),
        worktree_path: status.worktree_path,
        started_at_ms: status.started_at_ms,
      }));
    } finally {
      sqlite.close();
    }
  }

  // Fallback: read status.json files directly
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

// Import fs functions for fallback
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveJobsDir } from '../specialist/job-root.js';

function selectNewestChainRootJob(beadId: string, statuses: readonly JobStatusRecord[]): ChainMergeTarget | null {
  const TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled', 'stopped']);

  const candidates = statuses
    .filter((status) => status.bead_id === beadId && status.branch && status.worktree_path)
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

function validateEpicMergeReadiness(context: EpicMergeContext, options: EpicMergeCliOptions): void {
  const epicState: EpicState = context.epicRecord?.status ?? 'open';

  // Check if epic is already terminal
  if (isEpicTerminalState(epicState)) {
    throw new Error(`Epic ${context.epicId} is already in terminal state '${epicState}'. No further merges allowed.`);
  }

  // Check unresolved states
  if (epicState !== 'merge_ready' && epicState !== 'resolving') {
    if (!options.forceResolving) {
      throw new Error(
        `Epic ${context.epicId} is in state '${epicState}'. Must be 'merge_ready' or 'resolving' before publication.\n` +
        `Use --force-resolving to attempt automatic transition from 'resolving' to 'merge_ready'.`,
      );
    }
  }

  // Check for running chains
  const blockingChains: string[] = [];
  for (const [chainId, status] of context.chainJobStatuses.entries()) {
    if (status.hasRunningJob) {
      blockingChains.push(chainId);
    }
  }

  if (blockingChains.length > 0) {
    throw new Error(
      `Epic ${context.epicId} has running chains: ${blockingChains.join(', ')}.\n` +
      'All chain jobs must be terminal (done/error/stopped) before publication.',
    );
  }

  // Check that all chains have branch metadata
  const missingBranchChains = context.chainTargets.filter((chain) => !chain.branch);
  if (missingBranchChains.length > 0) {
    throw new Error(
      `Chains missing branch metadata: ${missingBranchChains.map((c) => c.beadId).join(', ')}.\n` +
      'Ensure chain-root jobs have worktree_path and branch fields.',
    );
  }
}

function updateEpicState(epicId: string, fromState: EpicState, toState: EpicState): void {
  const sqlite = createObservabilitySqliteClient();
  if (!sqlite) {
    throw new Error('Observability SQLite database not available. Cannot persist epic state transition.');
  }

  try {
    const now = Date.now();
    sqlite.upsertEpicRun({
      epic_id: epicId,
      status: toState,
      status_json: JSON.stringify({
        epic_id: epicId,
        status: toState,
        previous_status: fromState,
        transitioned_at_ms: now,
      }),
      updated_at_ms: now,
    });
  } finally {
    sqlite.close();
  }
}

function mergeEpicChains(context: EpicMergeContext): Array<{ beadId: string; branch: string; changedFiles: string[] }> {
  const merged: Array<{ beadId: string; branch: string; changedFiles: string[] }> = [];

  for (const chain of context.chainTargets) {
    // Reuse merge.ts merge logic
    mergeBranch(chain.branch);
    runTypecheckGate();

    const changedFiles = readChangedFilesForHead();
    merged.push({
      beadId: chain.beadId,
      branch: chain.branch,
      changedFiles,
    });
  }

  return merged;
}

function mergeBranch(branch: string): void {
  const result = runCommand('git', ['merge', branch, '--no-ff', '--no-edit']);
  if (result.status === 0) return;

  const conflicts = getConflictFiles();
  const context = conflicts.length > 0
    ? `\nConflicting files:\n${conflicts.map((file) => `- ${file}`).join('\n')}`
    : '';

  throw new Error(`Merge conflict while merging '${branch}'.${context}`);
}

function getConflictFiles(): string[] {
  const result = runCommand('git', ['diff', '--name-only', '--diff-filter=U']);
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function runTypecheckGate(): void {
  const tsc = runCommand('bunx', ['tsc', '--noEmit']);
  if (tsc.status === 0) return;

  const stderr = tsc.stderr.trim();
  const stdout = tsc.stdout.trim();
  throw new Error(`TypeScript gate failed after merge.\n${stderr || stdout || 'Unknown tsc error'}`);
}

function readChangedFilesForHead(): string[] {
  const diff = runCommand('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']);
  if (diff.status !== 0) return [];
  return diff.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function runRebuild(): void {
  const build = runCommand('bun', ['run', 'build']);
  if (build.status === 0) return;

  const stderr = build.stderr.trim();
  const stdout = build.stdout.trim();
  throw new Error(`Rebuild failed.\n${stderr || stdout || 'Unknown build error'}`);
}

function printEpicMergeSummary(result: EpicMergeResult, rebuild: boolean): void {
  console.log('');
  console.log(`Epic ${result.epicId}: ${result.fromState} → ${result.toState}`);

  if (result.success) {
    console.log('');
    console.log('Publication successful.');
    console.log('');
    console.log('Merged chains (dependency order):');
    for (const chain of result.mergedChains) {
      console.log(`  ${chain.branch} (${chain.beadId})`);
      if (chain.changedFiles.length === 0) {
        console.log('    files: (none)');
      } else {
        console.log(`    files: ${chain.changedFiles.join(', ')}`);
      }
    }

    console.log('');
    console.log('TypeScript gate: passed after each merge');
    if (rebuild) {
      console.log('Rebuild: bun run build (passed)');
    }
  } else {
    console.log('');
    console.log('Publication failed.');
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    if (result.blockedChains.length > 0) {
      console.log(`Blocked chains: ${result.blockedChains.join(', ')}`);
    }
  }

  console.log('');
}

export async function handleEpicMergeCommand(argv: readonly string[]): Promise<void> {
  let options: EpicMergeCliOptions;
  try {
    options = parseOptions(argv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error('');
    console.error('Usage: specialists epic merge <epic-id> [--rebuild] [--force-resolving]');
    process.exit(1);
  }

  let context: EpicMergeContext;
  try {
    context = gatherEpicContext(options);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to gather epic context: ${message}`);
    process.exit(1);
  }

  try {
    validateEpicMergeReadiness(context, options);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Merge blocked: ${message}`);
    process.exit(1);
  }

  const fromState: EpicState = context.epicRecord?.status ?? 'open';

  // Transition to resolving if not already
  let currentState = fromState;
  if (currentState !== 'merge_ready' && currentState !== 'resolving') {
    if (options.forceResolving && canTransitionEpicState(currentState, 'resolving')) {
      currentState = transitionEpicState(currentState, 'resolving');
      updateEpicState(context.epicId, fromState, currentState);
      console.log(summarizeEpicTransition(context.epicId, fromState, currentState));
    }
  }

  // Perform merges
  let mergedChains: Array<{ beadId: string; branch: string; changedFiles: string[] }> = [];
  let mergeError: string | undefined;
  let toState: EpicState = currentState;

  try {
    mergedChains = mergeEpicChains(context);

    if (options.rebuild) {
      runRebuild();
    }

    // Transition to merged on success
    toState = transitionEpicState(currentState, 'merged');
    updateEpicState(context.epicId, currentState, toState);
  } catch (error: unknown) {
    mergeError = error instanceof Error ? error.message : String(error);
    // Transition to failed on error
    toState = transitionEpicState(currentState, 'failed');
    updateEpicState(context.epicId, currentState, toState);
  }

  const result: EpicMergeResult = {
    epicId: context.epicId,
    success: !mergeError,
    fromState,
    toState,
    mergedChains,
    blockedChains: [],
    error: mergeError,
  };

  printEpicMergeSummary(result, options.rebuild);

  if (!result.success) {
    process.exit(1);
  }
}

export async function handleEpicStatusCommand(argv: readonly string[]): Promise<void> {
  const epicId = argv[0];

  if (!epicId) {
    console.error('Missing epic ID');
    console.error('Usage: specialists epic status <epic-id>');
    process.exit(1);
  }

  const sqlite = createObservabilitySqliteClient();
  if (!sqlite) {
    console.error('Observability SQLite database not available. Run `sp db setup` first.');
    process.exit(1);
  }

  try {
    const epicRecord = sqlite.readEpicRun(epicId);
    const chainRecords = sqlite.listEpicChains(epicId);

    console.log('');
    console.log(`Epic: ${epicId}`);

    if (epicRecord) {
      console.log(`State: ${epicRecord.status}`);
      console.log(`Updated: ${new Date(epicRecord.updated_at_ms).toISOString()}`);
    } else {
      console.log('State: (not tracked in SQLite)');
    }

    console.log('');
    console.log('Chains:');
    if (chainRecords.length === 0) {
      console.log('  (none tracked)');
    } else {
      for (const chain of chainRecords) {
        const jobIds = sqlite.listChainJobIds(chain.chain_id);
        const runningJobs = jobIds.filter((jobId) => {
          const status = sqlite.readStatus(jobId);
          return status && RUNNING_STATUSES.has(status.status);
        });

        const statusIndicator = runningJobs.length > 0 ? '◉ running' : '○ terminal';
        console.log(`  ${chain.chain_id}: ${statusIndicator}`);
        if (chain.chain_root_bead_id) {
          console.log(`    bead: ${chain.chain_root_bead_id}`);
        }
        if (runningJobs.length > 0) {
          console.log(`    running jobs: ${runningJobs.join(', ')}`);
        }
      }
    }

    console.log('');
  } finally {
    sqlite.close();
  }
}

export async function handleEpicCommand(argv: readonly string[]): Promise<void> {
  const subcommand = argv[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log([
      '',
      'Usage: specialists epic <merge|status> [options]',
      '',
      'Commands:',
      '  merge <epic-id> [--rebuild] [--force-resolving]   Publish epic-owned chains in dependency order',
      '  status <epic-id>                                  Show epic state and chain statuses',
      '',
      'Epic lifecycle states:',
      '  open        → resolving → merge_ready → merged',
      '  (any)       → failed / abandoned (terminal)',
      '',
      'Merge behavior:',
      '  - Requires epic state: merge_ready (or resolving with --force-resolving)',
      '  - All chain jobs must be terminal (done/error/stopped)',
      '  - Chains merged in topological dependency order',
      '  - TypeScript gate runs after each merge',
      '  - Lifecycle transitions persisted to SQLite',
      '',
      'Options:',
      '  --rebuild           Run bun run build after all merges',
      '  --force-resolving   Allow merge from resolving state (auto-transition)',
      '',
      'Examples:',
      '  specialists epic merge unitAI-3f7b',
      '  specialists epic merge unitAI-3f7b --rebuild',
      '  specialists epic status unitAI-3f7b',
      '',
    ].join('\n'));
    return;
  }

  if (subcommand === 'merge') {
    await handleEpicMergeCommand(argv.slice(1));
    return;
  }

  if (subcommand === 'status') {
    await handleEpicStatusCommand(argv.slice(1));
    return;
  }

  console.error(`Unknown epic subcommand: ${subcommand}`);
  console.error('Usage: specialists epic <merge|status>');
  process.exit(1);
}