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
  current_event?: string;
  current_tool?: string;
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
  return {
    kind: 'job',
    id: job.id,
    specialist: job.specialist,
    status: job.status,
    current_event: job.current_event,
    current_tool: job.current_tool,
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

function groupByTree(jobs: SupervisorStatus[]): WorktreeTree[] {
  const groups = new Map<string, SupervisorStatus[]>();

  for (const job of jobs) {
    const ownerId = job.worktree_owner_job_id ?? job.id;
    if (!groups.has(ownerId)) groups.set(ownerId, []);
    groups.get(ownerId)!.push(job);
  }

  const trees: WorktreeTree[] = [];

  for (const [ownerJobId, treeJobs] of groups.entries()) {
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

  return trees.sort((a, b) => a.owner_job_id.localeCompare(b.owner_job_id));
}

function statusLabel(status: JobState): string {
  if (status === 'running') return cyan(status);
  if (status === 'waiting') return magenta(status);
  if (status === 'done') return green(status);
  if (status === 'error') return red(status);
  return yellow(status);
}

function getStatusIcon(job: JobNode, frame: number): string {
  if (job.status === 'running') return cyan(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
  if (job.status === 'waiting') return magenta('⏸');
  if (job.status === 'done') return green('✓');
  if (job.status === 'error') return red('✖');
  return yellow('…');
}

function getElapsedSeconds(job: JobNode, nowMs: number): number {
  if (job.status === 'running' || job.status === 'waiting' || job.status === 'starting') {
    return Math.max(0, Math.floor((nowMs - job.started_at_ms) / 1000));
  }
  return Math.max(0, job.elapsed_s ?? 0);
}

function getActivity(job: JobNode): string {
  if (job.current_tool) return dim(` tool=${job.current_tool}`);
  if (job.current_event) return dim(` event=${job.current_event}`);
  return '';
}

function renderJobLine(job: JobNode, nowMs: number, frame: number, prefix = ''): void {
  const context = typeof job.context_pct === 'number'
    ? dim(` context=${job.context_pct.toFixed(2)}%${job.context_health ? `(${job.context_health})` : ''}`)
    : '';
  const elapsed = dim(` ${getElapsedSeconds(job, nowMs)}s`);
  console.log(`${prefix}${getStatusIcon(job, frame)} ${dim(job.id)} ${job.specialist} ${statusLabel(job.status)}${elapsed}${getActivity(job)}${context}`);
}

function renderTreeJobs(items: Array<JobNode | NodeGroup>, nowMs: number, frame: number, indent = ''): void {
  for (const item of items) {
    if (item.kind === 'node') {
      console.log(`${indent}${bold(`node:${item.node_id}`)}`);
      renderTreeJobs(item.children, nowMs, frame, `${indent}  `);
      continue;
    }

    renderJobLine(item, nowMs, frame, `${indent}- `);
    if (item.children.length > 0) renderTreeJobs(item.children, nowMs, frame, `${indent}  `);
  }
}

function renderHuman(jobs: SupervisorStatus[], trees: WorktreeTree[], all: boolean, frame = 0): void {
  const nowMs = Date.now();
  console.log(`\n${bold(all ? 'Jobs' : 'Active jobs')} (${jobs.length}) ${dim(new Date(nowMs).toLocaleTimeString())}\n`);
  for (const job of jobs) {
    renderJobLine(toJobNode(job), nowMs, frame);
  }

  console.log(`\n${bold('Worktree trees')} (${trees.length})\n`);
  for (const tree of trees) {
    const where = tree.worktree_path ? dim(` ${tree.worktree_path}`) : '';
    const branch = tree.branch ? dim(` (${tree.branch})`) : '';
    console.log(`${bold(tree.owner_job_id)}${branch}${where}`);
    renderTreeJobs(tree.children, nowMs, frame, '  ');
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
      current_event: job.current_event,
      current_tool: job.current_tool,
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

function render(args: PsArgs, frame = 0): void {
  const statuses = loadStatuses().filter((job) => isVisibleStatus(job.status, args.all));
  const trees = groupByTree(statuses);

  if (args.json) {
    renderJson(statuses, trees, args.all);
    return;
  }

  renderHuman(statuses, trees, args.all, frame);
}

async function follow(args: PsArgs): Promise<void> {
  if (args.json) {
    render(args);
    return;
  }

  process.stdout.write('\x1B[?25l');
  let frame = 0;

  await new Promise<void>(() => {
    setInterval(() => {
      process.stdout.write('\x1Bc');
      render(args, frame);
      frame += 1;
    }, 120);
  });
}

export async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  if (args.follow) {
    process.on('exit', () => {
      process.stdout.write('\x1B[?25h');
    });
    await follow(args);
    return;
  }
  render(args);
}
