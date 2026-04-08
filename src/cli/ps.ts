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
  started_at_ms: number;
  elapsed_s?: number;
  context_pct?: number;
  context_health?: SupervisorStatus['context_health'];
  children: JobNode[];
}

interface WorktreeTree {
  owner_job_id: string;
  worktree_path?: string;
  branch?: string;
  children: JobNode[];
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
  const positional = argv.filter((a) => !a.startsWith('-'));
  return {
    json: argv.includes('--json'),
    all: argv.includes('--all'),
    follow: argv.includes('--follow') || argv.includes('-f'),
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

    trees.push({
      owner_job_id: ownerJobId,
      worktree_path: representative.worktree_path,
      branch: representative.branch,
      children: buildReuseForest(treeJobs),
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

function isPidAlive(pid: number | undefined): boolean {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isDeadActiveJob(job: SupervisorStatus): boolean {
  if (job.status !== 'running' && job.status !== 'waiting') return false;
  return !isPidAlive(job.pid);
}

function withPidLiveness(statuses: SupervisorStatus[]): Array<SupervisorStatus & { is_dead: boolean }> {
  return statuses.map((job) => ({
    ...job,
    is_dead: isDeadActiveJob(job),
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
  if (job.is_dead) return 'sp clean --zombies';
  if (job.status === 'running' || job.status === 'starting') return `sp feed -f ${job.id}`;
  if (job.status === 'waiting') return `sp resume ${job.id} "next task"`;
  if (job.status === 'done') return `sp result ${job.id}`;
  return `sp result ${job.id}`;
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
  const elapsed = formatElapsed(job.elapsed_s).padStart(7);
  const bead = job.bead_id ? job.bead_id.padEnd(14) : ''.padEnd(14);
  const next = job.is_dead ? red('dead') : dim(getNextAction(job).replace('sp ', ''));
  return `${prefix}${connector}${icon} ${id} ${spec} ${ctx} ${elapsed}  ${bead} ${next}`;
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

function renderHuman(jobs: SupervisorStatus[], trees: WorktreeTree[], all: boolean): void {
  const beadTitles = buildBeadTitleCache(jobs);
  const counter = { running: 0, waiting: 0 };

  console.log('');
  for (const tree of trees) {
    const branch = tree.branch ?? 'master';
    const beadId = tree.children[0]?.bead_id;
    const beadSuffix = beadId ? ` · ${beadId}` : '';
    console.log(`${dim(branch)}${dim(beadSuffix)}`);

    renderTreeNodes(tree.children, beadTitles, '', counter);
    console.log('');
  }

  if (trees.length === 0) {
    console.log(dim('  no active jobs'));
    console.log('');
  }

  console.log(dim(`${jobs.length} jobs · ${trees.length} worktrees · ${counter.running} running · ${counter.waiting} waiting`));
}

function renderInspect(jobId: string): void {
  const statuses = withPidLiveness(loadStatuses());
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
  console.log(`  model     ${job.model ?? '--'} ${job.backend ? `(${job.backend})` : ''}`);
  if (job.bead_id) console.log(`  bead      ${job.bead_id}${beadTitle ? ` — ${beadTitle}` : ''}`);
  if (job.branch) console.log(`  worktree  ${job.branch}`);
  if (chainJobs.length > 1) console.log(`  chain     ${chainStr}`);
  console.log(`  elapsed   ${formatElapsed(job.elapsed_s)}${job.metrics ? ` · ${job.metrics.turns ?? 0} turns · ${job.metrics.tool_calls ?? 0} tools` : ''}`);
  console.log(`  context   ${ctx}`);
  if (job.current_tool) console.log(`  current   ${job.current_tool}`);
  console.log(`\n  ${dim(getNextAction(toJobNode(job)))}`);
}

function renderJson(jobs: Array<SupervisorStatus & { is_dead: boolean }>, trees: WorktreeTree[], _all: boolean): void {
  console.log(JSON.stringify({
    generated_at_ms: Date.now(),
    include_terminal: _all,
    counts: {
      jobs: jobs.length,
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
      started_at_ms: job.started_at_ms,
      elapsed_s: job.elapsed_s,
      context_pct: job.context_pct,
      context_health: job.context_health,
    })),
    trees,
  }, null, 2));
}

function render(args: PsArgs): void {
  const statusesWithLiveness = withPidLiveness(loadStatuses());
  const visibleStatuses = statusesWithLiveness.filter((job) => {
    if (!isVisibleStatus(job.status, args.all)) return false;
    if (args.all) return true;
    return !job.is_dead;
  });
  const trees = groupByTree(visibleStatuses);

  if (args.json) {
    renderJson(visibleStatuses, trees, args.all);
    return;
  }

  renderHuman(visibleStatuses, trees, args.all);
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
