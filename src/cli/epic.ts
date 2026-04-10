import { spawnSync } from 'node:child_process';
import type { EpicState } from '../specialist/epic-lifecycle.js';
import { isEpicTerminalState, summarizeEpicTransition, transitionEpicState } from '../specialist/epic-lifecycle.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import {
  loadEpicReadinessSummary,
  syncEpicStateFromReadiness,
  type EpicReadinessSummary,
} from '../specialist/epic-readiness.js';
import {
  resolveMergeTargetsForBeadIds,
  parseChildBeadIds,
  runMergePlan,
  type ChainMergeTarget,
  type MergeStepResult,
} from './merge.js';

interface EpicMergeCliOptions {
  epicId: string;
  rebuild: boolean;
}

interface EpicMergeContext {
  epicId: string;
  readiness: EpicReadinessSummary;
  chainTargets: ChainMergeTarget[];
}

interface EpicMergeResult {
  epicId: string;
  success: boolean;
  fromState: EpicState;
  toState: EpicState;
  mergedChains: Array<{ beadId: string; branch: string; changedFiles: string[] }>;
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

function gatherEpicContext(options: EpicMergeCliOptions): EpicMergeContext {
  const sqlite = createObservabilitySqliteClient();
  if (!sqlite) {
    throw new Error('Observability SQLite database not available. Run `sp db setup` first.');
  }

  try {
    const readiness = loadEpicReadinessSummary(sqlite, options.epicId);
    syncEpicStateFromReadiness(sqlite, readiness);

    const childBeadIds = readiness.chains
      .map((chain) => chain.chain_root_bead_id)
      .filter((id): id is string => Boolean(id));

    const resolvedBeadIds = childBeadIds.length > 0 ? childBeadIds : readEpicChildrenFromBeads(options.epicId);

    if (resolvedBeadIds.length === 0) {
      throw new Error(`No chain-root bead IDs found for epic '${options.epicId}'`);
    }

    return {
      epicId: options.epicId,
      readiness,
      chainTargets: resolveMergeTargetsForBeadIds(resolvedBeadIds),
    };
  } finally {
    sqlite.close();
  }
}

function validateEpicMergeReadiness(context: EpicMergeContext): EpicState {
  const currentState = context.readiness.next_state;

  if (isEpicTerminalState(currentState)) {
    throw new Error(`Epic ${context.epicId} is already in terminal state '${currentState}'. No further merges allowed.`);
  }

  if (context.readiness.readiness_state === 'failed') {
    throw new Error(`Epic ${context.epicId} is failed: ${context.readiness.summary}`);
  }

  if (context.readiness.readiness_state !== 'merge_ready') {
    throw new Error(`Epic ${context.epicId} is not merge-ready: ${context.readiness.summary}`);
  }

  return currentState;
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
      console.log(chain.changedFiles.length === 0 ? '    files: (none)' : `    files: ${chain.changedFiles.join(', ')}`);
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
  let mergedChains: MergeStepResult[] = [];
  let mergeError: string | undefined;
  let toState: EpicState = currentState;

  try {
    mergedChains = runMergePlan(context.chainTargets, { rebuild: options.rebuild });
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
    const readiness = loadEpicReadinessSummary(sqlite, epicId);
    const persisted = syncEpicStateFromReadiness(sqlite, readiness);

    console.log('');
    console.log(`Epic: ${epicId}`);
    console.log(`State: ${persisted.status}`);
    console.log(`Readiness: ${readiness.readiness_state}`);
    console.log(`Summary: ${readiness.summary}`);
    console.log(`Updated: ${new Date(persisted.updated_at_ms).toISOString()}`);

    console.log('');
    console.log('Prep:');
    console.log(`  total: ${readiness.prep.total}`);
    console.log(`  done: ${readiness.prep.done}`);
    console.log(`  running: ${readiness.prep.running}`);
    console.log(`  failed: ${readiness.prep.failed}`);

    console.log('');
    console.log('Chains:');
    if (readiness.chains.length === 0) {
      console.log('  (none tracked)');
    } else {
      for (const chain of readiness.chains) {
        console.log(`  ${chain.chain_id}: ${chain.state} (reviewer=${chain.reviewer_verdict})`);
        if (chain.chain_root_bead_id) {
          console.log(`    bead: ${chain.chain_root_bead_id}`);
        }
        if (chain.blocking_reason) {
          console.log(`    reason: ${chain.blocking_reason}`);
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
      '  status <epic-id>                                  Show epic state and readiness summary',
      '',
      'Epic lifecycle states:',
      '  open        → resolving → merge_ready → merged',
      '  (any)       → failed / abandoned (terminal)',
      '',
      'Readiness behavior:',
      '  - Includes prep + chain jobs from persisted SQLite state',
      '  - Requires chain reviewer PASS verdicts',
      '  - Non-PASS review + missing follow-up review keeps epic blocked/failed',
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
