import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { SpecialistLoader, type SpecialistSummary } from '../specialist/loader.js';
import { validateSpecialist } from '../specialist/schema.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

export interface ParsedArgs {
  name: string;
  json?: boolean;
}

export class ArgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgParseError';
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const name = argv[0];
  if (!name || name.startsWith('--')) {
    throw new ArgParseError('Usage: specialists validate <name> [--json]');
  }
  return { name, json: argv.includes('--json') };
}

function getSourceLabel(summary: SpecialistSummary): string {
  return `${summary.scope}/${summary.source}`;
}

async function findSpecialist(name: string): Promise<SpecialistSummary | undefined> {
  const loader = new SpecialistLoader();
  const list = await loader.list();
  return list.find(item => item.name === name);
}

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

  const summary = await findSpecialist(args.name);

  if (!summary) {
    if (args.json) {
      console.log(JSON.stringify({ valid: false, errors: [{ path: 'name', message: `Specialist not found: ${args.name}`, code: 'not_found' }] }));
    } else {
      console.error(`${red('✗')} Specialist not found: ${cyan(args.name)}`);
    }
    process.exit(1);
  }

  if (!existsSync(summary.filePath)) {
    const message = `Failed to read file: ${summary.filePath}`;
    if (args.json) {
      console.log(JSON.stringify({ valid: false, errors: [{ path: 'file', message, code: 'read_error' }] }));
    } else {
      console.error(`${red('✗')} ${message}`);
    }
    process.exit(1);
  }

  const content = await readFile(summary.filePath, 'utf-8');
  const result = await validateSpecialist(content);

  if (args.json) {
    console.log(JSON.stringify({
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      file: summary.filePath,
      source: getSourceLabel(summary),
    }, null, 2));
    process.exit(result.valid ? 0 : 1);
  }

  console.log(`\n${bold('Validating')} ${cyan(args.name)} ${dim(`(${summary.filePath})`)} ${dim(`[${getSourceLabel(summary)}]`)}\n`);

  if (result.valid) {
    console.log(`${green('✓')} Schema validation passed\n`);
  } else {
    console.log(`${red('✗')} Schema validation failed:\n`);
    for (const error of result.errors) {
      console.log(`  ${red('•')} ${error.message}`);
      if (error.path && error.path !== 'json') {
        console.log(`    ${dim(`path: ${error.path}`)}`);
      }
    }
    console.log();
  }

  if (result.warnings.length > 0) {
    console.log(`${yellow('Warnings')}:\n`);
    for (const warning of result.warnings) {
      console.log(`  ${yellow('⚠')} ${warning}`);
    }
    console.log();
  }

  process.exit(result.valid ? 0 : 1);
}
