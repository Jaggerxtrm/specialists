import { describe, expect, it } from 'vitest';
import { parseArgs, resolveSurfaceModel } from '../../../src/cli/view.js';

describe('view --surface', () => {
  it('parses the optional surface and prefers its configured model', () => {
    expect(parseArgs(['debugger', '--surface', 'claude']).surface).toBe('claude');
    expect(resolveSurfaceModel({ model: 'openai/gpt-5', surface_models: { claude: 'anthropic/claude-sonnet' } }, 'claude'))
      .toBe('anthropic/claude-sonnet');
    expect(resolveSurfaceModel({ model: 'openai/gpt-5' }, 'claude')).toBe('openai/gpt-5');
  });

  it('treats the codex surface as a selector and model spellings as data (K3)', () => {
    expect(parseArgs(['debugger', '--surface', 'codex']).surface).toBe('codex');
    // surface_models.codex wins when configured...
    expect(resolveSurfaceModel({ model: 'openai/gpt-5', surface_models: { codex: 'gpt-5.4-codex' } }, 'codex'))
      .toBe('gpt-5.4-codex');
    // ...otherwise the base model passes through verbatim: an openai-codex/...
    // provider spelling is data for the launcher, never a surface alias.
    expect(resolveSurfaceModel({ model: 'openai-codex/gpt-5.4' }, 'codex')).toBe('openai-codex/gpt-5.4');
    expect(resolveSurfaceModel({ model: 'openai-codex/gpt-5.4' }, 'pi')).toBe('openai-codex/gpt-5.4');
    expect(resolveSurfaceModel({ model: null }, 'codex')).toBeNull();
  });
});
