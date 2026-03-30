import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parse, parseDocument } from 'yaml';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

type Command = 'get' | 'set';

interface ParsedArgs {
  command: Command;
  key: string;
  value?: string;
  name?: string;
  all: boolean;
}

class ArgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgParseError';
  }
}

function usage(): string {
  return [
    'Usage:',
    '  specialists config get <key> [--all] [--name <specialist>]',
    '  specialists config set <key> <value> [--all] [--name <specialist>]',
    '',
    'Examples:',
    '  specialists config get specialist.execution.stall_timeout_ms',
    '  specialists config set specialist.execution.stall_timeout_ms 180000',
    '  specialists config set specialist.execution.stall_timeout_ms 120000 --name executor',
  ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0];
  if (command !== 'get' && command !== 'set') {
    throw new ArgParseError(usage());
  }

  const key = argv[1];
  if (!key || key.startsWith('--')) {
    throw new ArgParseError(`Missing key\n\n${usage()}`);
  }

  let value: string | undefined;
  let index = 2;

  if (command === 'set') {
    value = argv[2];
    if (value === undefined || value.startsWith('--')) {
      throw new ArgParseError(`Missing value for set\n\n${usage()}`);
    }
    index = 3;
  }

  let name: string | undefined;
  let all = false;

  for (let i = index; i < argv.length; i++) {
    const token = argv[i];

    if (token === '--all') {
      all = true;
      continue;
    }

    if (token === '--name') {
      const next = argv[++i];
      if (!next || next.startsWith('--')) {
        throw new ArgParseError('--name requires a specialist name');
      }
      name = next;
      continue;
    }

    throw new ArgParseError(`Unknown option: ${token}`);
  }

  if (name && all) {
    throw new ArgParseError('Use either --name or --all, not both');
  }

  if (!name) {
    all = true;
  }

  return { command, key, value, name, all };
}

function splitKeyPath(key: string): string[] {
  const path = key.split('.').map(part => part.trim()).filter(Boolean);
  if (path.length === 0) {
    throw new ArgParseError(`Invalid key: ${key}`);
  }
  return path;
}

function getSpecialistDir(projectDir: string): string {
  return join(projectDir, 'config', 'specialists');
}

function getSpecialistNameFromPath(path: string): string {
  return path.replace(/\.specialist\.yaml$/, '');
}

async function listSpecialistFiles(projectDir: string): Promise<string[]> {
  const specialistDir = getSpecialistDir(projectDir);
  if (!existsSync(specialistDir)) {
    throw new Error(`Missing directory: ${specialistDir}`);
  }

  const entries = await readdir(specialistDir);
  return entries
    .filter(entry => entry.endsWith('.specialist.yaml'))
    .sort((a, b) => a.localeCompare(b))
    .map(entry => join(specialistDir, entry));
}

async function findNamedSpecialistFile(projectDir: string, name: string): Promise<string> {
  const path = join(getSpecialistDir(projectDir), `${name}.specialist.yaml`);
  if (!existsSync(path)) {
    throw new Error(`Specialist not found in config/specialists/: ${name}`);
  }
  return path;
}

function parseValue(rawValue: string): unknown {
  try {
    return parse(rawValue);
  } catch {
    return rawValue;
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return '<unset>';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function getAcrossFiles(files: string[], keyPath: string[]): Promise<void> {
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const doc = parseDocument(content);
    const value = doc.getIn(keyPath);
    const name = getSpecialistNameFromPath(basename(file));
    console.log(`${yellow(name)}: ${formatValue(value)}`);
  }
}

async function setAcrossFiles(files: string[], keyPath: string[], rawValue: string): Promise<void> {
  const typedValue = parseValue(rawValue);

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const doc = parseDocument(content);
    doc.setIn(keyPath, typedValue);
    await writeFile(file, doc.toString(), 'utf-8');
  }

  console.log(
    `${green('✓')} updated ${files.length} specialist${files.length === 1 ? '' : 's'}: ` +
    `${keyPath.join('.')} = ${formatValue(typedValue)}`,
  );
}

export async function run(): Promise<void> {
  let args: ParsedArgs;

  try {
    args = parseArgs(process.argv.slice(3));
  } catch (error) {
    if (error instanceof ArgParseError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const keyPath = splitKeyPath(args.key);
  const projectDir = process.cwd();

  let files: string[];

  try {
    files = args.name
      ? [await findNamedSpecialistFile(projectDir, args.name)]
      : await listSpecialistFiles(projectDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
    return;
  }

  if (files.length === 0) {
    console.error('No specialists found in config/specialists/');
    process.exit(1);
    return;
  }

  if (args.command === 'get') {
    await getAcrossFiles(files, keyPath);
    return;
  }

  await setAcrossFiles(files, keyPath, args.value!);
}
