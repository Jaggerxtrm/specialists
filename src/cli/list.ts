// src/cli/list.ts

import { SpecialistLoader } from '../specialist/loader.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ParsedArgs {
  category?: string;
  scope?: 'project' | 'user';
}

export class ArgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgParseError';
  }
}

// ── Argument parser ────────────────────────────────────────────────────────────
export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === '--category') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) {
        throw new ArgParseError('--category requires a value');
      }
      result.category = value;
      continue;
    }

    if (token === '--scope') {
      const value = argv[++i];
      if (value !== 'project' && value !== 'user') {
        throw new ArgParseError(
          `--scope must be "project" or "user", got: "${value ?? ''}"`
        );
      }
      result.scope = value;
      continue;
    }
    // Unknown flags: silently ignored
  }

  return result;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  let args: ParsedArgs;

  try {
    args = parseArgs(process.argv.slice(3));
  } catch (err) {
    if (err instanceof ArgParseError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const loader = new SpecialistLoader();
  let specialists = await loader.list(args.category);

  if (args.scope) {
    specialists = specialists.filter(s => s.scope === args.scope);
  }

  if (specialists.length === 0) {
    console.log('No specialists found.');
    return;
  }

  const nameWidth  = Math.max(...specialists.map(s => s.name.length),  4);
  const modelWidth = Math.max(...specialists.map(s => s.model.length), 5);

  console.log(`\n${bold(`Specialists (${specialists.length})`)}\n`);
  for (const s of specialists) {
    const name     = cyan(s.name.padEnd(nameWidth));
    const model    = dim(s.model.padEnd(modelWidth));
    const scopeTag = yellow(`[${s.scope}]`);
    console.log(`  ${name}  ${model}  ${s.description}  ${scopeTag}`);
  }
  console.log();
}
