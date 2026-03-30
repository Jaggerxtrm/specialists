// src/cli/run.ts

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { SpecialistLoader } from '../specialist/loader.js';
import { SpecialistRunner } from '../specialist/runner.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { HookEmitter } from '../specialist/hooks.js';
import { BeadsClient, buildBeadContext } from '../specialist/beads.js';
import { Supervisor } from '../specialist/supervisor.js';
import type { TimelineEvent } from '../specialist/timeline-events.js';
import { formatEventInlineDebounced, type InlineIndicatorPhase } from './format-helpers.js';

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
  keepAlive: boolean;
  contextDepth: number;
  outputMode: OutputMode;
}

async function parseArgs(argv: string[]): Promise<RunArgs> {
  const name = argv[0];
  if (!name || name.startsWith('--')) {
    console.error('Usage: specialists|sp run <name> [--prompt "..."] [--bead <id>] [--context-depth <n>] [--model <model>] [--no-beads] [--keep-alive] [--json|--raw]');
    process.exit(1);
  }

  let prompt = '';
  let beadId: string | undefined;
  let model: string | undefined;
  let noBeads = false;
  let keepAlive = false;
  let outputMode: OutputMode = 'human';
  let contextDepth = 1; // default: inject immediate completed blockers when --bead is used

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--prompt'         && argv[i + 1]) { prompt       = argv[++i]; continue; }
    if (token === '--bead'           && argv[i + 1]) { beadId       = argv[++i]; continue; }
    if (token === '--model'          && argv[i + 1]) { model        = argv[++i]; continue; }
    if (token === '--context-depth'  && argv[i + 1]) { contextDepth = parseInt(argv[++i], 10) || 0; continue; }
    if (token === '--no-beads')    { noBeads    = true; continue; }
    if (token === '--keep-alive')  { keepAlive  = true; continue; }
    if (token === '--background') {
      console.error('Error: --background was removed. Use start_specialist/feed_specialist (MCP), run normally then feed/poll/result (CLI), or shell backgrounding (&).');
      process.exit(1);
    }
    if (token === '--json')        { outputMode = 'json'; continue; }
    if (token === '--raw')         { outputMode = 'raw';  continue; }
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

  return { name, prompt, beadId, model, noBeads, keepAlive, contextDepth, outputMode };
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

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const args = await parseArgs(process.argv.slice(3));

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

  const runner = new SpecialistRunner({
    loader,
    hooks,
    circuitBreaker,
    beadsClient,
  });

  // ── Run with Supervisor (creates job files for poll command) ───────────────
  const jobsDir = join(process.cwd(), '.specialists', 'jobs');

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
    },
    jobsDir,
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
  const footer = [
    `job ${jobId}`,
    status?.bead_id ? `bead ${status.bead_id}` : '',
    `${secs.toFixed(1)}s`,
    status?.model ? dim(`${status.backend}/${status.model}`) : '',
  ].filter(Boolean).join('  ');

  process.stderr.write(`\n${green('✓')} ${footer}\n\n`);
  process.stderr.write(dim(`Poll: specialists poll ${jobId} --json\n\n`));
  
  // Exit immediately - all work is done
  process.exit(0);
}
