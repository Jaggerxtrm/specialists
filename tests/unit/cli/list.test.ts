// tests/unit/cli/list.test.ts
import { describe, it, expect } from 'vitest';
import { parseArgs, ArgParseError } from '../../../src/cli/list.js';

describe('list CLI — parseArgs', () => {
  it('returns empty object for no args', () => {
    expect(parseArgs([])).toEqual({});
  });

  it('parses --category', () => {
    expect(parseArgs(['--category', 'analysis'])).toEqual({ category: 'analysis' });
  });

  it('parses --scope project', () => {
    expect(parseArgs(['--scope', 'project'])).toEqual({ scope: 'project' });
  });

  it('parses --scope user', () => {
    expect(parseArgs(['--scope', 'user'])).toEqual({ scope: 'user' });
  });

  it('parses both --category and --scope together', () => {
    expect(parseArgs(['--category', 'review', '--scope', 'user']))
      .toEqual({ category: 'review', scope: 'user' });
  });

  it('parses flags in any order', () => {
    expect(parseArgs(['--scope', 'project', '--category', 'debug']))
      .toEqual({ category: 'debug', scope: 'project' });
  });

  it('throws ArgParseError for invalid --scope value', () => {
    expect(() => parseArgs(['--scope', 'system']))
      .toThrow(ArgParseError);
    expect(() => parseArgs(['--scope', 'system']))
      .toThrow('must be "project" or "user"');
  });

  it('throws ArgParseError for empty --scope', () => {
    expect(() => parseArgs(['--scope']))
      .toThrow(ArgParseError);
  });

  it('throws ArgParseError for --category with no value', () => {
    expect(() => parseArgs(['--category']))
      .toThrow(ArgParseError);
    expect(() => parseArgs(['--category']))
      .toThrow('--category requires a value');
  });

  it('throws ArgParseError when --category value looks like a flag', () => {
    expect(() => parseArgs(['--category', '--scope']))
      .toThrow(ArgParseError);
  });

  it('silently ignores unknown flags', () => {
    expect(parseArgs(['--unknown', 'foo'])).toEqual({});
  });
});
