// src/tools/specialist/specialist_status.tool.ts
import { z } from 'zod';
import type { SpecialistLoader } from '../../specialist/loader.js';
import { checkStaleness } from '../../specialist/loader.js';
import type { CircuitBreaker } from '../../utils/circuitBreaker.js';

const BACKENDS = ['gemini', 'qwen', 'anthropic', 'openai'];

export function createSpecialistStatusTool(loader: SpecialistLoader, circuitBreaker: CircuitBreaker) {
  return {
    name: 'specialist_status' as const,
    description: 'System health: backend circuit breaker states, loaded specialists, staleness.',
    inputSchema: z.object({}),
    async execute(_: object) {
      const list = await loader.list();

      // Check staleness for each specialist concurrently
      const stalenessResults = await Promise.all(list.map(s => checkStaleness(s)));

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
      };
    },
  };
}
