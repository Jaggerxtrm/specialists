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

  it('parses --scope default', () => {
    expect(parseArgs(['--scope', 'default'])).toEqual({ scope: 'default' });
  });

  it('parses --scope user', () => {
    expect(parseArgs(['--scope', 'user'])).toEqual({ scope: 'user' });
  });

  it('parses both --category and --scope together', () => {
    expect(parseArgs(['--category', 'review', '--scope', 'user']))
      .toEqual({ category: 'review', scope: 'user' });
  });

  it('parses flags in any order', () => {
    expect(parseArgs(['--scope', 'default', '--category', 'debug']))
      .toEqual({ category: 'debug', scope: 'default' });
  });

  it('throws ArgParseError for invalid --scope value', () => {
    expect(() => parseArgs(['--scope', 'system']))
      .toThrow(ArgParseError);
    expect(() => parseArgs(['--scope', 'system']))
      .toThrow('must be "default" or "user"');
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

describe('list CLI — parseArgs --json', () => {
  it('parses --json flag', () => {
    expect(parseArgs(['--json'])).toEqual({ json: true });
  });

  it('parses --json with other flags', () => {
    expect(parseArgs(['--scope', 'default', '--json'])).toEqual({ scope: 'default', json: true });
  });

  it('json defaults to undefined when not provided', () => {
    const result = parseArgs([]);
    expect(result.json).toBeUndefined();
  });
});

describe('list CLI — parseArgs --live', () => {
  it('parses --live flag', () => {
    expect(parseArgs(['--live'])).toEqual({ live: true });
  });

  it('parses --live with other flags', () => {
    expect(parseArgs(['--scope', 'default', '--json', '--live']))
      .toEqual({ scope: 'default', json: true, live: true });
  });

  it('live defaults to undefined when not provided', () => {
    const result = parseArgs([]);
    expect(result.live).toBeUndefined();
  });
});
