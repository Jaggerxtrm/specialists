// src/tools/specialist/specialist_status.tool.ts
import { z } from 'zod';
import { checkStaleness } from '../../specialist/loader.js';
const BACKENDS = ['gemini', 'qwen', 'anthropic', 'openai'];
export function createSpecialistStatusTool(loader, circuitBreaker) {
    return {
        name: 'specialist_status',
        description: 'System health: backend circuit breaker states, loaded specialists, staleness. Also shows active background jobs from .specialists/jobs/.',
        inputSchema: z.object({}),
        async execute(_) {
            const list = await loader.list();
            // Check staleness for each specialist concurrently
            const stalenessResults = await Promise.all(list.map(s => checkStaleness(s)));
            // Include active background jobs from file-based job state
            const { existsSync, readdirSync, readFileSync } = await import('node:fs');
            const { join } = await import('node:path');
            const jobsDir = join(process.cwd(), '.specialists', 'jobs');
            const jobs = [];
            if (existsSync(jobsDir)) {
                for (const entry of readdirSync(jobsDir)) {
                    const statusPath = join(jobsDir, entry, 'status.json');
                    if (!existsSync(statusPath))
                        continue;
                    try {
                        jobs.push(JSON.parse(readFileSync(statusPath, 'utf-8')));
                    }
                    catch { /* skip */ }
                }
                jobs.sort((a, b) => b.started_at_ms - a.started_at_ms);
            }
            return {
                loaded_count: list.length,
                backends_health: Object.fromEntries(BACKENDS.map(b => [b, circuitBreaker.getState(b)])),
                specialists: list.map((s, i) => ({
                    name: s.name,
                    scope: s.scope,
                    category: s.category,
                    version: s.version,
                    staleness: stalenessResults[i],
                })),
                background_jobs: jobs.map(j => ({
                    id: j.id,
                    specialist: j.specialist,
                    status: j.status,
                    elapsed_s: j.elapsed_s,
                    current_event: j.current_event,
                    bead_id: j.bead_id,
                    metrics: j.metrics,
                    error: j.error,
                })),
            };
        },
    };
}
//# sourceMappingURL=specialist_status.tool.js.map