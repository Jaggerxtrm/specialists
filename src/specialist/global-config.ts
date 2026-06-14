// src/specialist/global-config.ts
//
// Global user override layer: ~/.config/specialists/user.json
// Single source of truth for path resolution + override template shape.
// Shared by: sp init --global (cli/init.ts), sp edit --global (cli/edit.ts),
// the SpecialistLoader merge (C1 chain), and sp doctor (C3 chain).
//
// Merge precedence at runtime (loader-owned, documented here for context):
//   repo .specialists/user/  >  global user.json  >  package canonical
// A null/empty override field means "inherit from the layer below".

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import * as z from 'zod';

const CONFIG_FILENAME = 'user.json';
const SPECIALISTS_SUBDIR = 'specialists';

export type GlobalConfigSource = 'xdg' | 'config-home' | 'legacy';

export interface GlobalUserConfigPath {
  /** Absolute path to user.json (may not exist yet). */
  path: string;
  /** Whether the resolved path currently exists on disk. */
  exists: boolean;
  /** Which resolution rule produced this path. */
  source: GlobalConfigSource;
}

/**
 * Resolve the global user-config path. Resolution order:
 *   1. $XDG_CONFIG_HOME/specialists/user.json      -> source: 'xdg'
 *   2. $HOME/.config/specialists/user.json         -> source: 'config-home'
 *   3. $HOME/.specialists/user.json (read-only)    -> source: 'legacy'
 *
 * When $XDG_CONFIG_HOME is set it always wins (write target).
 * When unset, config-home is the write target; legacy is a read-only
 * fallback surfaced only when config-home is absent but legacy exists.
 */
export function getGlobalUserConfigPath(): GlobalUserConfigPath {
  const home = process.env.HOME?.trim() || homedir();

  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  if (xdgConfigHome) {
    const xdgPath = join(xdgConfigHome, SPECIALISTS_SUBDIR, CONFIG_FILENAME);
    return { path: xdgPath, exists: existsSync(xdgPath), source: 'xdg' };
  }

  const configHomePath = join(home, '.config', SPECIALISTS_SUBDIR, CONFIG_FILENAME);
  if (existsSync(configHomePath)) {
    return { path: configHomePath, exists: true, source: 'config-home' };
  }

  const legacyPath = join(home, '.specialists', CONFIG_FILENAME);
  if (existsSync(legacyPath)) {
    return { path: legacyPath, exists: true, source: 'legacy' };
  }

  return { path: configHomePath, exists: false, source: 'config-home' };
}

// ── Override schema ────────────────────────────────────────────────────────────
// Mirrors the override-allowed field set from the loader contract.
// null / [] = "inherit from the layer below".

const OverrideExecutionSchema = z.object({
  model: z.string().nullable(),
  fallback_model: z.string().nullable(),
  timeout_ms: z.number().nullable(),
  stall_timeout_ms: z.number().nullable(),
  thinking_level: z
    .enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])
    .nullable(),
  max_retries: z.number().int().min(0).nullable(),
}).strict();

const OverrideSkillsSchema = z.object({
  paths: z.array(z.string()),
}).strict();

export const GlobalSpecialistOverrideSchema = z.object({
  execution: OverrideExecutionSchema,
  beads_write_notes: z.boolean().nullable(),
  skills: OverrideSkillsSchema,
}).strict();

export type GlobalSpecialistOverride = z.infer<typeof GlobalSpecialistOverrideSchema>;

/** Top-level shape: { "<specialist-name>": GlobalSpecialistOverride }. */
export const GlobalUserConfigSchema = z.record(
  z.string(),
  GlobalSpecialistOverrideSchema,
);

export type GlobalUserConfig = z.infer<typeof GlobalUserConfigSchema>;

export interface GlobalConfigValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

/**
 * Build the override template for a single specialist (all fields defaulted to
 * null / [] = inherit). Used by sp init --global to seed each specialist entry.
 */
export function buildSpecialistOverrideTemplate(): GlobalSpecialistOverride {
  return {
    execution: {
      model: null,
      fallback_model: null,
      timeout_ms: null,
      stall_timeout_ms: null,
      thinking_level: null,
      max_retries: null,
    },
    beads_write_notes: null,
    skills: { paths: [] },
  };
}

/**
 * Build the full global config template keyed by specialist name.
 * @param specialistNames - every specialist currently visible to SpecialistLoader.list()
 */
export function buildGlobalUserConfigTemplate(
  specialistNames: ReadonlyArray<string>,
): GlobalUserConfig {
  const template: GlobalUserConfig = {};
  for (const name of specialistNames) {
    template[name] = buildSpecialistOverrideTemplate();
  }
  return template;
}

/**
 * Recursively fill missing keys from `defaults` into `target` without ever
 * overwriting an existing value (including explicit nulls a user may have set).
 * Arrays are treated as leaf values (not recursed).
 */
function fillMissingDefaults(
  target: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!(key in target)) {
      target[key] = structuredClone(defaultValue);
      continue;
    }

    const currentValue = target[key];
    if (
      currentValue !== null &&
      typeof currentValue === 'object' &&
      !Array.isArray(currentValue) &&
      defaultValue !== null &&
      typeof defaultValue === 'object' &&
      !Array.isArray(defaultValue)
    ) {
      fillMissingDefaults(
        currentValue as Record<string, unknown>,
        defaultValue as Record<string, unknown>,
      );
    }
  }
  return target;
}

export interface GlobalConfigMergeResult {
  config: GlobalUserConfig;
  added: string[];
  extended: string[];
  removed: string[];
}

/**
 * Idempotent merge: extend an existing global config with newly-shipped
 * specialists and fill any missing override fields with defaults.
 * NEVER clobbers a user-filled value. Removed specialists STAY in the file.
 *
 * @param existing - parsed existing config (may be empty)
 * @param template - fresh template built from SpecialistLoader.list()
 */
export function mergeGlobalUserConfig(
  existing: Readonly<Record<string, unknown>>,
  template: GlobalUserConfig,
): GlobalConfigMergeResult {
  const merged: GlobalUserConfig = {};
  const added: string[] = [];
  const extended: string[] = [];
  const removed: string[] = [];

  // 1. Preserve existing specialists, filling missing override fields.
  for (const [name, rawExisting] of Object.entries(existing)) {
    const templateOverride = template[name];
    if (templateOverride) {
      const normalized = fillMissingDefaults(
        (rawExisting && typeof rawExisting === 'object' ? { ...rawExisting } : {}) as Record<string, unknown>,
        templateOverride as unknown as Record<string, unknown>,
      );
      merged[name] = normalized as unknown as GlobalSpecialistOverride;
      extended.push(name);
    } else {
      // Specialist no longer shipped — keep verbatim, flag as removed.
      merged[name] = rawExisting as unknown as GlobalSpecialistOverride;
      removed.push(name);
    }
  }

  // 2. Append newly-shipped specialists not already in the file.
  for (const [name, override] of Object.entries(template)) {
    if (!(name in existing)) {
      merged[name] = override;
      added.push(name);
    }
  }

  return { config: merged, added, extended, removed };
}

/**
 * Validate a raw JSON string against the global user-config schema.
 * Returns structured errors; never throws on invalid input.
 */
export function validateGlobalUserConfig(
  jsonContent: string,
): GlobalConfigValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      errors: [{ path: 'json', message: `JSON parse error: ${message}` }],
    };
  }

  const result = GlobalUserConfigSchema.safeParse(raw);
  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors = result.error.issues.map(issue => ({
    path: issue.path.map(p => (typeof p === 'number' ? `[${p}]` : p)).join('.'),
    message: issue.message,
  }));
  return { valid: false, errors };
}

/**
 * Read and parse the global user config. Returns null if the file does not
 * exist. Throws on invalid JSON. Callers validating before use should prefer
 * {@link validateGlobalUserConfig}.
 */
export function readGlobalUserConfig(
  location: GlobalUserConfigPath,
): GlobalUserConfig | null {
  if (!location.exists) return null;
  const content = readFileSync(location.path, 'utf-8');
  return JSON.parse(content) as GlobalUserConfig;
}

/**
 * Write the global user config, creating parent directories as needed.
 */
export function writeGlobalUserConfig(
  location: GlobalUserConfigPath,
  config: GlobalUserConfig,
): void {
  mkdirSync(dirname(location.path), { recursive: true });
  writeFileSync(location.path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

export { SPECIALISTS_SUBDIR, CONFIG_FILENAME };
