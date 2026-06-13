// src/specialist/loader.ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  parseSpecialist,
  BLOCKED_OVERRIDE_FIELDS,
  OVERRIDE_ALLOWED_EXECUTION_FIELDS,
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

export interface StallDetectionConfig {
  running_silence_warn_ms?: number;
  running_silence_error_ms?: number;
  waiting_stale_ms?: number;
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
   * Scan dirs in priority order: highest-priority layer FIRST (user → default → package).
   * Used both to find a file for a given name (first hit wins for "where to load") and
   * to know which package/default file feeds the merge base.
   */
  private getScanDirs(): ScanDir[] {
    const dirs: ScanDir[] = [
      // Runtime contract: repo authoring layer wins, then repo-managed mirror, then upstream package fallback.
      { path: join(this.projectDir, '.specialists', 'user'), scope: 'user', source: 'user' },
      // Back-compat nested user path — migration bridge only.
      { path: join(this.projectDir, '.specialists', 'user', 'specialists'), scope: 'user', source: 'legacy' },

      // Repo-managed mirror. Same-name files here override package fallback; new names extend catalog.
      { path: join(this.projectDir, '.specialists', 'default'), scope: 'default', source: 'default-mirror' },
      // Back-compat nested default path — migration bridge only.
      { path: join(this.projectDir, '.specialists', 'default', 'specialists'), scope: 'default', source: 'legacy' },

      // Upstream source. Read-only fallback in runtime; not repo-authoring surface.
      { path: join(this.projectDir, 'config', 'specialists'), scope: 'package', source: 'package-fallback' },
      { path: resolveCanonicalAssetDir('specialists') ?? '', scope: 'package', source: 'package-live' },

      // Legacy locations retained for compatibility, but never primary anymore.
      { path: join(this.projectDir, 'specialists'), scope: 'default', source: 'legacy' },
      { path: join(this.projectDir, '.claude', 'specialists'), scope: 'default', source: 'legacy' },
      { path: join(this.projectDir, '.agent-forge', 'specialists'), scope: 'default', source: 'legacy' },
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

  /** Find every layer that has a file for `name`, ordered base-first (package → default → user). */
  private findLayerHits(name: string): Array<{ dir: ScanDir; resolved: ResolvedSpecPath }> {
    const hits: Array<{ dir: ScanDir; resolved: ResolvedSpecPath }> = [];
    const seenScopes = new Set<ScanDirScope>();
    // Walk top-down (user → default → package), then reverse so caller has base-first order.
    for (const dir of this.getScanDirs()) {
      // Avoid double-counting when same-scope dir has nested legacy entry already matched.
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
      baseExecution[field] = overrideValue;
    }
    baseSpec.execution = baseExecution;

    // 3. Apply allowed top-level fields.
    for (const field of OVERRIDE_ALLOWED_TOP_FIELDS) {
      if (!(field in overrideSpec)) continue;
      const overrideValue = overrideSpec[field];
      if (overrideValue === null || overrideValue === undefined) continue;
      baseSpec[field] = overrideValue;
    }

    // 4. skills.paths: append + dedup. Other skills.* fields stay base.
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

  /**
   * Build the merged spec for `name`. Reads every contributing layer
   * (package base → global user.json → repo default → repo user) and applies
   * override-allowed fields field-by-field. Does NOT throw on null model;
   * caller (get) enforces the missing-model error.
   */
  private async buildMergedSpec(name: string): Promise<MergeOutcome | null> {
    const hits = this.findLayerHits(name);
    if (hits.length === 0) return null;

    // Base = lowest-priority layer that has a file. Always a full spec.
    const baseHit = hits[0];
    const baseContent = await readFile(baseHit.resolved.filePath, 'utf-8');
    const base = await parseSpecialist(this.toJson(baseContent, baseHit.resolved.deprecatedYaml));
    if (baseHit.resolved.deprecatedYaml) {
      process.stderr.write(
        `[specialists] DEPRECATED: YAML specialist config detected at ${baseHit.resolved.filePath}. Please migrate to .specialist.json\n`,
      );
    }

    const warnings: BlockedFieldWarning[] = [];

    // Apply repo-layer overrides above the base (default-mirror, then user).
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
      const layerSource = hit.dir.scope === 'user' ? 'user' : 'default';
      warnings.push(...this.applyOverrideFields(name, base, overrideRaw as Record<string, unknown>, layerSource));
    }

    // The TOP layer (highest-priority hit) drives the SpecialistSummary scope/source.
    const top = hits[hits.length - 1];

    // Apply global user.json overrides between the base and the repo layers.
    // Semantically the global layer is below repo, so apply it BEFORE repo overrides.
    // For correctness we re-walk: re-build base, apply global, apply repo overrides on top.
    const globalLocation = getGlobalUserConfigPath();
    const globalConfig = globalLocation.exists ? readGlobalUserConfig(globalLocation) : null;
    const globalOverride = globalConfig?.[name];

    if (globalOverride) {
      // Re-do the merge in canonical order: base → global → repo overrides.
      const rebuiltBase = await parseSpecialist(this.toJson(baseContent, baseHit.resolved.deprecatedYaml));
      // Re-collect warnings cleanly to avoid double-counting.
      const rebuiltWarnings: BlockedFieldWarning[] = [];
      rebuiltWarnings.push(
        ...this.applyOverrideFields(name, rebuiltBase, { specialist: globalOverride } as Record<string, unknown>, 'global'),
      );
      for (const hit of hits.slice(1)) {
        const content = await readFile(hit.resolved.filePath, 'utf-8');
        let overrideRaw: unknown;
        try {
          overrideRaw = JSON.parse(this.toJson(content, hit.resolved.deprecatedYaml));
        } catch {
          continue;
        }
        const layerSource = hit.dir.scope === 'user' ? 'user' : 'default';
        rebuiltWarnings.push(
          ...this.applyOverrideFields(name, rebuiltBase, overrideRaw as Record<string, unknown>, layerSource),
        );
      }
      // Resolve skills.paths on the rebuilt spec.
      resolveSkillsPaths(rebuiltBase, baseHit.dir.path);
      return {
        spec: rebuiltBase,
        topLayer: {
          scope: top.dir.scope,
          source: top.dir.source,
          filePath: top.resolved.filePath,
          deprecatedYaml: top.resolved.deprecatedYaml,
        },
        warnings: rebuiltWarnings,
      };
    }

    // No global layer — finalize the base+repo merge.
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

function readDottedPath(obj: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
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
