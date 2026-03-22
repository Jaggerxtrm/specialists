// src/cli/run.ts

import { join } from 'node:path';
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
  background: boolean;
}

async function parseArgs(argv: string[]): Promise<RunArgs> {
  const name = argv[0];
  if (!name || name.startsWith('--')) {
    console.error('Usage: specialists run <name> [--prompt "..."] [--bead <id>] [--model <model>] [--no-beads] [--background]');
    process.exit(1);
  }

  let prompt = '';
  let beadId: string | undefined;
  let model: string | undefined;
  let noBeads = false;
  let background = false;

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--prompt'      && argv[i + 1]) { prompt = argv[++i]; continue; }
    if (token === '--bead'        && argv[i + 1]) { beadId = argv[++i]; continue; }
    if (token === '--model'       && argv[i + 1]) { model  = argv[++i]; continue; }
    if (token === '--no-beads')   { noBeads    = true; continue; }
    if (token === '--background') { background = true; continue; }
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

  return { name, prompt, beadId, model, noBeads, background };
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const args = await parseArgs(process.argv.slice(3));

  const loader         = new SpecialistLoader();
  const circuitBreaker = new CircuitBreaker();
  const hooks          = new HookEmitter({ tracePath: join(process.cwd(), '.specialists', 'trace.jsonl') });
  const beadsClient    = (args.beadId || !args.noBeads) ? new BeadsClient() : undefined;
  const trackingBeadsClient = args.noBeads ? undefined : beadsClient;

  let prompt = args.prompt;
  let variables: Record<string, string> | undefined;

  if (args.beadId) {
    const bead = beadsClient?.readBead(args.beadId);
    if (!bead) {
      throw new Error(`Unable to read bead '${args.beadId}' via bd show --json`);
    }
    const beadContext = buildBeadContext(bead);
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
    beadsClient: trackingBeadsClient,
  });

  // ── Background mode ─────────────────────────────────────────────────────────
  if (args.background) {
    const jobsDir = join(process.cwd(), '.specialists', 'jobs');
    const supervisor = new Supervisor({
      runner,
      runOptions: {
        name: args.name,
        prompt,
        variables,
        backendOverride: args.model,
        inputBeadId: args.beadId,
      },
      jobsDir,
      beadsClient: trackingBeadsClient,
    });
    try {
      const jobId = await supervisor.run();
      process.stdout.write(`Job started: ${jobId}\n`);
    } catch (err: any) {
      process.stderr.write(`Error: ${err?.message ?? err}\n`);
      process.exit(1);
    }
    return;
  }

  // ── Foreground mode (existing behavior) ─────────────────────────────────────
  process.stderr.write(`\n${bold(`Running ${cyan(args.name)}`)}\n\n`);

  let trackingBeadId: string | undefined;

  const result = await runner.run(
    {
      name: args.name,
      prompt,
      variables,
      backendOverride: args.model,
      inputBeadId: args.beadId,
    },
    // onProgress — stream tokens to stdout as they arrive
    (delta) => process.stdout.write(delta),
    // onEvent
    undefined,
    // onMeta
    (meta) => process.stderr.write(dim(`\n[${meta.backend} / ${meta.model}]\n\n`)),
    // onKillRegistered — wire Ctrl+C to kill the session cleanly
    (killFn) => {
      process.on('SIGINT', () => {
        process.stderr.write('\n\nInterrupted.\n');
        killFn();
        process.exit(130);
      });
    },
    // onBeadCreated
    (beadId) => {
      trackingBeadId = beadId;
      process.stderr.write(dim(`\n[bead: ${beadId}]\n`));
    },
  );

  // Ensure output ends with newline
  if (result.output && !result.output.endsWith('\n')) process.stdout.write('\n');

  // Footer
  const secs = (result.durationMs / 1000).toFixed(1);
  const footer = [
    trackingBeadId ? `bead ${trackingBeadId}` : '',
    `${secs}s`,
    dim(result.model),
  ].filter(Boolean).join('  ');

  process.stderr.write(`\n${green('✓')} ${footer}\n\n`);
}
