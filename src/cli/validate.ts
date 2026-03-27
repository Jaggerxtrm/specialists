// src/cli/validate.ts
//
// Validate a specialist YAML file against the schema.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateSpecialist } from '../specialist/schema.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold    = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim     = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green   = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red     = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow  = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan    = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Types ──────────────────────────────────────────────────────────────────────
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

// ── Argument parser ────────────────────────────────────────────────────────────
export function parseArgs(argv: string[]): ParsedArgs {
  const name = argv[0];
  
  if (!name || name.startsWith('--')) {
    throw new ArgParseError('Usage: specialists validate <name> [--json]');
  }
  
  const json = argv.includes('--json');
  
  return { name, json };
}

/** Find a specialist file by name, searching in standard locations. */
function findSpecialistFile(name: string): string | undefined {
  const scanDirs = [
    join(process.cwd(), '.specialists', 'user', 'specialists'),
    join(process.cwd(), '.specialists', 'default', 'specialists'),
    join(process.cwd(), 'specialists'),
  ];
  
  for (const dir of scanDirs) {
    const candidate = join(dir, `${name}.specialist.yaml`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  
  return undefined;
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
  
  const { name, json } = args;
  
  // Find the specialist file directly (don't use loader to avoid error spam)
  const filePath = findSpecialistFile(name);
  
  if (!filePath) {
    if (json) {
      console.log(JSON.stringify({ valid: false, errors: [{ path: 'name', message: `Specialist not found: ${name}`, code: 'not_found' }] }));
    } else {
      console.error(`${red('✗')} Specialist not found: ${cyan(name)}`);
    }
    process.exit(1);
  }
  
  // Read and validate the file
  let content: string;
  
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (json) {
      console.log(JSON.stringify({ valid: false, errors: [{ path: 'file', message: `Failed to read file: ${msg}`, code: 'read_error' }] }));
    } else {
      console.error(`${red('✗')} Failed to read file: ${msg}`);
    }
    process.exit(1);
  }
  
  const result = await validateSpecialist(content);
  
  if (json) {
    console.log(JSON.stringify({
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      file: filePath,
    }, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  
  // Human-readable output
  console.log(`\n${bold('Validating')} ${cyan(name)} ${dim(`(${filePath})`)}\n`);
  
  if (result.valid) {
    console.log(`${green('✓')} Schema validation passed\n`);
  } else {
    console.log(`${red('✗')} Schema validation failed:\n`);
    for (const error of result.errors) {
      console.log(`  ${red('•')} ${error.message}`);
      if (error.path && error.path !== 'yaml') {
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