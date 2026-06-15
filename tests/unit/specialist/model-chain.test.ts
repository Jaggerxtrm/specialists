import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveModelChain } from '../../../src/specialist/model-chain.js';

describe('resolveModelChain', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    expect(resolveModelChain({ model: 'p', fallback_model: 'f', fallback_models: ['a', 'b'] })).toEqual(['p', 'a', 'b']);
    expect(debug).toHaveBeenCalledWith('[model-chain] plural fallback_models wins; ignoring fallback_model=f');
  });

  it('returns empty chain when model missing and no fallback exists', () => {
    expect(resolveModelChain({ model: null })).toEqual([]);
  });

  it('dedupes while preserving order', () => {
    expect(resolveModelChain({ model: 'p', fallback_models: ['p', 'a', 'a'] })).toEqual(['p', 'a']);
  });
});
