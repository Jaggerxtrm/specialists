import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { SpecialistLoader } from '../specialist/loader.js';
import { SpecialistRunner } from '../specialist/runner.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { HookEmitter } from '../specialist/hooks.js';
import {
  createObservabilitySqliteClient,
  type NodeRunRow,
} from '../specialist/observability-sqlite.js';

interface NodeMemberConfig {
  memberId: string;
  specialist: string;
  model?: string;
  role?: string;
}

interface NodeConfig {
  name: string;
  coordinator: string;
  members: NodeMemberConfig[];
  initialPrompt: string;
  memoryNamespace?: string;
}

interface ParsedNodeArgs {
  command: 'run' | 'status' | 'feed' | 'promote';
  nodeConfigFile?: string;
  inlineJson?: string;
  nodeId?: string;
  findingId?: string;
  toBead?: string;
  beadId?: string;
  jsonMode: boolean;
}

function parseNodeArgs(argv: string[]): ParsedNodeArgs {
  const command = argv[0];
  if (command !== 'run' && command !== 'status' && command !== 'feed' && command !== 'promote') {
    throw new Error('Usage: specialists node <run|status|feed|promote> [options]');
  }

  let nodeConfigFile: string | undefined;
  let inlineJson: string | undefined;
  let nodeId: string | undefined;
  let findingId: string | undefined;
  let toBead: string | undefined;
  let beadId: string | undefined;
  let jsonMode = false;

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--json') {
      jsonMode = true;
      continue;
    }

    if (token === '--inline') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--inline requires a JSON string value');
      }
      inlineJson = value;
      i += 1;
      continue;
    }

    if (token === '--node') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--node requires a node id value');
      }
      nodeId = value;
      i += 1;
      continue;
    }

    if (token === '--to-bead') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--to-bead requires a bead id value');
      }
      toBead = value;
      i += 1;
      continue;
    }

    if (token === '--bead') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--bead requires a bead id value');
      }
      beadId = value;
      i += 1;
      continue;
    }

    if (!token.startsWith('--') && command === 'run' && !nodeConfigFile) {
      nodeConfigFile = token;
      continue;
    }

    if (!token.startsWith('--') && (command === 'feed' || command === 'promote') && !nodeId) {
      nodeId = token;
      continue;
    }

    if (!token.startsWith('--') && command === 'promote' && !findingId) {
      findingId = token;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (command === 'run' && !nodeConfigFile && !inlineJson) {
    throw new Error('Usage: specialists node run <node-config-file> [--inline JSON] [--bead <bead-id>] [--json]');
  }

  if (command === 'promote') {
    if (!nodeId || !findingId || !toBead) {
      throw new Error('Usage: specialists node promote <node-id> <finding-id> --to-bead <bead-id> [--json]');
    }
  }

  if (command === 'feed' && !nodeId) {
    throw new Error('Usage: specialists node feed <node-id> [--json]');
  }

  return {
    command,
    nodeConfigFile,
    inlineJson,
    nodeId,
    findingId,
    toBead,
    beadId,
    jsonMode,
  };
}

function parseNodeConfig(raw: string): NodeConfig {
  const parsed = JSON.parse(raw) as Partial<NodeConfig>;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Node config must be a JSON object');
  }

  if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
    throw new Error('Node config requires non-empty "name"');
  }
  if (typeof parsed.coordinator !== 'string' || parsed.coordinator.trim() === '') {
    throw new Error('Node config requires non-empty "coordinator"');
  }
  if (!Array.isArray(parsed.members) || parsed.members.length === 0) {
    throw new Error('Node config requires non-empty "members" array');
  }
  if (typeof parsed.initialPrompt !== 'string' || parsed.initialPrompt.trim() === '') {
    throw new Error('Node config requires non-empty "initialPrompt"');
  }

  for (const member of parsed.members) {
    if (!member || typeof member !== 'object') {
      throw new Error('Each member must be an object');
    }
    const entry = member as Partial<NodeMemberConfig>;
    if (typeof entry.memberId !== 'string' || entry.memberId.trim() === '') {
      throw new Error('Each member requires non-empty "memberId"');
    }
    if (typeof entry.specialist !== 'string' || entry.specialist.trim() === '') {
      throw new Error('Each member requires non-empty "specialist"');
    }
  }

  return {
    name: parsed.name,
    coordinator: parsed.coordinator,
    members: parsed.members as NodeMemberConfig[],
    initialPrompt: parsed.initialPrompt,
    memoryNamespace: parsed.memoryNamespace,
  };
}

type NodeEventRow = { id: number; t: number; type: string; event_json: string };

function formatTimestamp(ms: number | undefined): string {
  if (ms === undefined) return '-';
  const value = new Date(ms);
  return Number.isNaN(value.getTime()) ? '-' : value.toISOString();
}

function printNodeRunsTable(rows: NodeRunRow[]): void {
  const headers = ['node_id', 'node_name', 'status', 'started_at', 'updated_at', 'coordinator_job_id'];
  const body = rows.map((row) => [
    row.id,
    row.node_name,
    row.status,
    formatTimestamp(row.started_at_ms),
    formatTimestamp(row.updated_at_ms),
    row.coordinator_job_id ?? '-',
  ]);
  const allRows = [headers, ...body];
  const widths = headers.map((_, colIndex) => Math.max(...allRows.map((r) => (r[colIndex] ?? '').length)));

  const renderRow = (r: string[]) => r.map((cell, i) => cell.padEnd(widths[i])).join('  ');

  console.log(renderRow(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of body) {
    console.log(renderRow(row));
  }
}

async function handleNodeRun(args: ParsedNodeArgs): Promise<void> {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  try {
    const rawConfig = args.inlineJson
      ? args.inlineJson
      : readFileSync(args.nodeConfigFile!, 'utf-8');
    const config = parseNodeConfig(rawConfig);

    const loader = new SpecialistLoader();
    const runner = new SpecialistRunner({
      loader,
      hooks: new HookEmitter({ tracePath: join(process.cwd(), '.specialists', 'trace.jsonl') }),
      circuitBreaker: new CircuitBreaker(),
    });

    const nodeId = `${config.name}-${randomUUID().slice(0, 8)}`;

    const nodeSupervisorModulePath = '../specialist/node-supervisor.js';
    const module = await import(nodeSupervisorModulePath);
    const NodeSupervisorCtor = module.NodeSupervisor as new (opts: Record<string, unknown>) => {
      run(initialPrompt: string): Promise<unknown>;
    };

    const supervisor = new NodeSupervisorCtor({
      nodeId,
      nodeName: config.name,
      coordinatorSpecialist: config.coordinator,
      members: config.members,
      memoryNamespace: config.memoryNamespace,
      sourceBeadId: args.beadId,
      sqliteClient,
      runner,
      runOptions: {
        name: config.coordinator,
        prompt: config.initialPrompt,
        inputBeadId: args.beadId,
      },
    });

    let cursor = 0;
    const streamEvents = (): void => {
      const events = sqliteClient.readNodeEvents(nodeId) as NodeEventRow[];
      for (const event of events) {
        if (event.id <= cursor) continue;
        cursor = event.id;

        if (args.jsonMode) {
          console.log(JSON.stringify({
            type: 'node_event',
            node_id: nodeId,
            id: event.id,
            t: event.t,
            event_type: event.type,
            event_json: JSON.parse(event.event_json),
          }));
        } else {
          console.log(`[${new Date(event.t).toISOString()}] ${event.type}`);
        }
      }
    };

    const interval = setInterval(streamEvents, 400);

    try {
      const result = await supervisor.run(config.initialPrompt);
      streamEvents();
      const row = sqliteClient.readNodeRun(nodeId);

      if (args.jsonMode) {
        console.log(JSON.stringify({
          type: 'node_result',
          node_id: nodeId,
          status: row?.status ?? 'unknown',
          coordinator_job_id: row?.coordinator_job_id ?? null,
          result,
        }));
      } else {
        console.log(`node_id: ${nodeId}`);
        console.log(`status: ${row?.status ?? 'unknown'}`);
        console.log(`coordinator_job_id: ${row?.coordinator_job_id ?? '-'}`);
      }
    } catch (error) {
      streamEvents();
      const message = error instanceof Error ? error.message : String(error);
      if (args.jsonMode) {
        console.log(JSON.stringify({
          type: 'node_result',
          node_id: nodeId,
          status: 'error',
          error: message,
        }));
      } else {
        console.error(`node run failed (${nodeId}): ${message}`);
      }
      process.exitCode = 1;
    } finally {
      clearInterval(interval);
    }
  } finally {
    sqliteClient.close();
  }
}

function printNodeRunDetail(row: NodeRunRow): void {
  const detail = {
    node_id: row.id,
    node_name: row.node_name,
    status: row.status,
    started_at: formatTimestamp(row.started_at_ms),
    updated_at: formatTimestamp(row.updated_at_ms),
    coordinator_job_id: row.coordinator_job_id ?? '-',
  };

  for (const [key, value] of Object.entries(detail)) {
    console.log(`${key}: ${value}`);
  }
}

async function handleNodeFeed(args: ParsedNodeArgs): Promise<void> {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  try {
    const nodeId = args.nodeId!;
    const events = sqliteClient.readNodeEvents(nodeId);

    if (args.jsonMode) {
      for (const event of events) {
        console.log(JSON.stringify({
          type: 'node_event',
          node_id: nodeId,
          id: event.id,
          t: event.t,
          event_type: event.type,
          event_json: JSON.parse(event.event_json),
        }));
      }
      return;
    }

    if (events.length === 0) {
      console.log(`No node events found for ${nodeId}.`);
      return;
    }

    for (const event of events) {
      console.log(`[${new Date(event.t).toISOString()}] ${event.type}`);
    }
  } finally {
    sqliteClient.close();
  }
}

async function handleNodeStatus(args: ParsedNodeArgs): Promise<void> {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  try {
    if (args.nodeId) {
      const row = sqliteClient.readNodeRun(args.nodeId);
      if (!row) {
        if (args.jsonMode) {
          console.log(JSON.stringify({ error: `Node run not found: ${args.nodeId}` }, null, 2));
        } else {
          console.error(`Node run not found: ${args.nodeId}`);
        }
        process.exitCode = 1;
        return;
      }

      if (args.jsonMode) {
        console.log(JSON.stringify({
          node_id: row.id,
          node_name: row.node_name,
          status: row.status,
          started_at: row.started_at_ms,
          updated_at: row.updated_at_ms,
          coordinator_job_id: row.coordinator_job_id ?? null,
        }, null, 2));
      } else {
        printNodeRunDetail(row);
      }
      return;
    }

    const rows = sqliteClient.listNodeRuns();

    if (args.jsonMode) {
      console.log(JSON.stringify(rows.map((row) => ({
        node_id: row.id,
        node_name: row.node_name,
        status: row.status,
        started_at: row.started_at_ms,
        updated_at: row.updated_at_ms,
        coordinator_job_id: row.coordinator_job_id ?? null,
      })), null, 2));
      return;
    }

    if (rows.length === 0) {
      console.log('No node runs found.');
      return;
    }

    printNodeRunsTable(rows);
  } finally {
    sqliteClient.close();
  }
}

function buildFindingNotes(nodeId: string, findingId: string, summary: string): string {
  return [
    'Node finding promoted',
    `node_id: ${nodeId}`,
    `finding_id: ${findingId}`,
    '',
    summary,
  ].join('\n');
}

function promoteFindingToBead(beadId: string, notes: string): void {
  const result = spawnSync('bd', ['update', beadId, '--notes', notes], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const errorMessage = result.stderr?.trim() || result.stdout?.trim() || `bd update exited with status ${result.status}`;
    throw new Error(errorMessage);
  }
}

async function handleNodePromote(args: ParsedNodeArgs): Promise<void> {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  try {
    const nodeId = args.nodeId!;
    const findingId = args.findingId!;
    const beadId = args.toBead!;

    const finding = sqliteClient.readNodeMemory(nodeId).find((entry) => entry.entry_id === findingId);
    if (!finding) {
      throw new Error(`Finding not found: node=${nodeId}, finding=${findingId}`);
    }

    const findingSummary = finding.summary?.trim();
    if (!findingSummary) {
      throw new Error(`Finding ${findingId} has no summary to promote`);
    }

    const notes = buildFindingNotes(nodeId, findingId, findingSummary);
    promoteFindingToBead(beadId, notes);

    if (args.jsonMode) {
      console.log(JSON.stringify({
        type: 'node_promote',
        node_id: nodeId,
        finding_id: findingId,
        bead_id: beadId,
        promoted: true,
      }));
      return;
    }

    console.log(`Promoted finding ${findingId} from ${nodeId} to bead ${beadId}`);
  } finally {
    sqliteClient.close();
  }
}

export async function handleNodeCommand(argv: string[]): Promise<void> {
  let parsed: ParsedNodeArgs;
  try {
    parsed = parseNodeArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
    return;
  }

  if (parsed.command === 'run') {
    await handleNodeRun(parsed);
    return;
  }

  if (parsed.command === 'feed') {
    await handleNodeFeed(parsed);
    return;
  }

  if (parsed.command === 'promote') {
    await handleNodePromote(parsed);
    return;
  }

  await handleNodeStatus(parsed);
}
