import { describe, expect, it } from 'vitest';
import { parseArgs, resolveSurfaceModel } from '../../../src/cli/view.js';

describe('view --surface', () => {
  it('parses the optional surface and prefers its configured model', () => {
    expect(parseArgs(['debugger', '--surface', 'claude']).surface).toBe('claude');
    expect(resolveSurfaceModel({ model: 'openai/gpt-5', surface_models: { claude: 'anthropic/claude-sonnet' } }, 'claude'))
      .toBe('anthropic/claude-sonnet');
    expect(resolveSurfaceModel({ model: 'openai/gpt-5' }, 'claude')).toBe('openai/gpt-5');
  });
});
