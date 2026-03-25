// src/specialist/loader.ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parseSpecialist, type Specialist } from './schema.js';

export interface SpecialistSummary {
  name: string;
  description: string;
  category: string;
  version: string;
  model: string;
  scope: 'default' | 'user';
  filePath: string;
  updated?: string;
  filestoWatch?: string[];
  staleThresholdDays?: number;
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

export class SpecialistLoader {
  private cache = new Map<string, Specialist>();
  private projectDir: string;

  constructor(options: LoaderOptions = {}) {
    this.projectDir = options.projectDir ?? process.cwd();
  }

  private getScanDirs(): Array<{ path: string; scope: 'default' | 'user' }> {
    const dirs: Array<{ path: string; scope: 'default' | 'user' }> = [
      // User specialists take precedence over defaults
      { path: join(this.projectDir, '.specialists', 'user', 'specialists'), scope: 'user' },
      { path: join(this.projectDir, '.specialists', 'default', 'specialists'), scope: 'default' },
      // Legacy paths for backwards compatibility
      { path: join(this.projectDir, 'specialists'), scope: 'user' },
      { path: join(this.projectDir, '.claude', 'specialists'), scope: 'user' },
      { path: join(this.projectDir, '.agent-forge', 'specialists'), scope: 'user' },
    ];
    return dirs.filter(d => existsSync(d.path));
  }

  async list(category?: string): Promise<SpecialistSummary[]> {
    const results: SpecialistSummary[] = [];
    const seen = new Set<string>();

    for (const dir of this.getScanDirs()) {
      const files = await readdir(dir.path).catch(() => []);
      for (const file of files.filter(f => f.endsWith('.specialist.yaml'))) {
        const filePath = join(dir.path, file);
        try {
          const content = await readFile(filePath, 'utf-8');
          const spec = await parseSpecialist(content);
          const { name, description, category: cat, version, updated } = spec.specialist.metadata;
          if (seen.has(name)) continue; // first wins (user overrides default)
          if (category && cat !== category) continue;
          seen.add(name);
          results.push({
            name, description, category: cat, version,
            model: spec.specialist.execution.model,
            scope: dir.scope,
            filePath,
            updated,
            filestoWatch: spec.specialist.validation?.files_to_watch,
            staleThresholdDays: spec.specialist.validation?.stale_threshold_days,
          });
        } catch (e: unknown) {
          const reason = e instanceof Error ? e.message : String(e);
          process.stderr.write(`[specialists] skipping ${filePath}: ${reason}\n`);
        }
      }
    }
    return results;
  }

  async get(name: string): Promise<Specialist> {
    if (this.cache.has(name)) return this.cache.get(name)!;

    for (const dir of this.getScanDirs()) {
      const filePath = join(dir.path, `${name}.specialist.yaml`);
      if (existsSync(filePath)) {
        const content = await readFile(filePath, 'utf-8');
        const spec = await parseSpecialist(content);

        // Resolve skills.paths at load time (~/..., ./..., absolute)
        const rawPaths = spec.specialist.skills?.paths;
        if (rawPaths?.length) {
          const fileDir = dir.path;
          const resolved = rawPaths.map(p => {
            if (p.startsWith('~/')) return join(process.env.HOME || '', p.slice(2));
            if (p.startsWith('./')) return join(fileDir, p.slice(2));
            return p; // absolute
          });
          (spec.specialist.skills as any).paths = resolved;
        }

        this.cache.set(name, spec);
        return spec;
      }
    }
    throw new Error(`Specialist not found: ${name}`);
  }

  invalidateCache(name?: string): void {
    if (name) this.cache.delete(name);
    else this.cache.clear();
  }
}
