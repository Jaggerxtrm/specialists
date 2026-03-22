// src/cli/run.ts

import { join } from 'node:path';
import { SpecialistLoader } from '../specialist/loader.js';
import { SpecialistRunner } from '../specialist/runner.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { HookEmitter } from '../specialist/hooks.js';
import { BeadsClient } from '../specialist/beads.js';
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
  model?: string;
  noBeads: boolean;
  background: boolean;
}

async function parseArgs(argv: string[]): Promise<RunArgs> {
  const name = argv[0];
  if (!name || name.startsWith('--')) {
    console.error('Usage: specialists run <name> [--prompt "..."] [--model <model>] [--no-beads] [--background]');
    process.exit(1);
  }

  let prompt = '';
  let model: string | undefined;
  let noBeads = false;
  let background = false;

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--prompt'     && argv[i + 1]) { prompt = argv[++i]; continue; }
    if (token === '--model'      && argv[i + 1]) { model  = argv[++i]; continue; }
    if (token === '--no-beads')  { noBeads    = true; continue; }
    if (token === '--background') { background = true; continue; }
  }

  // If no --prompt, read from stdin (pipe-friendly)
  if (!prompt) {
    if (process.stdin.isTTY) {
      process.stderr.write(dim('Prompt (Ctrl+D when done): '));
    }
    prompt = await new Promise<string>(resolve => {
      let buf = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', chunk => { buf += chunk; });
      process.stdin.on('end', () => resolve(buf.trim()));
    });
  }

  return { name, prompt, model, noBeads, background };
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const args = await parseArgs(process.argv.slice(3));

  const loader         = new SpecialistLoader();
  const circuitBreaker = new CircuitBreaker();
  const hooks          = new HookEmitter({ tracePath: join(process.cwd(), '.specialists', 'trace.jsonl') });
  const beadsClient    = args.noBeads ? null : new BeadsClient();

  const runner = new SpecialistRunner({
    loader,
    hooks,
    circuitBreaker,
    beadsClient: beadsClient ?? undefined,
  });

  // ── Background mode ─────────────────────────────────────────────────────────
  if (args.background) {
    const jobsDir = join(process.cwd(), '.specialists', 'jobs');
    const supervisor = new Supervisor({
      runner,
      runOptions: { name: args.name, prompt: args.prompt, backendOverride: args.model },
      jobsDir,
      beadsClient: beadsClient ?? undefined,
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

  let beadId: string | undefined;

  const result = await runner.run(
    {
      name: args.name,
      prompt: args.prompt,
      backendOverride: args.model,
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
    (id) => {
      beadId = id;
      process.stderr.write(dim(`\n[bead: ${id}]\n`));
    },
  );

  // Ensure output ends with newline
  if (result.output && !result.output.endsWith('\n')) process.stdout.write('\n');

  // Footer
  const secs = (result.durationMs / 1000).toFixed(1);
  const footer = [
    beadId ? `bead ${beadId}` : '',
    `${secs}s`,
    dim(result.model),
  ].filter(Boolean).join('  ');

  process.stderr.write(`\n${green('✓')} ${footer}\n\n`);
}
