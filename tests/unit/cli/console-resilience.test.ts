import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorClassOf, logError, resetLogErrorMemo } from '../../../src/cli/console/log.js';

describe('logError — uniform NDJSON envelope', () => {
  let writes: string[];

  beforeEach(() => {
    writes = [];
    resetLogErrorMemo();
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits one JSON line per (view, op, errorClass) combination', () => {
    logError('ps', 'list_processes', { errorClass: 'ENOENT' });
    expect(writes).toHaveLength(1);
    const json = JSON.parse(writes[0].trim());
    expect(json.component).toBe('sp-console');
    expect(json.view).toBe('ps');
    expect(json.op).toBe('list_processes');
    expect(json.errorClass).toBe('ENOENT');
    expect(json.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('rate-limits duplicate (view, op, errorClass) to one line per session', () => {
    for (let i = 0; i < 50; i += 1) {
      logError('feed', 'subscribe_feed', { errorClass: 'EPIPE' });
    }
    expect(writes).toHaveLength(1);
  });

  it('different errorClass values for the same op log separately', () => {
    logError('diff', 'git_diff', { errorClass: 'EACCES' });
    logError('diff', 'git_diff', { errorClass: 'ENOENT' });
    expect(writes).toHaveLength(2);
  });

  it('NDJSON contains no event payload / stdout / stderr / file path', () => {
    logError('diff', 'git_diff', { errorClass: 'EACCES', durationMs: 12, exitCode: 1 });
    const json = JSON.parse(writes[0].trim());
    expect(Object.keys(json).sort()).toEqual(
      ['component', 'durationMs', 'errorClass', 'exitCode', 'op', 'ts', 'view'],
    );
    expect(JSON.stringify(json)).not.toContain('payload');
    expect(JSON.stringify(json)).not.toContain('stdout');
    expect(JSON.stringify(json)).not.toContain('stderr');
  });
});

describe('errorClassOf', () => {
  it('returns Node.js errno code when present', () => {
    const err = new Error('nope') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    expect(errorClassOf(err)).toBe('ENOENT');
  });

  it('returns Error.name when no errno', () => {
    expect(errorClassOf(new TypeError('x'))).toBe('TypeError');
  });

  it('returns "unknown" for null/undefined', () => {
    expect(errorClassOf(undefined)).toBe('unknown');
    expect(errorClassOf(null)).toBe('unknown');
  });

  it('stringifies unknown shapes', () => {
    expect(errorClassOf('plain string')).toBe('plain string');
  });
});
