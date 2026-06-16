// ConfigView source: reads ~/.config/specialists/user.json and projects the
// override table for the console. Schema-driven allowed-input hints come
// from zod introspection where possible; primitive hints fall back to a
// static map co-located with the override leaf paths.
//
// READ-ONLY. writeGlobalUserConfig is intentionally NOT imported here.

import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  getGlobalSpecialistOverrideLeafPaths,
  getGlobalUserConfigPath,
  GlobalSpecialistOverrideSchema,
  validateGlobalUserConfig,
  type GlobalConfigSource,
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
