// src/cli/list.ts

import { SpecialistLoader } from '../specialist/loader.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ParsedArgs {
  category?: string;
  scope?: 'default' | 'user';
  json?: boolean;
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
      if (value !== 'default' && value !== 'user') {
        throw new ArgParseError(
          `--scope must be "default" or "user", got: "${value ?? ''}"`
        );
      }
      result.scope = value;
      continue;
    }

    if (token === '--json') {
      result.json = true;
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

  if (args.json) {
    console.log(JSON.stringify(specialists, null, 2));
    return;
  }

  if (specialists.length === 0) {
    console.log('No specialists found.');
    return;
  }

  const nameWidth = Math.max(...specialists.map(s => s.name.length), 4);

  console.log(`\n${bold(`Specialists (${specialists.length})`)}\n`);
  for (const s of specialists) {
    const name     = cyan(s.name.padEnd(nameWidth));
    const scopeTag = s.scope === 'default' ? green('[default]') : yellow('[user]');
    const model    = dim(s.model);
    const desc     = s.description.length > 80
      ? s.description.slice(0, 79) + '…'
      : s.description;
    console.log(`  ${name}  ${scopeTag}  ${model}`);
    console.log(`  ${' '.repeat(nameWidth)}  ${dim(desc)}`);
    console.log();
  }
}
