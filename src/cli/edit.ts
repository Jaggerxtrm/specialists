// src/cli/edit.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { SpecialistLoader } from '../specialist/loader.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ── Editable fields ────────────────────────────────────────────────────────────
// Maps CLI flag → YAML path within the specialist document
const FIELD_MAP: Record<string, string[]> = {
  'model':              ['specialist', 'execution', 'model'],
  'fallback-model':     ['specialist', 'execution', 'fallback_model'],
  'description':        ['specialist', 'metadata', 'description'],
  'permission':         ['specialist', 'execution', 'permission_required'],
  'timeout':            ['specialist', 'execution', 'timeout_ms'],
  'tags':               ['specialist', 'metadata', 'tags'],
};

const VALID_PERMISSIONS = ['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH'];

// ── Arg parser ─────────────────────────────────────────────────────────────────
interface EditArgs {
  name: string;
  field: string;
  value: string;
  dryRun: boolean;
  scope?: 'default' | 'user';
}

function parseArgs(argv: string[]): EditArgs {
  const name = argv[0];
  if (!name || name.startsWith('--')) {
    console.error('Usage: specialists|sp edit <name> --<field> <value> [--dry-run]');
    console.error(`  Fields: ${Object.keys(FIELD_MAP).join(', ')}`);
    process.exit(1);
  }

  let field: string | undefined;
  let value: string | undefined;
  let dryRun = false;
  let scope: 'default' | 'user' | undefined;

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];

    if (token === '--dry-run') { dryRun = true; continue; }

    if (token === '--scope') {
      const v = argv[++i];
      if (v !== 'default' && v !== 'user') {
        console.error(`Error: --scope must be "default" or "user", got: "${v ?? ''}"`);
        process.exit(1);
      }
      scope = v as 'default' | 'user';
      continue;
    }

    if (token.startsWith('--') && !field) {
      field = token.slice(2);
      value = argv[++i];
      continue;
    }
  }

  if (!field || !FIELD_MAP[field]) {
    console.error(`Error: unknown or missing field. Valid fields: ${Object.keys(FIELD_MAP).join(', ')}`);
    process.exit(1);
  }

  if (value === undefined || value === '') {
    console.error(`Error: --${field} requires a value`);
    process.exit(1);
  }

  // Validate permission values
  if (field === 'permission' && !VALID_PERMISSIONS.includes(value)) {
    console.error(`Error: --permission must be one of: ${VALID_PERMISSIONS.join(', ')}`);
    process.exit(1);
  }

  // Coerce timeout to number string (guard against non-numeric)
  if (field === 'timeout' && !/^\d+$/.test(value)) {
    console.error('Error: --timeout must be a number (milliseconds)');
    process.exit(1);
  }

  return { name, field, value, dryRun, scope };
}

// ── YAML field setter ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setIn(doc: ReturnType<typeof parseDocument>, path: string[], value: any): void {
  // Navigate to parent node and set the leaf
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = doc;
  for (let i = 0; i < path.length - 1; i++) {
    node = node.get(path[i], true); // true = keep node reference
  }
  const leaf = path[path.length - 1];

  if (Array.isArray(value)) {
    node.set(leaf, value);
  } else {
    node.set(leaf, value);
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  const { name, field, value, dryRun, scope } = args;

  // Find the specialist file
  const loader = new SpecialistLoader();
  const all = await loader.list();
  const match = all.find(s =>
    s.name === name && (scope === undefined || s.scope === scope)
  );

  if (!match) {
    const hint = scope ? ` (scope: ${scope})` : '';
    console.error(`Error: specialist "${name}" not found${hint}`);
    console.error(`  Run ${yellow('specialists list')} to see available specialists`);
    process.exit(1);
  }

  // Read and parse YAML (preserves comments and formatting)
  const raw = readFileSync(match.filePath, 'utf-8');
  const doc = parseDocument(raw);

  // Determine the typed value to set
  const yamlPath = FIELD_MAP[field];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let typedValue: any = value;

  if (field === 'timeout') {
    typedValue = parseInt(value, 10);
  } else if (field === 'tags') {
    typedValue = value.split(',').map(t => t.trim()).filter(Boolean);
  }

  // Apply the change
  setIn(doc, yamlPath, typedValue);
  const updated = doc.toString();

  if (dryRun) {
    console.log(`\n${bold(`[dry-run] ${match.filePath}`)}\n`);
    console.log(dim('--- current'));
    console.log(dim(`+++ updated`));
    // Show only the changed line in context
    const oldLines = raw.split('\n');
    const newLines = updated.split('\n');
    newLines.forEach((line, i) => {
      if (line !== oldLines[i]) {
        if (oldLines[i] !== undefined) console.log(dim(`- ${oldLines[i]}`));
        console.log(green(`+ ${line}`));
      }
    });
    console.log();
    return;
  }

  writeFileSync(match.filePath, updated, 'utf-8');

  const displayValue = field === 'tags'
    ? `[${(typedValue as string[]).join(', ')}]`
    : String(typedValue);

  console.log(
    `${green('✓')} ${bold(name)}: ${yellow(field)} = ${displayValue}` +
    dim(` (${match.filePath})`)
  );
}
