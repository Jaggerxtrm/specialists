import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { SpecialistLoader, type SpecialistSummary } from '../specialist/loader.js';
import { SpecialistSchema, validateSpecialist } from '../specialist/schema.js';
import { compatGuard } from '../specialist/script-runner.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

export interface ParsedArgs {
  value: string;
  json?: boolean;
  target?: 'script';
}

export class ArgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgParseError';
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const value = argv[0];
  if (!value || value.startsWith('--')) {
    throw new ArgParseError('Usage: specialists validate <name|path> [--target=<surface>] [--json]');
  }

  const targetFlag = argv.find(arg => arg === '--target' || arg.startsWith('--target='));
  const target = targetFlag ? (targetFlag.includes('=') ? targetFlag.split('=', 2)[1] : argv[argv.indexOf(targetFlag) + 1]) : undefined;
  if (target && target !== 'script') {
    throw new ArgParseError('Usage: specialists validate <name|path> [--target=<surface>] [--json]');
  }

  return { value, json: argv.includes('--json'), target: target === 'script' ? 'script' : undefined };
}

function getSourceLabel(summary: SpecialistSummary): string {
  return `${summary.scope}/${summary.source}`;
}

async function findSpecialist(name: string): Promise<SpecialistSummary | undefined> {
  const loader = new SpecialistLoader();
  const list = await loader.list();
  return list.find(item => item.name === name);
}

async function loadSpecFromFile(filePath: string) {
  const content = await readFile(filePath, 'utf-8');
  const raw = filePath.endsWith('.yaml') || filePath.endsWith('.yml') ? parseYaml(content) : JSON.parse(content);
  return SpecialistSchema.parseAsync(raw);
}

function formatCompatGuardError(message: string): string {
  if (message.includes('interactive')) return 'compatGuard: interactive';
  if (message.includes('worktree')) return 'compatGuard: requires_worktree';
  if (message.includes('permission_required')) return 'compatGuard: permission_required';
  if (message.includes('scripts not allowed')) return 'compatGuard: scripts';
  return `compatGuard: ${message}`;
}

function printStructuredErrors(filePath: string, errors: Array<{ path: string; message: string }>): void {
  for (const error of errors) {
    console.error(`${filePath}:${error.path} ${error.message}`);
  }
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

  if (args.target === 'script') {
    try {
      const spec = await loadSpecFromFile(args.value);
      compatGuard(spec);
      console.log(`PASS ${args.value} script`);
      process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'exit:0') throw err;
      if (args.json) {
        console.log(JSON.stringify({ valid: false, errors: [{ path: 'target.script', message: formatCompatGuardError(message), code: 'compat_guard_error' }] }, null, 2));
      } else {
        console.error(`${red('✗')} ${args.value}: ${formatCompatGuardError(message)}`);
      }
      process.exit(1);
    }
  }

  const summary = await findSpecialist(args.value);

  if (!summary) {
    if (args.json) {
      console.log(JSON.stringify({ valid: false, errors: [{ path: 'name', message: `Specialist not found: ${args.value}`, code: 'not_found' }] }));
    } else {
      console.error(`${red('✗')} Specialist not found: ${cyan(args.value)}`);
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

  console.log(`\n${bold('Validating')} ${cyan(args.value)} ${dim(`(${summary.filePath})`)} ${dim(`[${getSourceLabel(summary)}]`)}\n`);

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
