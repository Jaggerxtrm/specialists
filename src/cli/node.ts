import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';
import { SpecialistLoader } from '../specialist/loader.js';
import { SpecialistRunner } from '../specialist/runner.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { HookEmitter } from '../specialist/hooks.js';
import {
  createObservabilitySqliteClient,
  type NodeMemoryRow,
  type NodeMemberRow,
  type NodeRunRow,
} from '../specialist/observability-sqlite.js';
import { BeadsClient, buildBeadContext } from '../specialist/beads.js';
import { Supervisor, type SupervisorStatus } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import {
  executeCompleteNodeAction,
  executeCreateBeadAction,
  spawnDynamicMember,
} from '../specialist/node-supervisor.js';

interface NodeMemberConfig {
  memberId: string;
  specialist: string;
  model?: string;
  role?: string;
  worktree?: string;
  bootstrapTemplate?: string;
}

interface NodeConfig {
  name: string;
  coordinator: string;
  members: NodeMemberConfig[];
  initialPrompt: string;
  memoryNamespace?: string;
  defaultContextDepth: number;
  completionStrategy: 'pr' | 'manual';
  maxRetries?: number;
  baseBranch: string;
}

type NodeCommand = 'run' | 'list' | 'status' | 'feed' | 'result' | 'promote' | 'members' | 'memory' | 'steer' | 'stop' | 'attach' | 'spawn-member' | 'create-bead' | 'complete' | 'wait-phase';

interface ParsedNodeArgs {
  command: NodeCommand;
  nodeConfigInput?: string;
  inlineJson?: string;
  nodeId?: string;
  findingId?: string;
  toBead?: string;
  beadId?: string;
  contextDepth?: number;
  memberKey?: string;
  specialist?: string;
  phaseId?: string;
  scope?: string[];
  title?: string;
  beadType?: 'task' | 'bug' | 'feature' | 'epic' | 'chore' | 'decision';
  priority?: number;
  dependsOn?: string[];
  strategy?: 'pr' | 'manual';
  forceDraftPr?: boolean;
  memberKeys?: string[];
  timeoutMs?: number;
  fullResult: boolean;
  jsonMode: boolean;
}

const NODE_RESULT_PREVIEW_CHAR_LIMIT = 4_000;

function parseNodeArgs(argv: string[]): ParsedNodeArgs {
  const command = argv[0] as NodeCommand | undefined;
  const supportedCommands = new Set<NodeCommand>(['run', 'list', 'status', 'feed', 'result', 'promote', 'members', 'memory', 'steer', 'stop', 'attach', 'spawn-member', 'create-bead', 'complete', 'wait-phase']);
  if (!command || !supportedCommands.has(command)) {
    throw new Error('Usage: specialists node <run|list|status|feed|result|promote|members|memory|steer|stop|attach|spawn-member|create-bead|complete|wait-phase> [options]');
  }
  let nodeConfigInput: string | undefined;
  let inlineJson: string | undefined;
  let nodeId: string | undefined;
  let findingId: string | undefined;
  let toBead: string | undefined;
  let beadId: string | undefined;
  let contextDepth: number | undefined;
  let memberKey: string | undefined;
  let specialist: string | undefined;
  let phaseId: string | undefined;
  let scope: string[] | undefined;
  let title: string | undefined;
  let beadType: ParsedNodeArgs['beadType'] = 'task';
  let priority = 2;
  let dependsOn: string[] | undefined;
  let strategy: ParsedNodeArgs['strategy'];
  let forceDraftPr = false;
  let memberKeys: string[] | undefined;
  let timeoutMs: number | undefined;
  let fullResult = false;
  let jsonMode = false;

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--json') {
      jsonMode = true;
      continue;
    }

    if (token === '--force-draft-pr') {
      forceDraftPr = true;
      continue;
    }

    if (token === '--full') {
      fullResult = true;
      continue;
    }

    const readValue = (flag: string): string => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${flag} requires a value`);
      }
      i += 1;
      return value;
    };

    if (token === '--inline') {
      inlineJson = readValue('--inline');
      continue;
    }

    if (token === '--node') {
      nodeId = readValue('--node');
      continue;
    }

    if (token === '--to-bead') {
      toBead = readValue('--to-bead');
      continue;
    }

    if (token === '--bead') {
      beadId = readValue('--bead');
      continue;
    }

    if (token === '--context-depth') {
      contextDepth = Math.max(0, Number.parseInt(readValue('--context-depth'), 10) || 0);
      continue;
    }

    if (token === '--member' || token === '--member-key') {
      memberKey = readValue(token);
      continue;
    }

    if (token === '--specialist') {
      specialist = readValue('--specialist');
      continue;
    }

    if (token === '--phase') {
      phaseId = readValue('--phase');
      continue;
    }

    if (token === '--scope') {
      scope = readValue('--scope').split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      continue;
    }

    if (token === '--title') {
      title = readValue('--title');
      continue;
    }

    if (token === '--type') {
      beadType = readValue('--type') as ParsedNodeArgs['beadType'];
      continue;
    }

    if (token === '--priority') {
      priority = Math.max(0, Math.min(4, Number.parseInt(readValue('--priority'), 10) || 2));
      continue;
    }

    if (token === '--depends-on') {
      dependsOn = readValue('--depends-on').split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      continue;
    }

    if (token === '--strategy') {
      const strategyValue = readValue('--strategy');
      if (strategyValue !== 'pr' && strategyValue !== 'manual') {
        throw new Error(`Invalid value for --strategy: ${strategyValue}. Expected one of: pr, manual`);
      }
      strategy = strategyValue;
      continue;
    }

    if (token === '--members') {
      memberKeys = readValue('--members').split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      continue;
    }

    if (token === '--timeout') {
      timeoutMs = Math.max(1, Number.parseInt(readValue('--timeout'), 10) || 1);
      continue;
    }

    if (!token.startsWith('--') && command === 'run' && !nodeConfigInput) {
      nodeConfigInput = token;
      continue;
    }

    if (!token.startsWith('--') && (command === 'feed' || command === 'promote' || command === 'members' || command === 'memory' || command === 'steer' || command === 'stop' || command === 'attach') && !nodeId) {
      nodeId = token;
      continue;
    }

    if (!token.startsWith('--') && command === 'promote' && !findingId) {
      findingId = token;
      continue;
    }

    if (!token.startsWith('--') && command === 'steer' && !findingId) {
      findingId = token;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (command === 'run' && !nodeConfigInput && !inlineJson) {
    throw new Error('Usage: specialists node run <node-config-name-or-file> [--inline JSON] [--bead <bead-id>] [--context-depth <n>] [--json]');
  }

  if (command === 'promote' && (!nodeId || !findingId || !toBead)) {
    throw new Error('Usage: specialists node promote <node-id> <finding-id> --to-bead <bead-id> [--json]');
  }

  if ((command === 'feed' || command === 'members' || command === 'memory' || command === 'stop' || command === 'attach') && !nodeId) {
    throw new Error(`Usage: specialists node ${command} <node-id> [--json]`);
  }

  if (command === 'steer' && (!nodeId || !findingId)) {
    throw new Error('Usage: specialists node steer <node-id> <message> [--json]');
  }

  if (command === 'result' && (!nodeId || !memberKey)) {
    throw new Error('Usage: specialists node result --node <id> --member <key> [--full] [--json]');
  }

  if (command === 'spawn-member' || command === 'create-bead' || command === 'complete' || command === 'wait-phase') {
    if (!nodeId) {
      throw new Error(`--node is required for specialists node ${command}`);
    }
  }

  if (command === 'spawn-member' && (!memberKey || !specialist)) {
    throw new Error('Usage: specialists node spawn-member --node <id> --member-key <key> --specialist <name> [--bead <id>] [--phase <id>] [--scope <paths>] [--json]');
  }

  if (command === 'create-bead' && !title) {
    throw new Error('Usage: specialists node create-bead --node <id> --title "..." [--type task] [--priority 2] [--depends-on <id>] [--json]');
  }

  if (command === 'complete' && !strategy) {
    throw new Error('Usage: specialists node complete --node <id> --strategy <pr|manual> [--force-draft-pr] [--json]');
  }

  if (command === 'wait-phase' && (!phaseId || !memberKeys || memberKeys.length === 0)) {
    throw new Error('Usage: specialists node wait-phase --node <id> --phase <id> --members <k1,k2,...> [--timeout <ms>] [--json]');
  }

  return {
    command,
    nodeConfigInput,
    inlineJson,
    nodeId,
    findingId,
    toBead,
    beadId,
    contextDepth,
    memberKey,
    specialist,
    phaseId,
    scope,
    title,
    beadType,
    priority,
    dependsOn,
    strategy,
    forceDraftPr,
    memberKeys,
    timeoutMs,
    fullResult,
    jsonMode,
  };
}

interface DiscoveredNodeConfig {
  name: string;
  path: string;
  source: 'default' | 'project';
}

const NODE_CONFIG_SUFFIX = '.node.json';
const NODE_DISCOVERY_DIRS: ReadonlyArray<{ path: string; source: DiscoveredNodeConfig['source'] }> = [
  { path: '.specialists/default/nodes', source: 'default' },
  { path: 'config/nodes', source: 'project' },
];

function toNodeName(filePath: string): string {
  const fileName = basename(filePath);
  return fileName.endsWith(NODE_CONFIG_SUFFIX)
    ? fileName.slice(0, -NODE_CONFIG_SUFFIX.length)
    : fileName;
}

function discoverNodeConfigs(cwd: string): DiscoveredNodeConfig[] {
  const discoveredByName = new Map<string, DiscoveredNodeConfig>();

  for (const directory of NODE_DISCOVERY_DIRS) {
    const absoluteDir = resolve(cwd, directory.path);
    if (!existsSync(absoluteDir)) continue;

    const files = readdirSync(absoluteDir).filter((fileName) => fileName.endsWith(NODE_CONFIG_SUFFIX));
    for (const fileName of files) {
      const path = join(absoluteDir, fileName);
      const name = toNodeName(fileName);
      if (discoveredByName.has(name)) continue;
      discoveredByName.set(name, { name, path, source: directory.source });
    }
  }

  return [...discoveredByName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function resolveNodeConfigPath(cwd: string, input: string): string {
  const explicitPath = resolve(cwd, input);
  if (existsSync(explicitPath)) {
    return explicitPath;
  }

  const normalizedName = input.endsWith(NODE_CONFIG_SUFFIX)
    ? input.slice(0, -NODE_CONFIG_SUFFIX.length)
    : input;
  const discovered = discoverNodeConfigs(cwd).find((entry) => entry.name === normalizedName);
  if (discovered) {
    return discovered.path;
  }

  throw new Error(
    `Node config not found: ${input}. Checked explicit path and discovery dirs: ${NODE_DISCOVERY_DIRS.map((entry) => entry.path).join(', ')}`,
  );
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
  if (!Array.isArray(parsed.members)) {
    throw new Error('Node config requires "members" array (can be empty for coordinator-only nodes)');
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

  const completionStrategyRaw = (parsed as any).completion_strategy ?? (parsed as any).completionStrategy;
  const completionStrategy = completionStrategyRaw === 'manual' ? 'manual' : 'pr';
  const defaultContextDepthRaw = (parsed as any).default_context_depth ?? (parsed as any).defaultContextDepth;
  const defaultContextDepth = Number.isFinite(defaultContextDepthRaw)
    ? Math.max(0, Number(defaultContextDepthRaw))
    : 1;
  const baseBranchRaw = (parsed as any).base_branch ?? (parsed as any).baseBranch;
  const baseBranch = typeof baseBranchRaw === 'string' && baseBranchRaw.trim().length > 0
    ? baseBranchRaw.trim()
    : 'master';
  const maxRetriesRaw = (parsed as any).max_retries ?? (parsed as any).maxRetries;
  const maxRetries = Number.isFinite(maxRetriesRaw)
    ? Math.max(0, Number(maxRetriesRaw))
    : undefined;

  return {
    name: parsed.name,
    coordinator: parsed.coordinator,
    members: (parsed.members as NodeMemberConfig[]).map((member) => ({
      ...member,
      worktree: typeof member.worktree === 'string' ? member.worktree : undefined,
      bootstrapTemplate: typeof member.bootstrapTemplate === 'string' ? member.bootstrapTemplate : undefined,
    })),
    initialPrompt: parsed.initialPrompt,
    memoryNamespace: parsed.memoryNamespace,
    defaultContextDepth,
    completionStrategy,
    maxRetries,
    baseBranch,
  };
}

type NodeEventRow = { id: number; t: number; type: string; event_json: string };

function formatTimestamp(ms: number | undefined): string {
  if (ms === undefined) return '-';
  const value = new Date(ms);
  return Number.isNaN(value.getTime()) ? '-' : value.toISOString();
}

function parseStatusJson(row: NodeRunRow): Record<string, unknown> {
  try {
    return JSON.parse(row.status_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readStatusReason(row: NodeRunRow): string {
  const statusJson = parseStatusJson(row);
  const reason = statusJson.reason;
  return typeof reason === 'string' && reason.trim() ? reason : '-';
}

function summarizeMembers(members: Array<{ member_id: string; status: string; enabled?: boolean; generation?: number }>): string {
  if (members.length === 0) return '-';
  return members
    .map((member) => `${member.member_id}#${member.generation ?? 0}:${member.status}${member.enabled === false ? ' (disabled)' : ''}`)
    .join(', ');
}

function readMemberLineage(member: NodeMemberRow, sqliteClient: ReturnType<typeof createObservabilitySqliteClient>): Record<string, string | null> {
  if (!sqliteClient || !member.job_id) {
    return { reused_from_job_id: null, worktree_owner_job_id: null };
  }

  const status = sqliteClient.readStatus(member.job_id);
  if (!status) {
    return { reused_from_job_id: null, worktree_owner_job_id: null };
  }

  return {
    reused_from_job_id: status.reused_from_job_id ?? null,
    worktree_owner_job_id: status.worktree_owner_job_id ?? null,
  };
}

function summarizeMemory(memoryEntries: NodeMemoryRow[]): { total: number; by_type: Record<string, number>; latest_summary: string | null } {
  const byType: Record<string, number> = {};
  for (const entry of memoryEntries) {
    const key = entry.entry_type ?? 'unknown';
    byType[key] = (byType[key] ?? 0) + 1;
  }

  const latestSummary = [...memoryEntries]
    .sort((left, right) => (right.updated_at_ms ?? 0) - (left.updated_at_ms ?? 0))
    .find((entry) => typeof entry.summary === 'string' && entry.summary.trim().length > 0)?.summary?.trim() ?? null;

  return {
    total: memoryEntries.length,
    by_type: byType,
    latest_summary: latestSummary,
  };
}

function printNodeRunsTable(rows: Array<NodeRunRow & { member_summary: string; memory_total: number }>): void {
  const headers = ['node_id', 'node_name', 'status', 'reason', 'started_at', 'updated_at', 'coordinator_job_id', 'memory', 'members'];
  const body = rows.map((row) => [
    row.id,
    row.node_name,
    row.status,
    readStatusReason(row),
    formatTimestamp(row.started_at_ms),
    formatTimestamp(row.updated_at_ms),
    row.coordinator_job_id ?? '-',
    String(row.memory_total),
    row.member_summary,
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
      : readFileSync(resolveNodeConfigPath(process.cwd(), args.nodeConfigInput!), 'utf-8');
    const config = parseNodeConfig(rawConfig);

    const loader = new SpecialistLoader();
    const runner = new SpecialistRunner({
      loader,
      hooks: new HookEmitter({ tracePath: join(process.cwd(), '.specialists', 'trace.jsonl') }),
      circuitBreaker: new CircuitBreaker(),
    });

    const nodeId = `${config.name}-${randomUUID().slice(0, 8)}`;
    const effectiveContextDepth = args.contextDepth ?? config.defaultContextDepth;

    const { NodeSupervisor } = await import('../specialist/node-supervisor.js');

    let beadContext: string | undefined;
    if (args.beadId) {
      const beadReader = new BeadsClient();
      const bead = beadReader.readBead(args.beadId);
      if (!bead) {
        throw new Error(`Unable to read bead '${args.beadId}' via bd show --json`);
      }

      const blockers = effectiveContextDepth > 0
        ? beadReader.getCompletedBlockers(args.beadId, effectiveContextDepth)
        : [];
      beadContext = buildBeadContext(bead, blockers);
    }

    const availableSpecialists = (await loader.list()).map((specialist) => specialist.name);

    const supervisor = new NodeSupervisor({
      nodeId,
      nodeName: config.name,
      coordinatorSpecialist: config.coordinator,
      members: config.members,
      memoryNamespace: config.memoryNamespace,
      sourceBeadId: args.beadId,
      sqliteClient,
      runner,
      availableSpecialists,
      qualityGates: ['npm run lint', 'npx tsc --noEmit'],
      nodeConfigSnapshot: config as unknown as Record<string, unknown>,
      completionStrategy: config.completionStrategy,
      maxRetries: config.maxRetries,
      baseBranch: config.baseBranch,
      runOptions: {
        inputBeadId: args.beadId,
        contextDepth: effectiveContextDepth,
        variables: beadContext
          ? {
              bead_context: beadContext,
              bead_id: args.beadId ?? '',
            }
          : undefined,
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

function printNodeRunDetail(row: NodeRunRow, members: NodeMemberRow[], memorySummary: { total: number; latest_summary: string | null }): void {
  const detail = {
    node_id: row.id,
    node_name: row.node_name,
    status: row.status,
    reason: readStatusReason(row),
    started_at: formatTimestamp(row.started_at_ms),
    updated_at: formatTimestamp(row.updated_at_ms),
    coordinator_job_id: row.coordinator_job_id ?? '-',
    memory_entries: memorySummary.total,
    memory_latest: memorySummary.latest_summary ?? '-',
    member_summary: summarizeMembers(members),
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
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(event.event_json) as Record<string, unknown>;
      } catch {
        payload = {};
      }

      const metadata = [
        typeof payload.member_id === 'string' ? `member=${payload.member_id}` : null,
        typeof payload.job_id === 'string' ? `job=${payload.job_id}` : null,
        typeof payload.status === 'string' ? `status=${payload.status}` : null,
        typeof payload.reason === 'string' ? `reason=${payload.reason}` : null,
        typeof payload.trigger === 'string' ? `trigger=${payload.trigger}` : null,
        typeof payload.context_health === 'string' ? `context=${payload.context_health}` : null,
        typeof payload.generation === 'number' ? `generation=${payload.generation}` : null,
        typeof payload.worktree_path === 'string' ? `worktree=${payload.worktree_path}` : null,
        typeof payload.parent_member_id === 'string' ? `parent=${payload.parent_member_id}` : null,
        typeof payload.replaced_member_id === 'string' ? `replaced=${payload.replaced_member_id}` : null,
        typeof payload.phase_id === 'string' ? `phase=${payload.phase_id}` : null,
        typeof payload.action_type === 'string' ? `action=${payload.action_type}` : null,
      ].filter((value): value is string => value !== null);

      console.log(`[${new Date(event.t).toISOString()}] ${event.type}${metadata.length > 0 ? ` | ${metadata.join(' ')}` : ''}`);
    }
  } finally {
    sqliteClient.close();
  }
}

async function handleNodeList(args: ParsedNodeArgs): Promise<void> {
  const nodes = discoverNodeConfigs(process.cwd());

  if (args.jsonMode) {
    console.log(JSON.stringify(nodes, null, 2));
    return;
  }

  if (nodes.length === 0) {
    console.log('No node configs found. Checked: .specialists/default/nodes and config/nodes');
    return;
  }

  for (const node of nodes) {
    console.log(`${node.name}\t${node.source}\t${node.path}`);
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

      const members = sqliteClient.readNodeMembers(row.id);
      const memorySummary = summarizeMemory(sqliteClient.readNodeMemory(row.id));

      if (args.jsonMode) {
        console.log(JSON.stringify({
          node_id: row.id,
          node_name: row.node_name,
          status: row.status,
          reason: readStatusReason(row),
          started_at: row.started_at_ms,
          updated_at: row.updated_at_ms,
          coordinator_job_id: row.coordinator_job_id ?? null,
          memory_summary: memorySummary,
          members: members.map((member) => {
            const lineage = readMemberLineage(member, sqliteClient);
            return {
              member_id: member.member_id,
              job_id: member.job_id ?? null,
              specialist: member.specialist,
              status: member.status,
              enabled: member.enabled ?? true,
              generation: member.generation ?? 0,
              worktree_path: member.worktree_path ?? null,
              parent_member_id: member.parent_member_id ?? null,
              replaced_member_id: member.replaced_member_id ?? null,
              phase_id: member.phase_id ?? null,
              reused_from_job_id: lineage.reused_from_job_id,
              worktree_owner_job_id: lineage.worktree_owner_job_id,
            };
          }),
          member_summary: summarizeMembers(members),
        }, null, 2));
      } else {
        printNodeRunDetail(row, members, memorySummary);
      }
      return;
    }

    const rows = sqliteClient.listNodeRuns();

    const rowsWithMembers = rows.map((row) => {
      const members = sqliteClient.readNodeMembers(row.id);
      const memorySummary = summarizeMemory(sqliteClient.readNodeMemory(row.id));
      return {
        ...row,
        members,
        memory_total: memorySummary.total,
        member_summary: summarizeMembers(members),
      };
    });

    if (args.jsonMode) {
      console.log(JSON.stringify(rowsWithMembers.map((row) => ({
        node_id: row.id,
        node_name: row.node_name,
        status: row.status,
        reason: readStatusReason(row),
        started_at: row.started_at_ms,
        updated_at: row.updated_at_ms,
        coordinator_job_id: row.coordinator_job_id ?? null,
        memory_total: row.memory_total,
        member_summary: row.member_summary,
      })), null, 2));
      return;
    }

    if (rows.length === 0) {
      console.log('No node runs found.');
      return;
    }

    printNodeRunsTable(rowsWithMembers);
  } finally {
    sqliteClient.close();
  }
}

function requireNodeRun(sqliteClient: NonNullable<ReturnType<typeof createObservabilitySqliteClient>>, nodeId: string): NodeRunRow {
  const row = sqliteClient.readNodeRun(nodeId);
  if (!row) {
    throw new Error(`Node run not found: ${nodeId}`);
  }
  return row;
}

function requireNodeMember(
  sqliteClient: NonNullable<ReturnType<typeof createObservabilitySqliteClient>>,
  nodeId: string,
  memberKey: string,
): NodeMemberRow {
  requireNodeRun(sqliteClient, nodeId);
  const member = sqliteClient.readNodeMembers(nodeId).find((entry) => entry.member_id === memberKey);
  if (!member) {
    throw new Error(`Member '${memberKey}' not found in node '${nodeId}'`);
  }
  return member;
}

function readPersistedJobResult(
  sqliteClient: NonNullable<ReturnType<typeof createObservabilitySqliteClient>>,
  jobId: string,
): string | null {
  const sqliteResult = sqliteClient.readResult(jobId);
  if (sqliteResult !== null) {
    return sqliteResult;
  }

  const resultPath = join(resolveJobsDir(), jobId, 'result.txt');
  if (!existsSync(resultPath)) {
    return null;
  }

  try {
    return readFileSync(resultPath, 'utf-8');
  } catch {
    return null;
  }
}

function emitResultTruncationNote(jobId: string, charCount: number): void {
  process.stderr.write(
    `Result for job ${jobId} truncated to ${NODE_RESULT_PREVIEW_CHAR_LIMIT} of ${charCount} chars. Re-run with --full for the complete output.\n`,
  );
}

async function handleNodeResult(args: ParsedNodeArgs): Promise<void> {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    emitNodeCommandError('Observability SQLite DB is unavailable. Run: specialists db setup', args.jsonMode);
    return;
  }

  try {
    const nodeId = args.nodeId!;
    const member = requireNodeMember(sqliteClient, nodeId, args.memberKey!);
    const jobId = member.job_id;

    if (!jobId) {
      throw new Error(`Member '${member.member_id}' in node '${nodeId}' has no job id yet`);
    }

    const persistedResult = readPersistedJobResult(sqliteClient, jobId);
    if (persistedResult === null) {
      throw new Error(`No persisted result found yet for member '${member.member_id}' in node '${nodeId}' (job ${jobId})`);
    }

    const charCount = persistedResult.length;
    const truncated = !args.fullResult && charCount > NODE_RESULT_PREVIEW_CHAR_LIMIT;
    const result = truncated
      ? persistedResult.slice(0, NODE_RESULT_PREVIEW_CHAR_LIMIT)
      : persistedResult;

    if (truncated) {
      emitResultTruncationNote(jobId, charCount);
    }

    if (args.jsonMode) {
      console.log(JSON.stringify({
        ok: true,
        node_id: nodeId,
        member_id: member.member_id,
        generation: member.generation ?? 0,
        phase_id: member.phase_id ?? null,
        specialist: member.specialist,
        job_id: jobId,
        status: member.status,
        char_count: charCount,
        truncated,
        result,
      }));
      return;
    }

    process.stdout.write(result);
    if (!result.endsWith('\n')) {
      process.stdout.write('\n');
    }
  } catch (error) {
    emitNodeCommandError(error, args.jsonMode);
  } finally {
    sqliteClient.close();
  }
}

async function handleNodeMembers(args: ParsedNodeArgs): Promise<void> {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  try {
    const nodeId = args.nodeId!;
    requireNodeRun(sqliteClient, nodeId);
    const members = sqliteClient.readNodeMembers(nodeId).map((member) => {
      const lineage = readMemberLineage(member, sqliteClient);
      return {
        member_id: member.member_id,
        generation: member.generation ?? 0,
        specialist: member.specialist,
        status: member.status,
        enabled: member.enabled ?? true,
        job_id: member.job_id ?? null,
        phase_id: member.phase_id ?? null,
        worktree_path: member.worktree_path ?? null,
        parent_member_id: member.parent_member_id ?? null,
        replaced_member_id: member.replaced_member_id ?? null,
        reused_from_job_id: lineage.reused_from_job_id,
        worktree_owner_job_id: lineage.worktree_owner_job_id,
      };
    });

    if (args.jsonMode) {
      console.log(JSON.stringify({ node_id: nodeId, members }, null, 2));
      return;
    }

    if (members.length === 0) {
      console.log(`No members found for ${nodeId}.`);
      return;
    }

    for (const member of members) {
      const details = [
        `${member.member_id}#${member.generation}`,
        `status=${member.status}`,
        `specialist=${member.specialist}`,
        member.job_id ? `job=${member.job_id}` : null,
        member.phase_id ? `phase=${member.phase_id}` : null,
        member.worktree_path ? `worktree=${member.worktree_path}` : null,
        member.parent_member_id ? `parent=${member.parent_member_id}` : null,
        member.replaced_member_id ? `replaced=${member.replaced_member_id}` : null,
        member.reused_from_job_id ? `reused_from=${member.reused_from_job_id}` : null,
        member.worktree_owner_job_id ? `worktree_owner=${member.worktree_owner_job_id}` : null,
      ].filter((value): value is string => value !== null);
      console.log(details.join(' | '));
    }
  } finally {
    sqliteClient.close();
  }
}

async function handleNodeMemory(args: ParsedNodeArgs): Promise<void> {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  try {
    const nodeId = args.nodeId!;
    requireNodeRun(sqliteClient, nodeId);
    const memoryEntries = sqliteClient.readNodeMemory(nodeId);
    const summary = summarizeMemory(memoryEntries);

    if (args.jsonMode) {
      console.log(JSON.stringify({ node_id: nodeId, summary, entries: memoryEntries }, null, 2));
      return;
    }

    console.log(`node_id: ${nodeId}`);
    console.log(`memory_entries: ${summary.total}`);
    console.log(`memory_by_type: ${JSON.stringify(summary.by_type)}`);
    console.log(`memory_latest: ${summary.latest_summary ?? '-'}`);

    for (const entry of memoryEntries) {
      console.log(`- ${entry.entry_id ?? 'n/a'} | type=${entry.entry_type ?? 'unknown'} | member=${entry.source_member_id ?? '-'} | summary=${entry.summary?.trim() ?? '-'}`);
    }
  } finally {
    sqliteClient.close();
  }
}

function resolveCoordinatorStatus(nodeId: string): { nodeRun: NodeRunRow; coordinatorJobId: string; coordinatorStatus: SupervisorStatus } {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  try {
    const nodeRun = requireNodeRun(sqliteClient, nodeId);
    if (!nodeRun.coordinator_job_id) {
      throw new Error(`Node ${nodeId} has no coordinator job id`);
    }

    const supervisor = new Supervisor({ runner: null as never, runOptions: null as never, jobsDir: resolveJobsDir() });
    try {
      const coordinatorStatus = supervisor.readStatus(nodeRun.coordinator_job_id);
      if (!coordinatorStatus) {
        throw new Error(`Coordinator job not found: ${nodeRun.coordinator_job_id}`);
      }
      return { nodeRun, coordinatorJobId: nodeRun.coordinator_job_id, coordinatorStatus };
    } finally {
      void supervisor.dispose();
    }
  } finally {
    sqliteClient.close();
  }
}

async function handleNodeSteer(args: ParsedNodeArgs): Promise<void> {
  const nodeId = args.nodeId!;
  const message = args.findingId!;
  const { coordinatorJobId, coordinatorStatus } = resolveCoordinatorStatus(nodeId);

  if (!coordinatorStatus.fifo_path) {
    throw new Error(`Coordinator job ${coordinatorJobId} has no steer pipe`);
  }

  writeFileSync(coordinatorStatus.fifo_path, `${JSON.stringify({ type: 'steer', message })}\n`, { flag: 'a' });

  if (args.jsonMode) {
    console.log(JSON.stringify({ node_id: nodeId, coordinator_job_id: coordinatorJobId, steered: true }, null, 2));
    return;
  }

  console.log(`Steer message sent to node ${nodeId} coordinator (${coordinatorJobId})`);
}

async function handleNodeStop(args: ParsedNodeArgs): Promise<void> {
  const nodeId = args.nodeId!;
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }

  const nodeRun = requireNodeRun(sqliteClient, nodeId);
  if (!nodeRun.coordinator_job_id) {
    throw new Error(`Node ${nodeId} has no coordinator job id`);
  }

  const supervisor = new Supervisor({ runner: null as never, runOptions: null as never, jobsDir: resolveJobsDir() });
  const stoppedMembers: Array<{ member_id: string; job_id: string; pid: number }> = [];
  const skippedMembers: Array<{ member_id: string; job_id: string; reason: string }> = [];

  try {
    // Stop all non-terminal members first
    const members = sqliteClient.readNodeMembers(nodeRun.id);
    const terminalStatuses = new Set(['done', 'error', 'cancelled', 'stopped']);

    for (const member of members) {
      if (!member.job_id) {
        skippedMembers.push({ member_id: member.member_id, job_id: '', reason: 'no job_id' });
        continue;
      }
      if (terminalStatuses.has(member.status)) {
        skippedMembers.push({ member_id: member.member_id, job_id: member.job_id, reason: `already ${member.status}` });
        continue;
      }
      const memberStatus = supervisor.readStatus(member.job_id);
      if (!memberStatus?.pid) {
        skippedMembers.push({ member_id: member.member_id, job_id: member.job_id, reason: 'no pid' });
        continue;
      }
      try {
        process.kill(memberStatus.pid, 'SIGTERM');
        stoppedMembers.push({ member_id: member.member_id, job_id: member.job_id, pid: memberStatus.pid });
      } catch {
        skippedMembers.push({ member_id: member.member_id, job_id: member.job_id, reason: 'SIGTERM failed (process already gone)' });
      }
    }

    // Stop coordinator
    const coordinatorStatus = supervisor.readStatus(nodeRun.coordinator_job_id);
    if (!coordinatorStatus?.pid) {
      throw new Error(`Coordinator job ${nodeRun.coordinator_job_id} has no pid`);
    }
    process.kill(coordinatorStatus.pid, 'SIGTERM');

    if (args.jsonMode) {
      console.log(JSON.stringify({
        node_id: nodeId,
        coordinator_job_id: nodeRun.coordinator_job_id,
        stopped: true,
        pid: coordinatorStatus.pid,
        members_stopped: stoppedMembers,
        members_skipped: skippedMembers,
      }, null, 2));
      return;
    }

    console.log(`Sent SIGTERM to node ${nodeId} coordinator (${nodeRun.coordinator_job_id}, pid=${coordinatorStatus.pid})`);
    if (stoppedMembers.length > 0) {
      console.log(`Stopped ${stoppedMembers.length} member(s): ${stoppedMembers.map((m) => `${m.member_id}(${m.job_id})`).join(', ')}`);
    }
  } finally {
    void supervisor.dispose();
    sqliteClient.close();
  }
}

async function handleNodeAttach(args: ParsedNodeArgs): Promise<void> {
  const nodeId = args.nodeId!;
  const { coordinatorJobId, coordinatorStatus } = resolveCoordinatorStatus(nodeId);

  const tmuxSession = coordinatorStatus.tmux_session?.trim();
  if (!tmuxSession) {
    throw new Error(`Coordinator job ${coordinatorJobId} has no tmux session`);
  }

  const whichTmux = spawnSync('which', ['tmux'], { stdio: 'ignore' });
  if (whichTmux.status !== 0) {
    throw new Error('tmux is not installed. Install tmux to use `sp node attach`.');
  }

  execFileSync('tmux', ['attach-session', '-t', tmuxSession], { stdio: 'inherit' });
}

function buildFindingNotes(nodeId: string, findingId: string, finding: NodeMemoryRow): string {
  const lines = [
    'Node finding promoted',
    `node_id: ${nodeId}`,
    `finding_id: ${findingId}`,
    `memory_entry_id: ${finding.entry_id ?? findingId}`,
    `source_member_id: ${finding.source_member_id ?? 'unknown'}`,
    `confidence: ${finding.confidence ?? 'unknown'}`,
    '',
    '## Summary',
    finding.summary?.trim() || '(no summary)',
  ];

  if (finding.provenance_json?.trim()) {
    lines.push('', '## Provenance', '```json');
    try {
      const parsed = JSON.parse(finding.provenance_json);
      lines.push(JSON.stringify(parsed, null, 2));
    } catch {
      lines.push(finding.provenance_json);
    }
    lines.push('```');
  }

  lines.push(
    '',
    '<!-- node_finding_provenance:start -->',
    JSON.stringify({
      node_id: nodeId,
      finding_id: findingId,
      memory_entry_id: finding.entry_id ?? findingId,
      source_member_id: finding.source_member_id ?? null,
      confidence: finding.confidence ?? null,
      provenance_json: finding.provenance_json ?? null,
      created_at_ms: finding.created_at_ms ?? null,
      updated_at_ms: finding.updated_at_ms ?? null,
    }),
    '<!-- node_finding_provenance:end -->',
  );

  return lines.join('\n');
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

    const notes = buildFindingNotes(nodeId, findingId, finding);
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

function buildActionError(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

function hasJsonFlag(argv: string[]): boolean {
  return argv.includes('--json');
}

function emitNodeCommandError(error: unknown, jsonMode: boolean): void {
  const payload = buildActionError(error);
  if (jsonMode) {
    console.log(JSON.stringify(payload));
    process.exitCode = 1;
    return;
  }

  console.error(payload.error);
  process.exitCode = 1;
}

async function createNodeActionRunnerDependencies(): Promise<{ loader: SpecialistLoader; runner: SpecialistRunner }> {
  const loader = new SpecialistLoader();
  const runner = new SpecialistRunner({
    loader,
    hooks: new HookEmitter({ tracePath: join(process.cwd(), '.specialists', 'trace.jsonl') }),
    circuitBreaker: new CircuitBreaker(),
  });
  return { loader, runner };
}

async function handleNodeAction(args: ParsedNodeArgs): Promise<void> {
  try {
    if (args.command === 'spawn-member') {
      const { loader, runner } = await createNodeActionRunnerDependencies();
      const available = new Set((await loader.list()).map((entry) => entry.name));
      if (!available.has(args.specialist!)) {
        throw new Error(`Unknown specialist: ${args.specialist}`);
      }

      const result = await spawnDynamicMember({
        nodeId: args.nodeId!,
        memberKey: args.memberKey!,
        specialist: args.specialist!,
        beadId: args.beadId,
        phaseId: args.phaseId,
        scopePaths: args.scope,
        runner,
        jobsDir: resolveJobsDir(),
        runOptions: {
          inputBeadId: args.beadId,
          contextDepth: 2,
          workingDirectory: process.cwd(),
          variables: {
            bead_id: args.beadId ?? '',
          },
        },
      });

      console.log(JSON.stringify({ ok: true, member_key: result.memberKey, job_id: result.jobId, specialist: result.specialist }, null, args.jsonMode ? 0 : 2));
      return;
    }

    if (args.command === 'create-bead') {
      const description = `Node action created bead from node ${args.nodeId}.`;
      const result = executeCreateBeadAction({
        nodeId: args.nodeId!,
        title: args.title!,
        description,
        beadType: args.beadType ?? 'task',
        priority: args.priority ?? 2,
        dependsOn: args.dependsOn,
      });

      console.log(JSON.stringify({ ok: true, bead_id: result.beadId, title: result.title }, null, args.jsonMode ? 0 : 2));
      return;
    }

    if (args.command === 'complete') {
      const result = await executeCompleteNodeAction({
        nodeId: args.nodeId!,
        strategy: args.strategy!,
        forceDraftPr: args.forceDraftPr,
      });

      console.log(JSON.stringify({ ok: true, strategy: result.strategy, pr_url: result.prUrl ?? null }, null, args.jsonMode ? 0 : 2));
      return;
    }

    if (args.command === 'wait-phase') {
      const sqliteClient = createObservabilitySqliteClient();
      if (!sqliteClient) throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
      try {
        requireNodeRun(sqliteClient, args.nodeId!);
        const deadline = args.timeoutMs ? Date.now() + args.timeoutMs : null;
        const memberKeys = args.memberKeys ?? [];

        while (true) {
          const members = sqliteClient.readNodeMembers(args.nodeId!).filter((member) => member.phase_id === args.phaseId && memberKeys.includes(member.member_id));
          const outcomes = Object.fromEntries(members.map((member) => [member.member_id, { status: member.status, result: member.job_id ? sqliteClient.readResult(member.job_id) : null }]));
          const allTerminal = memberKeys.every((key) => {
            const current = members.find((member) => member.member_id === key);
            return current ? ['done', 'error', 'stopped'].includes(current.status) : false;
          });

          if (allTerminal) {
            console.log(JSON.stringify({ ok: true, phase: args.phaseId, outcomes }, null, args.jsonMode ? 0 : 2));
            return;
          }

          if (deadline !== null && Date.now() >= deadline) {
            throw new Error(`Timed out waiting for phase '${args.phaseId}' members: ${memberKeys.join(', ')}`);
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } finally {
        sqliteClient.close();
      }
    }

    throw new Error(`Unsupported node action: ${args.command}`);
  } catch (error) {
    console.log(JSON.stringify(buildActionError(error), null, args.jsonMode ? 0 : 2));
    process.exitCode = 1;
  }
}

export async function handleNodeCommand(argv: string[]): Promise<void> {
  let parsed: ParsedNodeArgs;
  try {
    parsed = parseNodeArgs(argv);
  } catch (error) {
    emitNodeCommandError(error, hasJsonFlag(argv));
    return;
  }

  if (parsed.command === 'run') {
    await handleNodeRun(parsed);
    return;
  }

  if (parsed.command === 'list') {
    await handleNodeList(parsed);
    return;
  }

  if (parsed.command === 'feed') {
    await handleNodeFeed(parsed);
    return;
  }

  if (parsed.command === 'result') {
    await handleNodeResult(parsed);
    return;
  }

  if (parsed.command === 'promote') {
    await handleNodePromote(parsed);
    return;
  }

  if (parsed.command === 'members') {
    await handleNodeMembers(parsed);
    return;
  }

  if (parsed.command === 'memory') {
    await handleNodeMemory(parsed);
    return;
  }

  if (parsed.command === 'steer') {
    await handleNodeSteer(parsed);
    return;
  }

  if (parsed.command === 'stop') {
    await handleNodeStop(parsed);
    return;
  }

  if (parsed.command === 'attach') {
    await handleNodeAttach(parsed);
    return;
  }

  if (parsed.command === 'spawn-member' || parsed.command === 'create-bead' || parsed.command === 'complete' || parsed.command === 'wait-phase') {
    await handleNodeAction(parsed);
    return;
  }

  await handleNodeStatus(parsed);
}
