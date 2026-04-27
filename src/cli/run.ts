// src/cli/run.ts

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn as cpSpawn, execSync } from 'node:child_process';
import { SpecialistLoader } from '../specialist/loader.js';
import { SpecialistRunner } from '../specialist/runner.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { HookEmitter } from '../specialist/hooks.js';
import { BeadsClient, buildBeadContext } from '../specialist/beads.js';
import { Supervisor } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { provisionWorktree } from '../specialist/worktree.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import type { TimelineEvent } from '../specialist/timeline-events.js';
import { evaluateMergeWorthiness, previewBranchMergeDelta } from './merge.js';
import { formatEventInlineDebounced, type InlineIndicatorPhase } from './format-helpers.js';
import { isTmuxAvailable, buildSessionName, createTmuxSession } from './tmux-utils.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan  = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Output modes ───────────────────────────────────────────────────────────────
/** Output mode for foreground runs.
 *  - 'human'  (default) formatted event summaries to stdout + final output
 *  - 'json'   NDJSON event stream to stdout, one event per line
 *  - 'raw'    legacy: stream raw onProgress deltas to stdout (backward compat)
 */
type OutputMode = 'human' | 'json' | 'raw';

// ── Arg parser ─────────────────────────────────────────────────────────────────
interface RunArgs {
  name: string;
  prompt: string;
  beadId?: string;
  model?: string;
  noBeads: boolean;
  noBeadNotes: boolean;
  keepAlive?: boolean;
  noKeepAlive: boolean;
  background: boolean;
  contextDepth: number;
  outputMode: OutputMode;
  /** Provision (or reuse) an isolated bd-managed worktree for this run. */
  worktree: boolean;
  /** Reuse the workspace from a prior job. Mutually exclusive with --worktree. */
  reuseJobId?: string;
  /** Bypass reuse guard for active/unknown target job statuses. */
  forceJob: boolean;
  /** Owning epic for wave-bound chains. If --bead is set, defaults to bead.parent. */
  epicId?: string;
  /** Allow provisioning from a potentially stale base branch. */
  forceStaleBase: boolean;
}

async function parseArgs(argv: string[]): Promise<RunArgs> {
  const name = argv[0];
  if (!name || name.startsWith('--')) {
    console.error(
      'Usage: specialists|sp run <name> [--prompt "..."] [--bead <id>] ' +
      '[--worktree] [--job <id>] [--force-job] [--epic <id>] [--force-stale-base] [--context-depth <n>] [--model <model>] ' +
      '[--no-beads] [--no-bead-notes] [--keep-alive|--no-keep-alive] [--json|--raw]',
    );
    process.exit(1);
  }

  let prompt = '';
  let beadId: string | undefined;
  let model: string | undefined;
  let noBeads = false;
  let noBeadNotes = false;
  let keepAlive: boolean | undefined;
  let noKeepAlive = false;
  let background = false;
  let outputMode: OutputMode = 'human';
  let contextDepth = 1;
  let worktree = false;
  let reuseJobId: string | undefined;
  let forceJob = false;
  let epicId: string | undefined;
  let forceStaleBase = false;

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--prompt'         && argv[i + 1]) { prompt       = argv[++i]; continue; }
    if (token === '--bead'           && argv[i + 1]) { beadId       = argv[++i]; continue; }
    if (token === '--model'          && argv[i + 1]) { model        = argv[++i]; continue; }
    if (token === '--context-depth'  && argv[i + 1]) { contextDepth = parseInt(argv[++i], 10) || 0; continue; }
    if (token === '--no-beads')      { noBeads      = true; continue; }
    if (token === '--no-bead-notes') { noBeadNotes  = true; continue; }
    if (token === '--keep-alive')    { keepAlive    = true; noKeepAlive = false; continue; }
    if (token === '--no-keep-alive') { keepAlive    = undefined; noKeepAlive = true; continue; }
    if (token === '--background')    { background   = true; continue; }
    if (token === '--json')          { outputMode   = 'json'; continue; }
    if (token === '--raw')           { outputMode   = 'raw';  continue; }
    if (token === '--worktree')      { worktree     = true; continue; }
    if (token === '--no-worktree')   {
      console.error(
        'Error: --no-worktree has been removed. ' +
        'Edit-capable specialists now auto-provision worktrees. ' +
        'Use --job <id> to reuse an existing worktree.',
      );
      process.exit(1);
    }
    if (token === '--job'            && argv[i + 1]) { reuseJobId   = argv[++i]; continue; }
    if (token === '--force-job')     { forceJob     = true; continue; }
    if (token === '--epic'           && argv[i + 1]) { epicId       = argv[++i]; continue; }
    if (token === '--force-stale-base') { forceStaleBase = true; continue; }
  }

  // ── Mutual exclusion ─────────────────────────────────────────────────────────
  if (worktree && reuseJobId !== undefined) {
    console.error('Error: --worktree and --job are mutually exclusive. Use one or the other.');
    process.exit(1);
  }

  // ── Epic validation ───────────────────────────────────────────────────────────
  // --epic with --job: validate that target job doesn't already belong to a different epic
  if (epicId && reuseJobId !== undefined) {
    // Note: we can't fully validate this here without reading the target job's status.
    // The supervisor will handle this validation when it reads the target status.
    // For now, we just warn the operator that this may be an override.
    process.stderr.write(dim(`[warning: --epic ${epicId} with --job may override target job's epic membership]\n`));
  }

  // ── --worktree requires --bead ───────────────────────────────────────────────
  if (worktree && !beadId) {
    console.error(
      'Error: --worktree requires --bead <id> to derive a deterministic branch name.\n' +
      'Example: specialists run executor --worktree --bead hgpu.3',
    );
    process.exit(1);
  }

  if (prompt && beadId) {
    console.error('Error: use either --prompt or --bead, not both.');
    process.exit(1);
  }

  if (!prompt && !beadId && !process.stdin.isTTY) {
    prompt = await new Promise<string>(resolve => {
      let buf = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', chunk => { buf += chunk; });
      process.stdin.on('end', () => resolve(buf.trim()));
    });
  }

  if (!prompt && !beadId && !reuseJobId) {
    console.error('Error: provide --prompt, pipe stdin, use --bead <id>, or provide --job <id> for bead inference.');
    process.exit(1);
  }

  return {
    name, prompt, beadId, model, noBeads, noBeadNotes, keepAlive, noKeepAlive,
    background, contextDepth, outputMode, worktree, reuseJobId, forceJob, epicId, forceStaleBase,
  };
}

// ── Workspace resolution ──────────────────────────────────────────────────────

/**
 * Resolve the working directory for the run based on --worktree / --job flags.
 *
 * --worktree: provisions (or reuses) a bd-managed worktree derived from the
 *             bead id + specialist name and returns its absolute path.
 *
 * --job <id>: reads the target job status to extract `worktree_path` and
 *             `bead_id`. The inferred bead is used only when --bead is omitted.
 *
 * Returns undefined when neither flag is set (run in current directory).
 */
const BLOCKED_JOB_REUSE_STATUSES = new Set(['starting', 'running']);

interface BdBeadSummary {
  id?: string;
  parent?: string;
  issue_type?: string;
}

function readBeadSummary(beadId: string): BdBeadSummary | null {
  try {
    const raw = execSync(`bd show ${beadId} --json`, {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 5000,
    });
    const parsed = JSON.parse(raw) as unknown;
    const bead = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!bead || typeof bead !== 'object') return null;
    return bead as BdBeadSummary;
  } catch {
    return null;
  }
}

function resolveEpicIdForBead(sqliteClient: NonNullable<ReturnType<typeof createObservabilitySqliteClient>>, beadId: string): string | undefined {
  const membership = sqliteClient.resolveEpicByChainRootBeadId(beadId);
  if (membership?.epic_id) return membership.epic_id;

  const bead = readBeadSummary(beadId);
  if (!bead?.parent) return undefined;

  const parent = readBeadSummary(bead.parent);
  if (parent?.issue_type !== 'epic') return undefined;
  return bead.parent;
}

function assertNoStaleBaseSiblings(beadId: string, forceStaleBase: boolean): void {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) return;

  try {
    const epicId = resolveEpicIdForBead(sqliteClient, beadId);
    if (!epicId) return;

    const siblingChains = sqliteClient
      .listEpicChainsWithLatestJob(epicId)
      .filter((chain) => chain.chain_root_bead_id !== beadId && Boolean(chain.branch));

    const staleSiblings: Array<{ beadId: string; branch: string; chainId: string }> = [];

    for (const sibling of siblingChains) {
      const branch = sibling.branch;
      if (!branch) continue;

      try {
        const preview = previewBranchMergeDelta(branch);
        const decision = evaluateMergeWorthiness(preview);
        if (!decision.shouldMerge) continue;

        staleSiblings.push({
          beadId: sibling.chain_root_bead_id ?? '(unknown-bead)',
          branch,
          chainId: sibling.chain_id,
        });
      } catch {
        // Branch may already be deleted or unavailable locally.
      }
    }

    if (staleSiblings.length === 0) return;
    if (forceStaleBase) {
      process.stderr.write(dim(`[stale-base guard bypassed: ${staleSiblings.length} unmerged sibling chain(s) under epic ${epicId}]\n`));
      return;
    }

    const lines = staleSiblings
      .map((sibling) => `- bead=${sibling.beadId} chain=${sibling.chainId} branch=${sibling.branch}`)
      .join('\n');

    throw new Error(
      `Refusing worktree dispatch for bead '${beadId}': epic '${epicId}' has unmerged sibling chains with substantive commits.\n` +
      `${lines}\n` +
      `Publish the epic first: sp epic merge ${epicId}\n` +
      `If intentional, rerun with --force-stale-base.`,
    );
  } finally {
    sqliteClient.close();
  }
}

function resolveWorkingDirectory(
  args: RunArgs,
  jobsDir: string,
  permissionRequired: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH',
  readStatus: (jobId: string) => {
    id?: string;
    status?: string;
    bead_id?: string;
    worktree_path?: string;
    worktree_owner_job_id?: string;
  } | null,
): {
  workingDirectory?: string;
  reusedFromJobId?: string;
  worktreeOwnerJobId?: string;
  inferredBeadId?: string;
} {
  if (args.worktree) {
    // args.beadId is guaranteed non-null here (parseArgs validates this)
    assertNoStaleBaseSiblings(args.beadId!, args.forceStaleBase);

    const info = provisionWorktree({
      beadId: args.beadId!,
      specialistName: args.name,
    });
    if (info.reused) {
      process.stderr.write(dim(`[worktree reused: ${info.worktreePath}  branch: ${info.branch}]\n`));
    } else {
      process.stderr.write(dim(`[worktree created: ${info.worktreePath}  branch: ${info.branch}]\n`));
    }
    return {
      workingDirectory: info.worktreePath,
    };
  }

  if (args.reuseJobId !== undefined) {
    const targetStatus = readStatus(args.reuseJobId);
    if (!targetStatus) {
      console.error(
        `Error: cannot read status for job '${args.reuseJobId}'. ` +
        `Check the job id with: specialists poll ${args.reuseJobId} --json`,
      );
      process.exit(1);
    }

    const targetJobStatus = targetStatus.status;
    const editCapable = permissionRequired === 'MEDIUM' || permissionRequired === 'HIGH';
    const isBlockedStatus = typeof targetJobStatus === 'string' && BLOCKED_JOB_REUSE_STATUSES.has(targetJobStatus);
    const isKnownAllowedStatus = targetJobStatus === 'waiting'
      || targetJobStatus === 'done'
      || targetJobStatus === 'error'
      || targetJobStatus === 'cancelled';
    const shouldBlockUnknownStatus = editCapable
      && !args.forceJob
      && !isBlockedStatus
      && !isKnownAllowedStatus;

    if (editCapable && !args.forceJob && isBlockedStatus) {
      console.error(
        `Target job ${args.reuseJobId} is still running (status: ${targetJobStatus}). ` +
        `MEDIUM/HIGH specialists cannot enter an active worktree. ` +
        `Wait for completion or use --force-job to override.`,
      );
      process.exit(1);
    }

    if (shouldBlockUnknownStatus) {
      console.error(
        `Target job ${args.reuseJobId} has unknown status '${String(targetJobStatus)}'. ` +
        `MEDIUM/HIGH specialists block on unknown status to avoid concurrent worktree access. ` +
        `Use --force-job to override.`,
      );
      process.exit(1);
    }

    const worktreePath = targetStatus.worktree_path;
    if (!worktreePath) {
      console.error(
        `Error: job '${args.reuseJobId}' has no worktree_path — it was not started with --worktree.`,
      );
      process.exit(1);
    }

    const worktreeOwnerJobId = targetStatus.worktree_owner_job_id ?? targetStatus.id ?? args.reuseJobId;

    process.stderr.write(dim(`[workspace reused from job ${args.reuseJobId}: ${worktreePath}]\n`));
    return {
      workingDirectory: worktreePath,
      reusedFromJobId: args.reuseJobId,
      worktreeOwnerJobId,
      inferredBeadId: targetStatus.bead_id,
    };
  }

  return {};
}

// ── Event tailer ───────────────────────────────────────────────────────────────
/**
 * Tail events.jsonl for a job and emit formatted output to stdout.
 * Polls every 100ms; safe for same-process use (no partial-line risk).
 * Returns a stop() function that does a final drain before returning.
 */
function startEventTailer(
  jobId: string,
  jobsDir: string,
  mode: 'json' | 'human',
  specialist: string,
  beadId?: string,
): () => void {
  const eventsPath = join(jobsDir, jobId, 'events.jsonl');
  let linesRead = 0;
  let activeInlinePhase: InlineIndicatorPhase = null;

  const drain = () => {
    let content: string;
    try { content = readFileSync(eventsPath, 'utf-8'); } catch { return; }
    if (!content) return;

    // Only process up to the last complete line (ends with \n)
    const lastNl = content.lastIndexOf('\n');
    if (lastNl < 0) return;
    const complete = content.slice(0, lastNl);
    const lines = complete.split('\n');

    for (let i = linesRead; i < lines.length; i++) {
      linesRead++;
      const line = lines[i].trim();
      if (!line) continue;
      let event: TimelineEvent;
      try { event = JSON.parse(line) as TimelineEvent; } catch { continue; }

      if (mode === 'json') {
        process.stdout.write(JSON.stringify({ jobId, specialist, beadId, ...event }) + '\n');
      } else {
        // human mode: print output text from run_complete, debounce noisy phase indicators
        if (event.type === 'run_complete' && (event as any).output) {
          activeInlinePhase = null;
          process.stdout.write('\n' + (event as any).output + '\n');
        } else {
          const { line, nextPhase } = formatEventInlineDebounced(event, activeInlinePhase);
          activeInlinePhase = nextPhase;
          if (line) process.stdout.write(line + '\n');
        }
      }
    }
  };

  const intervalId = setInterval(drain, 100);

  return () => {
    clearInterval(intervalId);
    drain(); // final drain: catch events written just before supervisor.run() returned
  };
}

function formatFooterModel(backend: string | undefined, model: string | undefined): string {
  if (!model) return '';
  if (!backend) return model;
  return model.startsWith(`${backend}/`) ? model : `${backend}/${model}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function extractReviewedJobIdOverride(prompt: string): string | undefined {
  const match = prompt.match(/(?:^|\n)\s*reviewed_job_id\s*:\s*([^\n]+)/i);
  const candidate = match?.[1]?.trim();
  return candidate ? candidate : undefined;
}

function buildReusedWorktreeAwarenessBlock(options: {
  reusedFromJobId: string;
  worktreeOwnerJobId?: string;
}): string {
  const owner = options.worktreeOwnerJobId ?? options.reusedFromJobId;
  return [
    '## Reused workspace awareness (from --job)',
    `You are entering an existing worktree reused from job: ${options.reusedFromJobId}.`,
    `Worktree chain owner job: ${owner}.`,
    'Workspace may contain uncommitted edits, staged changes, generated files, or partial fixes from prior handoff steps.',
    'Before edits, run and inspect: git status --short --branch, git diff --stat, git diff --cached --stat.',
    'Treat existing tree state as real input context — do not assume clean baseline.',
  ].join('\n');
}

function buildInjectedReviewerDiffVariables(cwd: string, maxFiles = 20): Record<string, string> {
  const read = (command: string): string => {
    try {
      return execSync(command, {
        cwd,
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch {
      return '';
    }
  };

  const MAX_TOTAL_HUNKS_CHARS = 12_000;
  const MAX_FILE_DIFF_CHARS = 2_000;

  const resolveMergeBase = (): string => {
    const headRef = read('git symbolic-ref refs/remotes/origin/HEAD');
    const baseBranch = headRef ? headRef.split('/').pop() ?? 'main' : 'main';
    return read(`git merge-base ${shellQuote(baseBranch)} HEAD`);
  };

  type Source = {
    label: string;
    statCmd: string;
    namesCmd: string;
    diffCmd: (file: string) => string;
  };

  const mergeBase = resolveMergeBase();
  const sources: Source[] = [
    {
      label: 'unstaged diff',
      statCmd: 'git diff --stat',
      namesCmd: 'git diff --name-only',
      diffCmd: (f) => `git diff -- ${shellQuote(f)}`,
    },
    {
      label: 'staged diff',
      statCmd: 'git diff --cached --stat',
      namesCmd: 'git diff --cached --name-only',
      diffCmd: (f) => `git diff --cached -- ${shellQuote(f)}`,
    },
    ...(mergeBase ? [{
      label: `branch-vs-base diff (${mergeBase.slice(0, 12)}..HEAD)`,
      statCmd: `git diff --stat ${shellQuote(mergeBase)}..HEAD`,
      namesCmd: `git diff --name-only ${shellQuote(mergeBase)}..HEAD`,
      diffCmd: (f: string) => `git diff ${shellQuote(mergeBase)}..HEAD -- ${shellQuote(f)}`,
    }] : []),
  ];

  for (const src of sources) {
    const stat = read(src.statCmd);
    const files = read(src.namesCmd)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, maxFiles);

    if (files.length === 0) continue;

    let remaining = MAX_TOTAL_HUNKS_CHARS;
    const sections: string[] = [];
    for (const file of files) {
      if (remaining <= 0) break;
      const diff = read(src.diffCmd(file));
      const truncated = diff.length > MAX_FILE_DIFF_CHARS
        ? `${diff.slice(0, MAX_FILE_DIFF_CHARS)}
... [truncated]`
        : diff;
      const section = truncated ? `### ${file}\n${truncated}` : `### ${file}\n(no hunks)`;
      if (section.length > remaining) {
        sections.push(`${section.slice(0, remaining)}
... [truncated]`);
        remaining = 0;
        break;
      }
      sections.push(section);
      remaining -= section.length + 2;
    }

    const hunks = sections.join('\n\n');
    if (!hunks.trim()) continue;

    return {
      reviewer_diff_source: `injected diff context (${src.label})`,
      reviewer_diff_stat: stat || '(no stat)',
      reviewer_diff_files: files.join('\n'),
      reviewer_diff_hunks: hunks,
    };
  }

  return {};
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const args = await parseArgs(process.argv.slice(3));
  const loader = new SpecialistLoader();
  const specialist = await loader.get(args.name).catch((err: any) => {
    process.stderr.write(`Error: ${err?.message ?? err}\n`);
    process.exit(1);
  });

  // ── Worktree policy for edit-capable specialists ───────────────────────────
  const permission = specialist.specialist.execution.permission_required;
  const requiresWorktree = specialist.specialist.execution.requires_worktree ?? true;
  const perm: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH' =
    permission === 'LOW' || permission === 'MEDIUM' || permission === 'HIGH'
      ? permission
      : 'READ_ONLY';
  const editCapable = perm === 'MEDIUM' || perm === 'HIGH';
  const shouldAutoProvisionWorktree = editCapable && requiresWorktree && !args.reuseJobId;
  const useWorktree = args.worktree || shouldAutoProvisionWorktree;

  if (shouldAutoProvisionWorktree && !args.beadId) {
    process.stderr.write(
      `Error: specialist '${args.name}' has permission_required=${perm} and requires worktree isolation.\n` +
      `Provide --bead <id> for automatic worktree provisioning, or use --job <id> to reuse an existing worktree.\n`,
    );
    process.exit(1);
  }

  // ── Background mode: spawn detached child and exit ──────────────────────────
  if (args.background) {
    // Jobs dir may be worktree-anchored, but for the latest-poll we use the
    // common-root resolved path to stay consistent with the child process.
    const jobsDir = resolveJobsDir();
    const latestPath = join(jobsDir, 'latest');
    const oldLatest = (() => { try { return readFileSync(latestPath, 'utf-8').trim(); } catch { return ''; } })();
    const cwd = process.cwd();
    const innerArgs = process.argv.slice(2).filter(a => a !== '--background');
    const cmd = `${process.execPath} ${process.argv[1]} ${innerArgs.map(shellQuote).join(' ')}`;

    let childPid: number | undefined;
    if (isTmuxAvailable()) {
      const suffix = randomBytes(3).toString('hex');
      const sessionName = buildSessionName(args.name, suffix);
      createTmuxSession(sessionName, cwd, cmd);
    } else {
      // Re-invoke ourselves without --background, fully detached
      const child = cpSpawn(process.execPath, [process.argv[1], ...innerArgs], {
        detached: true,
        stdio: 'ignore',
        cwd,
        env: process.env,
      });
      child.unref();
      childPid = child.pid;
    }

    // Wait up to 5s for the child to write a new job ID to latest
    const deadline = Date.now() + 5000;
    let jobId = '';
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
      try {
        const current = readFileSync(latestPath, 'utf-8').trim();
        if (current && current !== oldLatest) { jobId = current; break; }
      } catch { /* not yet */ }
    }

    if (jobId) {
      process.stdout.write(`${jobId}\n`);
    } else {
      process.stderr.write('Warning: job started but ID not yet available. Check specialists status.\n');
      process.stdout.write(`${childPid ?? ''}\n`);
    }
    process.exit(0);
  }

  const circuitBreaker = new CircuitBreaker();
  const hooks          = new HookEmitter({ tracePath: join(process.cwd(), '.specialists', 'trace.jsonl') });
  const beadsClient = args.noBeads ? undefined : new BeadsClient();
  // Always create a reader for bead content — --no-beads only suppresses tracking
  const beadReader = beadsClient ?? new BeadsClient();

  let prompt = args.prompt;
  let variables: Record<string, string> | undefined;
  let epicId: string | undefined;
  let effectiveBeadId = args.beadId;

  const runner = new SpecialistRunner({
    loader,
    hooks,
    circuitBreaker,
    beadsClient,
  });
  const beadsWriteNotes = args.noBeadNotes
    ? false
    : (specialist.specialist.beads_write_notes ?? true);

  // ── Resolve jobs dir and optional working directory ─────────────────────────
  // Supervisor resolves this internally too, but we need it here for the tailer.
  const jobsDir = resolveJobsDir();
  const statusReader = new Supervisor({
    runner,
    runOptions: {
      name: args.name,
      prompt,
    },
    jobsDir,
  });

  const {
    workingDirectory,
    reusedFromJobId,
    worktreeOwnerJobId,
    inferredBeadId,
  } = resolveWorkingDirectory(
    {
      ...args,
      worktree: useWorktree,
    },
    jobsDir,
    perm,
    (jobId) => statusReader.readStatus(jobId),
  );
  await statusReader.dispose();

  if (!effectiveBeadId && inferredBeadId) {
    effectiveBeadId = inferredBeadId;
    console.error(`[input bead auto-resolved from job ${args.reuseJobId}: ${inferredBeadId}]`);
  }

  if (effectiveBeadId) {
    const bead = beadReader.readBead(effectiveBeadId);
    if (!bead) {
      const inferredFromJob = !args.beadId && inferredBeadId && effectiveBeadId === inferredBeadId;
      if (inferredFromJob) {
        throw new Error(`Unable to read inferred bead '${effectiveBeadId}' from --job '${args.reuseJobId}' via bd show --json`);
      }
      throw new Error(`Unable to read bead '${effectiveBeadId}' via bd show --json`);
    }

    const blockers = (args.contextDepth > 0)
      ? beadReader.getCompletedBlockers(effectiveBeadId, args.contextDepth)
      : [];

    if (blockers.length > 0) {
      process.stderr.write(dim(`\n[context: ${blockers.length} completed dep${blockers.length > 1 ? 's' : ''} injected]\n`));
    }

    const beadContext = buildBeadContext(bead, blockers);
    prompt = beadContext;
    epicId = args.epicId ?? bead.parent;
    variables = {
      ...(variables ?? {}),
      bead_context: beadContext,
      bead_id: effectiveBeadId,
    };
  } else if (args.epicId) {
    epicId = args.epicId;
  }

  variables = {
    ...(variables ?? {}),
    reused_worktree_awareness: '',
  };

  if (args.reuseJobId) {
    const reviewedJobId = extractReviewedJobIdOverride(prompt) ?? args.reuseJobId;
    const injectedReviewerDiffVariables = workingDirectory && args.name === 'reviewer'
      ? buildInjectedReviewerDiffVariables(workingDirectory)
      : {};
    variables = {
      ...(variables ?? {}),
      reviewed_job_id: reviewedJobId,
      reused_worktree_awareness: buildReusedWorktreeAwarenessBlock({
        reusedFromJobId: args.reuseJobId,
        worktreeOwnerJobId,
      }),
      ...injectedReviewerDiffVariables,
    };
  }

  if (!prompt && !effectiveBeadId) {
    console.error('Error: provide --prompt, pipe stdin, use --bead <id>, or provide --job <id> for bead inference.');
    process.exit(1);
  }

  let stopTailer: (() => void) | undefined;

  const supervisor = new Supervisor({
    runner,
    runOptions: {
      name: args.name,
      prompt,
      variables,
      backendOverride: args.model,
      inputBeadId: effectiveBeadId,
      epicId,
      keepAlive: args.keepAlive,
      noKeepAlive: args.noKeepAlive,
      beadsWriteNotes,
      workingDirectory,
      reusedFromJobId,
      worktreeOwnerJobId,
    },
    // jobsDir intentionally omitted — Supervisor derives it from workingDirectory
    // via resolveJobsDir() so all worktree sessions share the same state root.
    beadsClient,
    stallDetection: specialist.specialist.stall_detection,
    // raw: stream onProgress deltas (legacy behaviour); others: suppress raw text
    onProgress: args.outputMode === 'raw' ? (delta) => process.stdout.write(delta) : undefined,
    // raw/json: show backend/model on stderr; human: tailer prints it to stdout
    onMeta: args.outputMode !== 'human'
      ? (meta) => process.stderr.write(dim(`\n[${meta.backend} / ${meta.model}]\n\n`))
      : undefined,
    onJobStarted: ({ id }) => {
      process.stderr.write(dim(`[job started: ${id}]\n`));
      if (args.outputMode !== 'raw') {
        stopTailer = startEventTailer(id, jobsDir, args.outputMode, args.name, effectiveBeadId);
      }
    },
  });

  // Set bead-based claim for edit gate — allows specialists to edit without session-scoped claim.
  // This is checked by beads-edit-gate as a fallback when claimed:<sessionId> is not set.
  if (effectiveBeadId && workingDirectory) {
    try {
      execSync(`bd kv set "bead-claim:${effectiveBeadId}" "active"`, {
        cwd: workingDirectory,
        stdio: 'pipe',
        timeout: 5000,
      });
    } catch {
      // Non-fatal — edit gate will fall back to in_progress check
    }
  }

  process.stderr.write(`\n${bold(`Running ${cyan(args.name)}`)}\n\n`);

  let jobId = '';
  let runError: any;
  try {
    jobId = await supervisor.run();
  } catch (err: any) {
    runError = err;
    stopTailer?.();
  }

  // Drain remaining events before printing footer
  stopTailer?.();

  // Clean up bead-claim AFTER run completes (success or error) — ensures no stale claims
  if (effectiveBeadId && workingDirectory) {
    try {
      execSync(`bd kv clear "bead-claim:${effectiveBeadId}"`, {
        cwd: workingDirectory,
        stdio: 'pipe',
        timeout: 5000,
      });
    } catch {
      // Non-fatal — stale claim will be overwritten on next run
    }
  }

  // If run failed, report error and exit
  if (runError) {
    process.stderr.write(`Error: ${runError?.message ?? runError}\n`);
    process.exit(1);
  }

  // Read the result from the job file
  const status = supervisor.readStatus(jobId);

  // Footer
  const secs = ((status?.last_event_at_ms ?? Date.now()) - (status?.started_at_ms ?? Date.now())) / 1000;
  const modelLabel = formatFooterModel(status?.backend, status?.model);
  const footer = [
    `job ${jobId}`,
    status?.bead_id ? `bead ${status.bead_id}` : '',
    `${secs.toFixed(1)}s`,
    modelLabel ? dim(modelLabel) : '',
  ].filter(Boolean).join('  ');

  process.stderr.write(`\n${green('✓')} ${footer}\n\n`);
  process.stderr.write(dim(`Poll: specialists poll ${jobId} --json\n\n`));

  // Exit immediately - all work is done
  process.exit(0);
}
