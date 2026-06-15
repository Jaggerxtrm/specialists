import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PRESET_REFERENCE_PREFIX = '@preset/';
export const PRESET_REFERENCE_MAX_DEPTH = 4;

export interface PresetDefinition {
  description: string;
  fields: Record<string, unknown>;
}

export interface LoadPresetsOptions {
  force?: boolean;
  baseDir?: string;
}

export interface ResolvePresetOptions {
  specialist?: string;
  arrayEntry?: boolean;
}

type PresetValueType = 'string-or-null' | 'string-array-or-null' | 'number';

export interface PresetResolution {
  value: unknown;
  presetName?: string;
  depth: number;
}

let presetsCache: Record<string, PresetDefinition> | null = null;
let presetsCacheBaseDir: string | null = null;

export class SpecialistPresetNotFoundError extends Error {
  constructor(
    public readonly presetName: string,
    public readonly specialist: string | undefined,
    public readonly fieldPath: string,
    public readonly knownPresets: readonly string[],
  ) {
    super(
      `preset "${presetName}" referenced by ${formatReferenceLocation(specialist, fieldPath)} not found in config/presets.json. Known presets: ${knownPresets.join(', ') || '(none)'}`,
    );
    this.name = 'SpecialistPresetNotFoundError';
  }
}

export class SpecialistPresetCycleError extends Error {
  constructor(
    public readonly visited: readonly string[],
    public readonly specialist: string | undefined,
    public readonly fieldPath: string,
  ) {
    super(
      `preset cycle referenced by ${formatReferenceLocation(specialist, fieldPath)}: ${visited.join(' -> ')}`,
    );
    this.name = 'SpecialistPresetCycleError';
  }
}

export class SpecialistPresetTypeError extends Error {
  constructor(
    public readonly presetName: string,
    public readonly specialist: string | undefined,
    public readonly fieldPath: string,
    public readonly expectedType: string,
    public readonly actualType: string,
  ) {
    super(
      `preset "${presetName}" referenced by ${formatReferenceLocation(specialist, fieldPath)} resolved invalid value type: expected ${expectedType}, got ${actualType}`,
    );
    this.name = 'SpecialistPresetTypeError';
  }
}

export class SpecialistPresetConfigError extends Error {
  constructor(
    public readonly configPath: string,
    public readonly cause: unknown,
  ) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`failed to load presets from ${configPath}: ${message}`);
    this.name = 'SpecialistPresetConfigError';
  }
}

export class SpecialistPresetFieldMissingError extends Error {
  constructor(
    public readonly presetName: string,
    public readonly specialist: string | undefined,
    public readonly fieldPath: string,
    public readonly definedKeys: readonly string[],
  ) {
    super(
      `preset "${presetName}" referenced by ${formatReferenceLocation(specialist, fieldPath)} does not define ${fieldPath}. Defined keys: ${definedKeys.join(', ') || '(none)'}`,
    );
    this.name = 'SpecialistPresetFieldMissingError';
  }
}

export function loadPresets(options: LoadPresetsOptions = {}): Record<string, PresetDefinition> {
  const baseDir = options.baseDir ?? process.cwd();
  if (presetsCache && presetsCacheBaseDir === baseDir && !options.force) return presetsCache;

  const paths = [
    join(baseDir, 'config', 'presets.json'),
    join(baseDir, 'config', 'specialists', 'presets.json'),
  ];

  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      presetsCache = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, PresetDefinition>;
      presetsCacheBaseDir = baseDir;
      return presetsCache;
    } catch (error) {
      presetsCache = null;
      presetsCacheBaseDir = null;
      throw new SpecialistPresetConfigError(path, error);
    }
  }

  presetsCache = {};
  presetsCacheBaseDir = baseDir;
  return presetsCache;
}

export function resolvePresetReference(
  value: unknown,
  fieldPath: string,
  presets: Record<string, PresetDefinition>,
  visited = new Set<string>(),
  options: ResolvePresetOptions = {},
): PresetResolution {
  if (!isPresetReference(value)) return { value, depth: visited.size };

  const presetName = value.slice(PRESET_REFERENCE_PREFIX.length);
  if (visited.has(presetName)) {
    throw new SpecialistPresetCycleError([...visited, presetName], options.specialist, fieldPath);
  }
  if (visited.size >= PRESET_REFERENCE_MAX_DEPTH) {
    throw new SpecialistPresetCycleError([...visited, presetName], options.specialist, fieldPath);
  }

  const preset = presets[presetName];
  if (!preset) {
    throw new SpecialistPresetNotFoundError(presetName, options.specialist, fieldPath, Object.keys(presets));
  }

  if (!Object.prototype.hasOwnProperty.call(preset.fields, fieldPath)) {
    throw new SpecialistPresetFieldMissingError(
      presetName,
      options.specialist,
      fieldPath,
      Object.keys(preset.fields),
    );
  }

  const nextValue = preset.fields[fieldPath];
  const nextVisited = new Set([...visited, presetName]);
  const resolved = resolvePresetReference(nextValue, fieldPath, presets, nextVisited, options);
  validateResolvedPresetValue(resolved.value, fieldPath, presetName, options);
  return { value: resolved.value, presetName, depth: resolved.depth };
}

export function isPresetReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PRESET_REFERENCE_PREFIX);
}

function validateResolvedPresetValue(
  value: unknown,
  fieldPath: string,
  presetName: string,
  options: ResolvePresetOptions,
): void {
  const expectedType = getExpectedPresetValueType(fieldPath, options.arrayEntry === true);
  if (!expectedType) return;
  if (matchesExpectedPresetValueType(value, expectedType)) return;

  throw new SpecialistPresetTypeError(
    presetName,
    options.specialist,
    fieldPath,
    formatExpectedType(expectedType),
    formatActualType(value),
  );
}

function getExpectedPresetValueType(fieldPath: string, isArrayEntry: boolean): PresetValueType | null {
  if (fieldPath === 'specialist.execution.fallback_models' && isArrayEntry) return 'string-or-null';

  switch (fieldPath) {
    case 'specialist.execution.model':
    case 'specialist.execution.fallback_model':
    case 'specialist.execution.thinking_level':
      return 'string-or-null';
    case 'specialist.execution.fallback_models':
      return 'string-array-or-null';
    case 'specialist.execution.stall_timeout_ms':
      return 'number';
    default:
      return null;
  }
}

function matchesExpectedPresetValueType(value: unknown, expectedType: PresetValueType): boolean {
  switch (expectedType) {
    case 'string-or-null':
      return value === null || typeof value === 'string';
    case 'string-array-or-null':
      return value === null || (Array.isArray(value) && value.every(entry => typeof entry === 'string'));
    case 'number':
      return typeof value === 'number';
    default:
      return expectedType satisfies never;
  }
}

function formatExpectedType(expectedType: PresetValueType): string {
  switch (expectedType) {
    case 'string-or-null':
      return 'string or null';
    case 'string-array-or-null':
      return 'string[] or null';
    case 'number':
      return 'number';
    default:
      return expectedType satisfies never;
  }
}

function formatActualType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.map(formatActualType).join(', ')})`;
  return typeof value;
}

function formatReferenceLocation(specialist: string | undefined, fieldPath: string): string {
  return specialist ? `${specialist}.${fieldPath}` : fieldPath;
}
