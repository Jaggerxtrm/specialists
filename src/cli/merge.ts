import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { resolveJobsDir } from '../specialist/job-root.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';

interface MergeCliOptions {
  target: string;
  rebuild: boolean;
}

interface BeadSummary {
  id: string;
  title: string;
  issue_type?: string;
  parent?: string;
  dependencies?: Array<{ id?: string }>;
}

interface JobStatusRecord {
  id: string;
  bead_id?: string;
  status?: string;
  branch?: string;
  worktree_path?: string;
  started_at_ms?: number;
}

export interface ChainMergeTarget {
  beadId: string;
  branch: string;
  jobId: string;
  jobStatus: string;
  startedAtMs: number;
}

interface MergeStepResult {
  beadId: string;
  branch: string;
  changedFiles: string[];
}

const TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled']);

function parseOptions(argv: readonly string[]): MergeCliOptions {
  let target = '';
  let rebuild = false;

  for (const argument of argv) {
    if (argument === '--rebuild') {
      rebuild = true;
      continue;
    }

    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (target) {
      throw new Error('Only one merge target is supported');
    }
    target = argument;
  }

  if (!target) {
    throw new Error('Missing merge target');
  }

  return { target, rebuild };
}

function runCommand(command: string, args: readonly string[], cwd = process.cwd()) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function readBead(id: string): BeadSummary {
  const result = runCommand('bd', ['show', id, '--json']);
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`Unable to read bead '${id}'`);
  }

  const parsed = readJson<unknown>(result.stdout);
  const bead = Array.isArray(parsed) ? parsed[0] : parsed;

  if (!bead || typeof bead !== 'object') {
    throw new Error(`Unexpected bd show payload for '${id}'`);
  }

  const maybe = bead as BeadSummary;
  if (!maybe.id || !maybe.title) {
    throw new Error(`Invalid bead record for '${id}'`);
  }

  return maybe;
}

export function parseChildBeadIds(childrenOutput: string): string[] {
  const ids = childrenOutput
    .split('\n')
    .map(line => line.match(/(unitAI-[a-z0-9]+)/i)?.[1] ?? '')
    .filter(Boolean);
  return [...new Set(ids)];
}

function readEpicChildIds(epicId: string): string[] {
  // Try --json mode first (newer bd versions)
  let result = runCommand('bd', ['children', epicId, '--json']);
  if (result.status === 0) {
    const parsed = readJson<Array<{ id?: string }>>(result.stdout);
    if (Array.isArray(parsed)) {
      const ids = parsed.map(row => row.id).filter((id): id is string => Boolean(id));
      return [...new Set(ids)];
    }
    // Command succeeded but JSON parse failed — fall through to text parse
    const idsFromText = parseChildBeadIds(result.stdout);
    if (idsFromText.length === 0) {
      throw new Error(`No children found for epic '${epicId}'`);
    }
    return idsFromText;
  }

  // Fallback: retry without --json (older bd versions or --json unsupported)
  result = runCommand('bd', ['children', epicId]);
  if (result.status !== 0) {
    throw new Error(`Unable to load children for epic '${epicId}'`);
  }
  const idsFromText = parseChildBeadIds(result.stdout);
  if (idsFromText.length === 0) {
    throw new Error(`No children found for epic '${epicId}'`);
  }
  return idsFromText;
}

export function resolveChainEpicMembership(chainRootBeadId: string): { epicId?: string; source: 'sqlite' | 'bead-parent' | 'none' } {
  const sqliteClient = createObservabilitySqliteClient();
  if (sqliteClient) {
    try {
      const membership = sqliteClient.resolveEpicByChainRootBeadId(chainRootBeadId);
      if (membership?.epic_id) {
        return { epicId: membership.epic_id, source: 'sqlite' };
      }
    } finally {
      sqliteClient.close();
    }
  }

  const bead = readBead(chainRootBeadId);
  if (bead.parent) {
    return { epicId: bead.parent, source: 'bead-parent' };
  }

  return { source: 'none' };
}

function readAllJobStatuses(): JobStatusRecord[] {
  const jobsDir = resolveJobsDir();
  if (!existsSync(jobsDir)) return [];

  const entries = readdirSync(jobsDir, { withFileTypes: true });
  const statuses: JobStatusRecord[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const statusPath = join(jobsDir, entry.name, 'status.json');
    if (!existsSync(statusPath)) continue;

    const parsed = readJson<JobStatusRecord>(readFileSync(statusPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') continue;
    statuses.push(parsed);
  }

  return statuses;
}

function selectNewestChainRootJob(beadId: string, statuses: readonly JobStatusRecord[]): ChainMergeTarget | null {
  const candidates = statuses
    .filter(status => status.bead_id === beadId && status.branch && status.worktree_path)
    .sort((left, right) => (right.started_at_ms ?? 0) - (left.started_at_ms ?? 0));

  const selected = candidates[0];
  if (!selected || !selected.branch || !selected.status || !selected.id) return null;

  return {
    beadId,
    branch: selected.branch,
    jobId: selected.id,
    jobStatus: selected.status,
    startedAtMs: selected.started_at_ms ?? 0,
  };
}

function ensureTerminalJobs(chains: readonly ChainMergeTarget[]): void {
  const running = chains.filter(chain => !TERMINAL_STATUSES.has(chain.jobStatus));
  if (running.length === 0) return;

  const lines = running.map(chain => `- ${chain.beadId} (${chain.jobId}): ${chain.jobStatus}`);
  throw new Error(`Refusing merge: non-terminal chain jobs\n${lines.join('\n')}`);
}

export function topologicallySortChains(
  chains: readonly ChainMergeTarget[],
  dependenciesByBeadId: ReadonlyMap<string, readonly string[]>,
): ChainMergeTarget[] {
  const byId = new Map(chains.map(chain => [chain.beadId, chain]));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const chain of chains) {
    indegree.set(chain.beadId, 0);
    adjacency.set(chain.beadId, []);
  }

  for (const chain of chains) {
    const dependencies = dependenciesByBeadId.get(chain.beadId) ?? [];
    for (const dependencyId of dependencies) {
      if (!byId.has(dependencyId)) continue;
      adjacency.get(dependencyId)?.push(chain.beadId);
      indegree.set(chain.beadId, (indegree.get(chain.beadId) ?? 0) + 1);
    }
  }

  const queue = [...chains]
    .filter(chain => (indegree.get(chain.beadId) ?? 0) === 0)
    .sort((left, right) => left.startedAtMs - right.startedAtMs)
    .map(chain => chain.beadId);

  const ordered: ChainMergeTarget[] = [];

  while (queue.length > 0) {
    const beadId = queue.shift();
    if (!beadId) continue;

    const chain = byId.get(beadId);
    if (chain) {
      ordered.push(chain);
    }

    const dependents = adjacency.get(beadId) ?? [];
    for (const dependentId of dependents) {
      const nextIndegree = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(dependentId);
      }
    }
  }

  if (ordered.length !== chains.length) {
    throw new Error('Unable to compute merge order: dependency cycle detected');
  }

  return ordered;
}

function loadDependenciesFor(beadIds: readonly string[]): Map<string, readonly string[]> {
  const selected = new Set(beadIds);
  const dependenciesByBeadId = new Map<string, readonly string[]>();

  for (const beadId of beadIds) {
    const bead = readBead(beadId);
    const dependencyIds = (bead.dependencies ?? [])
      .map(dep => dep.id)
      .filter((id): id is string => {
        if (!id) return false;
        return selected.has(id);
      });
    dependenciesByBeadId.set(beadId, dependencyIds);
  }

  return dependenciesByBeadId;
}

export function resolveMergeTargets(target: string): ChainMergeTarget[] {
  const bead = readBead(target);
  const statuses = readAllJobStatuses();

  if (bead.issue_type !== 'epic') {
    const chain = selectNewestChainRootJob(target, statuses);
    if (!chain) {
      throw new Error(`No chain-root job with worktree metadata found for bead '${target}'`);
    }
    resolveChainEpicMembership(chain.beadId);
    ensureTerminalJobs([chain]);
    return [chain];
  }

  const childIds = readEpicChildIds(target);
  const chains = childIds
    .map(childId => selectNewestChainRootJob(childId, statuses))
    .filter((chain): chain is ChainMergeTarget => Boolean(chain));

  if (chains.length === 0) {
    throw new Error(`No mergeable chain branches found under epic '${target}'`);
  }

  ensureTerminalJobs(chains);

  const dependenciesByBeadId = loadDependenciesFor(chains.map(chain => chain.beadId));
  return topologicallySortChains(chains, dependenciesByBeadId);
}

function readChangedFilesForHead(): string[] {
  const diff = runCommand('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']);
  if (diff.status !== 0) return [];
  return diff.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function getConflictFiles(): string[] {
  const result = runCommand('git', ['diff', '--name-only', '--diff-filter=U']);
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function mergeBranch(branch: string): void {
  const result = runCommand('git', ['merge', branch, '--no-ff', '--no-edit']);
  if (result.status === 0) return;

  const conflicts = getConflictFiles();
  const context = conflicts.length > 0
    ? `\nConflicting files:\n${conflicts.map(file => `- ${file}`).join('\n')}`
    : '';

  throw new Error(`Merge conflict while merging '${branch}'.${context}`);
}

function runTypecheckGate(): void {
  const tsc = runCommand('bunx', ['tsc', '--noEmit']);
  if (tsc.status === 0) return;

  const stderr = tsc.stderr.trim();
  const stdout = tsc.stdout.trim();
  throw new Error(`TypeScript gate failed after merge.\n${stderr || stdout || 'Unknown tsc error'}`);
}

function runRebuild(): void {
  const build = runCommand('bun', ['run', 'build']);
  if (build.status === 0) return;

  const stderr = build.stderr.trim();
  const stdout = build.stdout.trim();
  throw new Error(`Rebuild failed.\n${stderr || stdout || 'Unknown build error'}`);
}

function printSummary(steps: readonly MergeStepResult[], rebuild: boolean): void {
  console.log('Merge complete.');
  console.log('Merged branches (in order):');
  for (const step of steps) {
    console.log(`- ${step.branch} (${step.beadId})`);
    if (step.changedFiles.length === 0) {
      console.log('  files: (none)');
      continue;
    }
    console.log(`  files: ${step.changedFiles.join(', ')}`);
  }

  console.log('TypeScript gate: passed after each merge');
  if (rebuild) {
    console.log('Rebuild: bun run build (passed)');
  }
}

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error('Usage: specialists|sp merge <target-bead-id> [--rebuild]');
  process.exit(1);
}

export async function run(): Promise<void> {
  let options: MergeCliOptions;
  try {
    options = parseOptions(process.argv.slice(3));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    printUsageAndExit(message);
  }

  const targets = resolveMergeTargets(options.target);
  const mergedSteps: MergeStepResult[] = [];

  for (const target of targets) {
    mergeBranch(target.branch);
    runTypecheckGate();
    mergedSteps.push({
      beadId: target.beadId,
      branch: target.branch,
      changedFiles: readChangedFilesForHead(),
    });
  }

  if (options.rebuild) {
    runRebuild();
  }

  printSummary(mergedSteps, options.rebuild);
}
