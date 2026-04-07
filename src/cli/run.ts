// src/cli/run.ts

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn as cpSpawn } from 'node:child_process';
import { SpecialistLoader } from '../specialist/loader.js';
import { SpecialistRunner } from '../specialist/runner.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { HookEmitter } from '../specialist/hooks.js';
import { BeadsClient, buildBeadContext } from '../specialist/beads.js';
import { Supervisor } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { provisionWorktree } from '../specialist/worktree.js';
import type { TimelineEvent } from '../specialist/timeline-events.js';
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
  /** Explicitly bypass the worktree requirement for edit-capable specialists. */
  noWorktree: boolean;
}

async function parseArgs(argv: string[]): Promise<RunArgs> {
  const name = argv[0];
  if (!name || name.startsWith('--')) {
    console.error(
      'Usage: specialists|sp run <name> [--prompt "..."] [--bead <id>] ' +
      '[--worktree] [--job <id>] [--context-depth <n>] [--model <model>] ' +
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
  let noWorktree = false;
  let reuseJobId: string | undefined;

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
    if (token === '--no-worktree')   { noWorktree   = true; continue; }
    if (token === '--job'            && argv[i + 1]) { reuseJobId   = argv[++i]; continue; }
  }

  // ── Mutual exclusion ─────────────────────────────────────────────────────────
  if (worktree && reuseJobId !== undefined) {
    console.error('Error: --worktree and --job are mutually exclusive. Use one or the other.');
    process.exit(1);
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

  if (!prompt && !beadId) {
    console.error('Error: provide --prompt, pipe stdin, or use --bead <id>.');
    process.exit(1);
  }

  return {
    name, prompt, beadId, model, noBeads, noBeadNotes, keepAlive, noKeepAlive,
    background, contextDepth, outputMode, worktree, reuseJobId, noWorktree,
  };
}

// ── Workspace resolution ──────────────────────────────────────────────────────

/**
 * Resolve the working directory for the run based on --worktree / --job flags.
 *
 * --worktree: provisions (or reuses) a bd-managed worktree derived from the
 *             bead id + specialist name and returns its absolute path.
 *
 * --job <id>: reads the target job's status.json to extract `worktree_path`.
 *             The caller's bead context remains authoritative — this just borrows
 *             the workspace without stealing the foreign job's bead.
 *
 * Returns undefined when neither flag is set (run in current directory).
 */
function resolveWorkingDirectory(
  args: RunArgs,
  jobsDir: string,
): string | undefined {
  if (args.worktree) {
    // args.beadId is guaranteed non-null here (parseArgs validates this)
    const info = provisionWorktree({
      beadId: args.beadId!,
      specialistName: args.name,
    });
    if (info.reused) {
      process.stderr.write(dim(`[worktree reused: ${info.worktreePath}  branch: ${info.branch}]\n`));
    } else {
      process.stderr.write(dim(`[worktree created: ${info.worktreePath}  branch: ${info.branch}]\n`));
    }
    return info.worktreePath;
  }

  if (args.reuseJobId !== undefined) {
    const statusPath = join(jobsDir, args.reuseJobId, 'status.json');
    let targetStatus: { worktree_path?: string } | null = null;
    try {
      targetStatus = JSON.parse(readFileSync(statusPath, 'utf-8'));
    } catch {
      console.error(
        `Error: cannot read status for job '${args.reuseJobId}'. ` +
        `Check the job id with: specialists poll ${args.reuseJobId} --json`,
      );
      process.exit(1);
    }

    const worktreePath = targetStatus?.worktree_path;
    if (!worktreePath) {
      console.error(
        `Error: job '${args.reuseJobId}' has no worktree_path — it was not started with --worktree.`,
      );
      process.exit(1);
    }

    process.stderr.write(dim(`[workspace reused from job ${args.reuseJobId}: ${worktreePath}]\n`));
    return worktreePath;
  }

  return undefined;
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

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const args = await parseArgs(process.argv.slice(3));

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

  const loader         = new SpecialistLoader();
  const circuitBreaker = new CircuitBreaker();
  const hooks          = new HookEmitter({ tracePath: join(process.cwd(), '.specialists', 'trace.jsonl') });
  const beadsClient = args.noBeads ? undefined : new BeadsClient();
  // Always create a reader for bead content — --no-beads only suppresses tracking
  const beadReader = beadsClient ?? new BeadsClient();

  let prompt = args.prompt;
  let variables: Record<string, string> | undefined;

  if (args.beadId) {
    const bead = beadReader.readBead(args.beadId);
    if (!bead) {
      throw new Error(`Unable to read bead '${args.beadId}' via bd show --json`);
    }

    // Fetch completed blockers at the requested depth (default 1)
    const blockers = (args.contextDepth > 0)
      ? beadReader.getCompletedBlockers(args.beadId, args.contextDepth)
      : [];

    if (blockers.length > 0) {
      process.stderr.write(dim(`\n[context: ${blockers.length} completed dep${blockers.length > 1 ? 's' : ''} injected]\n`));
    }

    const beadContext = buildBeadContext(bead, blockers);
    prompt = beadContext;
    variables = {
      bead_context: beadContext,
      bead_id: args.beadId,
    };
  }

  const specialist = await loader.get(args.name).catch((err: any) => {
    process.stderr.write(`Error: ${err?.message ?? err}\n`);
    process.exit(1);
  });

  // ── Worktree guard for edit-capable specialists ────────────────────────────
  const perm = specialist.specialist.execution.permission_required ?? 'READ_ONLY';
  const editCapable = perm === 'MEDIUM' || perm === 'HIGH';
  if (editCapable && !args.worktree && !args.reuseJobId && !args.noWorktree) {
    process.stderr.write(
      `Error: specialist '${args.name}' has permission_required=${perm} and can edit files.\n` +
      `Edit-capable specialists must run in isolation. Use one of:\n` +
      `  --worktree      provision an isolated worktree (recommended)\n` +
      `  --job <id>      reuse an existing job's worktree\n` +
      `  --no-worktree   bypass this guard (you accept last-writer-wins risk)\n`,
    );
    process.exit(1);
  }

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

  const workingDirectory = resolveWorkingDirectory(args, jobsDir);

  let stopTailer: (() => void) | undefined;

  const supervisor = new Supervisor({
    runner,
    runOptions: {
      name: args.name,
      prompt,
      variables,
      backendOverride: args.model,
      inputBeadId: args.beadId,
      keepAlive: args.keepAlive,
      noKeepAlive: args.noKeepAlive,
      beadsWriteNotes,
      workingDirectory,
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
        stopTailer = startEventTailer(id, jobsDir, args.outputMode, args.name, args.beadId);
      }
    },
  });

  process.stderr.write(`\n${bold(`Running ${cyan(args.name)}`)}\n\n`);

  let jobId: string;
  try {
    jobId = await supervisor.run();
  } catch (err: any) {
    stopTailer?.();
    process.stderr.write(`Error: ${err?.message ?? err}\n`);
    process.exit(1);
  }

  // Drain remaining events before printing footer
  stopTailer?.();

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
