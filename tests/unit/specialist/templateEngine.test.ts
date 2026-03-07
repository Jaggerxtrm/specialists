// tests/unit/specialist/templateEngine.test.ts
import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../../src/specialist/templateEngine.js';

describe('renderTemplate', () => {
  it('substitutes $variables', () => {
    expect(renderTemplate('Hello $name!', { name: 'world' })).toBe('Hello world!');
  });
  it('substitutes multiple occurrences', () => {
    expect(renderTemplate('$a $a $b', { a: 'x', b: 'y' })).toBe('x x y');
  });
  it('leaves unknown $vars intact', () => {
    expect(renderTemplate('Hello $missing', {})).toBe('Hello $missing');
  });
  it('handles $prompt as standard variable', () => {
    expect(renderTemplate('Task: $prompt', { prompt: 'do the thing' })).toBe('Task: do the thing');
  });
});
