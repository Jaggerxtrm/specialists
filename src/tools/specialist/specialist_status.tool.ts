// src/tools/specialist/specialist_status.tool.ts
import { z } from 'zod';
import type { SpecialistLoader } from '../../specialist/loader.js';
import type { CircuitBreaker } from '../../utils/circuitBreaker.js';

const BACKENDS = ['gemini', 'qwen', 'anthropic', 'openai'];

export function createSpecialistStatusTool(loader: SpecialistLoader, circuitBreaker: CircuitBreaker) {
  return {
    name: 'specialist_status' as const,
    description: 'System health: backend circuit breaker states, loaded specialists, staleness.',
    inputSchema: z.object({}),
    async execute(_: object) {
      const list = await loader.list();
      return {
        loaded_count: list.length,
        backends_health: Object.fromEntries(BACKENDS.map(b => [b, circuitBreaker.getState(b)])),
        specialists: list.map(s => ({
          name: s.name, scope: s.scope, category: s.category, version: s.version,
        })),
      };
    },
  };
}
