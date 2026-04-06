import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import { SpecialistLoader } from '../specialist/loader.js';
import { SpecialistSchema } from '../specialist/schema.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const LEGACY_FIELD_ALIASES: Record<string, string> = {
  model: 'specialist.execution.model',
  'fallback-model': 'specialist.execution.fallback_model',
  description: 'specialist.metadata.description',
  permission: 'specialist.execution.permission_required',
  timeout: 'specialist.execution.timeout_ms',
  tags: 'specialist.metadata.tags',
};

const ENUM_PATHS = new Set([
  'specialist.execution.permission_required',
  'specialist.execution.response_format',
  'specialist.execution.output_type',
  'specialist.execution.thinking_level',
  'specialist.beads_integration',
  'specialist.execution.mode',
]);

const MULTILINE_FILE_PATHS = new Set([
  'specialist.prompt.system',
  'specialist.prompt.task_template',
]);

interface PresetDefinition {
  description: string;
  fields: Record<string, unknown>;
}

function loadPresets(): Record<string, PresetDefinition> {
  const paths = [
    join(process.cwd(), 'config', 'presets.json'),
    join(process.cwd(), 'config', 'specialists', 'presets.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const data = JSON.parse(readFileSync(p, 'utf-8'));
        return data as Record<string, PresetDefinition>;
      } catch {
        return {};
      }
    }
  }
  return {};
}

type Action = 'get' | 'set' | 'append' | 'remove' | 'open-all' | 'list-presets' | 'preset';

interface ParsedArgs {
  name?: string;
  all: boolean;
  scope?: 'default' | 'user';
  dryRun: boolean;
  action: Action;
  path?: string;
  value?: string;
  filePath?: string;
  preset?: string;
}

interface ResolvedPath {
  normalizedPath: string;
  segments: string[];
  schema: z.ZodTypeAny;
}

function usage(): string {
  const aliasList = Object.keys(LEGACY_FIELD_ALIASES).map(v => `--${v}`).join(', ');
  return [
    'Usage:',
    '  specialists edit <name> <dot.path> <value> [options]',
    '  specialists edit <name> --set <dot.path> <value> [options]',
    '  specialists edit <name> --get <dot.path> [--scope <default|user>]',
    '  specialists edit --all --set <dot.path> <value> [options]',
    '  specialists edit --all --get <dot.path>',
    '  specialists edit --all',
    '  specialists edit <name> --preset <preset> [--dry-run]',
    '  specialists edit --list-presets',
    '',
    'Options:',
    '  --append              Append value(s) to array field',
    '  --remove              Remove value(s) from array field',
    '  --file <path>         Read value from file (prompt.system/task_template)',
    '  --preset <name>       Apply a preset (bundle of field values)',
    '  --list-presets         Show available presets',
    '  --dry-run             Preview the change without writing',
    '  --scope <scope>       default | user',
    '  --name <specialist>   Alias for positional <name> (compat)',
    '',
    `Legacy aliases (compat): ${aliasList}`,
  ].join('\n');
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 1 && argv[0] === '--all') {
    return { all: true, dryRun: false, action: 'open-all' };
  }

  if (argv.includes('--list-presets')) {
    return { all: false, dryRun: false, action: 'list-presets' };
  }

  let name: string | undefined;
  let all = false;
  let scope: 'default' | 'user' | undefined;
  let dryRun = false;
  let action: Action = 'set';
  let path: string | undefined;
  let value: string | undefined;
  let filePath: string | undefined;
  let pendingArrayOp: 'append' | 'remove' | undefined;
  let preset: string | undefined;

  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (token === '--all') {
      all = true;
      continue;
    }

    if (token === '--append') {
      pendingArrayOp = 'append';
      continue;
    }

    if (token === '--remove') {
      pendingArrayOp = 'remove';
      continue;
    }

    if (token === '--scope') {
      const rawScope = argv[++i];
      if (rawScope !== 'default' && rawScope !== 'user') {
        fail(`Error: --scope must be "default" or "user", got: "${rawScope ?? ''}"`);
      }
      scope = rawScope;
      continue;
    }

    if (token === '--name') {
      const rawName = argv[++i];
      if (!rawName || rawName.startsWith('--')) {
        fail(`Error: --name requires a specialist name\n\n${usage()}`);
      }
      name = rawName;
      continue;
    }

    if (token === '--preset') {
      const presetName = argv[++i];
      if (!presetName || presetName.startsWith('--')) {
        fail(`Error: --preset requires a preset name\n\n${usage()}`);
      }
      preset = presetName;
      action = 'preset';
      continue;
    }

    if (token === '--file') {
      const rawFilePath = argv[++i];
      if (!rawFilePath || rawFilePath.startsWith('--')) {
        fail(`Error: --file requires a path\n\n${usage()}`);
      }
      filePath = rawFilePath;
      continue;
    }

    if (token === '--get') {
      action = 'get';
      const rawPath = argv[++i];
      if (!rawPath || rawPath.startsWith('--')) {
        fail(`Error: --get requires a dot-path\n\n${usage()}`);
      }
      path = rawPath;
      continue;
    }

    if (token === '--set') {
      action = 'set';
      const rawPath = argv[++i];
      const rawValue = argv[++i];
      if (!rawPath || rawPath.startsWith('--') || rawValue === undefined || rawValue.startsWith('--')) {
        fail(`Error: --set requires <dot.path> and <value>\n\n${usage()}`);
      }
      path = rawPath;
      value = rawValue;
      continue;
    }

    const legacyField = token.slice(2);
    const aliasPath = LEGACY_FIELD_ALIASES[legacyField];
    if (aliasPath) {
      action = 'set';
      path = aliasPath;
      value = argv[++i];
      if (value === undefined || value === '') {
        fail(`Error: --${legacyField} requires a value`);
      }
      continue;
    }

    fail(`Error: unknown option: ${token}\n\n${usage()}`);
  }

  if (!name && positional.length > 0 && !positional[0].startsWith('--')) {
    name = positional.shift();
  }

  if (!path) {
    if (action === 'get' && positional.length >= 1) {
      path = positional.shift();
    } else if (positional.length >= 2) {
      path = positional.shift();
      value = positional.shift();
    }
  }

  if (action === 'set' && pendingArrayOp) {
    action = pendingArrayOp;
  }

  if (action === 'get' && value !== undefined) {
    fail(`Error: --get does not accept a value\n\n${usage()}`);
  }

  if (!all && !name) {
    fail(`Error: missing specialist name. Use <name> or --all\n\n${usage()}`);
  }

  if (action === 'preset') {
    return { name, all, scope, dryRun, action, path, value, filePath, preset };
  }

  if (!path) {
    fail(`Error: missing dot-path\n\n${usage()}`);
  }

  if (action !== 'get' && !filePath && (value === undefined || value === '')) {
    fail(`Error: missing value\n\n${usage()}`);
  }

  if (action === 'get' && (pendingArrayOp || filePath)) {
    fail('Error: --get cannot be combined with --append/--remove/--file');
  }

  if (filePath && !existsSync(filePath)) {
    fail(`Error: file not found: ${filePath}`);
  }

  return { name, all, scope, dryRun, action, path, value, filePath, preset };
}

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodEffects
  ) {
    if (current instanceof z.ZodEffects) {
      current = current.innerType();
      continue;
    }

    if (current instanceof z.ZodDefault) {
      current = current._def.innerType;
      continue;
    }

    current = current.unwrap();
  }
  return current;
}

function resolvePath(path: string): ResolvedPath {
  const normalizedPath = path.startsWith('specialist.') ? path : `specialist.${path}`;
  const segments = normalizedPath.split('.').map(part => part.trim()).filter(Boolean);
  if (segments.length === 0) {
    fail(`Error: invalid path: ${path}`);
  }

  let schema: z.ZodTypeAny = SpecialistSchema;

  for (const segment of segments) {
    const unwrapped = unwrapSchema(schema);
    if (!(unwrapped instanceof z.ZodObject)) {
      fail(`Error: invalid path "${path}" ("${segment}" is not nested object field)`);
    }

    const shape = unwrapped.shape;
    if (!(segment in shape)) {
      const available = Object.keys(shape).sort().join(', ');
      fail(`Error: invalid path "${path}". Unknown segment "${segment}". Available: ${available}`);
    }

    schema = shape[segment];
  }

  return {
    normalizedPath,
    segments,
    schema: unwrapSchema(schema),
  };
}

function parseJsonValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Error: value must be valid JSON: ${message}`);
  }
}

function parseBoolean(rawValue: string): boolean {
  const lowered = rawValue.toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  fail('Error: value must be a boolean (true/false)');
}

function parseArray(rawValue: string, elementSchema: z.ZodTypeAny): unknown[] {
  if (rawValue.trim().startsWith('[')) {
    const parsed = parseJsonValue(rawValue);
    if (!Array.isArray(parsed)) {
      fail('Error: expected JSON array for array field');
    }
    return parsed.map(item => coerceValue(elementSchema, typeof item === 'string' ? item : JSON.stringify(item)));
  }

  return rawValue
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => coerceValue(elementSchema, item));
}

function coerceUnion(schema: z.ZodUnion<[z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]>, rawValue: string): unknown {
  for (const option of schema.options) {
    try {
      return coerceValue(option, rawValue);
    } catch {
      // try next option
    }
  }
  fail(`Error: value "${rawValue}" does not match any supported type for this field`);
}

function coerceValue(schema: z.ZodTypeAny, rawValue: string): unknown {
  const unwrapped = unwrapSchema(schema);

  if (unwrapped instanceof z.ZodNumber) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      fail(`Error: value must be a number, got: ${rawValue}`);
    }
    return parsed;
  }

  if (unwrapped instanceof z.ZodBoolean) {
    return parseBoolean(rawValue);
  }

  if (unwrapped instanceof z.ZodEnum) {
    const values = unwrapped.options;
    if (!values.includes(rawValue)) {
      fail(`Error: invalid enum value "${rawValue}". Allowed: ${values.join(', ')}`);
    }
    return rawValue;
  }

  if (unwrapped instanceof z.ZodArray) {
    return parseArray(rawValue, unwrapped.element);
  }

  if (unwrapped instanceof z.ZodUnion) {
    return coerceUnion(unwrapped as z.ZodUnion<[z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]>, rawValue);
  }

  if (unwrapped instanceof z.ZodRecord || unwrapped instanceof z.ZodObject) {
    const parsed = parseJsonValue(rawValue);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      fail('Error: value must be a JSON object');
    }
    return parsed;
  }

  if (unwrapped instanceof z.ZodString) {
    return rawValue;
  }

  return rawValue;
}

function normalizeArrayValues(schema: z.ZodTypeAny, rawValue: string): unknown[] {
  const unwrapped = unwrapSchema(schema);
  if (!(unwrapped instanceof z.ZodArray)) {
    fail('Error: --append/--remove can only be used with array fields');
  }
  return parseArray(rawValue, unwrapped.element);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatOutputValue(value: unknown): string {
  if (value === undefined) return '<unset>';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function openAllConfigSpecialistsInEditor(): void {
  const configDir = join(process.cwd(), 'config', 'specialists');
  if (!existsSync(configDir)) {
    fail(`Error: missing directory: ${configDir}`);
  }

  const files = readdirSync(configDir)
    .filter(file => file.endsWith('.specialist.json'))
    .sort()
    .map(file => join(configDir, file));

  if (files.length === 0) {
    fail('Error: no specialist JSON files found in config/specialists/');
  }

  const editor = process.env.VISUAL ?? process.env.EDITOR ?? 'vi';
  const result = spawnSync(editor, files, { stdio: 'inherit', shell: true });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getRawValue(args: ParsedArgs, resolvedPath: ResolvedPath): string {
  if (!args.filePath) {
    return args.value!;
  }

  if (!MULTILINE_FILE_PATHS.has(resolvedPath.normalizedPath)) {
    fail(`Error: --file is only supported for: ${Array.from(MULTILINE_FILE_PATHS).join(', ')}`);
  }

  return readFileSync(args.filePath, 'utf-8');
}

function getAtPath(root: unknown, segments: string[]): unknown {
  let current = root as Record<string, unknown> | undefined;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[segment] as Record<string, unknown> | undefined;
  }
  return current;
}

function setAtPath(root: Record<string, unknown>, segments: string[], value: unknown): void {
  let current = root;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index]!;
    const next = current[segment];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]!] = value;
}

function applyMutation(
  jsonDoc: Record<string, unknown>,
  args: ParsedArgs,
  resolvedPath: ResolvedPath,
): unknown {
  if (args.action === 'get') {
    return getAtPath(jsonDoc, resolvedPath.segments);
  }

  const rawValue = getRawValue(args, resolvedPath);

  if (args.action === 'append' || args.action === 'remove') {
    const current = getAtPath(jsonDoc, resolvedPath.segments);
    const currentArray = Array.isArray(current) ? [...current] : [];
    const values = normalizeArrayValues(resolvedPath.schema, rawValue);

    const next = args.action === 'append'
      ? [...currentArray, ...values]
      : currentArray.filter(item => !values.some(value => deepEqual(item, value)));

    setAtPath(jsonDoc, resolvedPath.segments, next);
    return next;
  }

  const typedValue = coerceValue(resolvedPath.schema, rawValue);
  if (ENUM_PATHS.has(resolvedPath.normalizedPath)) {
    const enumSchema = unwrapSchema(resolvedPath.schema);
    if (enumSchema instanceof z.ZodEnum && !enumSchema.options.includes(String(typedValue))) {
      fail(`Error: invalid enum value "${typedValue}". Allowed: ${enumSchema.options.join(', ')}`);
    }
  }

  setAtPath(jsonDoc, resolvedPath.segments, typedValue);
  return typedValue;
}

function printDryRun(filePath: string, before: string, after: string): void {
  console.log(`\n${bold(`[dry-run] ${filePath}`)}\n`);
  console.log(dim('--- current'));
  console.log(dim('+++ updated'));

  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  newLines.forEach((line, index) => {
    if (line !== oldLines[index]) {
      if (oldLines[index] !== undefined) {
        console.log(dim(`- ${oldLines[index]}`));
      }
      console.log(green(`+ ${line}`));
    }
  });

  console.log();
}

async function resolveTargets(args: ParsedArgs): Promise<Array<{ name: string; filePath: string; scope: 'default' | 'user' }>> {
  const loader = new SpecialistLoader();
  const allSpecialists = await loader.list();

  if (args.all) {
    return allSpecialists;
  }

  const match = allSpecialists.find(
    specialist => specialist.name === args.name && (args.scope === undefined || specialist.scope === args.scope),
  );

  if (!match) {
    const hint = args.scope ? ` (scope: ${args.scope})` : '';
    fail(`Error: specialist "${args.name}" not found${hint}\n  Run ${yellow('specialists list')} to see available specialists`);
  }

  return [match];
}

export async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));

  if (args.action === 'open-all') {
    openAllConfigSpecialistsInEditor();
    return;
  }

  if (args.action === 'list-presets') {
    const presets = loadPresets();
    const entries = Object.entries(presets);
    if (entries.length === 0) {
      console.log('No presets found. Create config/presets.json to define presets.');
      return;
    }
    for (const [name, preset] of entries) {
      console.log(`${bold(name)}  ${dim(preset.description ?? '')}`);
      for (const [field, val] of Object.entries(preset.fields)) {
        console.log(`  ${yellow(field)} = ${formatOutputValue(val)}`);
      }
    }
    return;
  }

  if (args.action === 'preset') {
    const presets = loadPresets();
    const preset = presets[args.preset!];
    if (!preset) {
      const available = Object.keys(presets).join(', ');
      fail(`Error: preset "${args.preset}" not found. Available: ${available || 'none'}`);
    }

    const targets = await resolveTargets(args);
    for (const target of targets) {
      const raw = readFileSync(target.filePath, 'utf-8');
      const doc = parseDocument(raw);

      for (const [fieldPath, fieldValue] of Object.entries(preset.fields)) {
        const resolved = resolvePath(fieldPath);
        const rawVal = typeof fieldValue === 'string' ? fieldValue : JSON.stringify(fieldValue);
        const typedValue = coerceValue(resolved.schema, rawVal);
        doc.setIn(resolved.segments, typedValue);
      }

      const updated = doc.toString();
      if (args.dryRun) {
        printDryRun(target.filePath, raw, updated);
        continue;
      }

      writeFileSync(target.filePath, updated, 'utf-8');
      const fieldList = Object.keys(preset.fields).map(f => yellow(f)).join(', ');
      console.log(`${green('✓')} ${bold(target.name)}: applied preset ${bold(args.preset!)} (${fieldList})`);
    }
    return;
  }

  const resolvedPath = resolvePath(args.path!);
  const targets = await resolveTargets(args);

  if (targets.length === 0) {
    fail('Error: no specialists found');
  }

  for (const target of targets) {
    const raw = readFileSync(target.filePath, 'utf-8');
    let doc: Record<string, unknown>;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        fail(`Error: specialist file must contain a JSON object (${target.filePath})`);
      }
      doc = parsed as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(`Error: failed to parse JSON in ${target.filePath}: ${message}`);
    }

    if (args.action === 'get') {
      const value = getAtPath(doc, resolvedPath.segments);
      console.log(`${yellow(target.name)}: ${formatOutputValue(value)}`);
      continue;
    }

    const nextValue = applyMutation(doc, args, resolvedPath);
    const updated = `${JSON.stringify(doc, null, 2)}\n`;

    if (args.dryRun) {
      printDryRun(target.filePath, raw, updated);
      continue;
    }

    writeFileSync(target.filePath, updated, 'utf-8');
    console.log(
      `${green('✓')} ${bold(target.name)}: ${yellow(resolvedPath.normalizedPath)} = ${formatOutputValue(nextValue)}` +
      dim(` (${target.filePath})`),
    );
  }
}
