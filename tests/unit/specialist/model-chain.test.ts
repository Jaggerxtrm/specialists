import { describe, expect, it } from 'vitest';
import { resolveModelChain } from '../../../src/specialist/model-chain.js';

describe('resolveModelChain', () => {
  it('returns primary followed by plural fallbacks', () => {
    expect(resolveModelChain({ model: 'p', fallback_models: ['a', 'b'] })).toEqual(['p', 'a', 'b']);
  });

  it('returns primary followed by singular fallback', () => {
    expect(resolveModelChain({ model: 'p', fallback_model: 'f' })).toEqual(['p', 'f']);
  });

  it('returns primary when no fallbacks are configured', () => {
    expect(resolveModelChain({ model: 'p' })).toEqual(['p']);
  });

  it('prefers plural fallbacks over singular fallback', () => {
    expect(resolveModelChain({ model: 'p', fallback_model: 'f', fallback_models: ['a', 'b'] })).toEqual(['p', 'a', 'b']);
  });

  it('dedupes while preserving order', () => {
    expect(resolveModelChain({ model: 'p', fallback_models: ['p', 'a', 'a'] })).toEqual(['p', 'a']);
  });
});
