// src/cli/run.ts

import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { SpecialistLoader } from '../specialist/loader.js';
import { SpecialistRunner } from '../specialist/runner.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { HookEmitter } from '../specialist/hooks.js';
import { BeadsClient, buildBeadContext } from '../specialist/beads.js';
import { Supervisor } from '../specialist/supervisor.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan  = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Arg parser ─────────────────────────────────────────────────────────────────
interface RunArgs {
  name: string;
  prompt: string;
  beadId?: string;
  model?: string;
  noBeads: boolean;
  keepAlive: boolean;
  contextDepth: number;
  background: boolean;
  /** true if prompt was read from stdin (not supplied via --prompt flag) */
  promptFromStdin: boolean;
}

async function parseArgs(argv: string[]): Promise<RunArgs> {
  const name = argv[0];
  if (!name || name.startsWith('--')) {
    console.error('Usage: specialists|sp run <name> [--prompt "..."] [--bead <id>] [--context-depth <n>] [--model <model>] [--no-beads] [--keep-alive] [--background]');
    process.exit(1);
  }

  let prompt = '';
  let beadId: string | undefined;
  let model: string | undefined;
  let noBeads = false;
  let keepAlive = false;
  let background = false;
  let contextDepth = 1; // default: inject immediate completed blockers when --bead is used

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--prompt'         && argv[i + 1]) { prompt       = argv[++i]; continue; }
    if (token === '--bead'           && argv[i + 1]) { beadId       = argv[++i]; continue; }
    if (token === '--model'          && argv[i + 1]) { model        = argv[++i]; continue; }
    if (token === '--context-depth'  && argv[i + 1]) { contextDepth = parseInt(argv[++i], 10) || 0; continue; }
    if (token === '--no-beads')    { noBeads    = true; continue; }
    if (token === '--keep-alive')  { keepAlive  = true; continue; }
    if (token === '--background')  { background = true; continue; }
  }

  if (prompt && beadId) {
    console.error('Error: use either --prompt or --bead, not both.');
    process.exit(1);
  }

  let promptFromStdin = false;
  if (!prompt && !beadId && !process.stdin.isTTY) {
    prompt = await new Promise<string>(resolve => {
      let buf = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', chunk => { buf += chunk; });
      process.stdin.on('end', () => resolve(buf.trim()));
    });
    promptFromStdin = true;
  }

  if (!prompt && !beadId) {
    console.error('Error: provide --prompt, pipe stdin, or use --bead <id>.');
    process.exit(1);
  }

  return { name, prompt, beadId, model, noBeads, keepAlive, contextDepth, background, promptFromStdin };
}

// ── Background spawner ─────────────────────────────────────────────────────────
async function runBackground(args: RunArgs): Promise<void> {
  // Build child argv: same command minus --background; if prompt came from stdin, inject as --prompt
  const childArgv = process.argv.slice(1).filter(a => a !== '--background');
  if (args.promptFromStdin && args.prompt) {
    childArgv.push('--prompt', args.prompt);
  }

  const child = spawn(process.execPath, childArgv, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let resolved = false;
  const rl = createInterface({ input: child.stderr! });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Timeout waiting for job ID from background process'));
      }
    }, 15_000);

    rl.on('line', (line) => {
      if (resolved) return;
      const match = line.match(/\[job started: ([^\]]+)\]/);
      if (match) {
        resolved = true;
        clearTimeout(timeout);
        process.stdout.write(`${match[1]}\n`);
        resolve();
      }
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Background process exited with code ${code} before emitting job ID`));
      }
    });
  });

  rl.close();
  try { child.stderr!.destroy(); } catch { /* ignore */ }
  child.unref();
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const args = await parseArgs(process.argv.slice(3));

  if (args.background) {
    try {
      await runBackground(args);
      process.exit(0);
    } catch (err: any) {
      process.stderr.write(`Error: ${err?.message ?? err}\n`);
      process.exit(1);
    }
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

  const runner = new SpecialistRunner({
    loader,
    hooks,
    circuitBreaker,
    beadsClient,
  });

  // ── Run with Supervisor (creates job files for poll command) ───────────────
  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
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
    // Stream output to stdout while Supervisor handles file writing
    onProgress: (delta) => process.stdout.write(delta),
    onMeta: (meta) => process.stderr.write(dim(`\n[${meta.backend} / ${meta.model}]\n\n`)),
    onJobStarted: ({ id }) => process.stderr.write(dim(`[job started: ${id}]\n`)),
  });

  // Validate specialist exists before printing header
  try {
    await loader.get(args.name);
  } catch (err: any) {
    process.stderr.write(`Error: ${err?.message ?? err}\n`);
    process.exit(1);
  }

  process.stderr.write(`\n${bold(`Running ${cyan(args.name)}`)}\n\n`);

  let jobId: string;
  try {
    jobId = await supervisor.run();
  } catch (err: any) {
    process.stderr.write(`Error: ${err?.message ?? err}\n`);
    process.exit(1);
  }

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
