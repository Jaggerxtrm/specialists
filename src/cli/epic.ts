import { spawnSync } from 'node:child_process';
import {
  EPIC_STATES,
  EPIC_TERMINAL_STATES,
  VALID_EPIC_TRANSITIONS,
  type EpicState,
  type EpicRunRecord,
  type EpicChainRecord,
  type EpicReadinessResult,
  evaluateEpicMergeReadiness,
  canTransitionEpicState,
  transitionEpicState,
  isEpicTerminalState,
  isEpicUnresolvedState,
} from '../specialist/epic-lifecycle.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import type { SupervisorStatus } from '../specialist/supervisor.js';

interface EpicListArgs {
  json: boolean;
  unresolved: boolean;
}

interface EpicStatusArgs {
  epicId: string;
  json: boolean;
}

interface EpicResolveArgs {
  epicId: string;
  json: boolean;
  dryRun: boolean;
}

const ACTIVE_JOB_STATES: readonly SupervisorStatus['status'][] = ['starting', 'running', 'waiting'];

function parseEpicArgs(argv: string[]): { command: string; args: EpicListArgs | EpicStatusArgs | EpicResolveArgs } {
  const command = argv[0];

  if (command !== 'list' && command !== 'status' && command !== 'resolve') {
    throw new Error('Usage: specialists epic <list|status|resolve> [options]');
  }

  let epicId: string | undefined;
  let json = false;
  let unresolved = false;
  let dryRun = false;

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--json') {
      json = true;
      continue;
    }

    if (token === '--unresolved') {
      unresolved = true;
      continue;
    }

    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (!token.startsWith('-') && !epicId) {
      epicId = token;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (command === 'status' && !epicId) {
    throw new Error('Usage: specialists epic status <epic-id> [--json]');
  }

  if (command === 'resolve' && !epicId) {
    throw new Error('Usage: specialists epic resolve <epic-id> [--dry-run] [--json]');
  }

  if (command === 'list') {
    return { command, args: { json, unresolved } };
  }

  if (command === 'status') {
    return { command, args: { epicId: epicId!, json } };
  }

  return { command, args: { epicId: epicId!, json, dryRun } };
}

function formatTimestamp(ms: number | undefined): string {
  if (ms === undefined) return '-';
  const value = new Date(ms);
  return Number.isNaN(value.getTime()) ? '-' : value.toISOString();
}

function readBeadTitle(beadId: string): string | null {
  const result = spawnSync('bd', ['show', beadId, '--json'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0 || !result.stdout.trim()) return null;

  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    const bead = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!bead || typeof bead !== 'object') return null;
    const maybe = bead as { title?: string };
    return maybe.title?.trim() ?? null;
  } catch {
    return null;
  }
}

function getChainJobStatuses(
  sqliteClient: ReturnType<typeof createObservabilitySqliteClient>,
  chains: EpicChainRecord[],
): Array<{ chainId: string; beadId?: string; hasRunningJob: boolean; jobCount: number }> {
  const results: Array<{ chainId: string; beadId?: string; hasRunningJob: boolean; jobCount: number }> = [];

  for (const chain of chains) {
    const jobIds = sqliteClient!.listChainJobIds(chain.chain_id);
    let hasRunningJob = false;

    for (const jobId of jobIds) {
      const status = sqliteClient!.readStatus(jobId);
      if (status && ACTIVE_JOB_STATES.includes(status.status)) {
        hasRunningJob = true;
        break;
      }
    }

    results.push({
      chainId: chain.chain_id,
      beadId: chain.chain_root_bead_id,
      hasRunningJob,
      jobCount: jobIds.length,
    });
  }

  return results;
}

function evaluateReadiness(
  epic: EpicRunRecord,
  chainStatuses: Array<{ chainId: string; beadId?: string; hasRunningJob: boolean; jobCount: number }>,
): EpicReadinessResult {
  return evaluateEpicMergeReadiness({
    epicId: epic.epic_id,
    epicStatus: epic.status,
    chainStatuses: chainStatuses.map((chain) => ({
      chainId: chain.chainId,
      hasRunningJob: chain.hasRunningJob,
    })),
  });
}

interface EpicListRow {
  epic_id: string;
  status: EpicState;
  chain_count: number;
  blocking_chains: number;
  is_ready: boolean;
  updated_at: string;
  bead_title?: string;
}

function handleEpicList(args: EpicListArgs): void {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  try {
    const epics = sqliteClient.listEpicRuns();
    let filtered = epics;

    if (args.unresolved) {
      filtered = epics.filter((epic) => isEpicUnresolvedState(epic.status));
    }

    const rows: EpicListRow[] = filtered.map((epic) => {
      const chains = sqliteClient.listEpicChains(epic.epic_id);
      const chainStatuses = getChainJobStatuses(sqliteClient, chains);
      const readiness = evaluateReadiness(epic, chainStatuses);

      const beadTitle = chains.length > 0 && chains[0].chain_root_bead_id
        ? readBeadTitle(epic.epic_id) ?? undefined
        : undefined;

      return {
        epic_id: epic.epic_id,
        status: epic.status,
        chain_count: chains.length,
        blocking_chains: readiness.blockingChains.length,
        is_ready: readiness.isReady,
        updated_at: formatTimestamp(epic.updated_at_ms),
        bead_title: beadTitle,
      };
    });

    if (args.json) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    if (rows.length === 0) {
      console.log(args.unresolved ? 'No unresolved epics found.' : 'No epics found.');
      return;
    }

    const headers = ['epic_id', 'status', 'chains', 'blocking', 'ready', 'updated_at'];
    const body = rows.map((row) => [
      row.epic_id,
      row.status,
      String(row.chain_count),
      String(row.blocking_chains),
      row.is_ready ? 'yes' : 'no',
      row.updated_at,
    ]);

    const allRows = [headers, ...body];
    const widths = headers.map((_, colIndex) =>
      Math.max(...allRows.map((r) => (r[colIndex] ?? '').length)),
    );

    const renderRow = (r: string[]) => r.map((cell, i) => cell.padEnd(widths[i])).join('  ');

    console.log(renderRow(headers));
    console.log(widths.map((w) => '-'.repeat(w)).join('  '));
    for (const row of body) {
      console.log(renderRow(row));
    }
  } finally {
    sqliteClient.close();
  }
}

interface EpicStatusRow {
  epic_id: string;
  status: EpicState;
  updated_at: string;
  is_terminal: boolean;
  valid_transitions: readonly EpicState[];
  readiness?: EpicReadinessResult;
  chains: Array<{
    chain_id: string;
    bead_id?: string;
    job_count: number;
    has_running_job: boolean;
    bead_title?: string;
  }>;
}

function handleEpicStatus(args: EpicStatusArgs): void {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  try {
    const epic = sqliteClient.readEpicRun(args.epicId);
    if (!epic) {
      if (args.json) {
        console.log(JSON.stringify({ error: `Epic not found: ${args.epicId}` }, null, 2));
      } else {
        console.error(`Epic not found: ${args.epicId}`);
      }
      process.exitCode = 1;
      return;
    }

    const chains = sqliteClient.listEpicChains(args.epicId);
    const chainStatuses = getChainJobStatuses(sqliteClient, chains);
    const readiness = evaluateReadiness(epic, chainStatuses);

    const chainsWithTitle = chainStatuses.map((chain) => ({
      chain_id: chain.chainId,
      bead_id: chain.beadId,
      job_count: chain.jobCount,
      has_running_job: chain.hasRunningJob,
      bead_title: chain.beadId ? readBeadTitle(chain.beadId) ?? undefined : undefined,
    }));

    const row: EpicStatusRow = {
      epic_id: epic.epic_id,
      status: epic.status,
      updated_at: formatTimestamp(epic.updated_at_ms),
      is_terminal: isEpicTerminalState(epic.status),
      valid_transitions: VALID_EPIC_TRANSITIONS[epic.status],
      readiness,
      chains: chainsWithTitle,
    };

    if (args.json) {
      console.log(JSON.stringify(row, null, 2));
      return;
    }

    console.log(`epic_id: ${row.epic_id}`);
    console.log(`status: ${row.status}`);
    console.log(`updated_at: ${row.updated_at}`);
    console.log(`is_terminal: ${row.is_terminal}`);

    if (row.valid_transitions.length > 0) {
      console.log(`valid_transitions: ${row.valid_transitions.join(', ')}`);
    } else {
      console.log('valid_transitions: (none — terminal state)');
    }

    console.log('');
    console.log('## Readiness');
    if (row.readiness) {
      console.log(`is_ready: ${row.readiness.isReady}`);
      console.log(`blocking_chains: ${row.readiness.blockingChains.length > 0 ? row.readiness.blockingChains.join(', ') : '(none)'}`);
      console.log(`summary: ${row.readiness.summary}`);
    } else {
      console.log('(no readiness data)');
    }

    console.log('');
    console.log('## Chains');
    if (row.chains.length === 0) {
      console.log('(no chains registered)');
    } else {
      for (const chain of row.chains) {
        const statusIcon = chain.has_running_job ? '◉' : '○';
        const titleSuffix = chain.bead_title ? ` (${chain.bead_title.slice(0, 40)}${chain.bead_title.length > 40 ? '...' : ''})` : '';
        console.log(`  ${statusIcon} ${chain.chain_id}${titleSuffix}`);
        console.log(`      bead_id: ${chain.bead_id ?? '-'}`);
        console.log(`      jobs: ${chain.job_count}`);
        console.log(`      running: ${chain.has_running_job ? 'yes' : 'no'}`);
      }
    }
  } finally {
    sqliteClient.close();
  }
}

function handleEpicResolve(args: EpicResolveArgs): void {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  try {
    const epic = sqliteClient.readEpicRun(args.epicId);
    if (!epic) {
      if (args.json) {
        console.log(JSON.stringify({ error: `Epic not found: ${args.epicId}` }, null, 2));
      } else {
        console.error(`Epic not found: ${args.epicId}`);
      }
      process.exitCode = 1;
      return;
    }

    const fromState = epic.status;
    const toState: EpicState = 'resolving';

    if (!canTransitionEpicState(fromState, toState)) {
      const validTargets = VALID_EPIC_TRANSITIONS[fromState];
      const message = fromState === 'resolving'
        ? `Epic ${args.epicId} is already in 'resolving' state.`
        : `Invalid transition: ${fromState} -> ${toState}. Valid transitions from '${fromState}': ${validTargets.length > 0 ? validTargets.join(', ') : '(none)'}`;

      if (args.json) {
        console.log(JSON.stringify({
          error: 'invalid_transition',
          epic_id: args.epicId,
          from_state: fromState,
          attempted_to: toState,
          valid_transitions: validTargets,
          message,
        }, null, 2));
      } else {
        console.error(message);
      }
      process.exitCode = 1;
      return;
    }

    if (args.dryRun) {
      if (args.json) {
        console.log(JSON.stringify({
          epic_id: args.epicId,
          from_state: fromState,
          to_state: toState,
          dry_run: true,
          would_transition: true,
        }, null, 2));
      } else {
        console.log(`Would transition epic ${args.epicId}: ${fromState} -> ${toState}`);
      }
      return;
    }

    // Perform the transition
    const newStatus = transitionEpicState(fromState, toState);
    const now = Date.now();

    sqliteClient.upsertEpicRun({
      epic_id: args.epicId,
      status: newStatus,
      status_json: JSON.stringify({
        previous_state: fromState,
        transition_reason: 'operator_resolve',
        transitioned_at_ms: now,
      }),
      updated_at_ms: now,
    });

    if (args.json) {
      console.log(JSON.stringify({
        epic_id: args.epicId,
        from_state: fromState,
        to_state: newStatus,
        transitioned_at: formatTimestamp(now),
      }, null, 2));
    } else {
      console.log(`Epic ${args.epicId}: ${fromState} -> ${newStatus}`);
      console.log(`Use 'specialists epic status ${args.epicId}' to inspect chain readiness.`);
    }
  } finally {
    sqliteClient.close();
  }
}

export function handleEpicCommand(argv: string[]): void {
  let parsed: { command: string; args: EpicListArgs | EpicStatusArgs | EpicResolveArgs };
  try {
    parsed = parseEpicArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
    return;
  }

  if (parsed.command === 'list') {
    handleEpicList(parsed.args as EpicListArgs);
    return;
  }

  if (parsed.command === 'status') {
    handleEpicStatus(parsed.args as EpicStatusArgs);
    return;
  }

  handleEpicResolve(parsed.args as EpicResolveArgs);
}