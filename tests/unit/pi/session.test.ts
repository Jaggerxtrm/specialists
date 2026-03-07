// tests/unit/pi/session.test.ts
import { describe, it, expect } from 'vitest';
import { mapSpecialistBackend, getProviderArgs } from '../../../src/pi/backendMap.js';

describe('backendMap', () => {
  it('maps gemini to google', () => {
    expect(mapSpecialistBackend('gemini')).toBe('google');
  });
  it('maps qwen to openai', () => {
    expect(mapSpecialistBackend('qwen')).toBe('openai');
  });
  it('maps claude/anthropic to anthropic', () => {
    expect(mapSpecialistBackend('claude')).toBe('anthropic');
    expect(mapSpecialistBackend('anthropic')).toBe('anthropic');
  });
  it('passes through unknown backends', () => {
    expect(mapSpecialistBackend('groq')).toBe('groq');
    expect(mapSpecialistBackend('openrouter')).toBe('openrouter');
  });
  it('returns --api-key args for qwen', () => {
    const args = getProviderArgs('qwen');
    expect(args).toContain('--api-key');
  });
  it('returns empty args for gemini', () => {
    expect(getProviderArgs('gemini')).toHaveLength(0);
  });
});
