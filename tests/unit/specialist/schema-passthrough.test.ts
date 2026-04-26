import { describe, it, expect } from 'vitest';
import { parseSpecialist } from '../../../src/specialist/schema.js';

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

describe('parseSpecialist passthrough', () => {
  it('preserves unknown top-level and nested keys', async () => {
    const spec = {
      specialist: {
        metadata: {
          name: 'passthrough-spec',
          version: '1.0.0',
          description: 'Preserves unknown keys',
          category: 'test',
          UNKNOWN_TOP: 'metadata stays',
        },
        execution: {
          model: 'gemini',
          UNKNOWN_TOP: 'execution stays',
        },
        prompt: {
          task_template: '$prompt',
          UNKNOWN_TOP: 'prompt stays',
        },
        communication: {
          next_specialists: 'explorer',
          publishes: ['upstream-events'],
        },
        UNKNOWN_TOP: 'specialist stays',
      },
      UNKNOWN_TOP: 'root stays',
    };

    const result = await parseSpecialist(toJson(spec));

    const parsed = result as {
      UNKNOWN_TOP?: unknown;
      specialist: Record<string, unknown> & {
        metadata: Record<string, unknown>;
        execution: Record<string, unknown>;
        prompt: Record<string, unknown>;
        communication?: Record<string, unknown>;
      };
    };

    expect(parsed.UNKNOWN_TOP).toBe('root stays');
    expect(parsed.specialist.UNKNOWN_TOP).toBe('specialist stays');
    expect(parsed.specialist.metadata.UNKNOWN_TOP).toBe('metadata stays');
    expect(parsed.specialist.execution.UNKNOWN_TOP).toBe('execution stays');
    expect(parsed.specialist.prompt.UNKNOWN_TOP).toBe('prompt stays');
    expect(parsed.specialist.communication?.publishes).toEqual(['upstream-events']);
  });
});
