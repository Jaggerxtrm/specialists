// src/specialist/loader.ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  parseSpecialist,
  BLOCKED_OVERRIDE_FIELDS,
  OVERRIDE_ALLOWED_EXECUTION_FIELDS,
  OVERRIDE_ALLOWED_NESTED_EXECUTION_PATHS,
  OVERRIDE_ALLOWED_PROMPT_FIELDS,
  OVERRIDE_ALLOWED_STALL_DETECTION_PATHS,
  OVERRIDE_ALLOWED_TOP_FIELDS,
  type ScriptEntry,
  type Specialist,
  type BlockedFieldWarning,
} from './schema.js';
import { resolveCanonicalAssetDir } from './canonical-asset-resolver.js';
import {
  getGlobalUserConfigPath,
  readGlobalUserConfig,
  type GlobalUserConfigPath,
} from './global-config.js';
import { loadPresets, resolvePresetReference } from './preset-resolver.js';

export interface StallDetectionConfig {
  running_silence_warn_ms?: number;
  running_silence_error_ms?: number;
  waiting_stale_ms?: number;
  waiting_auto_close_ms?: number | null;
  tool_duration_warn_ms?: number;
}

export interface SpecialistSummary {
  name: string;
  description: string;
  category: string;
  version: string;
  /** Merged model after layer overrides. Empty string when no layer supplies a model. */
  model: string;
  permission_required: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
  interactive: boolean;
  thinking_level?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  skills: string[];
  scripts: ScriptEntry[];
  mandatoryRuleTemplateSets: string[];
  scope: 'user' | 'default' | 'package';
  /**
   * Scope says where override came from.
   * user = repo authoring layer, default = repo-managed mirror, package = upstream fallback.
   */
  source: 'user' | 'default-mirror' | 'package-fallback' | 'package-live' | 'legacy';
  filePath: string;
  updated?: string;
  filestoWatch?: string[];
  staleThresholdDays?: number;
  stallDetection?: StallDetectionConfig;
}

/** Thrown by SpecialistLoader.get when execution.model is null/empty after all overrides merge. */
export class SpecialistMissingModelError extends Error {
  constructor(public readonly specialistName: string) {
    super(
      `specialist '${specialistName}' has no model configured. ` +
        `Run: sp edit --global ${specialistName}.execution.model <model-id> ` +
        `(or 'sp init --global' to create the global user config file first).`,
    );
    this.name = 'SpecialistMissingModelError';
  }
}

/** Returns STALE, AGED, or OK based on file mtimes vs metadata.updated */
export async function checkStaleness(
  summary: SpecialistSummary,
): Promise<'OK' | 'STALE' | 'AGED'> {
  if (!summary.filestoWatch?.length || !summary.updated) return 'OK';
  const updatedMs = new Date(summary.updated).getTime();
  if (isNaN(updatedMs)) return 'OK';

  for (const file of summary.filestoWatch) {
    const fileStat = await stat(file).catch(() => null);
    if (fileStat && fileStat.mtimeMs > updatedMs) {
      // File changed after last specialist update — check if AGED
      const daysSinceUpdate = (Date.now() - updatedMs) / 86_400_000;
      if (summary.staleThresholdDays && daysSinceUpdate > summary.staleThresholdDays) {
        return 'AGED';
      }
      return 'STALE';
    }
  }
  return 'OK';
}

interface LoaderOptions {
  projectDir?: string;
}

type ScanDirScope = SpecialistSummary['scope'];
type ScanDirSource = SpecialistSummary['source'];

interface ResolvedSpecPath {
  filePath: string;
  deprecatedYaml: boolean;
}

interface ScanDir {
  path: string;
  scope: ScanDirScope;
  source: ScanDirSource;
}

interface MergeOutcome {
  /** Spec after layer-merge applied. */
  spec: Specialist;
  /** Scope/source of the highest-priority layer that contributed a file for this name. */
  topLayer: { scope: ScanDirScope; source: ScanDirSource; filePath: string; deprecatedYaml: boolean };
  /** Warnings for blocked-field attempts across all override layers. */
  warnings: BlockedFieldWarning[];
}

export class SpecialistLoader {
  private cache = new Map<string, Specialist>();
  private blockedFieldWarnings = new Map<string, BlockedFieldWarning[]>();
  private projectDir: string;

  constructor(options: LoaderOptions = {}) {
    this.projectDir = options.projectDir ?? process.cwd();
  }

  /**
   * Scan dirs in priority order: highest-priority layer FIRST (user → package).
   *
   * KAN-90 three-layer contract:
   *   package canonical → ~/.config/specialists/user.json → repo .specialists/user/<name>
   *
   * The repo `.specialists/default/` mirror was retired by commit 31a6421c
   * ("reconcile: empty .specialists/default/ — live-from-package canonical resolves all")
   * and is no longer walked by the loader. Stale `.specialists/default/` files left
   * behind on disk are detected by `drift-detector` and removed by `sp prune-stale-defaults`,
   * but they no longer feed into the merge. The legacy paths `./specialists`,
   * `.claude/specialists`, and `.agent-forge/specialists` are likewise no longer
   * authoritative — they belonged to the same `scope: 'default'` tier.
   */
  private getScanDirs(): ScanDir[] {
    const dirs: ScanDir[] = [
      // Repo authoring layer (highest priority). Full-spec replacement.
      { path: join(this.projectDir, '.specialists', 'user'), scope: 'user', source: 'user' },
      // Back-compat nested user path — migration bridge only.
      { path: join(this.projectDir, '.specialists', 'user', 'specialists'), scope: 'user', source: 'legacy' },

      // Package canonical (read-only fallback). The merge base.
      { path: join(this.projectDir, 'config', 'specialists'), scope: 'package', source: 'package-fallback' },
      { path: resolveCanonicalAssetDir('specialists') ?? '', scope: 'package', source: 'package-live' },
    ];
    return dirs.filter(d => d.path && existsSync(d.path));
  }

  private toJson(content: string, isYaml: boolean): string {
    if (!isYaml) return content;
    return JSON.stringify(parseYaml(content));
  }

  private resolveSpecialistPath(dirPath: string, specialistName: string): ResolvedSpecPath | null {
    const jsonPath = join(dirPath, `${specialistName}.specialist.json`);
    if (existsSync(jsonPath)) {
      return { filePath: jsonPath, deprecatedYaml: false };
    }

    const yamlPath = join(dirPath, `${specialistName}.specialist.yaml`);
    if (existsSync(yamlPath)) {
      return { filePath: yamlPath, deprecatedYaml: true };
    }

    return null;
  }

  /** Find every layer that has a file for `name`, ordered base-first (package → user). */
  private findLayerHits(name: string): Array<{ dir: ScanDir; resolved: ResolvedSpecPath }> {
    const hits: Array<{ dir: ScanDir; resolved: ResolvedSpecPath }> = [];
    const seenScopes = new Set<ScanDirScope>();
    // Walk top-down (user → package), then reverse so caller has base-first order.
    for (const dir of this.getScanDirs()) {
      const resolved = this.resolveSpecialistPath(dir.path, name);
      if (!resolved) continue;
      // Only one file per scope contributes — the first dir hit per scope.
      if (seenScopes.has(dir.scope)) continue;
      seenScopes.add(dir.scope);
      hits.push({ dir, resolved });
    }
    // Reverse so base (package) is first; caller applies overrides on top.
    return hits.reverse();
  }

  /**
   * Apply override-allowed fields from `override` onto `base`, in place.
   * `source` controls blocked-field severity ('strip' for global, 'warn' for repo layers).
   * Returns warnings (does NOT mutate the warnings store).
   */
  private applyOverrideFields(
    name: string,
    base: Specialist,
    override: Record<string, unknown>,
    source: BlockedFieldWarning['source'],
  ): BlockedFieldWarning[] {
    const warnings: BlockedFieldWarning[] = [];
    const baseSpec = base.specialist as Record<string, unknown>;
    const overrideSpec = (override.specialist ?? override) as Record<string, unknown>;

    // 1. Detect blocked fields in the override (regardless of source).
    for (const dottedPath of BLOCKED_OVERRIDE_FIELDS) {
      const value = readDottedPath(overrideSpec, dottedPath);
      if (value === undefined) continue;
      warnings.push({
        specialist: name,
        field: dottedPath,
        source,
        severity: source === 'global' ? 'strip' : 'warn',
        value,
      });
    }

    // 2. Apply allowed execution fields.
    const overrideExecution = (overrideSpec.execution ?? {}) as Record<string, unknown>;
    const baseExecution = (baseSpec.execution ?? {}) as Record<string, unknown>;
    for (const field of OVERRIDE_ALLOWED_EXECUTION_FIELDS) {
      if (!(field in overrideExecution)) continue;
      const overrideValue = overrideExecution[field];
      // null + global = "inherit base" (skip). null + repo-full-spec = explicit null (skip too).
      if (overrideValue === null || overrideValue === undefined) continue;
      baseExecution[field] = this.resolveOverrideValue(name, `specialist.execution.${field}`, overrideValue);
    }
    for (const path of OVERRIDE_ALLOWED_NESTED_EXECUTION_PATHS) {
      const overrideValue = readDottedPath(overrideExecution, path);
      if (overrideValue === null || overrideValue === undefined) continue;
      writeDottedPath(baseExecution, path, this.resolveOverrideValue(name, `specialist.execution.${path}`, overrideValue));
    }
    baseSpec.execution = baseExecution;

    // 3. Apply allowed prompt fields.
    const overridePrompt = (overrideSpec.prompt ?? {}) as Record<string, unknown>;
    const basePrompt = (baseSpec.prompt ?? {}) as Record<string, unknown>;
    for (const field of OVERRIDE_ALLOWED_PROMPT_FIELDS) {
      if (!(field in overridePrompt)) continue;
      const overrideValue = overridePrompt[field];
      if (overrideValue === null || overrideValue === undefined) continue;
      basePrompt[field] = this.resolveOverrideValue(name, `specialist.prompt.${field}`, overrideValue);
    }
    baseSpec.prompt = basePrompt;

    // 4. Apply allowed stall_detection fields.
    const overrideStallDetection = (overrideSpec.stall_detection ?? {}) as Record<string, unknown>;
    const baseStallDetection = (baseSpec.stall_detection ?? {}) as Record<string, unknown>;
    for (const path of OVERRIDE_ALLOWED_STALL_DETECTION_PATHS) {
      const overrideValue = readDottedPath(overrideStallDetection, path);
      if (overrideValue === null || overrideValue === undefined) continue;
      writeDottedPath(baseStallDetection, path, this.resolveOverrideValue(name, `specialist.stall_detection.${path}`, overrideValue));
    }
    if (Object.keys(baseStallDetection).length > 0) {
      baseSpec.stall_detection = baseStallDetection;
    }

    // 5. Apply allowed top-level fields.
    for (const field of OVERRIDE_ALLOWED_TOP_FIELDS) {
      if (!(field in overrideSpec)) continue;
      const overrideValue = overrideSpec[field];
      if (overrideValue === null || overrideValue === undefined) continue;
      baseSpec[field] = this.resolveOverrideValue(name, `specialist.${field}`, overrideValue);
    }

    // 6. skills.paths: append + dedup. Other skills.* fields stay base.
    const overrideSkills = (overrideSpec.skills ?? {}) as Record<string, unknown>;
    const overridePaths = Array.isArray(overrideSkills.paths) ? (overrideSkills.paths as string[]) : null;
    if (overridePaths && overridePaths.length) {
      const baseSkills = (baseSpec.skills ?? {}) as Record<string, unknown>;
      const basePaths = Array.isArray(baseSkills.paths) ? (baseSkills.paths as string[]) : [];
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const p of [...basePaths, ...overridePaths]) {
        if (seen.has(p)) continue;
        seen.add(p);
        merged.push(p);
      }
      baseSkills.paths = merged;
      baseSpec.skills = baseSkills;
    }

    return warnings;
  }

  private resolveOverrideValue(name: string, fieldPath: string, value: unknown, isArrayEntry = false): unknown {
    if (Array.isArray(value)) {
      return value.map(entry => this.resolveOverrideValue(name, fieldPath, entry, true));
    }

    const resolution = resolvePresetReference(value, fieldPath, loadPresets({ baseDir: this.projectDir }), new Set(), { specialist: name, arrayEntry: isArrayEntry });
    if (resolution.presetName) emitPresetResolved(name, fieldPath, resolution.presetName, resolution.value, resolution.depth);
    return resolution.value;
  }

  /**
   * Build the merged spec for `name`. Single linear pass over the three layers:
   *
   *   package canonical → ~/.config/specialists/user.json → repo .specialists/user/<name>
   *
   * findLayerHits returns at most two hits (package + user repo), ordered base-first.
   * Does NOT throw on null model; caller (get) enforces the missing-model error.
   */
  private async buildMergedSpec(name: string): Promise<MergeOutcome | null> {
    const hits = this.findLayerHits(name);
    if (hits.length === 0) return null;

    // Layer 1: package canonical (always lowest hit; full spec).
    const baseHit = hits[0];
    const baseContent = await readFile(baseHit.resolved.filePath, 'utf-8');
    const base = await parseSpecialist(this.toJson(baseContent, baseHit.resolved.deprecatedYaml));
    if (baseHit.resolved.deprecatedYaml) {
      process.stderr.write(
        `[specialists] DEPRECATED: YAML specialist config detected at ${baseHit.resolved.filePath}. Please migrate to .specialist.json\n`,
      );
    }
    this.resolveCanonicalPresetReferences(name, base);

    const warnings: BlockedFieldWarning[] = [];

    // Layer 2: global ~/.config/specialists/user.json (sparse, override-allowed fields only).
    const globalLocation = getGlobalUserConfigPath();
    const globalConfig = globalLocation.exists ? readGlobalUserConfig(globalLocation) : null;
    const globalOverride = globalConfig?.[name];
    if (globalOverride) {
      warnings.push(
        ...this.applyOverrideFields(
          name,
          base,
          { specialist: globalOverride } as Record<string, unknown>,
          'global',
        ),
      );
    }

    // Layer 3: repo .specialists/user/<name> (full spec; only allowed fields propagate).
    for (const hit of hits.slice(1)) {
      const content = await readFile(hit.resolved.filePath, 'utf-8');
      let overrideRaw: unknown;
      try {
        overrideRaw = JSON.parse(this.toJson(content, hit.resolved.deprecatedYaml));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`[specialists] skipping override ${hit.resolved.filePath}: ${msg}\n`);
        continue;
      }
      if (hit.resolved.deprecatedYaml) {
        process.stderr.write(
          `[specialists] DEPRECATED: YAML specialist config detected at ${hit.resolved.filePath}. Please migrate to .specialist.json\n`,
        );
      }
      warnings.push(
        ...this.applyOverrideFields(name, base, overrideRaw as Record<string, unknown>, 'user'),
      );
    }

    // The TOP layer (highest-priority hit) drives the SpecialistSummary scope/source.
    const top = hits[hits.length - 1];
    resolveSkillsPaths(base, baseHit.dir.path);
    return {
      spec: base,
      topLayer: {
        scope: top.dir.scope,
        source: top.dir.source,
        filePath: top.resolved.filePath,
        deprecatedYaml: top.resolved.deprecatedYaml,
      },
      warnings,
    };
  }

  private resolveCanonicalPresetReferences(name: string, spec: Specialist): void {
    const execution = spec.specialist.execution as Record<string, unknown>;
    for (const field of OVERRIDE_ALLOWED_EXECUTION_FIELDS) {
      if (!(field in execution)) continue;
      const value = execution[field];
      if (value === null || value === undefined) continue;
      execution[field] = this.resolveOverrideValue(name, `specialist.execution.${field}`, value);
    }
    for (const path of OVERRIDE_ALLOWED_NESTED_EXECUTION_PATHS) {
      const value = readDottedPath(execution, path);
      if (value === null || value === undefined) continue;
      writeDottedPath(execution, path, this.resolveOverrideValue(name, `specialist.execution.${path}`, value));
    }
  }

  async list(category?: string): Promise<SpecialistSummary[]> {
    const results: SpecialistSummary[] = [];
    const seen = new Set<string>();

    for (const dir of this.getScanDirs()) {
      const files = await readdir(dir.path).catch(() => []);
      for (const file of files.filter(f => f.endsWith('.specialist.json') || f.endsWith('.specialist.yaml'))) {
        const specialistName = basename(file).replace(/\.specialist\.(json|yaml)$/, '');
        if (seen.has(specialistName)) continue;

        try {
          const merged = await this.buildMergedSpec(specialistName);
          if (!merged) continue;
          const { name, description, category: cat, version, updated } = merged.spec.specialist.metadata;
          if (seen.has(name)) continue;
          if (category && cat !== category) continue;
          seen.add(name);
          // Cache warnings for doctor.
          if (merged.warnings.length) this.blockedFieldWarnings.set(name, merged.warnings);
          results.push({
            name,
            description,
            category: cat,
            version,
            model: merged.spec.specialist.execution.model ?? '',
            permission_required: merged.spec.specialist.execution.permission_required,
            interactive: merged.spec.specialist.execution.interactive,
            thinking_level: merged.spec.specialist.execution.thinking_level,
            skills: merged.spec.specialist.skills?.paths ?? [],
            scripts: merged.spec.specialist.skills?.scripts ?? [],
            mandatoryRuleTemplateSets: merged.spec.specialist.mandatory_rules?.template_sets ?? [],
            scope: merged.topLayer.scope,
            source: merged.topLayer.source,
            filePath: merged.topLayer.filePath,
            updated,
            filestoWatch: merged.spec.specialist.validation?.files_to_watch,
            staleThresholdDays: merged.spec.specialist.validation?.stale_threshold_days,
            stallDetection: merged.spec.specialist.stall_detection ?? undefined,
          });
        } catch (e: unknown) {
          const reason = e instanceof Error ? e.message : String(e);
          process.stderr.write(`[specialists] skipping ${file} (${specialistName}): ${reason}\n`);
        }
      }
    }
    return results;
  }

  async get(name: string): Promise<Specialist> {
    if (this.cache.has(name)) return this.cache.get(name)!;

    const merged = await this.buildMergedSpec(name);
    if (!merged) throw new Error(`Specialist not found: ${name}`);

    // Cache warnings even if no model error — doctor consumes both paths.
    if (merged.warnings.length) this.blockedFieldWarnings.set(name, merged.warnings);

    const model = merged.spec.specialist.execution.model;
    if (model === null || model === undefined || model === '') {
      throw new SpecialistMissingModelError(name);
    }

    this.cache.set(name, merged.spec);
    return merged.spec;
  }

  /**
   * Return the merged (effective) spec for `name`: package canonical + global
   * user.json + repo overrides, in the same precedence as get().
   *
   * Unlike get(), does NOT enforce the "model must be set" gate — this method
   * exists precisely so tooling (sp view --raw, launchers, doctors) can inspect
   * the effective config even when it isn't yet runnable. Callers that need
   * runtime enforcement should still use get().
   *
   * Returns null if the specialist has no package canonical (unknown name).
   */
  async getEffective(name: string): Promise<Specialist | null> {
    const merged = await this.buildMergedSpec(name);
    if (!merged) return null;
    if (merged.warnings.length) this.blockedFieldWarnings.set(name, merged.warnings);
    return merged.spec;
  }

  /**
   * Blocked-field warnings collected during the most recent list() or get() calls.
   * Returns all warnings when called without a name; filters to one specialist otherwise.
   */
  getBlockedFieldWarnings(name?: string): BlockedFieldWarning[] {
    if (name) return this.blockedFieldWarnings.get(name) ?? [];
    const all: BlockedFieldWarning[] = [];
    for (const warnings of this.blockedFieldWarnings.values()) all.push(...warnings);
    return all;
  }

  /** Resolution of the global user-config path. Returns null only if HOME is unset and XDG_CONFIG_HOME is empty. */
  getGlobalLayerPath(): GlobalUserConfigPath | null {
    try {
      return getGlobalUserConfigPath();
    } catch {
      return null;
    }
  }

  invalidateCache(name?: string): void {
    if (name) {
      this.cache.delete(name);
      this.blockedFieldWarnings.delete(name);
    } else {
      this.cache.clear();
      this.blockedFieldWarnings.clear();
    }
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

// Keys that would traverse / mutate Object.prototype. Defense-in-depth even though
// callers currently pass static keys from BLOCKED_OVERRIDE_FIELDS — guard the walk
// in case user-controlled data ever reaches this helper. Also silences Semgrep
// rule javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Read-only walk used to detect blocked-field assignments in override layers.
// `part` is guarded by PROTOTYPE_POLLUTION_KEYS deny-list and a hasOwnProperty check above each
// indexed read. Current callers pass static keys from BLOCKED_OVERRIDE_FIELDS (constant strings,
// not user-controlled). Semgrep's prototype-pollution-loop rule fires on the AST shape regardless,
// so the indexed read carries an inline `nosemgrep:` waiver on the same line.
function readDottedPath(obj: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    if (PROTOTYPE_POLLUTION_KEYS.has(part)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part]; // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
  }
  return cur;
}

function writeDottedPath(obj: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split('.');
  const leaf = parts.pop();
  if (!leaf || PROTOTYPE_POLLUTION_KEYS.has(leaf)) return;

  let cur = obj;
  for (const part of parts) {
    if (PROTOTYPE_POLLUTION_KEYS.has(part)) return;
    const next = cur[part];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[leaf] = value;
}

function emitPresetResolved(
  specialist: string,
  field: string,
  presetName: string,
  resolvedValue: unknown,
  depth: number,
): void {
  process.stderr.write(`${JSON.stringify({
    event: 'preset_resolved',
    specialist,
    field,
    preset_name: presetName,
    resolved_value: resolvedValue,
    depth,
  })}\n`);
}

function resolveSkillsPaths(spec: Specialist, fileDir: string): void {
  const rawPaths = spec.specialist.skills?.paths;
  if (!rawPaths?.length) return;
  const resolved = rawPaths.map(p => {
    if (p.startsWith('~/')) return join(process.env.HOME || '', p.slice(2));
    if (p.startsWith('./')) return join(fileDir, p.slice(2));
    return p; // absolute
  });
  (spec.specialist.skills as Record<string, unknown>).paths = resolved;
}
