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
import { createPiJsonProjector } from './pi-json-output.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan  = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Output modes ───────────────────────────────────────────────────────────────
/** Output mode for foreground runs.
 *  - 'human'  (default) formatted event summaries to stdout + final output
 *  - 'json'   pi-compatible NDJSON event stream to stdout, one event per line
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

/**
 * Schema tag on the single event a `--background --json` launch prints.
 *
 * A detached launch is NOT the pi-compatible run stream that `--json` produces in
 * the foreground (`session` → `agent_start` → message/turn/tool events): that
 * stream belongs to the detached child, which the parent never sees. Rather than
 * fake a `session` event for a run it has no output for, the parent emits one
 * launch event carrying this discriminator, so a strict pi consumer can tell the
 * two apart instead of silently mis-parsing one as the other.
 */
export const BACKGROUND_LAUNCH_SCHEMA = 'specialists.background_launch.v1';

/**
 * Stdout line a `--background` launch prints before the parent exits.
 *
 * The background branch returns before the JSON projector is initialised, so
 * under `--json` this emits a single launch event rather than a bare id —
 * otherwise a caller parsing stdout as NDJSON chokes on the first line.
 */
export function formatBackgroundLaunchLine(opts: {
  jobId: string | null;
  specialist: string;
  outputMode: OutputMode;
  tmuxSession?: string;
  pid?: number;
}): string {
  if (opts.outputMode !== 'json') return `${opts.jobId ?? opts.pid ?? ''}\n`;
  return `${JSON.stringify({
    schema: BACKGROUND_LAUNCH_SCHEMA,
    type: 'job_started',
    jobId: opts.jobId,
    specialist: opts.specialist,
    detached: true,
    ...(opts.tmuxSession ? { tmuxSession: opts.tmuxSession } : {}),
    ...(opts.jobId ? {} : { pid: opts.pid ?? null }),
  })}\n`;
}

async function parseArgs(argv: string[]): Promise<RunArgs> {
  const name = argv[0];
  if (!name || name.startsWith('--')) {
    console.error(
      'Usage: specialists|sp run <name> [--prompt "..."] [--bead <id>] ' +
      '[--worktree] [--job <id>] [--force-job] [--epic <id>] [--base-sha <sha>] [--base-ref <branch>] [--accept-stale-base --reason <text>] [--context-depth <n>] [--model <model>] ' +
      '[--no-beads] [--no-bead-notes] [--keep-alive|--no-keep-alive] [--background] [--json|--raw]',
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
    // Supported dispatch form for agent panes — see the --background branch below.
    // Shell `&` is not equivalent: it backgrounds only inside the shell.
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

  // --raw is a stream of LLM text deltas. A detached run has no stream to hand the
  // caller — the child's stdout is discarded (or belongs to its tmux pane) — so the
  // parent would print a job id where the script expects model output.
  if (background && outputMode === 'raw') {
    console.error(
      'Error: --background and --raw are mutually exclusive.\n' +
      'A detached run cannot stream text deltas back to the caller. Use --background --json\n' +
      'for a parseable launch event, then `specialists result <job-id>` for the output.',
    );
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
    base_sha_pinned?: string;
  } | null,
): {
  workingDirectory?: string;
  reusedFromJobId?: string;
  worktreeOwnerJobId?: string;
  reusedBaseShaPinned?: string;
  inferredBeadId?: string;
  /** Coordinator integration branch the worktree's branch was based on, if any. */
  coordinatorBase?: string;
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
      const baseNote = info.baseBranch ? `  base: ${info.baseBranch}` : '';
      process.stderr.write(dim(`[worktree created: ${info.worktreePath}  branch: ${info.branch}${baseNote}]\n`));
    }
    return {
      workingDirectory: info.worktreePath,
      ...(info.baseBranch ? { coordinatorBase: info.baseBranch } : {}),
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
      reusedBaseShaPinned: targetStatus.base_sha_pinned,
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
export function startEventTailer(
  jobId: string,
  jobsDir: string,
  mode: 'json' | 'human',
  _specialist: string,
  _beadId?: string,
): () => void {
  const eventsPath = join(jobsDir, jobId, 'events.jsonl');
  const sqliteClient = createObservabilitySqliteClient(process.cwd());
  let linesRead = 0;
  let lastSeq = 0;
  let activeInlinePhase: InlineIndicatorPhase = null;
  let projectPiJson: ReturnType<typeof createPiJsonProjector> | undefined;
  const getPiJsonProjector = () => {
    if (projectPiJson) return projectPiJson;
    const status = (() => {
      try { return sqliteClient?.readStatus(jobId); } catch { return null; }
    })();
    projectPiJson = createPiJsonProjector({
      jobId,
      sessionId: status?.session_id,
      cwd: status?.worktree_path ?? process.cwd(),
      startedAtMs: status?.started_at_ms,
      model: status?.model,
      backend: status?.backend,
    });
    return projectPiJson;
  };

  const readFileEvents = (): TimelineEvent[] => {
    let content: string;
    try { content = readFileSync(eventsPath, 'utf-8'); } catch { return []; }
    const lastNl = content.lastIndexOf('\n');
    if (lastNl < 0) return [];
    const lines = content.slice(0, lastNl).split('\n');
    const events: TimelineEvent[] = [];
    for (let i = linesRead; i < lines.length; i++) {
      linesRead++;
      try {
        const event = JSON.parse(lines[i]) as TimelineEvent;
        if (event.seq === undefined || event.seq > lastSeq) events.push(event);
      } catch { /* malformed line */ }
    }
    return events;
  };

  const drain = () => {
    let events: TimelineEvent[];
    try {
      events = sqliteClient
        ? sqliteClient.readEventsAfterSeq(jobId, lastSeq)
        : readFileEvents();
    } catch {
      events = readFileEvents();
    }
    for (const event of events) {
      lastSeq = Math.max(lastSeq, event.seq ?? 0);
      if (mode === 'json') {
        for (const piEvent of getPiJsonProjector()(event)) {
          process.stdout.write(JSON.stringify(piEvent) + '\n');
        }
      } else if (event.type === 'run_complete' && event.output) {
        activeInlinePhase = null;
        process.stdout.write('\n' + event.output + '\n');
      } else {
        const { line, nextPhase } = formatEventInlineDebounced(event, activeInlinePhase);
        activeInlinePhase = nextPhase;
        if (line) process.stdout.write(line + '\n');
      }
    }
  };

  const intervalId = setInterval(drain, 100);

  return () => {
    clearInterval(intervalId);
    drain();
    sqliteClient?.close();
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

function tryRunGit(cwd: string, args: string[]): string | undefined {
  try {
    const output = runGit(cwd, args);
    return output || undefined;
  } catch {
    return undefined;
  }
}

function resolveVerifiedBaseSha(cwd: string, candidate: string | undefined): string | undefined {
  const trimmed = candidate?.trim();
  if (!trimmed) return undefined;
  return tryRunGit(cwd, ['rev-parse', '--verify', '--quiet', `${trimmed}^{commit}`]);
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

/**
 * @param coordinatorBase When the worktree's branch was based on a dispatching
 *   coordinator's integration branch (see provisionWorktree), that branch — not
 *   `origin/HEAD` — is this job's declared base. Pinning against `origin/HEAD`
 *   instead would report every coordinator-dispatched job as `stale_base` and
 *   refuse the dispatch. Explicit `--base-sha` / `--base-ref` still win: they
 *   are direct operator intent. Whether the coordinator branch is itself
 *   current with origin is coordinator judgement (the P1-04 ladder), not this
 *   guard's call.
 */
function resolveInheritedBasePin(worktreePath: string | undefined, recordedBaseSha: string | undefined): BasePinResult | undefined {
  if (!worktreePath) return undefined;
  const baseShaPinned = resolveVerifiedBaseSha(worktreePath, recordedBaseSha);
  if (!baseShaPinned) return undefined;
  const currentSha = tryRunGit(worktreePath, ['rev-parse', 'HEAD']);
  const branch = tryRunGit(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!currentSha || !branch) return undefined;
  const commitsBehindText = tryRunGit(worktreePath, ['rev-list', '--count', `${currentSha}..${baseShaPinned}`]);
  return {
    baseShaPinned,
    baseShaObserved: baseShaPinned,
    currentSha,
    branch,
    commitsBehind: Number.parseInt(commitsBehindText ?? '0', 10) || 0,
    override: false,
  };
}

export function resolveBasePin(
  args: RunArgs,
  worktreePath?: string,
  coordinatorBase?: string,
): BasePinResult | undefined {
  if (!worktreePath || (!args.worktree && !args.baseSha)) return undefined;
  const baseRef = args.baseRef?.trim();
  // A coordinator base is a local branch; there is nothing to fetch for it.
  const pinToCoordinator = Boolean(coordinatorBase) && !baseRef && !args.baseSha;
  if (!pinToCoordinator) {
    if (baseRef) {
      runGitForBasePin(worktreePath, ['fetch', 'origin', baseRef], args);
    } else {
      runGitForBasePin(worktreePath, ['fetch', 'origin'], args);
    }
  }
  const baseShaObserved = pinToCoordinator
    ? runGitForBasePin(worktreePath, ['rev-parse', `refs/heads/${coordinatorBase}`], args)
    : runGitForBasePin(worktreePath, ['rev-parse', baseRef ? 'FETCH_HEAD' : 'refs/remotes/origin/HEAD'], args);
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

type HunkCoverageStatus = 'complete' | 'truncated' | 'omitted';
type ObligationsInventoryStatus = 'complete' | 'incomplete' | 'blocked';

type InjectedDiffFileEvidence = {
  path: string;
  status: HunkCoverageStatus;
  detail?: string;
};

type InjectedDiffContext = {
  source: string;
  reviewedBaseSha?: string;
  reviewedHeadSha: string;
  worktreeState: 'clean' | 'dirty';
  stat: string;
  files: string;
  pathCoverage: string;
  hunks: string;
  hunkCompleteness: string;
  obligationsInventoryStatus: ObligationsInventoryStatus;
  obligationsInventorySummary: string;
  obligationsInventoryLines: string;
};

const OBLIGATION_MARKER_REGEX = /\b(TODO|FIXME|HACK|XXX|TEMP|WIP|NOTE\(release\))(?![\w-])/;
const TRACKED_OBLIGATION_REGEX = /\b(?:TODO|FIXME|HACK|XXX|TEMP|WIP|NOTE\(release\))\(([A-Za-z0-9.-]+)\):/;
const TEST_PATH_PATTERNS = [
  /(?:^|\/)test\//,
  /(?:^|\/)tests\//,
  /(?:^|\/)__tests__\//,
  /\.spec\./,
  /\.test\./,
  /\.fixture\./,
  /(?:^|\/)fixtures?\//,
  /(?:^|\/)mocks?\//,
  /(?:^|\/)e2e\//,
  /(?:^|\/)docs\//,
] as const;

function formatHunkCoverageEntry(entry: InjectedDiffFileEvidence): string {
  const detail = entry.detail ? ` (${entry.detail})` : '';
  return `${entry.path} — hunks: ${entry.status}${detail}`;
}

function summarizeHunkCompleteness(entries: readonly InjectedDiffFileEvidence[]): string {
  if (entries.length === 0) return 'complete — 0/0 changed paths carried hunk evidence';

  const completeCount = entries.filter((entry) => entry.status === 'complete').length;
  const truncatedCount = entries.filter((entry) => entry.status === 'truncated').length;
  const omittedCount = entries.filter((entry) => entry.status === 'omitted').length;
  const excerptedCount = completeCount + truncatedCount;

  if (truncatedCount === 0 && omittedCount === 0) {
    return `complete — ${excerptedCount}/${entries.length} changed paths carried full hunk evidence`;
  }

  const detailParts = [
    `${completeCount} complete`,
    `${truncatedCount} truncated`,
    `${omittedCount} omitted`,
  ];
  return `partial — ${excerptedCount}/${entries.length} changed paths carried hunk excerpts; ${detailParts.join(', ')}`;
}

function classifyObligationSurface(filePath: string): 'production' | 'test' {
  const normalizedPath = filePath.replaceAll('\\', '/');
  return TEST_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath)) ? 'test' : 'production';
}

function buildInjectedDiffContext(cwd: string, maxFiles = 20, explicitBaseSha?: string): InjectedDiffContext | null {
  const readResult = (command: string): { ok: boolean; output: string } => {
    try {
      return {
        ok: true,
        output: execSync(command, {
          cwd,
          stdio: 'pipe',
          encoding: 'utf-8',
          timeout: 5000,
          maxBuffer: 8 * 1024 * 1024,
        }).trimEnd(),
      };
    } catch {
      return { ok: false, output: '' };
    }
  };

  const read = (command: string): string => readResult(command).output.trim();

  const MAX_TOTAL_HUNKS_CHARS = 12_000;
  const MAX_FILE_DIFF_CHARS = 2_000;
  const reviewedHeadSha = read('git rev-parse HEAD');
  if (!reviewedHeadSha) return null;

  const worktreeStatus = readResult('git status --porcelain=v1 --untracked-files=all');
  const worktreeState: 'clean' | 'dirty' = !worktreeStatus.ok || worktreeStatus.output.trim() ? 'dirty' : 'clean';

  const resolveMergeBase = (): string => {
    const headRef = read('git symbolic-ref refs/remotes/origin/HEAD');
    const baseBranch = headRef ? headRef.split('/').pop() ?? 'main' : 'main';
    return read(`git merge-base ${shellQuote(baseBranch)} ${shellQuote(reviewedHeadSha)}`);
  };

  type Source = {
    label: string;
    reviewedBaseSha?: string;
    statCmd: string;
    namesCmd: string;
    diffCmd: (file: string) => string;
    inventoryCmd: string;
  };

  const buildRangeSource = (label: string, baseSha: string): Source => ({
    label: `${label} (${baseSha}..${reviewedHeadSha})`,
    reviewedBaseSha: baseSha,
    statCmd: `git diff --stat ${shellQuote(baseSha)}..${shellQuote(reviewedHeadSha)}`,
    namesCmd: `git diff --name-only ${shellQuote(baseSha)}..${shellQuote(reviewedHeadSha)}`,
    diffCmd: (file: string) => `git diff ${shellQuote(baseSha)}..${shellQuote(reviewedHeadSha)} -- ${shellQuote(file)}`,
    inventoryCmd: `git diff -U0 ${shellQuote(baseSha)}..${shellQuote(reviewedHeadSha)}`,
  });

  const buildObligationsInventory = (
    inventoryCmd: string,
    changedPaths: readonly string[],
  ): Pick<InjectedDiffContext, 'obligationsInventoryStatus' | 'obligationsInventorySummary' | 'obligationsInventoryLines'> => {
    const inventory = readResult(inventoryCmd);
    if (!inventory.ok) {
      return {
        obligationsInventoryStatus: 'blocked',
        obligationsInventorySummary: 'BLOCKED — unable to scan exact delta for added markers',
        obligationsInventoryLines: 'BLOCKED: exact-delta marker inventory unavailable from selected diff source.',
      };
    }

    const allowedPaths = new Set(changedPaths);
    const findings: string[] = [];
    let currentFile: string | undefined;
    let nextNewLineNumber = 0;
    let parseGaps = 0;

    for (const line of inventory.output.split('\n')) {
      if (line.startsWith('+++ ')) {
        const rawPath = line.slice(4).trim();
        if (rawPath === '/dev/null') {
          currentFile = undefined;
          continue;
        }
        currentFile = rawPath.startsWith('b/') ? rawPath.slice(2) : rawPath;
        continue;
      }

      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        nextNewLineNumber = Number(hunkMatch[1]);
        continue;
      }

      if (!line.startsWith('+') || line.startsWith('+++')) continue;

      const addedLine = line.slice(1);
      const markerMatch = addedLine.match(OBLIGATION_MARKER_REGEX);
      const lineNumber = nextNewLineNumber;
      nextNewLineNumber += 1;
      if (!markerMatch) continue;
      if (!currentFile || !allowedPaths.has(currentFile)) continue;
      if (!Number.isFinite(lineNumber) || lineNumber <= 0) {
        parseGaps += 1;
        continue;
      }

      const surface = classifyObligationSurface(currentFile);
      const trackedBeadId = addedLine.match(TRACKED_OBLIGATION_REGEX)?.[1];
      const status = surface === 'test' ? 'N/A' : trackedBeadId ? `TRACKED ${trackedBeadId}` : 'UNTRACKED';
      const excerpt = addedLine.trim() || '(blank)';
      findings.push(`- ${currentFile}:${lineNumber} ${markerMatch[1]} [${surface}] [${status}] ${excerpt}`);
    }

    const markerCount = findings.length;
    if (parseGaps > 0) {
      return {
        obligationsInventoryStatus: 'incomplete',
        obligationsInventorySummary: `INCOMPLETE — exact-delta scan found ${markerCount} added marker match(es) with ${parseGaps} parse gap(s)`,
        obligationsInventoryLines: findings.length > 0 ? findings.join('\n') : '(none)',
      };
    }

    return {
      obligationsInventoryStatus: 'complete',
      obligationsInventorySummary: `complete exact-delta scan; ${markerCount} added marker match(es)`,
      obligationsInventoryLines: findings.length > 0 ? findings.join('\n') : '(none)',
    };
  };

  const verifiedExplicitBaseSha = resolveVerifiedBaseSha(cwd, explicitBaseSha);
  const mergeBase = verifiedExplicitBaseSha ? undefined : resolveMergeBase();
  const sources: Source[] = verifiedExplicitBaseSha
    ? [buildRangeSource('recorded-base diff', verifiedExplicitBaseSha)]
    : [
        {
          label: 'unstaged diff',
          statCmd: 'git diff --stat',
          namesCmd: 'git diff --name-only',
          diffCmd: (f) => `git diff -- ${shellQuote(f)}`,
          inventoryCmd: 'git diff -U0',
        },
        {
          label: 'staged diff',
          statCmd: 'git diff --cached --stat',
          namesCmd: 'git diff --cached --name-only',
          diffCmd: (f) => `git diff --cached -- ${shellQuote(f)}`,
          inventoryCmd: 'git diff --cached -U0',
        },
        ...(mergeBase
          ? [buildRangeSource('branch-vs-base diff', mergeBase)]
          : []),
      ];

  for (const src of sources) {
    const stat = read(src.statCmd);
    const files = read(src.namesCmd)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => !AUTO_COMMIT_NOISE_PREFIXES.some((prefix) => file.startsWith(prefix)));

    if (files.length === 0) continue;

    let remaining = MAX_TOTAL_HUNKS_CHARS;
    let excerptedFiles = 0;
    const coverage: InjectedDiffFileEvidence[] = [];
    const excerptSections: string[] = [];

    for (const file of files) {
      if (excerptedFiles >= maxFiles) {
        coverage.push({ path: file, status: 'omitted', detail: `excerpt file cap ${maxFiles}` });
        continue;
      }
      if (remaining <= 0) {
        coverage.push({ path: file, status: 'omitted', detail: 'total hunk excerpt budget exhausted' });
        continue;
      }

      const diff = read(src.diffCmd(file));
      let excerpt = diff || '(no hunks)';
      const detailParts: string[] = [];
      let status: HunkCoverageStatus = 'complete';

      if (excerpt.length > MAX_FILE_DIFF_CHARS) {
        excerpt = `${excerpt.slice(0, MAX_FILE_DIFF_CHARS)}\n... [truncated after ${MAX_FILE_DIFF_CHARS} chars]`;
        status = 'truncated';
        detailParts.push(`per-file excerpt limit ${MAX_FILE_DIFF_CHARS} chars`);
      }

      const buildSection = (detail: string | undefined, body: string): string => {
        const detailSuffix = detail ? `; ${detail}` : '';
        return `### ${file}\n[hunks: ${status}${detailSuffix}]\n${body}`;
      };

      let detail = detailParts.length > 0 ? detailParts.join('; ') : undefined;
      let section = buildSection(detail, excerpt);
      if (section.length > remaining) {
        status = 'truncated';
        detailParts.push('total hunk excerpt budget exhausted');
        detail = detailParts.join('; ');
        const header = `### ${file}\n[hunks: ${status}; ${detail}]\n`;
        const availableBodyChars = Math.max(0, remaining - header.length);
        if (availableBodyChars === 0) {
          coverage.push({ path: file, status: 'omitted', detail: 'total hunk excerpt budget exhausted' });
          remaining = 0;
          continue;
        }
        const truncatedBody = `${excerpt.slice(0, availableBodyChars)}\n... [truncated by total hunk excerpt budget]`;
        section = `${header}${truncatedBody}`;
      }

      excerptSections.push(section);
      coverage.push({ path: file, status, detail });
      remaining -= section.length + 2;
      excerptedFiles += 1;
    }

    const hunkCompleteness = summarizeHunkCompleteness(coverage);
    const changedPathCoverage = coverage.map(formatHunkCoverageEntry).join('\n');
    const hunks = [
      `Hunk evidence completeness: ${hunkCompleteness}`,
      '',
      'Changed path coverage:',
      changedPathCoverage,
      '',
      'Hunk excerpts:',
      excerptSections.length > 0 ? excerptSections.join('\n\n') : '(no hunk excerpts captured)',
    ].join('\n');

    const obligationsInventory = buildObligationsInventory(src.inventoryCmd, files);

    return {
      source: `injected diff context (${src.label})`,
      reviewedBaseSha: src.reviewedBaseSha,
      reviewedHeadSha,
      worktreeState,
      stat: stat || '(no stat)',
      files: files.join('\n'),
      pathCoverage: changedPathCoverage,
      hunks,
      hunkCompleteness,
      obligationsInventoryStatus: obligationsInventory.obligationsInventoryStatus,
      obligationsInventorySummary: obligationsInventory.obligationsInventorySummary,
      obligationsInventoryLines: obligationsInventory.obligationsInventoryLines,
    };
  }

  return null;
}

export function buildInjectedReviewerDiffVariables(cwd: string, maxFiles = 20, explicitBaseSha?: string): Record<string, string> {
  const context = buildInjectedDiffContext(cwd, maxFiles, explicitBaseSha);
  if (!context) return {};

  return {
    reviewer_diff_source: [
      context.source,
      context.reviewedBaseSha ? `reviewed-base: ${context.reviewedBaseSha}` : undefined,
      `reviewed-head: ${context.reviewedHeadSha}`,
      `worktree-state: ${context.worktreeState}`,
    ].filter(Boolean).join('\n'),
    reviewer_diff_stat: context.stat,
    reviewer_diff_files: context.files,
    reviewer_diff_hunks: context.hunks,
  };
}

export function buildInjectedWriterDiffVariables(cwd: string, maxFiles = 20, explicitBaseSha?: string): Record<string, string> {
  const context = buildInjectedDiffContext(cwd, maxFiles, explicitBaseSha);
  if (!context) return {};

  return {
    writer_diff: [
      `Source: ${context.source}`,
      ...(context.reviewedBaseSha ? [`Reviewed base: ${context.reviewedBaseSha}`] : []),
      `Reviewed head: ${context.reviewedHeadSha}`,
      `Worktree state: ${context.worktreeState}`,
      `Hunk evidence completeness: ${context.hunkCompleteness}`,
      '',
      'Changed files:',
      context.files,
      '',
      'Changed path coverage:',
      context.pathCoverage,
      '',
      'Diff stat:',
      context.stat,
      '',
      'Diff hunks:',
      context.hunks,
    ].join('\n'),
  };
}

export function buildInjectedObligationsDiffVariables(cwd: string, maxFiles = 20, explicitBaseSha?: string): Record<string, string> {
  const context = buildInjectedDiffContext(cwd, maxFiles, explicitBaseSha);
  if (!context) return {};

  return {
    obligations_diff: [
      '## Obligations Diff Evidence',
      `- source: ${context.source}`,
      ...(context.reviewedBaseSha ? [`- reviewed-base: ${context.reviewedBaseSha}`] : []),
      `- reviewed-head: ${context.reviewedHeadSha}`,
      `- worktree-state: ${context.worktreeState}`,
      `- changed files: ${context.files.split('\n').filter(Boolean).length}`,
      `- hunk evidence completeness: ${context.hunkCompleteness}`,
      `- added-marker inventory: ${context.obligationsInventoryStatus.toUpperCase()} — ${context.obligationsInventorySummary}`,
      '',
      '### Changed files',
      context.files,
      '',
      '### Changed path coverage',
      context.pathCoverage,
      '',
      '### Added marker inventory',
      context.obligationsInventoryLines,
      '',
      '### Diff stat',
      context.stat,
      '',
      '### Diff hunks',
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

    const writeLaunch = (id: string | null) => process.stdout.write(formatBackgroundLaunchLine({
      jobId: id,
      specialist: args.name,
      outputMode: args.outputMode,
      tmuxSession: tmuxSessionName,
      pid: childPid,
    }));

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
      writeLaunch(jobId);
    } else {
      process.stderr.write('Warning: job started but ID not yet available. Check specialists status.\n');
      writeLaunch(null);
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
  const {
    workingDirectory,
    reusedFromJobId,
    worktreeOwnerJobId,
    reusedBaseShaPinned,
    inferredBeadId,
    coordinatorBase,
  } = resolveWorkingDirectory(
    effectiveArgs,
    jobsDir,
    perm,
    (jobId) => statusReader.readStatus(jobId),
  );
  const basePin = resolveBasePin(effectiveArgs, workingDirectory, coordinatorBase)
    ?? resolveInheritedBasePin(workingDirectory, reusedBaseShaPinned);
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
    const explicitDiffBaseSha = basePin?.baseShaPinned;
    const injectedReviewerDiffVariables = workingDirectory && args.name === 'reviewer'
      ? buildInjectedReviewerDiffVariables(workingDirectory, 20, explicitDiffBaseSha)
      : {};
    const injectedWriterDiffVariables = workingDirectory && args.name === 'seconder'
      ? buildInjectedWriterDiffVariables(workingDirectory, 20, explicitDiffBaseSha)
      : {};
    const injectedObligationsDiffVariables = workingDirectory && args.name === 'obligations-scanner'
      ? buildInjectedObligationsDiffVariables(workingDirectory, 20, explicitDiffBaseSha)
      : {};
    variables = {
      ...(variables ?? {}),
      reviewed_job_id: reviewedJobId,
      reused_worktree_awareness: buildReusedWorktreeAwarenessBlock({ reusedFromJobId: args.reuseJobId, worktreeOwnerJobId }),
      ...injectedReviewerDiffVariables,
      ...injectedWriterDiffVariables,
      ...injectedObligationsDiffVariables,
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
    ambientRuntimeOrigin,
  });
}
