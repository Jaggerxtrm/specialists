// src/specialist/loader.ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { parseSpecialist, type Specialist } from './schema.js';

export interface SpecialistSummary {
  name: string;
  description: string;
  category: string;
  version: string;
  model: string;
  scope: 'project' | 'user' | 'system';
  filePath: string;
}

interface LoaderOptions {
  projectDir?: string;
  userDir?: string;   // override for testing
}

export class SpecialistLoader {
  private cache = new Map<string, Specialist>();
  private projectDir: string;
  private userDir: string;
  private systemDir: string;

  constructor(options: LoaderOptions = {}) {
    this.projectDir = options.projectDir ?? process.cwd();
    this.userDir = options.userDir ?? join(homedir(), '.claude', 'specialists');
    // System specialists: bundled in package next to compiled output
    this.systemDir = join(new URL(import.meta.url).pathname, '..', '..', '..', 'specialists');
  }

  private getScanDirs(): Array<{ path: string; scope: 'project' | 'user' | 'system' }> {
    return [
      { path: join(this.projectDir, 'specialists'), scope: 'project' },
      { path: join(this.projectDir, '.claude', 'specialists'), scope: 'project' },
      { path: join(this.projectDir, '.agent-forge', 'specialists'), scope: 'project' }, // cross-scan
      { path: this.userDir, scope: 'user' },
      { path: this.systemDir, scope: 'system' },
    ].filter(d => existsSync(d.path));
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
          const { name, description, category: cat, version } = spec.specialist.metadata;
          if (seen.has(name)) continue; // project overrides user/system (first wins)
          if (category && cat !== category) continue;
          seen.add(name);
          results.push({
            name, description, category: cat, version,
            model: spec.specialist.execution.model,
            scope: dir.scope,
            filePath,
          });
        } catch {
          // Skip invalid YAML files silently
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
