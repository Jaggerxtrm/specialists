// src/cli/run.ts

import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn as cpSpawn, execSync } from 'node:child_process';
import { SpecialistLoader } from '../specialist/loader.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { HookEmitter } from '../specialist/hooks.js';
import { BeadsClient, buildBeadContext } from '../specialist/beads.js';
import { AUTO_COMMIT_NOISE_PREFIXES, Supervisor } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { provisionWorktree } from '../specialist/worktree.js';
import { createObservabilitySqliteClient, createObservabilitySqliteClientAtPath } from '../specialist/observability-sqlite.js';
import { resolveObservabilityDbLocation } from '../specialist/observability-db.js';
import type { TimelineEvent } from '../specialist/timeline-events.js';
import { evaluateMergeWorthiness, previewBranchMergeDelta } from './merge.js';
import { formatEventInlineDebounced, type InlineIndicatorPhase } from './format-helpers.js';
import { isTmuxAvailable, buildSessionName, createTmuxSession } from './tmux-utils.js';
import {
  captureRuntimeOrigin,
  decodePropagatedOrigin,
  encodePropagatedOrigin,
  SPECIALISTS_RUNTIME_ORIGIN_V1,
  type RuntimeOriginV1,
} from '../specialist/runtime-origin.js';
import { launchSpecialist } from '../specialist/launch.js';

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

const JOB_ID_HANDOFF_PATH_ENV = 'SPECIALISTS_BG_JOB_ID_PATH';

// ── Arg parser ─────────────────────────────────────────────────────────────────
export interface RunArgs {
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
  acceptStaleBase: boolean;
  staleBaseReason?: string;
  baseSha?: string;
  baseRef?: string;
}

async function parseArgs(argv: string[]): Promise<RunArgs> {
  const name = argv[0];
  if (!name || name.startsWith('--')) {
    console.error(
      'Usage: specialists|sp run <name> [--prompt "..."] [--bead <id>] ' +
      '[--worktree] [--job <id>] [--force-job] [--epic <id>] [--base-sha <sha>] [--base-ref <branch>] [--accept-stale-base --reason <text>] [--context-depth <n>] [--model <model>] ' +
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
  let contextDepth = 3;
  let worktree = false;
  let reuseJobId: string | undefined;
  let forceJob = false;
  let epicId: string | undefined;
  let forceStaleBase = false;
  let acceptStaleBase = false;
  let staleBaseReason: string | undefined;
  let baseSha: string | undefined;
  let baseRef: string | undefined;

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
    if (token === '--base-sha'       && argv[i + 1]) { baseSha      = argv[++i]; continue; }
    if (token === '--base-ref'       && argv[i + 1]) { baseRef      = argv[++i]; continue; }
    if (token === '--reason'         && argv[i + 1]) { staleBaseReason = argv[++i]; continue; }
    if (token === '--accept-stale-base') { acceptStaleBase = true; continue; }
    if (token === '--force-stale-base') {
      process.stderr.write('[deprecated] --force-stale-base is deprecated; use --accept-stale-base --reason <text>. Aliased for one release.\n');
      forceStaleBase = true;
      acceptStaleBase = true;
      staleBaseReason ??= 'deprecated --force-stale-base';
      continue;
    }
  }

  // ── Mutual exclusion ─────────────────────────────────────────────────────────
  if (acceptStaleBase && !staleBaseReason?.trim()) {
    console.error('Error: --accept-stale-base requires --reason <text>.');
    process.exit(1);
  }

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
    background, contextDepth, outputMode, worktree, reuseJobId, forceJob, epicId,
    forceStaleBase, acceptStaleBase, staleBaseReason, baseSha, baseRef,
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

function ensureObservabilityDb(cwd: string = process.cwd()): void {
  const existing = createObservabilitySqliteClient(cwd);
  if (existing) {
    existing.close();
    return;
  }

  const location = resolveObservabilityDbLocation(cwd);
  const bootstrapped = createObservabilitySqliteClientAtPath(location.dbPath);
  if (!bootstrapped) return;
  bootstrapped.close();
}

function resolveNewestJobIdFromDb(cwd: string, jobsDir: string, specialist: string, previousLatest: string, minStartedAtMs: number): string {
  const sqliteClient = createObservabilitySqliteClient(cwd);
  if (!sqliteClient) return '';

  try {
    const newest = sqliteClient
      .listStatuses()
      .filter((status) => {
        if (status.specialist !== specialist || status.id === previousLatest || status.started_at_ms < minStartedAtMs) return false;
        return existsSync(join(jobsDir, status.id, 'status.json'));
      })
      .sort((left, right) => right.started_at_ms - left.started_at_ms || left.id.localeCompare(right.id))[0];

    return newest?.id ?? '';
  } catch {
    return '';
  } finally {
    sqliteClient.close();
  }
}

function resolveNewestJobIdFromJobsDir(jobsDir: string, previousLatest: string, minMtimeMs: number): string {
  try {
    const entries = readdirSync(jobsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[a-f0-9]{6}$/.test(entry.name) && entry.name !== previousLatest)
      .map((entry) => {
        const dirPath = join(jobsDir, entry.name);
        const statusPath = join(dirPath, 'status.json');
        const stats = statSync(dirPath);
        const statusStats = statSync(statusPath);
        return {
          id: entry.name,
          mtimeMs: Math.max(stats.mtimeMs, statusStats.mtimeMs),
        };
      })
      .filter((entry) => entry.mtimeMs >= minMtimeMs)
      .sort((left, right) => right.mtimeMs - left.mtimeMs || left.id.localeCompare(right.id));

    return entries[0]?.id ?? '';
  } catch {
    return '';
  }
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
        const decision = evaluateMergeWorthiness(preview, branch);
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
      process.stderr.write(dim(`[stale-base guard accepted: ${staleSiblings.length} unmerged sibling chain(s) under epic ${epicId}]\n`));
      return;
    }

    const lines = staleSiblings
      .map((sibling) => `- bead=${sibling.beadId} chain=${sibling.chainId} branch=${sibling.branch}`)
      .join('\n');

    throw new Error(
      `Refusing worktree dispatch for bead '${beadId}': epic '${epicId}' has unmerged sibling chains with substantive commits.\n` +
      `${lines}\n` +
      `Publish the epic first: sp epic merge ${epicId}\n` +
      `If intentional, rerun with --accept-stale-base --reason <text>.`, 
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
    assertNoStaleBaseSiblings(args.beadId!, args.acceptStaleBase);

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
        `Check the job id with: specialists ps ${args.reuseJobId} --json`,
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
  const statusPath = join(jobsDir, jobId, 'status.json');
  let linesRead = 0;
  let activeInlinePhase: InlineIndicatorPhase = null;

  const readPayloadBreakdown = (): unknown => {
    try {
      const statusRaw = readFileSync(statusPath, 'utf-8');
      const status = JSON.parse(statusRaw) as { startup_payload_json?: string | null };
      return status.startup_payload_json ? JSON.parse(status.startup_payload_json) : undefined;
    } catch {
      return undefined;
    }
  };

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
        const payloadBreakdown = event.type === 'run_start' ? readPayloadBreakdown() : undefined;
        process.stdout.write(JSON.stringify({ jobId, specialist, beadId, ...(payloadBreakdown ? { payload_breakdown: payloadBreakdown } : {}), ...event }) + '\n');
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

export function buildTmuxLiveFeedCommand(options: {
  cwd: string;
  runCommand: string;
  handoffPath: string;
  feedCommandPrefix: string;
}): string {
  const handoffPath = shellQuote(options.handoffPath);
  const logPath = shellQuote(`${options.handoffPath}.log`);
  const script = [
    `cd ${shellQuote(options.cwd)}`,
    `(${options.runCommand}) > ${logPath} 2>&1 & run_pid=$!`,
    'job_id=',
    `for _ in $(seq 1 150); do if [ -s ${handoffPath} ]; then job_id=$(tr -d '\\r\\n' < ${handoffPath}); break; fi; if ! kill -0 "$run_pid" 2>/dev/null; then break; fi; sleep 0.1; done`,
    `if [ -n "$job_id" ]; then printf '\\n[tmux live feed: %s]\\n' "$job_id"; ${options.feedCommandPrefix} "$job_id" --follow; wait "$run_pid"; run_status=$?; exit "$run_status"; fi`,
    `cat ${logPath} 2>/dev/null || true`,
    'wait "$run_pid"',
    'exit $?',
  ].join('; ');

  return `/bin/bash -c ${shellQuote(script)}`;
}

function recordTmuxLiveFeedStarted(options: {
  cwd: string;
  jobId: string;
  specialist: string;
  beadId?: string;
  tmuxSession: string;
}): void {
  const sqliteClient = createObservabilitySqliteClient(options.cwd);
  if (!sqliteClient) return;

  try {
    sqliteClient.appendEvent(options.jobId, options.specialist, options.beadId, {
      t: Date.now(),
      type: 'meta',
      model: 'tmux_live_feed_started',
      backend: 'cli.run',
      source: 'cli.run',
      data: {
        component: 'cli.run',
        event: 'tmux_live_feed_started',
        job_id: options.jobId,
        tmux_session: options.tmuxSession,
        command: 'sp feed <job> --follow',
        outcome: 'started',
      },
    } as TimelineEvent);
  } catch {
    // best-effort telemetry only
  } finally {
    sqliteClient.close();
  }
}

interface BasePinResult {
  baseShaPinned: string;
  baseShaObserved: string;
  currentSha: string;
  branch: string;
  commitsBehind: number;
  override: boolean;
}

function runGit(cwd: string, args: string[]): string {
  return execSync(['git', ...args.map(shellQuote)].join(' '), {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
    timeout: 10_000,
  }).trim();
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runGitForBasePin(cwd: string, args: string[], runArgs: RunArgs): string {
  try {
    return runGit(cwd, args);
  } catch (error) {
    const envelope = {
      ok: false,
      error_code: 'base_fetch_failed',
      blocked_by: ['fetch_or_resolve_failure'],
      next_safe_action: 'verify network/remote/declared base ref is reachable, or rerun with --accept-stale-base --reason <text> if intentional',
      base_ref: runArgs.baseRef ?? null,
      base_sha: runArgs.baseSha ?? null,
      worktree_path: cwd,
      underlying_error: formatErrorMessage(error),
    };
    throw new Error(JSON.stringify(envelope));
  }
}

export function resolveBasePin(args: RunArgs, worktreePath?: string): BasePinResult | undefined {
  if (!worktreePath || (!args.worktree && !args.baseSha)) return undefined;
  const baseRef = args.baseRef?.trim();
  if (baseRef) {
    runGitForBasePin(worktreePath, ['fetch', 'origin', baseRef], args);
  } else {
    runGitForBasePin(worktreePath, ['fetch', 'origin'], args);
  }
  const baseShaObserved = runGitForBasePin(worktreePath, ['rev-parse', baseRef ? 'FETCH_HEAD' : 'refs/remotes/origin/HEAD'], args);
  const baseShaPinned = args.baseSha ?? baseShaObserved;
  const currentSha = runGitForBasePin(worktreePath, ['rev-parse', 'HEAD'], args);
  const branch = runGitForBasePin(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'], args);
  const commitsBehindText = runGitForBasePin(worktreePath, ['rev-list', '--count', `${currentSha}..${baseShaPinned}`], args);
  const commitsBehind = Number.parseInt(commitsBehindText, 10) || 0;
  const hasStaleBase = currentSha !== baseShaPinned || baseShaObserved !== baseShaPinned;
  if (!hasStaleBase) {
    return { baseShaPinned, baseShaObserved, currentSha, branch, commitsBehind, override: false };
  }
  if (args.acceptStaleBase) {
    process.stderr.write(dim(`[stale-base guard accepted: base_sha_pinned=${baseShaPinned} current_sha=${currentSha} reason=${args.staleBaseReason}]\n`));
    return { baseShaPinned, baseShaObserved, currentSha, branch, commitsBehind, override: true };
  }
  const envelope = {
    ok: false,
    error_code: 'stale_base',
    blocked_by: ['worktree_base_mismatch'],
    next_safe_action: 'Fetch/recreate worktree from declared base, or rerun with --accept-stale-base --reason <text> if divergence is intentional.',
    base_sha_pinned: baseShaPinned,
    base_sha_observed: baseShaObserved,
    current_sha: currentSha,
    branch,
    worktree_path: worktreePath,
    commits_behind: commitsBehind,
  };
  throw new Error(JSON.stringify(envelope));
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

type InjectedDiffContext = {
  source: string;
  stat: string;
  files: string;
  hunks: string;
};

function buildInjectedDiffContext(cwd: string, maxFiles = 20): InjectedDiffContext | null {
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
      .slice(0, maxFiles)
      .filter((file) => !AUTO_COMMIT_NOISE_PREFIXES.some((prefix) => file.startsWith(prefix)));

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
      source: `injected diff context (${src.label})`,
      stat: stat || '(no stat)',
      files: files.join('\n'),
      hunks,
    };
  }

  return null;
}

export function buildInjectedReviewerDiffVariables(cwd: string, maxFiles = 20): Record<string, string> {
  const context = buildInjectedDiffContext(cwd, maxFiles);
  if (!context) return {};

  return {
    reviewer_diff_source: context.source,
    reviewer_diff_stat: context.stat,
    reviewer_diff_files: context.files,
    reviewer_diff_hunks: context.hunks,
  };
}

export function buildInjectedWriterDiffVariables(cwd: string, maxFiles = 20): Record<string, string> {
  const context = buildInjectedDiffContext(cwd, maxFiles);
  if (!context) return {};

  return {
    writer_diff: [
      `Source: ${context.source}`,
      '',
      'Changed files:',
      context.files,
      '',
      'Diff stat:',
      context.stat,
      '',
      'Diff hunks:',
      context.hunks,
    ].join('\n'),
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const args = await parseArgs(process.argv.slice(3));
  ensureObservabilityDb(process.cwd());
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

  // ── Active-job pre-flight ──────────────────────────────────────────────────
  // Refuse fresh dispatch if a starting/running/waiting job already targets the
  // same bead+specialist. This closes the race window where multiple `sp run`
  // invocations against the same bead spawn duplicates before the supervisor's
  // SQLite claim fires (unitAI-55cb3). The supervisor still acts as the
  // transactional backstop.
  //
  // Skipped when:
  //   - --job <id> is set (legitimate reuse of a waiting keep-alive job)
  //   - the run has no bead binding (one-off prompts can't conflict)
  if (args.beadId && !args.reuseJobId) {
    const sqliteClient = createObservabilitySqliteClient();
    if (sqliteClient) {
      try {
        const existing = sqliteClient.findActiveJob(args.beadId, args.name);
        if (existing?.job_id) {
          process.stderr.write(
            `Error: existing ${existing.status ?? 'unknown'} job '${existing.job_id}' already targets bead '${args.beadId}' specialist '${args.name}'.\n` +
            `To resume the keep-alive session: specialists run ${args.name} --job ${existing.job_id} ...\n` +
            `To inspect: specialists ps ${existing.job_id} --json\n` +
            `To cancel: specialists stop ${existing.job_id}\n`,
          );
          sqliteClient.close();
          process.exit(1);
        }
      } finally {
        sqliteClient.close();
      }
    }
  }

  // ── Capture xtmux runtime origin (BEFORE the --background branch) ──────────
  // Spec docs/xtmux-gaps.md §13.1-13.2: the invoking pane's identity must be
  // resolved here, because the detached child's TMUX_PANE will point at the
  // sp-* feed pane. If a propagated origin exists in the environment (background
  // re-invocation case), it wins over an ambient capture — the child must not
  // rediscover its own sp-* pane.
  const propagatedOrigin = decodePropagatedOrigin(process.env);
  const ambientRuntimeOrigin: RuntimeOriginV1 | undefined =
    propagatedOrigin ?? (await captureRuntimeOrigin());

  // ── Background mode: spawn detached child and exit ──────────────────────────
  if (args.background) {
    // Jobs dir may be worktree-anchored, but for the latest-poll we use the
    // common-root resolved path to stay consistent with the child process.
    const jobsDir = resolveJobsDir();
    const latestPath = join(jobsDir, 'latest');
    const oldLatest = (() => { try { return readFileSync(latestPath, 'utf-8').trim(); } catch { return ''; } })();
    const cwd = process.cwd();
    const launchStartedAt = Date.now();
    const innerArgs = process.argv.slice(2).filter(a => a !== '--background');
    const cmd = `${process.execPath} ${process.argv[1]} ${innerArgs.map(shellQuote).join(' ')}`;

    let childPid: number | undefined;
    let childExitCode: number | undefined;
    let childExitPromise: Promise<void> | undefined;
    let handoffPath: string | undefined;
    let tmuxSessionName: string | undefined;

    // Propagate runtime origin to the detached child (spec §13.2). The child's
    // own TMUX_PANE resolves to the sp-* feed pane — the propagated value keeps
    // the binding on the ORIGINAL invoking pane.
    const propagatedEnv: Record<string, string> = ambientRuntimeOrigin
      ? { [SPECIALISTS_RUNTIME_ORIGIN_V1]: encodePropagatedOrigin(ambientRuntimeOrigin) }
      : {};

    if (isTmuxAvailable()) {
      const suffix = randomBytes(3).toString('hex');
      const sessionName = buildSessionName(args.name, suffix);
      tmuxSessionName = sessionName;
      handoffPath = join(jobsDir, `.bg-job-id-${sessionName}`);
      const feedCommandPrefix = [process.execPath, process.argv[1], 'feed'].map(shellQuote).join(' ');
      const tmuxCmd = buildTmuxLiveFeedCommand({
        cwd,
        runCommand: cmd,
        handoffPath,
        feedCommandPrefix,
      });
      createTmuxSession(sessionName, cwd, tmuxCmd, { [JOB_ID_HANDOFF_PATH_ENV]: handoffPath, ...propagatedEnv });
    } else {
      // Re-invoke ourselves without --background, fully detached
      const child = cpSpawn(process.execPath, [process.argv[1], ...innerArgs], {
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        cwd,
        env: { ...process.env, ...propagatedEnv },
      });
      const childStderr = child.stderr;
      if (childStderr) {
        childStderr.setEncoding('utf8');
        childStderr.on('data', (chunk: string) => {
          process.stderr.write(chunk);
        });
      }
      childExitPromise = new Promise(resolve => {
        child.on('exit', code => {
          childExitCode = code ?? 1;
          resolve();
        });
      });
      child.unref();
      childPid = child.pid;
    }

    // Wait for child to write new job ID to latest.
    // tmux startup can be slower in integration environments.
    const pollTimeoutMs = isTmuxAvailable() ? 15000 : 5000;
    const deadline = Date.now() + pollTimeoutMs;
    let jobId = '';
    while (Date.now() < deadline) {
      await Promise.race([
        new Promise(r => setTimeout(r, 100)),
        childExitPromise,
      ]);
      try {
        const current = readFileSync(latestPath, 'utf-8').trim();
        if (current && current !== oldLatest) { jobId = current; break; }
      } catch { /* not yet */ }
      if (!jobId && handoffPath) {
        try {
          const handoff = readFileSync(handoffPath, 'utf-8').trim();
          if (/^[a-f0-9]{6}$/.test(handoff)) { jobId = handoff; break; }
        } catch { /* not yet */ }
      }
      if (childExitCode !== undefined) break;
    }

    if (!jobId && childExitCode !== undefined && childExitCode !== 0) {
      process.exit(childExitCode);
    }

    if (!jobId) {
      jobId = resolveNewestJobIdFromDb(cwd, jobsDir, args.name, oldLatest, launchStartedAt - 1000);
    }

    if (!jobId) {
      jobId = resolveNewestJobIdFromJobsDir(jobsDir, oldLatest, launchStartedAt - 1000);
    }

    if (jobId) {
      if (tmuxSessionName) {
        recordTmuxLiveFeedStarted({
          cwd,
          jobId,
          specialist: args.name,
          beadId: args.beadId,
          tmuxSession: tmuxSessionName,
        });
      }
      process.stdout.write(`${jobId}\n`);
    } else {
      process.stderr.write('Warning: job started but ID not yet available. Check specialists status.\n');
      process.stdout.write(`${childPid ?? ''}\n`);
    }
    process.exit(0);
  }

  const circuitBreaker = new CircuitBreaker();
  const hooks = new HookEmitter({ tracePath: join(process.cwd(), '.specialists', 'trace.jsonl') });
  const beadsClient = args.noBeads ? undefined : new BeadsClient();
  const beadReader = beadsClient ?? new BeadsClient();

  let prompt = args.prompt;
  let variables: Record<string, string> | undefined;
  let epicId: string | undefined;
  let effectiveBeadId = args.beadId;

  const beadsWriteNotes = args.noBeadNotes
    ? false
    : (specialist.specialist.beads_write_notes ?? true);

  const jobsDir = resolveJobsDir();
  const statusReader = new Supervisor({
    runner: new (await import('../specialist/runner.js')).SpecialistRunner({ loader, hooks, circuitBreaker, beadsClient }),
    runOptions: { name: args.name, prompt },
    jobsDir,
  });

  const effectiveArgs = { ...args, worktree: useWorktree };
  const { workingDirectory, reusedFromJobId, worktreeOwnerJobId, inferredBeadId } = resolveWorkingDirectory(
    effectiveArgs,
    jobsDir,
    perm,
    (jobId) => statusReader.readStatus(jobId),
  );
  const basePin = resolveBasePin(effectiveArgs, workingDirectory);
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

    const blockers = args.contextDepth > 0 ? beadReader.getCompletedBlockers(effectiveBeadId, args.contextDepth) : [];
    if (blockers.length > 0) {
      process.stderr.write(dim(`\n[context: ${blockers.length} completed dep${blockers.length > 1 ? 's' : ''} injected]\n`));
    }

    const beadContext = buildBeadContext(bead, blockers);
    prompt = beadContext;
    epicId = args.epicId ?? bead.parent;
    variables = { ...(variables ?? {}), bead_context: beadContext, bead_id: effectiveBeadId };
  } else if (args.epicId) {
    epicId = args.epicId;
  }

  variables = { ...(variables ?? {}), reused_worktree_awareness: '' };

  if (args.reuseJobId) {
    const reviewedJobId = extractReviewedJobIdOverride(prompt) ?? args.reuseJobId;
    const injectedReviewerDiffVariables = workingDirectory && args.name === 'reviewer' ? buildInjectedReviewerDiffVariables(workingDirectory) : {};
    const injectedWriterDiffVariables = workingDirectory && args.name === 'seconder' ? buildInjectedWriterDiffVariables(workingDirectory) : {};
    variables = {
      ...(variables ?? {}),
      reviewed_job_id: reviewedJobId,
      reused_worktree_awareness: buildReusedWorktreeAwarenessBlock({ reusedFromJobId: args.reuseJobId, worktreeOwnerJobId }),
      ...injectedReviewerDiffVariables,
      ...injectedWriterDiffVariables,
    };
  }

  if (!prompt && !effectiveBeadId) {
    console.error('Error: provide --prompt, pipe stdin, use --bead <id>, or provide --job <id> for bead inference.');
    process.exit(1);
  }

  await launchSpecialist({
    args,
    specialist,
    loader,
    hooks,
    circuitBreaker,
    beadsClient,
    workingDirectory,
    basePin,
    reusedFromJobId,
    worktreeOwnerJobId,
    effectiveBeadId,
    prompt,
    variables,
    epicId,
    beadsWriteNotes,
    perm,
    jobsDir,
    startEventTailer: (jobId, jobsDirArg) => startEventTailer(jobId, jobsDirArg, args.outputMode === 'raw' ? 'human' : args.outputMode, args.name, effectiveBeadId),
    formatFooterModel,
  });
}
