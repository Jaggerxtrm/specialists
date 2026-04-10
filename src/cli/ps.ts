import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bold, cyan, dim, formatCostUsd, formatTokenUsageSummary, green, magenta, red, yellow } from './format-helpers.js';
import { isJobDead } from '../specialist/supervisor.js';
import type { SupervisorStatus } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { loadEpicReadinessSummary, syncEpicStateFromReadiness, type EpicReadinessSummary } from '../specialist/epic-readiness.js';

type JobState = SupervisorStatus['status'];

interface PsArgs {
  json: boolean;
  all: boolean;
  follow: boolean;
  includeMerged: boolean;
  inspectId?: string;
}

interface JobNode {
  kind: 'job';
  id: string;
  specialist: string;
  status: JobState;
  pid?: number;
  is_dead?: boolean;
  bead_id?: string;
  bead_title?: string;
  node_id?: string;
  worktree_owner_job_id?: string;
  reused_from_job_id?: string;
  worktree_path?: string;
  branch?: string;
  epic_id?: string;
  started_at_ms: number;
  elapsed_s?: number;
  context_pct?: number;
  context_health?: SupervisorStatus['context_health'];
  metrics?: SupervisorStatus['metrics'];
  children: JobNode[];
}

interface WorktreeTree {
  owner_job_id: string;
  worktree_path?: string;
  branch?: string;
  children: JobNode[];
}

type EpicReadinessMap = Map<string, EpicReadinessSummary>;

interface NodeTree {
  node_id: string;
  node_name: string;
  status: string;
  member_count: number;
  newest_activity_ms: number;
  members: JobNode[];
}

interface EpicChainGroup {
  chain_id: string;
  chain_root_bead_id?: string;
  trees: WorktreeTree[];
}

interface EpicGroup {
  epic_id: string;
  readiness?: EpicReadinessSummary;
  prep_jobs: JobNode[];
  chains: EpicChainGroup[];
}

const ACTIVE_STATES: readonly JobState[] = ['starting', 'running', 'waiting'];
const TERMINAL_STATES: readonly JobState[] = ['done', 'error'];
const BEAD_TITLE_CACHE = new Map<string, string>();
const STATUS_PRIORITY: Readonly<Record<JobState, number>> = {
  waiting: 3,
  running: 2,
  starting: 1,
  done: 0,
  error: 0,
};
const SPINNER_FRAMES = ['⣾', '⣽', '⣻', '⣺', '⣹', '⣸', '⣷', '⣶'] as const;

function parseArgs(argv: string[]): PsArgs {
  const positional = argv.filter((a) => !a.startsWith('-'));
  return {
    json: argv.includes('--json'),
    all: argv.includes('--all'),
    follow: argv.includes('--follow') || argv.includes('-f'),
    includeMerged: argv.includes('--include-merged'),
    inspectId: positional[0],
  };
}

function isVisibleStatus(status: JobState, all: boolean): boolean {
  if (all) return true;
  return ACTIVE_STATES.includes(status);
}

function readStatusesFromFiles(jobsDir: string): SupervisorStatus[] {
  if (!existsSync(jobsDir)) return [];

  const statuses: SupervisorStatus[] = [];
  for (const entry of readdirSync(jobsDir)) {
    const statusPath = join(jobsDir, entry, 'status.json');
    if (!existsSync(statusPath)) continue;
    try {
      statuses.push(JSON.parse(readFileSync(statusPath, 'utf-8')) as SupervisorStatus);
    } catch {
      // ignore malformed status files
    }
  }

  return statuses.sort((a, b) => b.started_at_ms - a.started_at_ms);
}

function loadStatuses(): SupervisorStatus[] {
  const sqliteClient = createObservabilitySqliteClient();
  const jobsDir = resolveJobsDir();

  try {
    const sqliteStatuses = sqliteClient?.listStatuses() ?? [];
    if (sqliteStatuses.length > 0) {
      return sqliteStatuses.sort((a, b) => b.started_at_ms - a.started_at_ms);
    }
  } catch {
    // fallback to files below
  } finally {
    sqliteClient?.close();
  }

  return readStatusesFromFiles(jobsDir);
}

function toJobNode(job: SupervisorStatus & { is_dead?: boolean }): JobNode {
  const beadAwareStatus = job as SupervisorStatus & { bead_title?: string };

  return {
    kind: 'job',
    id: job.id,
    specialist: job.specialist,
    status: job.status,
    pid: job.pid,
    is_dead: job.is_dead,
    bead_id: job.bead_id,
    bead_title: beadAwareStatus.bead_title,
    node_id: job.node_id,
    worktree_owner_job_id: job.worktree_owner_job_id,
    reused_from_job_id: job.reused_from_job_id,
    worktree_path: job.worktree_path,
    branch: job.branch,
    epic_id: job.epic_id,
    started_at_ms: job.started_at_ms,
    elapsed_s: job.elapsed_s,
    context_pct: job.context_pct,
    context_health: job.context_health,
    metrics: job.metrics,
    children: [],
  };
}

function buildReuseForest(jobs: SupervisorStatus[]): JobNode[] {
  const nodes = new Map<string, JobNode>();
  for (const job of jobs) nodes.set(job.id, toJobNode(job));

  const roots: JobNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.reused_from_job_id;
    if (parentId && nodes.has(parentId)) {
      nodes.get(parentId)!.children.push(node);
      continue;
    }
    roots.push(node);
  }

  const sortTree = (jobNode: JobNode): void => {
    jobNode.children.sort((a, b) => a.started_at_ms - b.started_at_ms);
    for (const child of jobNode.children) sortTree(child);
  };

  roots.sort((a, b) => a.started_at_ms - b.started_at_ms);
  for (const root of roots) sortTree(root);
  return roots;
}

function getTreeUrgency(jobs: readonly SupervisorStatus[]): number {
  return jobs.reduce((highest, job) => Math.max(highest, STATUS_PRIORITY[job.status]), 0);
}

function getTreeNewestStart(jobs: readonly SupervisorStatus[]): number {
  return jobs.reduce((latest, job) => Math.max(latest, job.started_at_ms), 0);
}

function groupByTree(jobs: SupervisorStatus[]): WorktreeTree[] {
  const groups = new Map<string, SupervisorStatus[]>();

  for (const job of jobs) {
    if (job.node_id) continue;
    const ownerId = job.worktree_owner_job_id ?? job.id;
    if (!groups.has(ownerId)) groups.set(ownerId, []);
    groups.get(ownerId)!.push(job);
  }

  return groupTreeEntries([...groups.entries()]);
}

function groupTreeEntries(groupEntries: Array<[string, SupervisorStatus[]]>): WorktreeTree[] {
  const trees: WorktreeTree[] = [];

  const sortedGroups = groupEntries.sort(([ownerA, jobsA], [ownerB, jobsB]) => {
    const urgencyDelta = getTreeUrgency(jobsB) - getTreeUrgency(jobsA);
    if (urgencyDelta !== 0) return urgencyDelta;
    const startDelta = getTreeNewestStart(jobsB) - getTreeNewestStart(jobsA);
    if (startDelta !== 0) return startDelta;
    return ownerA.localeCompare(ownerB);
  });

  for (const [ownerJobId, treeJobs] of sortedGroups) {
    const representative = treeJobs.find((job) => job.id === ownerJobId) ?? treeJobs[0];

    trees.push({
      owner_job_id: ownerJobId,
      worktree_path: representative.worktree_path,
      branch: representative.branch,
      children: buildReuseForest(treeJobs),
    });
  }

  return trees;
}

function normalizeChainId(job: SupervisorStatus): string {
  if (job.chain_kind === 'chain') {
    if (job.chain_id) return job.chain_id;
    if (job.worktree_owner_job_id) return job.worktree_owner_job_id;
    return `chain:${job.id}`;
  }

  return 'prep';
}

function buildEpicGroups(jobs: SupervisorStatus[], epicReadiness: EpicReadinessMap): EpicGroup[] {
  const byEpic = new Map<string, SupervisorStatus[]>();
  for (const job of jobs) {
    if (!job.epic_id) continue;
    if (!byEpic.has(job.epic_id)) byEpic.set(job.epic_id, []);
    byEpic.get(job.epic_id)!.push(job);
  }

  const groups: EpicGroup[] = [];

  for (const [epicId, epicJobs] of byEpic.entries()) {
    const prepJobs = epicJobs
      .filter((job) => job.chain_kind !== 'chain')
      .map((job) => toJobNode(job))
      .sort((a, b) => {
        const urgencyDelta = STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
        if (urgencyDelta !== 0) return urgencyDelta;
        return b.started_at_ms - a.started_at_ms;
      });

    const chainBuckets = new Map<string, SupervisorStatus[]>();
    for (const job of epicJobs) {
      if (job.chain_kind !== 'chain') continue;
      const chainId = normalizeChainId(job);
      if (!chainBuckets.has(chainId)) chainBuckets.set(chainId, []);
      chainBuckets.get(chainId)!.push(job);
    }

    const chains: EpicChainGroup[] = [...chainBuckets.entries()]
      .map(([chainId, chainJobs]) => {
        const treeBuckets = new Map<string, SupervisorStatus[]>();
        for (const chainJob of chainJobs) {
          const ownerId = chainJob.worktree_owner_job_id ?? chainJob.id;
          if (!treeBuckets.has(ownerId)) treeBuckets.set(ownerId, []);
          treeBuckets.get(ownerId)!.push(chainJob);
        }

        const chainSummary = epicReadiness.get(epicId)?.chains.find((chain) => chain.chain_id === chainId);

        return {
          chain_id: chainId,
          chain_root_bead_id: chainSummary?.chain_root_bead_id ?? chainJobs[0]?.chain_root_bead_id,
          trees: groupTreeEntries([...treeBuckets.entries()]),
        };
      })
      .sort((a, b) => a.chain_id.localeCompare(b.chain_id));

    groups.push({
      epic_id: epicId,
      readiness: epicReadiness.get(epicId),
      prep_jobs: prepJobs,
      chains,
    });
  }

  groups.sort((a, b) => {
    const aNewest = Math.max(
      ...a.prep_jobs.map((job) => job.started_at_ms),
      ...a.chains.flatMap((chain) => chain.trees.flatMap((tree) => tree.children.map((child) => child.started_at_ms))),
      0,
    );
    const bNewest = Math.max(
      ...b.prep_jobs.map((job) => job.started_at_ms),
      ...b.chains.flatMap((chain) => chain.trees.flatMap((tree) => tree.children.map((child) => child.started_at_ms))),
      0,
    );
    return bNewest - aNewest;
  });

  return groups;
}

function resolveNodeRunMap(nodeIds: readonly string[]): Map<string, { node_name: string; status: string }> {
  const nodeIdSet = new Set(nodeIds.filter((nodeId) => nodeId.length > 0));
  if (nodeIdSet.size === 0) return new Map();

  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) return new Map();

  try {
    const byId = new Map<string, { node_name: string; status: string }>();
    const rows = sqliteClient.listNodeRuns();
    for (const row of rows) {
      if (!nodeIdSet.has(row.id)) continue;
      byId.set(row.id, { node_name: row.node_name, status: row.status });
    }
    return byId;
  } catch {
    return new Map();
  } finally {
    sqliteClient.close();
  }
}

function groupByNode(jobs: SupervisorStatus[]): NodeTree[] {
  const nodeGroups = new Map<string, SupervisorStatus[]>();
  for (const job of jobs) {
    if (!job.node_id) continue;
    if (!nodeGroups.has(job.node_id)) nodeGroups.set(job.node_id, []);
    nodeGroups.get(job.node_id)!.push(job);
  }

  const nodeInfoById = resolveNodeRunMap([...nodeGroups.keys()]);
  const nodeTrees: NodeTree[] = [];

  for (const [nodeId, nodeJobs] of nodeGroups.entries()) {
    const representative = nodeJobs[0];
    const nodeInfo = nodeInfoById.get(nodeId);

    const members = nodeJobs
      .map((job) => toJobNode(job))
      .sort((a, b) => {
        const urgencyDelta = STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
        if (urgencyDelta !== 0) return urgencyDelta;
        return b.started_at_ms - a.started_at_ms;
      });

    nodeTrees.push({
      node_id: nodeId,
      node_name: nodeInfo?.node_name ?? representative?.specialist ?? 'node',
      status: nodeInfo?.status ?? representative?.status ?? 'unknown',
      member_count: members.length,
      newest_activity_ms: getTreeNewestStart(nodeJobs),
      members,
    });
  }

  nodeTrees.sort((a, b) => {
    const timeDelta = b.newest_activity_ms - a.newest_activity_ms;
    if (timeDelta !== 0) return timeDelta;
    return a.node_id.localeCompare(b.node_id);
  });

  return nodeTrees;
}

function statusLabel(status: JobState): string {
  if (status === 'running') return cyan(status);
  if (status === 'waiting') return magenta(status);
  if (status === 'done') return green(status);
  if (status === 'error') return red(status);
  return yellow(status);
}

function epicStateLabel(state: EpicReadinessSummary['readiness_state'] | undefined): string {
  if (state === 'merge_ready') return green('merge_ready');
  if (state === 'merged') return dim('merged');
  if (state === 'failed') return red('failed');
  if (state === 'blocked') return yellow('blocked');
  if (state === 'resolving') return cyan('resolving');
  if (state === 'abandoned') return dim('abandoned');
  return magenta('unresolved');
}

function withPidLiveness(statuses: SupervisorStatus[]): Array<SupervisorStatus & { is_dead: boolean }> {
  return statuses.map((job) => ({
    ...job,
    is_dead: isJobDead(job),
  }));
}

function formatElapsed(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '--';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m${String(remainder).padStart(2, '0')}s`;
}


function getBeadTitleFromBd(beadId: string): string | null {
  const result = spawnSync('bd', ['show', beadId, '--json'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1500,
  });

  if (result.status !== 0 || !result.stdout) return null;

  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    const payload = (Array.isArray(parsed) ? parsed[0] : parsed) as {
      title?: unknown;
      issue?: { title?: unknown };
    };

    if (typeof payload?.title === 'string' && payload.title.trim().length > 0) return payload.title.trim();
    if (typeof payload?.issue?.title === 'string' && payload.issue.title.trim().length > 0) {
      return payload.issue.title.trim();
    }
  } catch {
    return null;
  }

  return null;
}

function buildBeadTitleCache(jobs: SupervisorStatus[]): Map<string, string> {
  const titles = new Map(BEAD_TITLE_CACHE);

  for (const job of jobs) {
    const beadAwareStatus = job as SupervisorStatus & { bead_title?: string };
    const beadId = job.bead_id;
    if (!beadId || titles.has(beadId)) continue;

    const cachedTitle = beadAwareStatus.bead_title;
    if (typeof cachedTitle === 'string' && cachedTitle.trim().length > 0) {
      const title = cachedTitle.trim();
      titles.set(beadId, title);
      BEAD_TITLE_CACHE.set(beadId, title);
      continue;
    }

    const resolvedTitle = getBeadTitleFromBd(beadId);
    if (resolvedTitle) {
      titles.set(beadId, resolvedTitle);
      BEAD_TITLE_CACHE.set(beadId, resolvedTitle);
    }
  }

  return titles;
}

function getStatusIcon(job: JobNode): string {
  if (job.is_dead) return red('◉');
  if (job.status === 'running') return cyan('◉');
  if (job.status === 'waiting') return magenta('◐');
  if (job.status === 'starting') return yellow('◐');
  if (job.status === 'done') return green('○');
  if (job.status === 'error') return red('○');
  return dim('○');
}

function getNextAction(job: JobNode): string {
  if (job.is_dead) return 'dead';
  if (job.status === 'running' || job.status === 'starting') return 'feed';
  if (job.status === 'waiting') return 'resume';
  if (job.status === 'done') return 'result';
  if (job.status === 'error') return 'result';
  return '';
}

function formatCtxWithIndicator(contextPct: number | undefined, contextHealth: string | undefined): string {
  if (contextPct === undefined || !Number.isFinite(contextPct)) return '  --';
  const pct = `${Math.round(contextPct)}%`;
  const warn = contextHealth === 'WARN' || contextHealth === 'CRITICAL' ? '▲' : '';
  return `${pct}${warn}`.padStart(4);
}

function renderJobLine(
  job: JobNode,
  beadTitles: Map<string, string>,
  prefix: string,
  connector: string,
): string {
  const icon = getStatusIcon(job);
  const id = job.id.padEnd(8);
  const spec = job.specialist.slice(0, 13).padEnd(13);
  const ctx = formatCtxWithIndicator(job.context_pct, job.context_health);
  const elapsedBase = formatElapsed(job.elapsed_s);
  const metricParts: string[] = [];
  if (job.metrics?.turns) metricParts.push(`${job.metrics.turns}t`);
  if (job.metrics?.tool_calls) metricParts.push(`${job.metrics.tool_calls}tc`);
  const totalTokens = job.metrics?.token_usage?.total_tokens;
  if (totalTokens) metricParts.push(`${totalTokens}tok`);
  const elapsed = metricParts.length > 0 ? `${elapsedBase} ${dim(metricParts.join('·'))}` : elapsedBase;
  const beadTitle = job.bead_id ? beadTitles.get(job.bead_id) : undefined;
  const beadCol = job.bead_id ? job.bead_id : '';
  const action = getNextAction(job);
  const actionCol = job.is_dead ? red(action) : dim(action);
  const titleSuffix = beadTitle ? dim(` ${beadTitle.slice(0, 40)}`) : '';
  return `${prefix}${connector}${icon} ${id} ${spec} ${ctx} ${elapsed}  ${beadCol.padEnd(14)} ${actionCol}${titleSuffix}`;
}

function renderTreeNodes(
  nodes: readonly JobNode[],
  beadTitles: Map<string, string>,
  prefix: string,
  counter: { running: number; waiting: number },
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const isLast = i === nodes.length - 1;
    const connector = prefix === '' ? '  ' : isLast ? '└ ' : '├ ';
    const childPrefix = prefix === '' ? '  ' : prefix + (isLast ? '  ' : '│ ');

    if (node.status === 'running') counter.running += 1;
    if (node.status === 'waiting') counter.waiting += 1;

    console.log(renderJobLine(node, beadTitles, prefix, connector));

    if (node.children.length > 0) {
      renderTreeNodes(node.children, beadTitles, childPrefix, counter);
    }
  }
}

function resolveEpicReadinessMap(jobs: readonly SupervisorStatus[]): EpicReadinessMap {
  const epicIds = [...new Set(jobs.map((job) => job.epic_id).filter((epicId): epicId is string => Boolean(epicId)))];
  if (epicIds.length === 0) return new Map();

  const sqlite = createObservabilitySqliteClient();
  if (!sqlite) return new Map();

  try {
    const readinessMap: EpicReadinessMap = new Map();
    for (const epicId of epicIds) {
      const summary = loadEpicReadinessSummary(sqlite, epicId);
      syncEpicStateFromReadiness(sqlite, summary);
      readinessMap.set(epicId, summary);
    }
    return readinessMap;
  } catch {
    return new Map();
  } finally {
    sqlite.close();
  }
}

function renderHuman(jobs: SupervisorStatus[], nodes: NodeTree[], trees: WorktreeTree[], all: boolean, epicReadiness: EpicReadinessMap): void {
  const beadTitles = buildBeadTitleCache(jobs);
  const counter = { running: 0, waiting: 0 };
  const epicGroups = buildEpicGroups(jobs, epicReadiness);

  console.log('');

  for (const epic of epicGroups) {
    const prepCount = epic.prep_jobs.length;
    const chainCount = epic.chains.length;
    const readiness = epic.readiness;
    const readinessState = readiness?.readiness_state ?? 'unresolved';
    const persistedState = readiness?.persisted_state ?? 'open';
    const prepSummary = readiness?.prep
      ? `prep ${readiness.prep.done}/${readiness.prep.total} done${readiness.prep.running > 0 ? ` ${readiness.prep.running} running` : ''}${readiness.prep.failed > 0 ? ` ${readiness.prep.failed} failed` : ''}`
      : `prep ${prepCount}`;
    const chainSummary = readiness?.chains
      ? `chains ${readiness.chains.filter((chain) => chain.state === 'pass').length}/${readiness.chains.length} pass`
      : `chains ${chainCount}`;

    console.log(`${bold('◆')} epic:${bold(epic.epic_id)} · ${epicStateLabel(readiness?.readiness_state)} · state:${persistedState} · ${prepSummary} · ${chainSummary}`);

    console.log(`  ${bold('Prep')}`);
    if (epic.prep_jobs.length === 0) {
      console.log(dim('    (none)'));
    } else {
      for (const prepJob of epic.prep_jobs) {
        if (prepJob.status === 'running') counter.running += 1;
        if (prepJob.status === 'waiting') counter.waiting += 1;
        console.log(renderJobLine(prepJob, beadTitles, '    ', ''));
      }
    }

    console.log(`  ${bold('Chains')}`);
    if (epic.chains.length === 0) {
      console.log(dim('    (none)'));
    } else {
      for (const chain of epic.chains) {
        const chainReadiness = readiness?.chains.find((entry) => entry.chain_id === chain.chain_id);
        const readinessLabel = chainReadiness ? ` · ${chainReadiness.state}` : '';
        const rootBeadSuffix = chain.chain_root_bead_id ? ` · root:${chain.chain_root_bead_id}` : '';
        console.log(`    ${bold(chain.chain_id)}${dim(rootBeadSuffix)}${dim(readinessLabel)}`);

        for (const tree of chain.trees) {
          const branch = tree.branch ?? 'master';
          console.log(`      ${dim(branch)}`);
          renderTreeNodes(tree.children, beadTitles, '      ', counter);
        }
      }
    }

    console.log('');
  }

  const legacyNodes = nodes.filter((node) => !node.members.some((member) => member.epic_id));
  const legacyTrees = trees.filter((tree) => !tree.children.some((child) => child.epic_id));

  for (const node of legacyNodes) {
    console.log(`${cyan('⬢')} ${node.node_id} · ${node.node_name} · ${statusLabel(node.status as JobState)} · ${node.member_count} members`);
    for (const member of node.members) {
      if (member.status === 'running') counter.running += 1;
      if (member.status === 'waiting') counter.waiting += 1;
      console.log(renderJobLine(member, beadTitles, '    ', ''));
    }
    console.log('');
  }

  for (const tree of legacyTrees) {
    const branch = tree.branch ?? 'master';
    const beadId = tree.children[0]?.bead_id;
    const beadSuffix = beadId ? ` · ${beadId}` : '';
    console.log(`${dim(branch)}${dim(beadSuffix)}`);

    renderTreeNodes(tree.children, beadTitles, '', counter);
    console.log('');
  }

  if (epicGroups.length === 0 && legacyNodes.length === 0 && legacyTrees.length === 0) {
    console.log(dim('  no active jobs'));
    console.log('');
  }

  console.log(dim(`${jobs.length} jobs · ${epicGroups.length} epics · ${legacyNodes.length} nodes · ${legacyTrees.length} worktrees · ${counter.running} running · ${counter.waiting} waiting${all ? ' · include terminal' : ''}`));
}

function renderInspect(jobId: string): void {
  const statuses = withPidLiveness(loadStatuses());
  const epicReadiness = resolveEpicReadinessMap(statuses);
  const job = statuses.find((s) => s.id.startsWith(jobId));
  if (!job) {
    console.error(`Job not found: ${jobId}`);
    process.exitCode = 1;
    return;
  }

  const beadTitles = buildBeadTitleCache([job]);
  const beadTitle = job.bead_id ? beadTitles.get(job.bead_id) : undefined;
  const ctx = job.context_pct !== undefined ? `${Math.round(job.context_pct)}% ${job.context_health ?? ''}` : '--';
  const deadLabel = job.is_dead ? ` ${red('dead')}` : '';

  // Find chain via worktree_owner_job_id
  const chainJobs = job.worktree_owner_job_id
    ? statuses.filter((s) => s.worktree_owner_job_id === job.worktree_owner_job_id).sort((a, b) => a.started_at_ms - b.started_at_ms)
    : [job];
  const chainStr = chainJobs.map((j) => j.id === job.id ? bold(j.id) : dim(j.id)).join(' → ');

  console.log(`\n${job.id}  ${job.specialist}  ${getStatusIcon(toJobNode(job))} ${statusLabel(job.status)}  ${ctx}${deadLabel}`);
  if (job.epic_id) {
    const readiness = epicReadiness.get(job.epic_id);
    const readinessSuffix = readiness ? ` · ${readiness.readiness_state} (${readiness.persisted_state})` : '';
    console.log(`  epic      ${job.epic_id}${readinessSuffix}`);
  }
  console.log(`  model     ${job.model ?? '--'} ${job.backend ? `(${job.backend})` : ''}`);
  if (job.bead_id) console.log(`  bead      ${job.bead_id}${beadTitle ? ` — ${beadTitle}` : ''}`);
  if (job.worktree_path || job.branch) {
    const wt = job.worktree_path ? dim(` ${job.worktree_path}`) : '';
    console.log(`  worktree  ${job.branch ?? 'master'}${wt}`);
  }
  const chainRole = job.chain_kind === 'chain' ? 'chain' : 'prep';
  const chainIdentity = job.chain_kind === 'chain' ? (job.chain_id ?? job.worktree_owner_job_id ?? '--') : '--';
  console.log(`  role      ${chainRole}`);
  console.log(`  chain_id  ${chainIdentity}`);
  if (chainJobs.length > 1) console.log(`  chain     ${chainStr}`);
  console.log(`  elapsed   ${formatElapsed(job.elapsed_s)}${job.metrics ? ` · ${job.metrics.turns ?? 0} turns · ${job.metrics.tool_calls ?? 0} tools` : ''}`);
  const tokenUsage = job.metrics?.token_usage;
  const tokenSummaryParts = formatTokenUsageSummary(tokenUsage).filter((part) => !part.startsWith('cost='));
  if (tokenSummaryParts.length > 0) {
    console.log(`  tokens    ${tokenSummaryParts.join(' · ')}`);
  }
  const formattedCost = formatCostUsd(tokenUsage?.cost_usd);
  if (formattedCost) {
    console.log(`  cost_usd  ${formattedCost}`);
  }
  console.log(`  context   ${ctx}`);
  if (job.current_tool) console.log(`  current   ${job.current_tool}`);
  const inspectActions: string[] = [];
  if (job.status === 'running' || job.status === 'starting') inspectActions.push(`feed -f ${job.id}`);
  if (job.status === 'waiting') inspectActions.push(`resume ${job.id} "..."`);
  if (job.status === 'running') inspectActions.push(`steer ${job.id} "..."`);
  if (job.tmux_session) inspectActions.push(`attach ${job.id}`);
  if (job.status === 'done' || job.status === 'error') inspectActions.push(`result ${job.id}`);
  if (job.is_dead) inspectActions.push('clean --zombies');
  console.log(`\n  ${dim(inspectActions.join(' | '))}`);
}

function renderJson(
  jobs: Array<SupervisorStatus & { is_dead: boolean }>,
  nodes: NodeTree[],
  trees: WorktreeTree[],
  _all: boolean,
  epicReadiness: EpicReadinessMap,
  args: PsArgs,
): void {
  console.log(JSON.stringify({
    generated_at_ms: Date.now(),
    include_terminal: _all,
    include_merged: args.includeMerged,
    counts: {
      jobs: jobs.length,
      nodes: nodes.length,
      trees: trees.length,
    },
    flat: jobs.map((job) => ({
      id: job.id,
      specialist: job.specialist,
      status: job.status,
      pid: job.pid,
      is_dead: job.is_dead,
      bead_id: job.bead_id,
      bead_title: (job as SupervisorStatus & { bead_title?: string }).bead_title,
      node_id: job.node_id,
      worktree_owner_job_id: job.worktree_owner_job_id,
      reused_from_job_id: job.reused_from_job_id,
      worktree_path: job.worktree_path,
      branch: job.branch,
      epic_id: job.epic_id,
      chain_kind: job.chain_kind,
      chain_id: job.chain_id,
      chain_root_job_id: job.chain_root_job_id,
      chain_root_bead_id: job.chain_root_bead_id,
      started_at_ms: job.started_at_ms,
      elapsed_s: job.elapsed_s,
      context_pct: job.context_pct,
      context_health: job.context_health,
    })),
    nodes,
    trees,
    epics: buildEpicGroups(jobs, epicReadiness),
    epic_readiness: Object.fromEntries([...epicReadiness.entries()].map(([epicId, summary]) => [epicId, summary])),
  }, null, 2));
}

function render(args: PsArgs): void {
  const statusesWithLiveness = withPidLiveness(loadStatuses());
  const epicReadiness = resolveEpicReadinessMap(statusesWithLiveness);

  const visibleStatuses = statusesWithLiveness.filter((job) => {
    const readiness = job.epic_id ? epicReadiness.get(job.epic_id) : undefined;
    const readinessState = readiness?.readiness_state;

    if (readinessState === 'merged' && !args.includeMerged && !args.all) return false;
    if (args.all) return true;
    if (job.is_dead) return false;
    if (isVisibleStatus(job.status, false)) return true;

    if (!job.epic_id) return false;
    if (!TERMINAL_STATES.includes(job.status)) return false;
    if (readinessState === 'merged' || readinessState === 'abandoned') return false;
    return true;
  });

  const nodes = groupByNode(visibleStatuses);
  const trees = groupByTree(visibleStatuses);

  if (args.json) {
    renderJson(visibleStatuses, nodes, trees, args.all, epicReadiness, args);
    return;
  }

  renderHuman(visibleStatuses, nodes, trees, args.all, epicReadiness);
}

function renderBuffered(args: PsArgs): string {
  const lines: string[] = [];
  const origLog = console.log;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.log = (...logArgs: any[]) => lines.push(logArgs.map(String).join(' '));
  try {
    render(args);
  } finally {
    console.log = origLog;
  }
  return lines.join('\n');
}

async function follow(args: PsArgs): Promise<void> {
  process.stdout.write('\x1B[?25l'); // hide cursor while updating
  process.on('exit', () => process.stdout.write('\x1B[?25h')); // restore on exit

  process.stdout.write(renderBuffered(args) + '\n');

  await new Promise<void>(() => {
    setInterval(() => {
      const content = renderBuffered(args);
      // Move cursor to home, write new content, clear from cursor to end of screen
      process.stdout.write('\x1B[H' + content + '\n\x1B[J');
    }, 1000);
  });
}

export async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  if (args.inspectId) {
    renderInspect(args.inspectId);
    return;
  }
  if (args.follow) {
    await follow(args);
    return;
  }
  render(args);
}
