import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
  command: 'run' | 'status';
  nodeConfigFile?: string;
  inlineJson?: string;
  nodeId?: string;
  jsonMode: boolean;
}

function parseNodeArgs(argv: string[]): ParsedNodeArgs {
  const command = argv[0];
  if (command !== 'run' && command !== 'status') {
    throw new Error('Usage: specialists node <run|status> [options]');
  }

  let nodeConfigFile: string | undefined;
  let inlineJson: string | undefined;
  let nodeId: string | undefined;
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

    if (!token.startsWith('--') && command === 'run' && !nodeConfigFile) {
      nodeConfigFile = token;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (command === 'run' && !nodeConfigFile && !inlineJson) {
    throw new Error('Usage: specialists node run <node-config-file> [--inline JSON] [--json]');
  }

  return {
    command,
    nodeConfigFile,
    inlineJson,
    nodeId,
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
      sqliteClient,
      runner,
      runOptions: {
        name: config.coordinator,
        prompt: config.initialPrompt,
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

  await handleNodeStatus(parsed);
}
