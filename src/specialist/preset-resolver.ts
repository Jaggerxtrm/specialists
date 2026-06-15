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
}

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
    } catch {
      presetsCache = {};
      presetsCacheBaseDir = baseDir;
      return presetsCache;
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

  const nextValue = preset.fields[fieldPath];
  const nextVisited = new Set([...visited, presetName]);
  const resolved = resolvePresetReference(nextValue, fieldPath, presets, nextVisited, options);
  return { value: resolved.value, presetName, depth: resolved.depth };
}

export function isPresetReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PRESET_REFERENCE_PREFIX);
}

function formatReferenceLocation(specialist: string | undefined, fieldPath: string): string {
  return specialist ? `${specialist}.${fieldPath}` : fieldPath;
}
