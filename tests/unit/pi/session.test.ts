// tests/unit/pi/session.test.ts
import { describe, it, expect } from 'vitest';
import { mapSpecialistBackend, getProviderArgs } from '../../../src/pi/backendMap.js';

describe('backendMap', () => {
  it('maps gemini to google-gemini-cli', () => {
    expect(mapSpecialistBackend('gemini')).toBe('google-gemini-cli');
  });
  it('maps qwen to openai', () => {
    expect(mapSpecialistBackend('qwen')).toBe('openai');
  });
  it('maps claude/anthropic to anthropic', () => {
    expect(mapSpecialistBackend('claude')).toBe('anthropic');
    expect(mapSpecialistBackend('anthropic')).toBe('anthropic');
  });
  it('throws for unsupported backend', () => {
    expect(() => mapSpecialistBackend('droid')).toThrow('Unsupported backend');
  });
  it('returns DashScope args for qwen', () => {
    const args = getProviderArgs('qwen');
    expect(args).toContain('--baseURL');
  });
  it('returns empty args for gemini', () => {
    expect(getProviderArgs('gemini')).toHaveLength(0);
  });
});
