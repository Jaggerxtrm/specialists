// ConfigView source: reads ~/.config/specialists/user.json and projects the
// override table for the console. Schema-driven allowed-input hints come
// from zod introspection where possible; primitive hints fall back to a
// static map co-located with the override leaf paths.
//
// READ-ONLY. writeGlobalUserConfig is intentionally NOT imported here.

import { homedir } from 'node:os';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import {
  getGlobalSpecialistOverrideLeafPaths,
  getGlobalUserConfigPath,
  GlobalSpecialistOverrideSchema,
  validateGlobalUserConfig,
  writeGlobalUserConfig,
  type GlobalConfigSource,
  type GlobalUserConfigPath,
} from '../../specialist/global-config.js';
import type { SpecialistLoader } from '../../specialist/loader.js';

export type ConfigFieldHint = string;

export interface ConfigField {
  path: string;
  value: unknown;
  allowedHint: ConfigFieldHint;
  isEnum: boolean;
  enumValues?: string[];
  isOverride: boolean;
  isBlocked: boolean;
}

export interface ConfigSpecialistRow {
  name: string;
  hasOverride: boolean;
  fields: ConfigField[];
  blockedWarnings: string[];
}

export interface ConfigSnapshot {
  path: string;
  displayPath: string;
  source: GlobalConfigSource;
  exists: boolean;
  parseError?: string;
  validationErrors: Array<{ path: string; message: string }>;
  specialists: ConfigSpecialistRow[];
}

const PRIMITIVE_HINT: Record<string, string> = {
  'execution.model': 'string | null',
  'execution.fallback_model': 'string | null',
  'execution.fallback_models': 'string[] | null',
  'execution.timeout_ms': 'int ≥ 0 | null',
  'execution.stall_timeout_ms': 'int ≥ 0 | null',
  'execution.max_retries': 'int ≥ 0 | null',
  'execution.prompt_limit_bytes': 'int > 0 | null',
  'execution.stdout_limit_bytes': 'int > 0 | null',
  'execution.extensions.serena': 'bool | null',
  'execution.extensions.gitnexus': 'bool | null',
  'beads_write_notes': 'bool | null',
  'output_file': 'string | null',
  'skills.paths': 'string[]',
};

export function readGlobalConfigSnapshot(loader?: SpecialistLoader): ConfigSnapshot {
  const location = getGlobalUserConfigPath();
  const exists = existsSync(location.path);
  const home = homedir();
  const displayPath = home && location.path.startsWith(home)
    ? location.path.replace(home, '~')
    : location.path;

  if (!exists) {
    return {
      path: location.path,
      displayPath,
      source: location.source,
      exists: false,
      validationErrors: [],
      specialists: [],
    };
  }

  let raw: string;
  try {
    raw = readFileSync(location.path, 'utf-8');
  } catch (error) {
    logConfigError('read', error);
    return {
      path: location.path,
      displayPath,
      source: location.source,
      exists,
      parseError: `read failed: ${describeError(error)}`,
      validationErrors: [],
      specialists: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    logConfigError('parse', error);
    return {
      path: location.path,
      displayPath,
      source: location.source,
      exists,
      parseError: `JSON parse error: ${describeError(error)}`,
      validationErrors: [],
      specialists: [],
    };
  }

  const validation = validateGlobalUserConfig(raw);
  const specialists = collectSpecialists(parsed, loader);
  return {
    path: location.path,
    displayPath,
    source: location.source,
    exists,
    validationErrors: validation.valid ? [] : validation.errors,
    specialists,
  };
}

function collectSpecialists(
  parsedConfig: unknown,
  loader?: SpecialistLoader,
): ConfigSpecialistRow[] {
  const knownNames = safeListNames(loader);
  let userKeys: string[] = [];
  if (isRecord(parsedConfig)) {
    userKeys = Object.keys(parsedConfig).filter((k) => !k.startsWith('_'));
  }
  const allNames = Array.from(new Set([...knownNames, ...userKeys])).sort();

  const leafPaths = getGlobalSpecialistOverrideLeafPaths();
  return allNames.map((name) => {
    const overrideObj = isRecord(parsedConfig) ? parsedConfig[name] : undefined;
    const hasOverride = isRecord(overrideObj);
    const fields: ConfigField[] = leafPaths.map((path) => {
      const value = hasOverride ? readLeaf(overrideObj as Record<string, unknown>, path) : undefined;
      const { hint, isEnum, enumValues } = describeLeaf(path);
      return {
        path,
        value,
        allowedHint: hint,
        isEnum,
        enumValues,
        isOverride: hasOverride && value !== null && value !== undefined,
        isBlocked: false,
      };
    });

    const blockedWarnings = safeBlockedWarnings(loader, name);
    return { name, hasOverride, fields, blockedWarnings };
  });
}

function safeListNames(loader?: SpecialistLoader): string[] {
  if (!loader) return [];
  try {
    const fn = (loader as unknown as { list?: () => Array<{ name: string }> }).list;
    if (typeof fn !== 'function') return [];
    return fn.call(loader).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function safeBlockedWarnings(loader: SpecialistLoader | undefined, name: string): string[] {
  if (!loader) return [];
  try {
    const fn = (loader as unknown as { getBlockedFieldWarnings?: (n: string) => string[] }).getBlockedFieldWarnings;
    if (typeof fn !== 'function') return [];
    return fn.call(loader, name) ?? [];
  } catch {
    return [];
  }
}

function readLeaf(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cursor: unknown = obj;
  for (const part of parts) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function describeLeaf(path: string): { hint: string; isEnum: boolean; enumValues?: string[] } {
  const enumValues = introspectEnumForPath(path);
  if (enumValues && enumValues.length > 0) {
    return { hint: `enum: ${enumValues.join('|')} | null`, isEnum: true, enumValues };
  }
  return { hint: PRIMITIVE_HINT[path] ?? 'string | null', isEnum: false };
}

function introspectEnumForPath(path: string): string[] | undefined {
  try {
    const rootShape = extractShape(GlobalSpecialistOverrideSchema as unknown as z.ZodTypeAny);
    if (!rootShape) return undefined;
    const parts = path.split('.');
    let node: z.ZodTypeAny | undefined = rootShape[parts[0]!];
    for (let i = 1; i < parts.length; i += 1) {
      if (!node) return undefined;
      const innerShape = extractShape(node);
      if (!innerShape) return undefined;
      node = innerShape[parts[i]!];
    }
    if (!node) return undefined;
    return extractEnumValues(node);
  } catch {
    return undefined;
  }
}

function extractShape(node: z.ZodTypeAny): Record<string, z.ZodTypeAny> | undefined {
  let current: z.ZodTypeAny | undefined = node;
  for (let i = 0; i < 6 && current; i += 1) {
    const def = (current as unknown as { _def?: Record<string, unknown> })._def;
    if (def) {
      if (typeof def.shape === 'function') {
        const got = (def.shape as () => Record<string, z.ZodTypeAny>)();
        if (got) return got;
      }
      if (def.shape && typeof def.shape === 'object') return def.shape as Record<string, z.ZodTypeAny>;
      const inner = (def.innerType ?? def.schema) as z.ZodTypeAny | undefined;
      if (inner) {
        current = inner;
        continue;
      }
    }
    const directShape = (current as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape;
    if (directShape) return directShape;
    return undefined;
  }
  return undefined;
}

function extractEnumValues(node: z.ZodTypeAny): string[] | undefined {
  let current: z.ZodTypeAny | undefined = node;
  for (let i = 0; i < 8 && current; i += 1) {
    const def = (current as unknown as { _def?: Record<string, unknown> })._def;
    if (!def) return undefined;
    const values = def.values as unknown;
    if (Array.isArray(values) && values.every((v) => typeof v === 'string')) return values as string[];
    const entries = def.entries as Record<string, string> | undefined;
    if (entries && typeof entries === 'object') {
      const vals = Object.values(entries).filter((v): v is string => typeof v === 'string');
      if (vals.length > 0) return vals;
    }
    current = (def.innerType ?? def.schema) as z.ZodTypeAny | undefined;
  }
  return undefined;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function logConfigError(op: 'read' | 'parse', error: unknown): void {
  try {
    const errorClass = error instanceof Error ? error.name : 'unknown';
    process.stderr.write(JSON.stringify({
      ts: new Date().toISOString(),
      component: 'sp-console',
      op: 'read_global_config',
      step: op,
      errorClass,
    }) + '\n');
  } catch {
    // swallow
  }
}

export function formatConfigValue(value: unknown): string {
  if (value === undefined || value === null) return 'inherit';
  if (Array.isArray(value)) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

// ---------- Phase 7: inline edit ----------

export interface CoerceResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function getLeafSchema(path: string): z.ZodTypeAny | undefined {
  try {
    const rootShape = extractShape(GlobalSpecialistOverrideSchema as unknown as z.ZodTypeAny);
    if (!rootShape) return undefined;
    const parts = path.split('.');
    let node: z.ZodTypeAny | undefined = rootShape[parts[0]!];
    for (let i = 1; i < parts.length; i += 1) {
      if (!node) return undefined;
      const innerShape = extractShape(node);
      if (!innerShape) return undefined;
      node = innerShape[parts[i]!];
    }
    return node;
  } catch {
    return undefined;
  }
}

function unwrapNullableOptional(node: z.ZodTypeAny): { inner: z.ZodTypeAny; nullable: boolean } {
  let current: z.ZodTypeAny = node;
  let nullable = false;
  for (let i = 0; i < 6; i += 1) {
    const def = (current as unknown as { _def?: Record<string, unknown> })._def;
    if (!def) break;
    const typeName = def.typeName as string | undefined;
    if (typeName === 'ZodNullable' || typeName === 'ZodOptional') {
      nullable = nullable || typeName === 'ZodNullable';
      const inner = def.innerType as z.ZodTypeAny | undefined;
      if (!inner) break;
      current = inner;
      continue;
    }
    break;
  }
  return { inner: current, nullable };
}

export function coerceFieldValue(path: string, rawInput: string): CoerceResult {
  const node = getLeafSchema(path);
  if (!node) return { ok: false, error: `unknown leaf: ${path}` };
  const trimmed = rawInput.trim();
  const { inner, nullable } = unwrapNullableOptional(node);

  if (trimmed === '' || trimmed === 'null' || trimmed.toLowerCase() === 'inherit') {
    if (nullable) return { ok: true, value: null };
    return { ok: false, error: 'field is not nullable' };
  }

  const def = (inner as unknown as { _def?: Record<string, unknown> })._def ?? {};
  const typeName = def.typeName as string | undefined;

  switch (typeName) {
    case 'ZodBoolean': {
      if (/^(true|false)$/i.test(trimmed)) return { ok: true, value: trimmed.toLowerCase() === 'true' };
      return { ok: false, error: 'expected true|false' };
    }
    case 'ZodNumber': {
      const parsed = trimmed.includes('.') ? Number.parseFloat(trimmed) : Number.parseInt(trimmed, 10);
      if (!Number.isFinite(parsed)) return { ok: false, error: 'expected a number' };
      return { ok: true, value: parsed };
    }
    case 'ZodEnum':
    case 'ZodNativeEnum': {
      const values = (def.values as unknown[] | undefined) ?? Object.values(def.entries as Record<string, unknown> ?? {});
      const accepted = values.filter((v): v is string => typeof v === 'string');
      if (accepted.includes(trimmed)) return { ok: true, value: trimmed };
      return { ok: false, error: `expected one of: ${accepted.join('|')}` };
    }
    case 'ZodArray': {
      if (trimmed.startsWith('[')) {
        try {
          const arr = JSON.parse(trimmed) as unknown;
          if (!Array.isArray(arr)) return { ok: false, error: 'expected JSON array' };
          return { ok: true, value: arr };
        } catch {
          return { ok: false, error: 'invalid JSON array' };
        }
      }
      const items = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
      return { ok: true, value: items };
    }
    case 'ZodString':
    default:
      return { ok: true, value: trimmed };
  }
}

export function applyFieldEdit(
  raw: Record<string, unknown>,
  specialist: string,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const clone: Record<string, unknown> = structuredClone(raw);
  const top = (clone[specialist] as Record<string, unknown> | undefined) ?? {};
  const parts = path.split('.');
  let cursor: Record<string, unknown> = top;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const existing = cursor[key];
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      cursor = existing as Record<string, unknown>;
    } else {
      const next: Record<string, unknown> = {};
      cursor[key] = next;
      cursor = next;
    }
  }
  cursor[parts[parts.length - 1]!] = value;
  clone[specialist] = top;
  return clone;
}

export interface WriteOutcome {
  ok: boolean;
  errors?: Array<{ path: string; message: string }>;
  errorClass?: string;
}

export function writeGlobalConfigSafe(
  rawObj: Record<string, unknown>,
  expectedMtimeMs?: number,
): WriteOutcome {
  const location = getGlobalUserConfigPath();
  if (typeof expectedMtimeMs === 'number' && existsSync(location.path)) {
    try {
      const stat = statSync(location.path);
      if (Math.floor(stat.mtimeMs) !== Math.floor(expectedMtimeMs)) {
        return { ok: false, errorClass: 'mtime_mismatch' };
      }
    } catch {
      return { ok: false, errorClass: 'stat_failed' };
    }
  }
  const validation = validateGlobalUserConfig(JSON.stringify(rawObj));
  if (!validation.valid) return { ok: false, errors: validation.errors };
  try {
    writeGlobalUserConfig({ ...location, exists: true } as GlobalUserConfigPath, rawObj as any);
    return { ok: true };
  } catch (error) {
    logConfigWriteError(error);
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return { ok: false, errorClass: code ?? (error instanceof Error ? error.name : 'unknown') };
  }
}

export function statConfigFileMtimeMs(): number | undefined {
  const location = getGlobalUserConfigPath();
  try {
    if (!existsSync(location.path)) return undefined;
    return statSync(location.path).mtimeMs;
  } catch {
    return undefined;
  }
}

function logConfigWriteError(error: unknown): void {
  try {
    const errorClass = (error as NodeJS.ErrnoException | undefined)?.code
      ?? (error instanceof Error ? error.name : 'unknown');
    process.stderr.write(JSON.stringify({
      ts: new Date().toISOString(),
      component: 'sp-console',
      op: 'write_global_config',
      errorClass,
    }) + '\n');
  } catch {
    // swallow
  }
}
