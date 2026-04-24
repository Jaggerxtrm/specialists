// src/specialist/loader.ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { parseSpecialist } from './schema.js';
/** Returns STALE, AGED, or OK based on file mtimes vs metadata.updated */
export async function checkStaleness(summary) {
    if (!summary.filestoWatch?.length || !summary.updated)
        return 'OK';
    const updatedMs = new Date(summary.updated).getTime();
    if (isNaN(updatedMs))
        return 'OK';
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
export class SpecialistLoader {
    cache = new Map();
    projectDir;
    constructor(options = {}) {
        this.projectDir = options.projectDir ?? process.cwd();
    }
    getScanDirs() {
        const dirs = [
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
            // Legacy locations retained for compatibility, but never primary anymore.
            { path: join(this.projectDir, 'specialists'), scope: 'default', source: 'legacy' },
            { path: join(this.projectDir, '.claude', 'specialists'), scope: 'default', source: 'legacy' },
            { path: join(this.projectDir, '.agent-forge', 'specialists'), scope: 'default', source: 'legacy' },
        ];
        return dirs.filter(d => existsSync(d.path));
    }
    toJson(content, isYaml) {
        if (!isYaml)
            return content;
        return JSON.stringify(parseYaml(content));
    }
    resolveSpecialistPath(dirPath, specialistName) {
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
    async list(category) {
        const results = [];
        const seen = new Set();
        for (const dir of this.getScanDirs()) {
            const files = await readdir(dir.path).catch(() => []);
            for (const file of files.filter(f => f.endsWith('.specialist.json') || f.endsWith('.specialist.yaml'))) {
                const specialistName = basename(file).replace(/\.specialist\.(json|yaml)$/, '');
                if (seen.has(specialistName))
                    continue;
                const resolved = this.resolveSpecialistPath(dir.path, specialistName);
                if (!resolved)
                    continue;
                try {
                    const content = await readFile(resolved.filePath, 'utf-8');
                    const spec = await parseSpecialist(this.toJson(content, resolved.deprecatedYaml));
                    const { name, description, category: cat, version, updated } = spec.specialist.metadata;
                    if (seen.has(name))
                        continue; // first wins (user overrides default)
                    if (category && cat !== category)
                        continue;
                    if (resolved.deprecatedYaml) {
                        process.stderr.write(`[specialists] DEPRECATED: YAML specialist config detected at ${resolved.filePath}. Please migrate to .specialist.json\n`);
                    }
                    seen.add(name);
                    results.push({
                        name,
                        description,
                        category: cat,
                        version,
                        model: spec.specialist.execution.model,
                        permission_required: spec.specialist.execution.permission_required,
                        interactive: spec.specialist.execution.interactive,
                        thinking_level: spec.specialist.execution.thinking_level,
                        skills: spec.specialist.skills?.paths ?? [],
                        scripts: spec.specialist.skills?.scripts ?? [],
                        scope: dir.scope,
                        source: dir.source,
                        filePath: resolved.filePath,
                        updated,
                        filestoWatch: spec.specialist.validation?.files_to_watch,
                        staleThresholdDays: spec.specialist.validation?.stale_threshold_days,
                        stallDetection: spec.specialist.stall_detection ?? undefined,
                    });
                }
                catch (e) {
                    const reason = e instanceof Error ? e.message : String(e);
                    process.stderr.write(`[specialists] skipping ${resolved.filePath}: ${reason}\n`);
                }
            }
        }
        return results;
    }
    async get(name) {
        if (this.cache.has(name))
            return this.cache.get(name);
        for (const dir of this.getScanDirs()) {
            const resolvedPath = this.resolveSpecialistPath(dir.path, name);
            if (!resolvedPath)
                continue;
            const content = await readFile(resolvedPath.filePath, 'utf-8');
            const spec = await parseSpecialist(this.toJson(content, resolvedPath.deprecatedYaml));
            if (resolvedPath.deprecatedYaml) {
                process.stderr.write(`[specialists] DEPRECATED: YAML specialist config detected at ${resolvedPath.filePath}. Please migrate to .specialist.json\n`);
            }
            // Resolve skills.paths at load time (~/..., ./..., absolute)
            const rawPaths = spec.specialist.skills?.paths;
            if (rawPaths?.length) {
                const fileDir = dir.path;
                const resolved = rawPaths.map(p => {
                    if (p.startsWith('~/'))
                        return join(process.env.HOME || '', p.slice(2));
                    if (p.startsWith('./'))
                        return join(fileDir, p.slice(2));
                    return p; // absolute
                });
                spec.specialist.skills.paths = resolved;
            }
            this.cache.set(name, spec);
            return spec;
        }
        throw new Error(`Specialist not found: ${name}`);
    }
    invalidateCache(name) {
        if (name)
            this.cache.delete(name);
        else
            this.cache.clear();
    }
}
//# sourceMappingURL=loader.js.map