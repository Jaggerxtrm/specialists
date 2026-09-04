import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as z from 'zod';
import { resolveSpecialistsRoot } from './resolve-specialists-root.mjs';

interface AddedField { path: string; value: unknown }
interface ScaffoldResult { value: unknown; added: AddedField[]; changed: boolean }

function usage(): never {
  console.error('Usage: bun scaffold-specialist.ts <path-to-specialist.json> | --all');
  process.exit(64);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalWithoutDefault(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodOptional) return true;
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodEffects) {
    return optionalWithoutDefault(schema instanceof z.ZodEffects ? schema.innerType() : schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) return false;
  return false;
}

function scaffold(schema: z.ZodTypeAny, current: unknown, parts: string[]): ScaffoldResult {
  if (schema instanceof z.ZodEffects) return scaffold(schema.innerType(), current, parts);
  if (schema instanceof z.ZodDefault) {
    if (current === undefined) {
      const nested = scaffold(schema._def.innerType, schema._def.defaultValue(), parts);
      return { value: nested.value, added: [{ path: parts.join('.'), value: nested.value }, ...nested.added], changed: true };
    }
    return scaffold(schema._def.innerType, current, parts);
  }
  if (schema instanceof z.ZodOptional) {
    return current === undefined ? { value: current, added: [], changed: false } : scaffold(schema.unwrap(), current, parts);
  }
  if (schema instanceof z.ZodNullable) {
    return current == null ? { value: current, added: [], changed: false } : scaffold(schema.unwrap(), current, parts);
  }
  if (schema instanceof z.ZodArray) {
    return current === undefined
      ? { value: [], added: [{ path: parts.join('.'), value: [] }], changed: true }
      : { value: current, added: [], changed: false };
  }
  if (schema instanceof z.ZodObject) {
    const source = isRecord(current) ? current : undefined;
    const draft: Record<string, unknown> = source ? { ...source } : {};
    const added: AddedField[] = [];
    let changed = false;
    for (const [key, child] of Object.entries(schema.shape)) {
      const result = scaffold(child as z.ZodTypeAny, source?.[key], [...parts, key]);
      if (!result.changed) continue;
      draft[key] = result.value;
      added.push(...result.added);
      changed = true;
    }
    if (!source && (!changed || optionalWithoutDefault(schema))) return { value: current, added, changed: false };
    return { value: changed ? draft : current, added, changed };
  }
  return { value: current, added: [], changed: false };
}

const root = resolveSpecialistsRoot();
const schemaUrl = pathToFileURL(path.join(root, 'src', 'specialist', 'schema.ts')).href;
const { SpecialistSchema } = await import(schemaUrl);

const arg = process.argv[2];
if (!arg) usage();
const targets = arg === '--all'
  ? readdirSync(path.join(root, 'config', 'specialists'))
      .filter((name) => name.endsWith('.specialist.json'))
      .sort()
      .map((name) => path.join(root, 'config', 'specialists', name))
  : [arg];

for (const file of targets) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`Expected JSON object in ${file}`);
  const result = scaffold(SpecialistSchema, parsed, []);
  if (!result.changed) continue;
  writeFileSync(file, `${JSON.stringify(result.value, null, 2)}\n`, 'utf8');
  for (const field of result.added) console.log(`${file}: ${field.path} = ${JSON.stringify(field.value)}`);
}
