import { spawnSync } from 'node:child_process';
import type { EpicState, EpicRunRecord, EpicChainRecord } from '../specialist/epic-lifecycle.js';
import {
  isEpicTerminalState,
  transitionEpicState,
  evaluateEpicMergeReadiness,
  summarizeEpicTransition,
} from '../specialist/epic-lifecycle.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import type { ObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import {
  resolveMergeTargetsForBeadIds,
  parseChildBeadIds,
  runMergePlan,
  type ChainMergeTarget,
  type MergeStepResult,
} from './merge.js';

const RUNNING_STATUSES = new Set(['starting', 'running', 'waiting', 'degraded']);

interface EpicMergeCliOptions {
  epicId: string;
  rebuild: boolean;
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

function parseOptions(argv: readonly string[]): EpicMergeCliOptions {
  let epicId = '';
  let rebuild = false;

  for (const argument of argv) {
    if (argument === '--rebuild') {
      rebuild = true;
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

  return { epicId, rebuild };
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

    const childBeadIds = chainRecords.length > 0
      ? chainRecords
        .map((chain) => chain.chain_root_bead_id)
        .filter((id): id is string => Boolean(id))
      : readEpicChildrenFromBeads(options.epicId);

    if (childBeadIds.length === 0) {
      throw new Error(`No chain-root bead IDs found for epic '${options.epicId}'`);
    }

    const chainTargets = resolveMergeTargetsForBeadIds(childBeadIds);
    const chainRecordsForStatus = chainRecords.length > 0
      ? chainRecords
      : chainTargets.map((chainTarget) => ({
        chain_id: chainTarget.jobId,
        epic_id: options.epicId,
        chain_root_bead_id: chainTarget.beadId,
        chain_root_job_id: chainTarget.jobId,
        updated_at_ms: chainTarget.startedAtMs,
      }));

    return {
      epicId: options.epicId,
      epicRecord,
      chainRecords,
      chainTargets,
      chainJobStatuses: buildChainJobStatuses(sqlite, chainRecordsForStatus),
    };
  } finally {
    sqlite.close();
  }
}

function validateEpicMergeReadiness(context: EpicMergeContext): EpicState {
  const epicState: EpicState = context.epicRecord?.status ?? 'open';

  if (isEpicTerminalState(epicState)) {
    throw new Error(`Epic ${context.epicId} is already in terminal state '${epicState}'. No further merges allowed.`);
  }

  if (epicState !== 'resolving' && epicState !== 'merge_ready') {
    throw new Error(
      `Epic ${context.epicId} is in state '${epicState}'. Must be 'resolving' or 'merge_ready' before publication.`,
    );
  }

  const chainStatuses = [...context.chainJobStatuses.entries()].map(([chainId, status]) => ({
    chainId,
    hasRunningJob: status.hasRunningJob,
  }));
  const readiness = evaluateEpicMergeReadiness({
    epicId: context.epicId,
    epicStatus: epicState,
    chainStatuses,
  });

  if (readiness.blockingChains.length > 0) {
    throw new Error(
      `Epic ${context.epicId} has running chains: ${readiness.blockingChains.join(', ')}.\n` +
      'All chain jobs must be terminal before publication.',
    );
  }

  return epicState;
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

function mergeEpicChains(context: EpicMergeContext, rebuild: boolean): MergeStepResult[] {
  return runMergePlan(context.chainTargets, { rebuild });
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
    console.error('Usage: specialists epic merge <epic-id> [--rebuild]');
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

  let currentState: EpicState;
  try {
    currentState = validateEpicMergeReadiness(context);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Merge blocked: ${message}`);
    process.exit(1);
  }

  const fromState = currentState;

  if (currentState === 'resolving') {
    const nextState = transitionEpicState(currentState, 'merge_ready');
    updateEpicState(context.epicId, currentState, nextState);
    console.log(summarizeEpicTransition(context.epicId, currentState, nextState));
    currentState = nextState;
  }

  let mergedChains: MergeStepResult[] = [];
  let mergeError: string | undefined;
  let toState: EpicState = currentState;

  try {
    mergedChains = mergeEpicChains(context, options.rebuild);
    toState = transitionEpicState(currentState, 'merged');
    updateEpicState(context.epicId, currentState, toState);
  } catch (error: unknown) {
    mergeError = error instanceof Error ? error.message : String(error);
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
      '  merge <epic-id> [--rebuild]                      Publish epic-owned chains in dependency order',
      '  status <epic-id>                                  Show epic state and chain statuses',
      '',
      'Epic lifecycle states:',
      '  open        → resolving → merge_ready → merged',
      '  (any)       → failed / abandoned (terminal)',
      '',
      'Merge behavior:',
      '  - Requires epic state: resolving or merge_ready',
      '  - All chain jobs must be terminal before publication',
      '  - Chains merged in topological dependency order',
      '  - TypeScript gate runs after each merge',
      '  - Lifecycle transitions persisted to SQLite',
      '',
      'Options:',
      '  --rebuild           Run bun run build after all merges',
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