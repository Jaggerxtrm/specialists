import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bold, cyan, dim, green, magenta, red, yellow } from './format-helpers.js';
import type { SupervisorStatus } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';

type JobState = SupervisorStatus['status'];

interface PsArgs {
  json: boolean;
  all: boolean;
  follow: boolean;
}

interface JobNode {
  kind: 'job';
  id: string;
  specialist: string;
  status: JobState;
  bead_id?: string;
  bead_title?: string;
  node_id?: string;
  worktree_owner_job_id?: string;
  reused_from_job_id?: string;
  worktree_path?: string;
  branch?: string;
  started_at_ms: number;
  elapsed_s?: number;
  context_pct?: number;
  context_health?: SupervisorStatus['context_health'];
  children: JobNode[];
}

interface NodeGroup {
  kind: 'node';
  node_id: string;
  children: JobNode[];
}

interface WorktreeTree {
  owner_job_id: string;
  worktree_path?: string;
  branch?: string;
  children: Array<JobNode | NodeGroup>;
}

const ACTIVE_STATES: readonly JobState[] = ['starting', 'running', 'waiting'];
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
  return {
    json: argv.includes('--json'),
    all: argv.includes('--all'),
    follow: argv.includes('--follow') || argv.includes('-f'),
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

function toJobNode(job: SupervisorStatus): JobNode {
  const beadAwareStatus = job as SupervisorStatus & { bead_title?: string };

  return {
    kind: 'job',
    id: job.id,
    specialist: job.specialist,
    status: job.status,
    bead_id: job.bead_id,
    bead_title: beadAwareStatus.bead_title,
    node_id: job.node_id,
    worktree_owner_job_id: job.worktree_owner_job_id,
    reused_from_job_id: job.reused_from_job_id,
    worktree_path: job.worktree_path,
    branch: job.branch,
    started_at_ms: job.started_at_ms,
    elapsed_s: job.elapsed_s,
    context_pct: job.context_pct,
    context_health: job.context_health,
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
    const ownerId = job.worktree_owner_job_id ?? job.id;
    if (!groups.has(ownerId)) groups.set(ownerId, []);
    groups.get(ownerId)!.push(job);
  }

  const trees: WorktreeTree[] = [];

  const sortedGroups = [...groups.entries()].sort(([ownerA, jobsA], [ownerB, jobsB]) => {
    const urgencyDelta = getTreeUrgency(jobsB) - getTreeUrgency(jobsA);
    if (urgencyDelta !== 0) return urgencyDelta;
    const startDelta = getTreeNewestStart(jobsB) - getTreeNewestStart(jobsA);
    if (startDelta !== 0) return startDelta;
    return ownerA.localeCompare(ownerB);
  });

  for (const [ownerJobId, treeJobs] of sortedGroups) {
    const representative = treeJobs.find((job) => job.id === ownerJobId) ?? treeJobs[0];
    const nonNodeJobs = treeJobs.filter((job) => !job.node_id);
    const nodeBuckets = new Map<string, SupervisorStatus[]>();

    for (const nodeJob of treeJobs.filter((job) => Boolean(job.node_id))) {
      const nodeId = nodeJob.node_id!;
      if (!nodeBuckets.has(nodeId)) nodeBuckets.set(nodeId, []);
      nodeBuckets.get(nodeId)!.push(nodeJob);
    }

    const children: Array<JobNode | NodeGroup> = [
      ...buildReuseForest(nonNodeJobs),
      ...[...nodeBuckets.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([nodeId, nodeJobs]) => ({
          kind: 'node' as const,
          node_id: nodeId,
          children: buildReuseForest(nodeJobs),
        })),
    ];

    trees.push({
      owner_job_id: ownerJobId,
      worktree_path: representative.worktree_path,
      branch: representative.branch,
      children,
    });
  }

  return trees;
}

function statusLabel(status: JobState): string {
  if (status === 'running') return cyan(status);
  if (status === 'waiting') return magenta(status);
  if (status === 'done') return green(status);
  if (status === 'error') return red(status);
  return yellow(status);
}

function formatElapsed(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '--';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m${String(remainder).padStart(2, '0')}s`;
}

function formatContextPct(contextPct: number | undefined): string {
  if (contextPct === undefined || !Number.isFinite(contextPct)) return '--';
  return `${Math.round(contextPct)}%`;
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

function renderJobLine(job: JobNode, beadTitles: Map<string, string>, prefix = ''): void {
  const beadTitle = job.bead_id ? beadTitles.get(job.bead_id) : undefined;
  const beadLabel = job.bead_id
    ? `${job.bead_id}${beadTitle ? ` ${beadTitle}` : ''}`
    : '-';
  const context = dim(formatContextPct(job.context_pct).padStart(4));
  const elapsed = dim(formatElapsed(job.elapsed_s).padStart(6));
  console.log(`${prefix}${dim(job.id)} ${job.specialist} ${context} ${elapsed} ${beadLabel} ${statusLabel(job.status)}`);
}

function renderTreeJobs(items: Array<JobNode | NodeGroup>, beadTitles: Map<string, string>, indent = ''): void {
  for (const item of items) {
    if (item.kind === 'node') {
      console.log(`${indent}${bold(`node:${item.node_id}`)}`);
      renderTreeJobs(item.children, beadTitles, `${indent}  `);
      continue;
    }

    renderJobLine(item, beadTitles, `${indent}- `);
    if (item.children.length > 0) renderTreeJobs(item.children, beadTitles, `${indent}  `);
  }
}

function renderHuman(jobs: SupervisorStatus[], trees: WorktreeTree[], all: boolean): void {
  const beadTitles = buildBeadTitleCache(jobs);

  console.log(`\n${bold(all ? 'Jobs' : 'Active jobs')} (${jobs.length})\n`);
  for (const job of jobs) {
    renderJobLine(toJobNode(job), beadTitles);
  }

  console.log(`\n${bold('Worktree trees')} (${trees.length})\n`);
  for (const tree of trees) {
    const where = tree.worktree_path ? dim(` ${tree.worktree_path}`) : '';
    const branch = tree.branch ? dim(` (${tree.branch})`) : '';
    console.log(`${bold(tree.owner_job_id)}${branch}${where}`);
    renderTreeJobs(tree.children, beadTitles, '  ');
    console.log('');
  }
}

function renderJson(jobs: SupervisorStatus[], trees: WorktreeTree[], all: boolean): void {
  console.log(JSON.stringify({
    generated_at_ms: Date.now(),
    include_terminal: all,
    counts: {
      jobs: jobs.length,
      trees: trees.length,
    },
    flat: jobs.map((job) => ({
      id: job.id,
      specialist: job.specialist,
      status: job.status,
      bead_id: job.bead_id,
      bead_title: (job as SupervisorStatus & { bead_title?: string }).bead_title,
      node_id: job.node_id,
      worktree_owner_job_id: job.worktree_owner_job_id,
      reused_from_job_id: job.reused_from_job_id,
      worktree_path: job.worktree_path,
      branch: job.branch,
      started_at_ms: job.started_at_ms,
      elapsed_s: job.elapsed_s,
      context_pct: job.context_pct,
      context_health: job.context_health,
    })),
    trees,
  }, null, 2));
}

function render(args: PsArgs): void {
  const statuses = loadStatuses().filter((job) => isVisibleStatus(job.status, args.all));
  const trees = groupByTree(statuses);

  if (args.json) {
    renderJson(statuses, trees, args.all);
    return;
  }

  renderHuman(statuses, trees, args.all);
}

async function follow(args: PsArgs): Promise<void> {
  render(args);

  await new Promise<void>(() => {
    setInterval(() => {
      process.stdout.write('\x1Bc');
      render(args);
    }, 1000);
  });
}

export async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  if (args.follow) {
    await follow(args);
    return;
  }
  render(args);
}
