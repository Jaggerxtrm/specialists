// src/tools/specialist/specialist_status.tool.ts
import { z } from 'zod';
import type { SpecialistLoader } from '../../specialist/loader.js';
import { checkStaleness } from '../../specialist/loader.js';
import { createObservabilitySqliteClient } from '../../specialist/observability-sqlite.js';
import type { CircuitBreaker } from '../../utils/circuitBreaker.js';

const BACKENDS = ['gemini', 'qwen', 'anthropic', 'openai'];

export function createSpecialistStatusTool(loader: SpecialistLoader, circuitBreaker: CircuitBreaker) {
  return {
    name: 'specialist_status' as const,
    description: 'System health: backend circuit breaker states, loaded specialists, staleness. Also shows active background jobs from DB-first observability, with file fallback only when SPECIALISTS_JOB_FILE_OUTPUT=on.',
    inputSchema: z.object({}),
    async execute(_: object) {
      const list = await loader.list();

      // Check staleness for each specialist concurrently
      const stalenessResults = await Promise.all(list.map(s => checkStaleness(s)));

      // Include active background jobs from DB-first observability.
      const sqliteClient = createObservabilitySqliteClient();
      const jobs = sqliteClient?.listStatuses() ?? [];

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
